create or replace function public.has_admin_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid() and active = true and role = any(p_roles)
  );
$$;
revoke all on function public.has_admin_role(text[]) from public;
grant execute on function public.has_admin_role(text[]) to authenticated;

alter table public.booking_cancellation_requests
  add column if not exists resolution text check (resolution is null or resolution in ('approved', 'rejected')),
  add column if not exists resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  add column if not exists assigned_to uuid references auth.users(id);
alter table public.booking_cancellation_requests alter column passenger_id drop not null;

drop policy if exists "bookings admin update" on public.bookings;
revoke update on public.bookings from authenticated;

drop policy if exists "bookings_own_read" on public.bookings;
drop policy if exists "bookings passenger read" on public.bookings;
drop policy if exists "bookings passenger and support read" on public.bookings;
create policy "bookings passenger and support read" on public.bookings
  for select to authenticated
  using (auth.uid() = passenger_id or public.has_admin_role(array['super_admin', 'admin', 'support']));

drop policy if exists "booking passengers admin read" on public.booking_passengers;
drop policy if exists "booking passengers read own" on public.booking_passengers;
drop policy if exists "booking passengers passenger and support read" on public.booking_passengers;
create policy "booking passengers passenger and support read" on public.booking_passengers
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (b.passenger_id = auth.uid() or public.has_admin_role(array['super_admin', 'admin', 'support']))
  ));

drop policy if exists "cancellation requests own read" on public.booking_cancellation_requests;
drop policy if exists "cancellation requests passenger and support read" on public.booking_cancellation_requests;
create policy "cancellation requests passenger and support read" on public.booking_cancellation_requests
  for select to authenticated
  using (passenger_id = auth.uid() or public.has_admin_role(array['super_admin', 'admin', 'support']));

drop policy if exists "cancellation requests admin update" on public.booking_cancellation_requests;
revoke update on public.booking_cancellation_requests from authenticated;

drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles support read" on public.profiles;
create policy "profiles support read" on public.profiles
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'support']));
grant select on public.profiles to authenticated;

drop policy if exists "audit logs admin read" on public.audit_logs;
create policy "audit logs admin read" on public.audit_logs
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'support']));

drop policy if exists "provider logs admin read" on public.provider_request_logs;
drop policy if exists "provider logs operations read" on public.provider_request_logs;
create policy "provider logs operations read" on public.provider_request_logs
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'provider_operator']));

drop policy if exists "routes operations read" on public.routes;
create policy "routes operations read" on public.routes
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'provider_operator']));

drop policy if exists "locations operations read" on public.locations;
create policy "locations operations read" on public.locations
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'content_manager', 'provider_operator']));

drop policy if exists "locations localization update" on public.locations;
create policy "locations localization update" on public.locations
  for update to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'content_manager']))
  with check (public.has_admin_role(array['super_admin', 'admin', 'content_manager']));
revoke update on public.locations from authenticated;
grant update (name_uk, name_en, name_it, aliases, normalized_name) on public.locations to authenticated;

drop policy if exists "provider schedules operations read" on public.provider_route_schedules;
create policy "provider schedules operations read" on public.provider_route_schedules
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'provider_operator']));

drop policy if exists "provider schedule stops operations read" on public.provider_route_schedule_stops;
create policy "provider schedule stops operations read" on public.provider_route_schedule_stops
  for select to authenticated
  using (public.has_admin_role(array['super_admin', 'admin', 'provider_operator']));

create table if not exists public.admin_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon;
drop policy if exists "admin settings read" on public.admin_settings;
create policy "admin settings read" on public.admin_settings
  for select to authenticated using (public.has_admin_role(array['super_admin', 'admin']));
drop policy if exists "admin settings manage" on public.admin_settings;
create policy "admin settings manage" on public.admin_settings
  for all to authenticated
  using (public.has_admin_role(array['super_admin', 'admin']))
  with check (public.has_admin_role(array['super_admin', 'admin']));

create or replace function public.get_public_admin_settings()
returns table (setting_key text, setting_value jsonb)
language sql stable security definer set search_path = public
as $$
  select s.setting_key, s.setting_value from public.admin_settings s
  where s.setting_key in ('timezone','booking_expiration_minutes','supported_currencies','max_passengers_per_booking','maintenance_mode','default_locale');
