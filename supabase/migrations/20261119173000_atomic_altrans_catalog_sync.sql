create or replace function public.sync_altrans_catalog(
  p_locations jsonb,
  p_routes jsonb
)
returns table (imported_locations bigint, imported_routes bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_locations bigint;
  v_routes bigint;
  v_expected_routes bigint;
begin
  if jsonb_typeof(p_locations) is distinct from 'array'
    or jsonb_typeof(p_routes) is distinct from 'array' then
    raise exception 'Catalog payloads must be JSON arrays';
  end if;

  v_expected_routes := jsonb_array_length(p_routes);
  if v_expected_routes = 0 then
    raise exception 'Catalog must include routes';
  end if;

  insert into public.locations (
    provider_location_id,
    name_uk,
    normalized_name,
    active
  )
  select distinct on (location.provider_location_id)
    location.provider_location_id,
    location.name_uk,
    location.normalized_name,
    location.active
  from jsonb_to_recordset(p_locations) as location(
    provider_location_id text,
    name_uk text,
    normalized_name text,
    active boolean
  )
  order by location.provider_location_id
  on conflict (provider_location_id) do update
  set name_uk = excluded.name_uk,
      normalized_name = excluded.normalized_name,
      active = excluded.active;

  get diagnostics v_locations = row_count;

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
  set active = excluded.active;

  get diagnostics v_routes = row_count;
  if v_routes <> v_expected_routes then
    raise exception 'Catalog route count mismatch: expected %, imported %',
      v_expected_routes, v_routes;
  end if;

  return query select v_locations, v_routes;
end;
$$;

revoke all on function public.sync_altrans_catalog(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_altrans_catalog(jsonb, jsonb)
  to service_role;
