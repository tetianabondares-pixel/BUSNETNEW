create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  preferred_locale text not null default 'uk' check (preferred_locale in ('uk', 'en', 'it')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name_uk text not null,
  name_en text,
  name_it text,
  normalized_name text not null,
  ascii_name text,
  aliases jsonb not null default '[]'::jsonb,
  country_code char(2),
  provider_location_id text unique,
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  provider_route_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_location_id, to_location_id, provider_route_id),
  constraint routes_different_locations check (from_location_id <> to_location_id)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  provider_trip_id text unique,
  departure_at timestamptz not null,
  arrival_at timestamptz,
  duration_minutes integer,
  carrier text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'cancelled', 'completed')),
  external_version text,
  external_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  stop_order integer not null,
  arrival_offset interval,
  departure_offset interval,
  day_offset integer not null default 0,
  is_pickup boolean not null default false,
  is_dropoff boolean not null default false,
  unique (trip_id, stop_order)
);

create table if not exists public.trip_prices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  currency char(3) not null default 'UAH',
  price numeric(12,2) not null check (price >= 0),
  seats_available integer not null default 0 check (seats_available >= 0),
  source text not null default 'provider',
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (trip_id)
);

create table if not exists public.availability_cache (
  route_id uuid not null references public.routes(id) on delete cascade,
  travel_date date not null,
  trips_count integer not null default 0 check (trips_count >= 0),
  min_price numeric(12,2),
  max_price numeric(12,2),
  currency char(3),
  provider_source text,
  schema_version text not null default '1',
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (route_id, travel_date, schema_version)
);