$$;
revoke all on function public.get_public_admin_settings() from public;
grant execute on function public.get_public_admin_settings() to anon, authenticated;

insert into public.admin_settings (setting_key, setting_value) values
  ('timezone', to_jsonb('Europe/Kyiv'::text)),
  ('booking_expiration_minutes', '30'::jsonb),
  ('supported_currencies', '["UAH"]'::jsonb),
  ('max_passengers_per_booking', '5'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('support_email', '""'::jsonb),
  ('support_phone', '""'::jsonb),
  ('default_locale', to_jsonb('uk'::text))
on conflict (setting_key) do nothing;

create or replace function public.update_booking_status(p_booking_id uuid, p_status text)
returns table (booking_id uuid, status text)
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if not public.has_admin_role(array['super_admin', 'admin']) then
    raise exception 'authorization denied';
  end if;
  if p_status not in ('confirmed', 'cancelled', 'refunded') then
    raise exception 'invalid booking status';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking not found';
  end if;
  if not (
    (v_booking.status = 'pending' and p_status in ('confirmed', 'cancelled'))
    or (v_booking.status = 'confirmed' and p_status in ('cancelled', 'refunded'))
  ) then
    raise exception 'invalid booking status transition';
  end if;
  update public.bookings
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end
  where id = p_booking_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'booking_status_changed', 'booking', p_booking_id::text,
          jsonb_build_object('from', v_booking.status, 'to', p_status));
  return query select p_booking_id, p_status;
end;
$$;
revoke all on function public.update_booking_status(uuid, text) from public;
grant execute on function public.update_booking_status(uuid, text) to authenticated;

create or replace function public.admin_review_cancellation(
  p_request_id uuid, p_action text, p_resolution_note text default null, p_assigned_to uuid default null)
returns table (request_id uuid, request_status text, booking_status text, resolution text)
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.booking_cancellation_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_resolution text;
  v_booking_status text;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_action not in ('start', 'approve', 'reject', 'assign') then
    raise exception 'invalid cancellation action';
  end if;
  if p_resolution_note is not null and char_length(p_resolution_note) > 1000 then
    raise exception 'resolution note too long';
  end if;
  select * into v_request from public.booking_cancellation_requests where id = p_request_id for update;
  if not found then
    raise exception 'cancellation request not found';
  end if;
  if v_request.status not in ('new', 'in_progress') then
    raise exception 'cancellation request already resolved';
  end if;

  if p_action = 'assign' then
    if p_assigned_to is not null and not exists (
      select 1 from public.admin_profiles
      where user_id = p_assigned_to and active = true and role in ('super_admin', 'admin', 'support')
    ) then
      raise exception 'invalid support assignee';
    end if;
    update public.booking_cancellation_requests set assigned_to = p_assigned_to, updated_at = now() where id = p_request_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'cancellation_assigned', 'cancellation_request', p_request_id::text,
            jsonb_build_object('assigned_to', p_assigned_to));
    return query select p_request_id, v_request.status, null::text, null::text;
    return;
  end if;

  if p_action = 'start' then
    if v_request.status <> 'new' then
      raise exception 'cancellation request is already in progress';
    end if;
    update public.booking_cancellation_requests set status = 'in_progress', updated_at = now() where id = p_request_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'cancellation_review_started', 'cancellation_request', p_request_id::text,
            jsonb_build_object('booking_id', v_request.booking_id));
    return query select p_request_id, 'in_progress'::text, null::text, null::text;
    return;
  end if;

  if v_request.status <> 'in_progress' then
    raise exception 'cancellation request must be in progress';
  end if;
  select * into v_booking from public.bookings where id = v_request.booking_id for update;
  if not found then
    raise exception 'booking not found';
  end if;
  if p_action = 'approve' then
    if v_booking.status not in ('pending', 'confirmed') then
      raise exception 'booking cannot be cancelled in current status';
    end if;
    update public.bookings set status = 'cancelled' where id = v_booking.id;
    v_booking_status := 'cancelled';
    v_resolution := 'approved';
  else
    v_booking_status := v_booking.status;
    v_resolution := 'rejected';
  end if;
  update public.booking_cancellation_requests
  set status = 'resolved', resolution = v_resolution,
      resolution_note = nullif(btrim(p_resolution_note), ''), updated_at = now()
  where id = p_request_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(),
    case when p_action = 'approve' then 'cancellation_approved' else 'cancellation_rejected' end,
    'cancellation_request', p_request_id::text,
    jsonb_build_object('booking_id', v_request.booking_id,
      'booking_status_before', v_booking.status, 'booking_status_after', v_booking_status,
      'resolution_note', nullif(btrim(p_resolution_note), '')));
  return query select p_request_id, 'resolved'::text, v_booking_status, v_resolution;
