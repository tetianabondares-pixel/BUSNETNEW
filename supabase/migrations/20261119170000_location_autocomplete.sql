drop function if exists public.search_locations(text, text, integer);

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
  select l.id,
    case when p_language = 'en' and l.name_en is not null then l.name_en
         when p_language = 'it' and l.name_it is not null then l.name_it
         else l.name_uk end,
    l.name_uk, l.name_en, l.name_it, l.country_code, l.provider_location_id,
    exists (
      select 1 from public.popular_routes pr
      join public.routes r on r.id = pr.route_id
      where pr.active and r.active
        and (r.from_location_id = l.id or r.to_location_id = l.id)
    )
  from public.locations l cross join q
  where l.active and (
    q.value = '' or
    lower(l.name_uk) = q.value or lower(coalesce(l.name_en, '')) = q.value or
    lower(coalesce(l.name_it, '')) = q.value or lower(coalesce(l.ascii_name, '')) = q.value or
    lower(l.name_uk) like q.value || '%' or lower(coalesce(l.name_en, '')) like q.value || '%' or
    lower(coalesce(l.name_it, '')) like q.value || '%' or lower(coalesce(l.ascii_name, '')) like q.value || '%' or
    lower(l.name_uk) like '%' || q.value || '%' or lower(coalesce(l.name_en, '')) like '%' || q.value || '%' or
    lower(coalesce(l.name_it, '')) like '%' || q.value || '%' or lower(coalesce(l.ascii_name, '')) like '%' || q.value || '%' or
    exists (select 1 from jsonb_array_elements_text(l.aliases) alias_value
      where lower(alias_value) = q.value or lower(alias_value) like q.value || '%' or lower(alias_value) like '%' || q.value || '%')
  )
  order by
    case when q.value = '' then 0
         when lower(case when p_language = 'en' and l.name_en is not null then l.name_en
                         when p_language = 'it' and l.name_it is not null then l.name_it else l.name_uk end) = q.value then 0
         when exists (select 1 from jsonb_array_elements_text(l.aliases) a where lower(a) = q.value) then 1
         when lower(l.name_uk) = q.value or lower(coalesce(l.name_en, '')) = q.value or lower(coalesce(l.name_it, '')) = q.value then 2
         when lower(case when p_language = 'en' and l.name_en is not null then l.name_en
                         when p_language = 'it' and l.name_it is not null then l.name_it else l.name_uk end) like q.value || '%' then 3
         when exists (select 1 from jsonb_array_elements_text(l.aliases) a where lower(a) like q.value || '%') then 4
         else 5 end,
    (not exists (select 1 from public.popular_routes pr join public.routes r on r.id = pr.route_id
      where pr.active and r.active and (r.from_location_id = l.id or r.to_location_id = l.id)))::int,
    lower(l.name_uk), l.id
  limit greatest(1, least(coalesce(p_limit, 10), 20));
$$;

create or replace function public.search_destination_locations(
  p_query text, p_language text default 'uk', p_limit integer default 10,
  p_from_location_id uuid default null
) returns table (
  id uuid, name text, name_uk text, name_en text, name_it text,
  country_code char(2), provider_location_id text, is_popular boolean
)
language sql stable security invoker set search_path = public
as $$
  select l.* from public.search_locations(p_query, p_language, p_limit) l
  where (p_from_location_id is null or exists (
    select 1 from public.routes r
    where r.active and r.from_location_id = p_from_location_id and r.to_location_id = l.id
  )) and (p_from_location_id is null or l.id <> p_from_location_id)
  order by l.is_popular desc, l.name;
$$;

create or replace function public.search_origin_locations(
  p_query text, p_language text default 'uk', p_limit integer default 10,
  p_to_location_id uuid default null
) returns table (
  id uuid, name text, name_uk text, name_en text, name_it text,
  country_code char(2), provider_location_id text, is_popular boolean
)
language sql stable security invoker set search_path = public
as $$
  select l.* from public.search_locations(p_query, p_language, p_limit) l
  where (p_to_location_id is null or exists (
    select 1 from public.routes r
    where r.active and r.to_location_id = p_to_location_id and r.from_location_id = l.id
  )) and (p_to_location_id is null or l.id <> p_to_location_id)
  order by l.is_popular desc, l.name;
$$;

create index if not exists routes_active_pair_idx
  on public.routes(from_location_id, to_location_id) where active = true;

drop function if exists public.get_month_availability(integer, integer, text, text, text, text);

create or replace function public.get_month_availability(
  p_year integer, p_month integer, p_from_location_id uuid, p_to_location_id uuid,
  p_timezone text default 'Europe/Kyiv', p_schema_version text default '1'
) returns table (
  date date, trips_count bigint, min_price numeric, max_price numeric,
  currency char(3), routes text[], is_available boolean
)
language sql stable security invoker set search_path = public
as $$
  with month_days as (
    select day::date from generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
      interval '1 day'
    ) day
  )
  select d.day, count(distinct t.id), min(tp.price), max(tp.price),
    (array_agg(tp.currency order by tp.confirmed_at desc))[1],
    array_agg(distinct lf.name_uk || ' — ' || lt.name_uk) filter (where r.id is not null),
    count(distinct t.id) > 0
  from month_days d
  left join public.routes r on r.active
    and r.from_location_id = p_from_location_id and r.to_location_id = p_to_location_id
  left join public.locations lf on lf.id = r.from_location_id and lf.active
  left join public.locations lt on lt.id = r.to_location_id and lt.active
  left join public.trips t on t.route_id = r.id and t.departure_at::date = d.day
    and t.status in ('scheduled', 'active') and t.departure_at >= now()
  left join public.trip_prices tp on tp.trip_id = t.id
    and (tp.expires_at is null or tp.expires_at > now())
  group by d.day order by d.day;
$$;
