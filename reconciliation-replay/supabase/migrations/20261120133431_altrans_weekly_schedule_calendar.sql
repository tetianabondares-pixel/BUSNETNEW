create table if not exists public.provider_route_schedules (
  id uuid primary key default gen_random_uuid(),
  provider_route_id text not null,
  schedule_key text not null,
  title text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  service_weekday smallint not null check (service_weekday between 1 and 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_route_id, schedule_key, direction)
);

create table if not exists public.provider_route_schedule_stops (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.provider_route_schedules(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  stop_order integer not null check (stop_order >= 0),
  day_offset smallint not null check (day_offset between 0 and 6),
  departure_time time not null,
  place text,
  latitude double precision,
  longitude double precision,
  unique (schedule_id, stop_order)
);

create index if not exists provider_route_schedules_active_route_idx
  on public.provider_route_schedules(provider_route_id, active);
create index if not exists provider_route_schedule_stops_location_idx
  on public.provider_route_schedule_stops(schedule_id, location_id, stop_order);

alter table public.provider_route_schedules enable row level security;
alter table public.provider_route_schedule_stops enable row level security;

drop policy if exists "active provider schedules public read"
  on public.provider_route_schedules;
create policy "active provider schedules public read"
  on public.provider_route_schedules for select using (active = true);

drop policy if exists "active provider schedule stops public read"
  on public.provider_route_schedule_stops;
create policy "active provider schedule stops public read"
  on public.provider_route_schedule_stops for select using (
    exists (
      select 1
      from public.provider_route_schedules schedule
      where schedule.id = provider_route_schedule_stops.schedule_id
        and schedule.active = true
    )
  );

grant select on public.provider_route_schedules, public.provider_route_schedule_stops
  to anon, authenticated;

create or replace function public.search_locations(
  p_query text,
  p_language text default 'uk',
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  name_uk text,
  name_en text,
  name_it text,
  country_code char(2),
  provider_location_id text,
  is_popular boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')) as value
  )
  select
    location.id,
    case
      when p_language = 'en' and location.name_en is not null then location.name_en
      when p_language = 'it' and location.name_it is not null then location.name_it
      else location.name_uk
    end,
    location.name_uk,
    location.name_en,
    location.name_it,
    location.country_code,
    location.provider_location_id,
    exists (
      select 1
      from public.popular_routes popular
      join public.routes route on route.id = popular.route_id
      where popular.active
        and route.active
        and (route.from_location_id = location.id or route.to_location_id = location.id)
    )
  from public.locations location
  cross join q
  where location.active
    and exists (
      select 1
      from public.routes route
      where route.active
        and (route.from_location_id = location.id or route.to_location_id = location.id)
    )
    and (
      q.value = ''
      or lower(location.name_uk) = q.value
      or lower(coalesce(location.name_en, '')) = q.value
      or lower(coalesce(location.name_it, '')) = q.value
      or lower(coalesce(location.ascii_name, '')) = q.value
      or lower(location.name_uk) like q.value || '%'
      or lower(coalesce(location.name_en, '')) like q.value || '%'
      or lower(coalesce(location.name_it, '')) like q.value || '%'
      or lower(coalesce(location.ascii_name, '')) like q.value || '%'
      or lower(location.name_uk) like '%' || q.value || '%'
      or lower(coalesce(location.name_en, '')) like '%' || q.value || '%'
      or lower(coalesce(location.name_it, '')) like '%' || q.value || '%'
      or lower(coalesce(location.ascii_name, '')) like '%' || q.value || '%'
      or exists (
        select 1
        from jsonb_array_elements_text(location.aliases) alias_value
        where lower(alias_value) = q.value
          or lower(alias_value) like q.value || '%'
          or lower(alias_value) like '%' || q.value || '%'
      )
    )
  order by
    case
      when q.value = '' then 0
      when lower(case
        when p_language = 'en' and location.name_en is not null then location.name_en
        when p_language = 'it' and location.name_it is not null then location.name_it
        else location.name_uk
      end) = q.value then 0
      when exists (
        select 1
        from jsonb_array_elements_text(location.aliases) alias_value
        where lower(alias_value) = q.value
      ) then 1
      when lower(location.name_uk) = q.value
        or lower(coalesce(location.name_en, '')) = q.value
        or lower(coalesce(location.name_it, '')) = q.value then 2
      when lower(case
        when p_language = 'en' and location.name_en is not null then location.name_en
        when p_language = 'it' and location.name_it is not null then location.name_it
        else location.name_uk
      end) like q.value || '%' then 3
      when exists (
        select 1
        from jsonb_array_elements_text(location.aliases) alias_value
        where lower(alias_value) like q.value || '%'
      ) then 4
      else 5
    end,
    (not exists (
      select 1
      from public.popular_routes popular
      join public.routes route on route.id = popular.route_id
      where popular.active
        and route.active
        and (route.from_location_id = location.id or route.to_location_id = location.id)
    ))::integer,
    lower(location.name_uk),
    location.id
  limit greatest(1, least(coalesce(p_limit, 10), 20));
$$;

drop function if exists public.sync_altrans_catalog(jsonb, jsonb);

create function public.sync_altrans_catalog(
  p_locations jsonb,
  p_routes jsonb,
  p_schedules jsonb
)
returns table (
  imported_locations bigint,
  imported_routes bigint,
  imported_schedules bigint,
  imported_schedule_stops bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_locations bigint;
  v_routes bigint;
  v_schedules bigint := 0;
  v_schedule_stops bigint := 0;
  v_expected_locations bigint;
  v_expected_routes bigint;
  v_expected_schedules bigint;
  v_schedule record;
  v_stop record;
  v_schedule_id uuid;
  v_location_id uuid;
begin
  if jsonb_typeof(p_locations) is distinct from 'array'
    or jsonb_typeof(p_routes) is distinct from 'array'
    or jsonb_typeof(p_schedules) is distinct from 'array' then
    raise exception 'Catalog payloads must be JSON arrays';
  end if;

  v_expected_locations := jsonb_array_length(p_locations);
  v_expected_routes := jsonb_array_length(p_routes);
  v_expected_schedules := jsonb_array_length(p_schedules);
  if v_expected_locations = 0 or v_expected_routes = 0
    or v_expected_schedules = 0 then
    raise exception 'Catalog must include locations, routes, and schedules';
  end if;

  insert into public.locations (
    provider_location_id,
    name_uk,
    name_en,
    name_it,
    normalized_name,
    ascii_name,
    aliases,
    country_code,
    active
  )
  select distinct on (location.provider_location_id)
    location.provider_location_id,
    location.name_uk,
    location.name_en,
    location.name_it,
    location.normalized_name,
    location.ascii_name,
    coalesce(location.aliases, '[]'::jsonb),
    location.country_code,
    location.active
  from jsonb_to_recordset(p_locations) as location(
    provider_location_id text,
    name_uk text,
    name_en text,
    name_it text,
    normalized_name text,
    ascii_name text,
    aliases jsonb,
    country_code char(2),
    active boolean
  )
  order by location.provider_location_id
  on conflict (provider_location_id) do update
  set name_uk = excluded.name_uk,
      name_en = coalesce(excluded.name_en, locations.name_en),
      name_it = coalesce(excluded.name_it, locations.name_it),
      normalized_name = excluded.normalized_name,
      ascii_name = coalesce(excluded.ascii_name, locations.ascii_name),
      aliases = case
        when jsonb_array_length(excluded.aliases) > 0 then excluded.aliases
        else locations.aliases
      end,
      country_code = coalesce(excluded.country_code, locations.country_code),
      active = excluded.active;

  get diagnostics v_locations = row_count;
  if v_locations <> v_expected_locations then
    raise exception 'Catalog location count mismatch: expected %, imported %',
      v_expected_locations, v_locations;
  end if;

  insert into public.routes (
    from_location_id,
    to_location_id,
    provider_route_id,
    active
  )
  select distinct
    from_location.id,
    to_location.id,
    route.provider_route_id,
    route.active
  from jsonb_to_recordset(p_routes) as route(
    from_provider_location_id text,
    to_provider_location_id text,
    provider_route_id text,
    active boolean
  )
  join public.locations from_location
    on from_location.provider_location_id = route.from_provider_location_id
  join public.locations to_location
    on to_location.provider_location_id = route.to_provider_location_id
  on conflict (from_location_id, to_location_id, provider_route_id) do update
  set active = excluded.active,
      updated_at = now();

  get diagnostics v_routes = row_count;
  if v_routes <> v_expected_routes then
    raise exception 'Catalog route count mismatch: expected %, imported %',
      v_expected_routes, v_routes;
  end if;

  update public.routes existing
  set active = false,
      updated_at = now()
  where existing.provider_route_id is not null
    and existing.active
    and existing.provider_route_id in (
      select distinct schedule.provider_route_id
      from public.provider_route_schedules schedule
    )
    and not exists (
      select 1
      from jsonb_to_recordset(p_routes) as route(
        from_provider_location_id text,
        to_provider_location_id text,
        provider_route_id text,
        active boolean
      )
      join public.locations from_location
        on from_location.provider_location_id = route.from_provider_location_id
      join public.locations to_location
        on to_location.provider_location_id = route.to_provider_location_id
      where existing.from_location_id = from_location.id
        and existing.to_location_id = to_location.id
        and existing.provider_route_id = route.provider_route_id
    );

  update public.provider_route_schedules existing
  set active = false,
      updated_at = now()
  where existing.active
    and not exists (
      select 1
      from jsonb_to_recordset(p_schedules) as schedule(
        provider_route_id text,
        schedule_key text,
        title text,
        direction text,
        service_weekday smallint,
        stops jsonb
      )
      where existing.provider_route_id = schedule.provider_route_id
        and existing.schedule_key = schedule.schedule_key
        and existing.direction = schedule.direction
    );

  for v_schedule in
    select *
    from jsonb_to_recordset(p_schedules) as schedule(
      provider_route_id text,
      schedule_key text,
      title text,
      direction text,
      service_weekday smallint,
      stops jsonb
    )
  loop
    if v_schedule.provider_route_id is null or v_schedule.schedule_key is null
      or v_schedule.direction is null
      or v_schedule.direction not in ('outbound', 'inbound')
      or v_schedule.service_weekday is null
      or v_schedule.service_weekday not between 1 and 7
      or jsonb_typeof(v_schedule.stops) is distinct from 'array'
      or jsonb_array_length(v_schedule.stops) < 2 then
      raise exception 'Invalid provider schedule';
    end if;

    insert into public.provider_route_schedules (
      provider_route_id,
      schedule_key,
      title,
      direction,
      service_weekday,
      active,
      updated_at
    )
    values (
      v_schedule.provider_route_id,
      v_schedule.schedule_key,
      coalesce(nullif(v_schedule.title, ''), v_schedule.schedule_key),
      v_schedule.direction,
      v_schedule.service_weekday,
      true,
      now()
    )
    on conflict (provider_route_id, schedule_key, direction) do update
    set title = excluded.title,
        service_weekday = excluded.service_weekday,
        active = true,
        updated_at = now()
    returning id into v_schedule_id;

    delete from public.provider_route_schedule_stops
    where schedule_id = v_schedule_id;

    for v_stop in
      select *
      from jsonb_to_recordset(v_schedule.stops) as stop(
        provider_location_id text,
        stop_order integer,
        day_offset smallint,
        departure_time time,
        place text,
        latitude double precision,
        longitude double precision
      )
    loop
      if v_stop.provider_location_id is null
        or v_stop.stop_order is null
        or v_stop.stop_order < 0
        or v_stop.day_offset is null
        or v_stop.day_offset not between 0 and 6
        or v_stop.departure_time is null then
        raise exception 'Invalid provider schedule stop';
      end if;

      select location.id into v_location_id
      from public.locations location
      where location.provider_location_id = v_stop.provider_location_id
        and location.active = true;
      if not found then
        raise exception 'Schedule references unknown provider location %',
          v_stop.provider_location_id;
      end if;

      insert into public.provider_route_schedule_stops (
        schedule_id,
        location_id,
        stop_order,
        day_offset,
        departure_time,
        place,
        latitude,
        longitude
      )
      values (
        v_schedule_id,
        v_location_id,
        v_stop.stop_order,
        v_stop.day_offset,
        v_stop.departure_time,
        v_stop.place,
        v_stop.latitude,
        v_stop.longitude
      );
      v_schedule_stops := v_schedule_stops + 1;
    end loop;

    v_schedules := v_schedules + 1;
  end loop;

  if v_schedules <> v_expected_schedules then
    raise exception 'Catalog schedule count mismatch: expected %, imported %',
      v_expected_schedules, v_schedules;
  end if;

  return query select v_locations, v_routes, v_schedules, v_schedule_stops;
end;
$$;

revoke all on function public.sync_altrans_catalog(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_altrans_catalog(jsonb, jsonb, jsonb)
  to service_role;

drop function if exists public.get_month_availability(integer, integer, uuid, uuid, text, text);

create function public.get_month_availability(
  p_year integer,
  p_month integer,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_timezone text default 'Europe/Kyiv'
)
returns table (
  date date,
  scheduled_services_count bigint,
  routes text[],
  is_available boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with month_days as (
    select day::date
    from generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
      interval '1 day'
    ) day
  ),
  matching_schedules as (
    select
      day.day,
      schedule.id as schedule_id,
      from_location.name_uk || ' — ' || to_location.name_uk as route_name
    from month_days day
    join public.routes route
      on route.active
      and route.from_location_id = p_from_location_id
      and route.to_location_id = p_to_location_id
    join public.provider_route_schedules schedule
      on schedule.active
      and schedule.provider_route_id = route.provider_route_id
    join public.provider_route_schedule_stops from_stop
      on from_stop.schedule_id = schedule.id
      and from_stop.location_id = p_from_location_id
    join public.provider_route_schedule_stops to_stop
      on to_stop.schedule_id = schedule.id
      and to_stop.location_id = p_to_location_id
      and to_stop.stop_order > from_stop.stop_order
    join public.locations from_location
      on from_location.id = p_from_location_id
      and from_location.active
    join public.locations to_location
      on to_location.id = p_to_location_id
      and to_location.active
    where schedule.service_weekday =
        extract(isodow from (day.day - from_stop.day_offset))::smallint
      and day.day <= (now() at time zone p_timezone)::date + 365
      and (day.day + from_stop.departure_time) >
        (now() at time zone (
          case
            when from_location.country_code = 'IT' then 'Europe/Rome'
            else p_timezone
          end
        ))
  )
  select
    day.day,
    count(distinct matching.schedule_id),
    coalesce(
      array_agg(distinct matching.route_name)
        filter (where matching.schedule_id is not null),
      array[]::text[]
    ),
    count(distinct matching.schedule_id) > 0
  from month_days day
  left join matching_schedules matching on matching.day = day.day
  group by day.day
  order by day.day;
$$;

revoke all on function public.get_month_availability(integer, integer, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_month_availability(integer, integer, uuid, uuid, text)
  to anon, authenticated;