end;
$$;
revoke all on function public.admin_review_cancellation(uuid, text, text, uuid) from public;
grant execute on function public.admin_review_cancellation(uuid, text, text, uuid) to authenticated;

create or replace function public.admin_list_support_agents()
returns table (user_id uuid, full_name text, role text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  return query
  select a.user_id, coalesce(p.full_name, p.email, a.user_id::text), a.role
  from public.admin_profiles a
  left join public.profiles p on p.id = a.user_id
  where a.active = true and a.role in ('super_admin', 'admin', 'support')
  order by a.role, p.full_name, p.email;
end;
$$;
revoke all on function public.admin_list_support_agents() from public;
grant execute on function public.admin_list_support_agents() to authenticated;

create or replace function public.admin_search_bookings(
  p_query text default null, p_status text default null, p_from_date date default null,
  p_to_date date default null, p_page integer default 0, p_page_size integer default 50)
returns table (
  id uuid, booking_number text, status text, currency text, total_amount numeric,
  created_at timestamptz, expires_at timestamptz, confirmed_at timestamptz,
  provider_booking_id text, passenger_id uuid, trip_id uuid,
  trip_details jsonb, booking_passengers jsonb, total_count bigint)
language plpgsql security definer set search_path = public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_page < 0 or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid pagination';
  end if;
  if p_status is not null and p_status not in ('pending', 'confirmed', 'cancelled', 'expired', 'refunded') then
    raise exception 'invalid booking status';
  end if;
  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid date range';
  end if;
  return query
  select
    b.id, b.booking_number, b.status, b.currency::text, b.total_amount,
    b.created_at, b.expires_at, b.confirmed_at, b.provider_booking_id, b.passenger_id, b.trip_id,
    coalesce((
      select jsonb_build_object('departure_at', t.departure_at, 'arrival_at', t.arrival_at,
        'carrier', t.carrier, 'from_city', origin.name_uk, 'to_city', destination.name_uk)
      from public.trips t
      join public.routes r on r.id = t.route_id
      join public.locations origin on origin.id = r.from_location_id
      join public.locations destination on destination.id = r.to_location_id
      where t.id = b.trip_id
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('full_name', bp.full_name, 'email', bp.email, 'phone', bp.phone) order by bp.id)
      from public.booking_passengers bp where bp.booking_id = b.id
    ), '[]'::jsonb),
    count(*) over()
  from public.bookings b
  where (p_status is null or b.status = p_status)
    and (p_from_date is null or b.created_at >= (p_from_date::timestamp at time zone 'Europe/Kyiv'))
    and (p_to_date is null or b.created_at < ((p_to_date + 1)::timestamp at time zone 'Europe/Kyiv'))
    and (
      v_query is null
      or b.booking_number ilike '%' || v_query || '%'
      or b.status ilike '%' || v_query || '%'
      or b.trip_id::text ilike '%' || v_query || '%'
      or exists (
        select 1 from public.booking_passengers bp
        where bp.booking_id = b.id
          and (bp.full_name ilike '%' || v_query || '%'
               or coalesce(bp.email, '') ilike '%' || v_query || '%'
               or coalesce(bp.phone, '') ilike '%' || v_query || '%')
      )
    )
  order by b.created_at desc
  limit p_page_size offset (p_page * p_page_size);
end;
$$;
revoke all on function public.admin_search_bookings(text, text, date, date, integer, integer) from public;
grant execute on function public.admin_search_bookings(text, text, date, date, integer, integer) to authenticated;