create table if not exists public.provider_request_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  route_key text,
  travel_date date,
  status text not null,
  response_code integer,
  cache_hit boolean not null default false,
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.popular_routes (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  locale text not null check (locale in ('uk', 'en', 'it')),
  sort_order integer not null default 0,
  is_featured boolean not null default true,
  active boolean not null default true,
  unique (route_id, locale)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text unique not null,
  passenger_id uuid references auth.users(id),
  trip_id uuid not null references public.trips(id),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'refunded')),
  currency char(3) not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  expires_at timestamptz,
  provider_booking_id text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  seat_number text,
  nationality text,
  document_type text,
  document_number text
);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (
    role in ('super_admin', 'admin', 'content_manager', 'support', 'provider_operator')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.routes enable row level security;
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;
alter table public.trip_prices enable row level security;
alter table public.availability_cache enable row level security;
alter table public.provider_request_logs enable row level security;
alter table public.popular_routes enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_passengers enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "locations public read" on public.locations;
create policy "locations public read" on public.locations
  for select using (active = true);

drop policy if exists "routes public read" on public.routes;
create policy "routes public read" on public.routes
  for select using (active = true);

drop policy if exists "trips public read" on public.trips;
create policy "trips public read" on public.trips
  for select using (status in ('scheduled', 'active'));

drop policy if exists "trip stops public read" on public.trip_stops;
create policy "trip stops public read" on public.trip_stops
  for select using (exists (
    select 1 from public.trips t
    where t.id = trip_id and t.status in ('scheduled', 'active')
  ));

drop policy if exists "trip prices public read" on public.trip_prices;
create policy "trip prices public read" on public.trip_prices
  for select using (exists (
    select 1 from public.trips t
    where t.id = trip_id
      and t.status in ('scheduled', 'active')
  ));

drop policy if exists "availability public read" on public.availability_cache;
create policy "availability public read" on public.availability_cache
  for select using (expires_at > now());

drop policy if exists "popular routes public read" on public.popular_routes;
create policy "popular routes public read" on public.popular_routes
  for select using (active = true);

drop policy if exists "bookings passenger read" on public.bookings;
create policy "bookings passenger read" on public.bookings
  for select using (auth.uid() = passenger_id or public.is_admin());

drop policy if exists "admin profile read own" on public.admin_profiles;
create policy "admin profile read own" on public.admin_profiles
  for select using (auth.uid() = user_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, preferred_locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'preferred_locale', ''), 'uk')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.search_locations(
  p_query text,
  p_language text default 'uk',
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  country_code char(2),
  provider_location_id text
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id,
         case
           when p_language = 'en' and l.name_en is not null then l.name_en
           when p_language = 'it' and l.name_it is not null then l.name_it
           else l.name_uk
         end,
         l.country_code,
         l.provider_location_id
  from public.locations l
  where l.active = true
    and (
      l.normalized_name ilike '%' || lower(trim(p_query)) || '%'
      or l.ascii_name ilike '%' || lower(trim(p_query)) || '%'
      or l.name_uk ilike '%' || trim(p_query) || '%'
      or l.name_en ilike '%' || trim(p_query) || '%'
      or l.name_it ilike '%' || trim(p_query) || '%'
    )
  order by l.name_uk
  limit greatest(1, least(p_limit, 20));
$$;

create or replace function public.search_trips(
  p_from text,
  p_to text,
  p_travel_date date,
  p_passenger_count integer default 1,
  p_locale text default 'uk'
)
returns table (
  trip_id uuid,
  route_id uuid,
  departure_at timestamptz,
  arrival_at timestamptz,
  duration_minutes integer,
  carrier text,
  status text,
  currency char(3),
  price numeric,
  seats_available integer,
  provider_trip_id text
)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id,
         t.route_id,
         t.departure_at,
         t.arrival_at,
         t.duration_minutes,
         t.carrier,
         t.status,
         tp.currency,
         tp.price,
         tp.seats_available,
         t.provider_trip_id
  from public.trips t
  join public.routes r on r.id = t.route_id
  join public.locations lf on lf.id = r.from_location_id
  join public.locations lt on lt.id = r.to_location_id
  join public.trip_prices tp on tp.trip_id = t.id
  where r.active = true
    and lf.active = true
    and lt.active = true
    and t.status in ('scheduled', 'active')
    and t.departure_at >= now()
    and t.departure_at::date = p_travel_date
    and tp.seats_available >= greatest(p_passenger_count, 1)
    and (tp.expires_at is null or tp.expires_at > now())
    and (
      lf.normalized_name = lower(trim(p_from))
      or lf.ascii_name = lower(trim(p_from))
      or lf.name_uk = trim(p_from)
      or lf.name_en = trim(p_from)
      or lf.name_it = trim(p_from)
    )
    and (
      lt.normalized_name = lower(trim(p_to))
      or lt.ascii_name = lower(trim(p_to))
      or lt.name_uk = trim(p_to)
      or lt.name_en = trim(p_to)
      or lt.name_it = trim(p_to)
    )
  order by t.departure_at;
$$;

create or replace function public.get_month_availability(
  p_year integer,
  p_month integer,
  p_from text,
  p_to text,
  p_timezone text default 'Europe/Kyiv',
  p_schema_version text default '1'
)
returns table (
  date date,
  trips_count bigint,
  min_price numeric,
  max_price numeric,
  currency char(3),
  routes text[],
  is_available boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with route_matches as (
    select r.id,
           lf.name_uk as from_name,
           lt.name_uk as to_name
    from public.routes r
    join public.locations lf on lf.id = r.from_location_id
    join public.locations lt on lt.id = r.to_location_id
    where r.active = true
      and lf.active = true
      and lt.active = true
      and (
        lf.normalized_name = lower(trim(p_from))
        or lf.ascii_name = lower(trim(p_from))
        or lf.name_uk = trim(p_from)
        or lf.name_en = trim(p_from)
        or lf.name_it = trim(p_from)
      )
      and (
        lt.normalized_name = lower(trim(p_to))
        or lt.ascii_name = lower(trim(p_to))
        or lt.name_uk = trim(p_to)
        or lt.name_en = trim(p_to)
        or lt.name_it = trim(p_to)
      )
  ),
  month_days as (
    select day::date
    from generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
      interval '1 day'
    ) day
  )
  select d.day,
         count(distinct t.id),
         min(tp.price),
         max(tp.price),
         (array_agg(tp.currency order by tp.confirmed_at desc))[1],
         array_agg(distinct rm.from_name || ' — ' || rm.to_name)
           filter (where rm.id is not null),
         count(distinct t.id) > 0
  from month_days d
  left join public.trips t
    on t.departure_at::date = d.day
   and t.status in ('scheduled', 'active')
   and t.departure_at >= now()
  left join route_matches rm on rm.id = t.route_id
  left join public.trip_prices tp
    on tp.trip_id = t.id
   and (tp.expires_at is null or tp.expires_at > now())
  group by d.day
  order by d.day;
$$;

create index if not exists locations_normalized_name_idx
  on public.locations(normalized_name);
create index if not exists locations_ascii_name_idx
  on public.locations(ascii_name);
create index if not exists locations_active_idx
  on public.locations(active);
create index if not exists trips_route_departure_idx
  on public.trips(route_id, departure_at);
create index if not exists trips_status_departure_idx
  on public.trips(status, departure_at);
create index if not exists trip_prices_trip_idx
  on public.trip_prices(trip_id);
create index if not exists bookings_passenger_idx
  on public.bookings(passenger_id);
create index if not exists bookings_status_idx
  on public.bookings(status);
