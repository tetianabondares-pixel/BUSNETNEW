create or replace function public.admin_booking_dashboard_summary()
returns table (
  total_count bigint,
  attention_count bigint,
  upcoming_count bigint,
  completed_count bigint,
  pending_count bigint,
  confirmed_count bigint,
  cancelled_count bigint,
  cancellation_request_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;

  return query
  select
    (select count(*) from public.bookings),
    (select count(*)
     from public.bookings b
     where b.status in ('pending', 'expired')
       or exists (
         select 1
         from public.booking_cancellation_requests cr
         where cr.booking_id = b.id
           and cr.status in ('new', 'in_progress')
       )),
    (select count(*)
     from public.bookings b
     join public.trips t on t.id = b.trip_id
     where b.status in ('pending', 'confirmed')
       and t.status in ('scheduled', 'active')
       and t.departure_at >= now()),
    (select count(*)
     from public.bookings b
     join public.trips t on t.id = b.trip_id
     where t.status = 'completed'
       and b.status in ('confirmed', 'refunded')),
    (select count(*) from public.bookings where status = 'pending'),
    (select count(*) from public.bookings where status = 'confirmed'),
    (select count(*) from public.bookings where status = 'cancelled'),
    (select count(*)
     from public.booking_cancellation_requests
     where status in ('new', 'in_progress'));
end;
$$;

revoke all on function public.admin_booking_dashboard_summary() from public;
grant execute on function public.admin_booking_dashboard_summary() to authenticated;

create or replace function public.admin_search_booking_dashboard(
  p_query text default null,
  p_status text default null,
  p_category text default 'all',
  p_created_from date default null,
  p_created_to date default null,
  p_departure_from date default null,
  p_departure_to date default null,
  p_carrier text default null,
  p_currency text default null,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_passenger_count integer default null,
  p_page integer default 0,
  p_page_size integer default 50
)
returns table (
  id uuid,
  booking_number text,
  status text,
  currency text,
  total_amount numeric,
  created_at timestamptz,
  expires_at timestamptz,
  confirmed_at timestamptz,
  provider_booking_id text,
  passenger_id uuid,
  trip_id uuid,
  trip_details jsonb,
  booking_passengers jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_carrier text := nullif(btrim(p_carrier), '');
  v_currency text := nullif(btrim(p_currency), '');
  v_timezone text;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception 'authorization denied';
  end if;

  select setting_value #>> '{}'
  into v_timezone
  from public.admin_settings
  where setting_key = 'timezone';
  v_timezone := coalesce(nullif(v_timezone, ''), 'Europe/Kyiv');
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'invalid admin timezone setting';
  end if;
  if p_page < 0 or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid pagination';
  end if;
  if p_status is not null and p_status not in (
    'pending', 'confirmed', 'cancelled', 'expired', 'refunded'
  ) then
    raise exception 'invalid booking status';
  end if;
  if p_category not in ('all', 'attention', 'upcoming', 'completed', 'cancelled') then
    raise exception 'invalid booking category';
  end if;
  if (p_created_from is not null and p_created_to is not null and p_created_from > p_created_to)
    or (p_departure_from is not null and p_departure_to is not null and p_departure_from > p_departure_to) then
    raise exception 'invalid date range';
  end if;
  if p_min_amount is not null and p_min_amount < 0
    or p_max_amount is not null and p_max_amount < 0
    or p_min_amount is not null and p_max_amount is not null and p_min_amount > p_max_amount then
    raise exception 'invalid amount range';
  end if;
  if p_passenger_count is not null and p_passenger_count < 1 then
    raise exception 'invalid passenger count';
  end if;

  return query
  with matched as (
    select b.id
    from public.bookings b
    left join public.trips t on t.id = b.trip_id
    left join public.routes r on r.id = t.route_id
    left join public.locations origin on origin.id = r.from_location_id
    left join public.locations destination on destination.id = r.to_location_id
    where (p_status is null or b.status = p_status)
      and (
        p_created_from is null
        or b.created_at >= (p_created_from::timestamp at time zone v_timezone)
      )
      and (
        p_created_to is null
        or b.created_at < ((p_created_to + 1)::timestamp at time zone v_timezone)
      )
      and (
        p_departure_from is null
        or (t.departure_at at time zone v_timezone)::date >= p_departure_from
      )
      and (
        p_departure_to is null
        or (t.departure_at at time zone v_timezone)::date <= p_departure_to
      )
      and (v_carrier is null or t.carrier = v_carrier)
      and (v_currency is null or b.currency::text = v_currency)
      and (p_min_amount is null or b.total_amount >= p_min_amount)
      and (p_max_amount is null or b.total_amount <= p_max_amount)
      and (
        p_passenger_count is null
        or (select count(*) from public.booking_passengers bp where bp.booking_id = b.id) = p_passenger_count
      )
      and (
        p_category = 'all'
        or (p_category = 'attention' and (
          b.status in ('pending', 'expired')
          or exists (
            select 1
            from public.booking_cancellation_requests cr
            where cr.booking_id = b.id and cr.status in ('new', 'in_progress')
          )
        ))
        or (p_category = 'upcoming'
          and b.status in ('pending', 'confirmed')
          and t.status in ('scheduled', 'active')
          and t.departure_at >= now())
        or (p_category = 'completed'
          and t.status = 'completed'
          and b.status in ('confirmed', 'refunded'))
        or (p_category = 'cancelled' and b.status = 'cancelled')
      )
      and (
        v_query is null
        or b.booking_number ilike '%' || v_query || '%'
        or b.status ilike '%' || v_query || '%'
        or b.trip_id::text ilike '%' || v_query || '%'
        or coalesce(origin.name_uk, '') ilike '%' || v_query || '%'
        or coalesce(origin.name_en, '') ilike '%' || v_query || '%'
        or coalesce(origin.name_it, '') ilike '%' || v_query || '%'
        or coalesce(destination.name_uk, '') ilike '%' || v_query || '%'
        or coalesce(destination.name_en, '') ilike '%' || v_query || '%'
        or coalesce(destination.name_it, '') ilike '%' || v_query || '%'
        or coalesce(t.carrier, '') ilike '%' || v_query || '%'
        or exists (
          select 1
          from public.booking_passengers bp
          where bp.booking_id = b.id
            and (
              bp.full_name ilike '%' || v_query || '%'
              or coalesce(bp.email, '') ilike '%' || v_query || '%'
              or coalesce(bp.phone, '') ilike '%' || v_query || '%'
            )
        )
      )
  )
  select
    b.id,
    b.booking_number,
    b.status,
    b.currency::text,
    b.total_amount,
    b.created_at,
    b.expires_at,
    b.confirmed_at,
    b.provider_booking_id,
    b.passenger_id,
    b.trip_id,
    coalesce((
      select jsonb_build_object(
        'departure_at', t.departure_at,
        'arrival_at', t.arrival_at,
        'carrier', t.carrier,
        'trip_status', t.status,
        'open_cancellation_request', exists (
          select 1
          from public.booking_cancellation_requests cr
          where cr.booking_id = b.id
            and cr.status in ('new', 'in_progress')
        ),
        'from_city', origin.name_uk,
        'to_city', destination.name_uk
      )
      from public.trips t
      join public.routes r on r.id = t.route_id
      join public.locations origin on origin.id = r.from_location_id
      join public.locations destination on destination.id = r.to_location_id
      where t.id = b.trip_id
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'full_name', bp.full_name,
        'email', bp.email,
        'phone', bp.phone,
        'seat_number', bp.seat_number,
        'nationality', case
          when public.has_admin_role(array['super_admin', 'admin']) then bp.nationality
          else null
        end,
        'document_type', case
          when public.has_admin_role(array['super_admin', 'admin']) then bp.document_type
          else null
        end,
        'document_number', case
          when public.has_admin_role(array['super_admin', 'admin']) then bp.document_number
          else null
        end
      ) order by bp.id)
      from public.booking_passengers bp
      where bp.booking_id = b.id
    ), '[]'::jsonb),
    count(*) over()
  from matched
  join public.bookings b on b.id = matched.id
  order by b.created_at desc
  limit p_page_size
  offset (p_page * p_page_size);
end;
$$;

revoke all on function public.admin_search_booking_dashboard(text, text, text, date, date, date, date, text, text, numeric, numeric, integer, integer, integer) from public;
grant execute on function public.admin_search_booking_dashboard(text, text, text, date, date, date, date, text, text, numeric, numeric, integer, integer, integer) to authenticated;