create or replace function public.admin_search_passengers(
  p_query text default null, p_locale text default null, p_page integer default 0, p_page_size integer default 50)
returns table (
  id uuid, full_name text, email text, preferred_locale text, phone text, created_at timestamptz,
  booking_count bigint, latest_booking_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_page < 0 or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid pagination';
  end if;
  if p_locale is not null and p_locale not in ('uk', 'en', 'it') then
    raise exception 'invalid locale';
  end if;
  return query
  select p.id, p.full_name, p.email, p.preferred_locale, p.phone, p.created_at,
         count(b.id), max(b.created_at), count(*) over()
  from public.profiles p
  left join public.bookings b on b.passenger_id = p.id
  where (p_locale is null or p.preferred_locale = p_locale)
    and (v_query is null
         or coalesce(p.full_name, '') ilike '%' || v_query || '%'
         or coalesce(p.email, '') ilike '%' || v_query || '%'
         or coalesce(p.phone, '') ilike '%' || v_query || '%')
  group by p.id
  order by p.created_at desc
  limit p_page_size offset (p_page * p_page_size);
end;
$$;
revoke all on function public.admin_search_passengers(text, text, integer, integer) from public;
grant execute on function public.admin_search_passengers(text, text, integer, integer) to authenticated;

create or replace function public.swap_popular_route_order(p_first_id uuid, p_second_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_first public.popular_routes%rowtype;
  v_second public.popular_routes%rowtype;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'content_manager']) then
    raise exception 'authorization denied';
  end if;
  select * into v_first from public.popular_routes where id = p_first_id for update;
  select * into v_second from public.popular_routes where id = p_second_id for update;
  if v_first.id is null or v_second.id is null then
    raise exception 'popular route not found';
  end if;
  if v_first.locale <> v_second.locale then
    raise exception 'popular routes must have the same locale';
  end if;
  update public.popular_routes
  set sort_order = case id when p_first_id then v_second.sort_order else v_first.sort_order end
  where id in (p_first_id, p_second_id);
end;
$$;
revoke all on function public.swap_popular_route_order(uuid, uuid) from public;
grant execute on function public.swap_popular_route_order(uuid, uuid) to authenticated;

create or replace function public.audit_admin_content_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row_id text;
  v_action text;
  v_target_type text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'popular_routes' then
    v_target_type := 'popular_route';
    v_row_id := coalesce(new.id, old.id)::text;
    v_action := case tg_op when 'INSERT' then 'popular_route_created' when 'UPDATE' then 'popular_route_updated' else 'popular_route_deleted' end;
    v_metadata := jsonb_build_object(
      'route_id', coalesce(new.route_id, old.route_id),
      'locale', coalesce(new.locale, old.locale),
      'active', case when tg_op = 'DELETE' then old.active else new.active end,
      'sort_order', case when tg_op = 'DELETE' then old.sort_order else new.sort_order end);
  else
    v_target_type := 'public_content';
    v_row_id := coalesce(new.content_key, old.content_key) || ':' || coalesce(new.locale, old.locale);
    v_action := case tg_op when 'INSERT' then 'public_content_created' when 'UPDATE' then 'public_content_updated' else 'public_content_deleted' end;
    v_metadata := jsonb_build_object(
      'content_key', coalesce(new.content_key, old.content_key),
      'locale', coalesce(new.locale, old.locale),
      'active', case when tg_op = 'DELETE' then old.active else new.active end);
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), v_action, v_target_type, v_row_id, v_metadata);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists audit_popular_route_change on public.popular_routes;
create trigger audit_popular_route_change
  after insert or update or delete on public.popular_routes
  for each row execute function public.audit_admin_content_change();
drop trigger if exists audit_public_content_change on public.public_content;
create trigger audit_public_content_change
  after insert or update or delete on public.public_content
  for each row execute function public.audit_admin_content_change();

create or replace function public.audit_admin_setting_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(),
    case when tg_op = 'INSERT' then 'admin_setting_created' else 'admin_setting_updated' end,
    'admin_setting', new.setting_key, jsonb_build_object('setting_key', new.setting_key));
  return new;
end;
$$;
drop trigger if exists audit_admin_setting_change on public.admin_settings;
create trigger audit_admin_setting_change
  after insert or update on public.admin_settings
  for each row execute function public.audit_admin_setting_change();

create or replace function public.audit_location_localization_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
begin
  if new.name_uk is distinct from old.name_uk then v_changed := array_append(v_changed, 'name_uk'); end if;
  if new.name_en is distinct from old.name_en then v_changed := array_append(v_changed, 'name_en'); end if;
  if new.name_it is distinct from old.name_it then v_changed := array_append(v_changed, 'name_it'); end if;
  if new.aliases is distinct from old.aliases then v_changed := array_append(v_changed, 'aliases'); end if;
  if cardinality(v_changed) > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'location_localization_updated', 'location', new.id::text,
            jsonb_build_object('changed_fields', to_jsonb(v_changed)));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_location_localization_change on public.locations;
create trigger audit_location_localization_change
  after update of name_uk, name_en, name_it, aliases on public.locations
  for each row execute function public.audit_location_localization_change();

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_booking', 'cancellation_request', 'booking_status')),
  booking_id uuid references public.bookings(id) on delete cascade,
  passenger_id uuid references auth.users(id) on delete set null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from anon, authenticated;
drop policy if exists "admin notifications own read" on public.admin_notifications;
create policy "admin notifications own read" on public.admin_notifications
  for select to authenticated
  using (recipient_id = auth.uid() and public.has_admin_role(array['super_admin', 'admin', 'support']));
drop policy if exists "admin notifications own update" on public.admin_notifications;
create policy "admin notifications own update" on public.admin_notifications
  for update to authenticated
  using (recipient_id = auth.uid() and public.has_admin_role(array['super_admin', 'admin', 'support']))
  with check (recipient_id = auth.uid());
grant select on public.admin_notifications to authenticated;
grant update (read_at) on public.admin_notifications to authenticated;

create or replace function public.mark_admin_notification_read(p_notification_id uuid)
returns table (notification_id uuid, read_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_read_at timestamptz;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  update public.admin_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id and n.recipient_id = auth.uid()
  returning n.read_at into v_read_at;
  if not found then
    raise exception 'notification not found';
  end if;
  return query select p_notification_id, v_read_at;
end;
$$;
revoke all on function public.mark_admin_notification_read(uuid) from public;
grant execute on function public.mark_admin_notification_read(uuid) to authenticated;

create table if not exists public.passenger_interactions (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid references auth.users(id) on delete set null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  trip_completed boolean not null default false,
  rating integer check (rating is null or rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists passenger_interactions_passenger_idx on public.passenger_interactions(passenger_id, created_at desc);
create index if not exists passenger_interactions_booking_idx on public.passenger_interactions(booking_id, created_at desc);
alter table public.passenger_interactions enable row level security;
revoke all on public.passenger_interactions from anon;
drop policy if exists "passenger interactions admin read" on public.passenger_interactions;
create policy "passenger interactions admin read" on public.passenger_interactions
  for select to authenticated using (public.has_admin_role(array['super_admin', 'admin', 'support']));
drop policy if exists "passenger interactions admin insert" on public.passenger_interactions;
create policy "passenger interactions admin insert" on public.passenger_interactions
  for insert to authenticated
  with check (actor_id = auth.uid() and public.has_admin_role(array['super_admin', 'admin', 'support']));
drop policy if exists "passenger interactions admin update" on public.passenger_interactions;
create policy "passenger interactions admin update" on public.passenger_interactions
  for update to authenticated
  using (actor_id = auth.uid() and public.has_admin_role(array['super_admin', 'admin', 'support']))
  with check (actor_id = auth.uid() and public.has_admin_role(array['super_admin', 'admin', 'support']));
grant select, insert, update on public.passenger_interactions to authenticated;

create or replace function public.save_passenger_interaction(
  p_booking_id uuid, p_trip_completed boolean, p_rating integer, p_comment text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_interaction_id uuid;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'invalid rating';
  end if;
  if p_comment is not null and char_length(p_comment) > 2000 then
    raise exception 'comment too long';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;
  select id into v_interaction_id from public.passenger_interactions
  where booking_id = p_booking_id and actor_id = auth.uid()
  order by created_at desc limit 1;
  if v_interaction_id is null then
    insert into public.passenger_interactions (passenger_id, booking_id, actor_id, trip_completed, rating, comment)
    values (v_booking.passenger_id, p_booking_id, auth.uid(), p_trip_completed, p_rating, coalesce(p_comment, ''))
    returning id into v_interaction_id;
  else
    update public.passenger_interactions
    set trip_completed = p_trip_completed, rating = p_rating, comment = coalesce(p_comment, ''), updated_at = now()
    where id = v_interaction_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'passenger_interaction_saved', 'booking', p_booking_id::text,
          jsonb_build_object('trip_completed', p_trip_completed, 'rating', p_rating,
                             'comment_length', char_length(coalesce(p_comment, ''))));
  return v_interaction_id;
end;
$$;
revoke all on function public.save_passenger_interaction(uuid, boolean, integer, text) from public;
grant execute on function public.save_passenger_interaction(uuid, boolean, integer, text) to authenticated;

create or replace function public.notify_admins_new_booking()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if exists (
    select 1 from public.admin_notifications n
    where n.booking_id = new.booking_id and n.type = 'new_booking'
  ) then
    return new;
  end if;
  select * into v_booking from public.bookings where id = new.booking_id;
  insert into public.admin_notifications (recipient_id, type, booking_id, passenger_id, title, message, metadata)
  select ap.user_id, 'new_booking', v_booking.id, v_booking.passenger_id,
    'Нове бронювання',
    format('Бронювання %s від пасажира %s очікує підтвердження',
      v_booking.booking_number, coalesce(nullif(btrim(new.full_name), ''), 'Без імені')),
    jsonb_build_object('booking_number', v_booking.booking_number,
      'passenger_name', new.full_name, 'status', v_booking.status)
  from public.admin_profiles ap
  where ap.active = true and ap.role in ('super_admin', 'admin', 'support');
  return new;
end;
$$;
drop trigger if exists notify_admins_new_booking on public.bookings;
drop trigger if exists notify_admins_new_booking on public.booking_passengers;
create trigger notify_admins_new_booking
  after insert on public.booking_passengers
  for each row execute function public.notify_admins_new_booking();

create or replace function public.admin_request_booking_cancellation(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_request_id uuid;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'reason too long';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking not found';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'booking cannot be cancelled';
  end if;
  select id into v_request_id from public.booking_cancellation_requests
  where booking_id = p_booking_id and status in ('new', 'in_progress')
  order by created_at desc limit 1;
  if v_request_id is null then
    insert into public.booking_cancellation_requests (booking_id, passenger_id, reason, status)
    values (p_booking_id, v_booking.passenger_id, p_reason, 'new')
    returning id into v_request_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'booking_cancellation_requested', 'booking', p_booking_id::text,
          jsonb_build_object('reason', p_reason, 'request_id', v_request_id));
  return v_request_id;
end;
$$;
revoke all on function public.admin_request_booking_cancellation(uuid, text) from public;
grant execute on function public.admin_request_booking_cancellation(uuid, text) to authenticated;

create or replace function public.admin_update_booking_passenger(
  p_booking_id uuid, p_full_name text, p_email text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_passenger_id uuid;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) < 2 then
    raise exception 'invalid full name';
  end if;
  if p_email is not null and char_length(p_email) > 320 then
    raise exception 'invalid email';
  end if;
  if p_phone is not null and char_length(p_phone) > 32 then
    raise exception 'invalid phone';
  end if;
  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'booking not found';
  end if;
  select id into v_passenger_id from public.booking_passengers
  where booking_id = p_booking_id order by id limit 1 for update;
  if v_passenger_id is null then
    raise exception 'passenger not found';
  end if;
  update public.booking_passengers
  set full_name = btrim(p_full_name), email = nullif(btrim(p_email), ''), phone = nullif(btrim(p_phone), '')
  where id = v_passenger_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'booking_passenger_updated', 'booking', p_booking_id::text,
          jsonb_build_object('passenger_id', v_passenger_id));
  return v_passenger_id;
end;
$$;
revoke all on function public.admin_update_booking_passenger(uuid, text, text, text) from public;
grant execute on function public.admin_update_booking_passenger(uuid, text, text, text) to authenticated;