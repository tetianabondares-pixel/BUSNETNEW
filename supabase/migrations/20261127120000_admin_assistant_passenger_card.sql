create or replace function public.admin_get_passenger_assistant_card(
  p_passenger_id uuid,
  p_page integer default 0,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profile jsonb;
  v_summary jsonb;
  v_bookings jsonb;
  v_booking_count integer;
begin
  if not public.has_admin_role(array['super_admin', 'admin', 'support']) then
    raise exception using errcode = '42501', message = 'authorization denied';
  end if;

  if p_passenger_id is null then
    raise exception using errcode = '22023', message = 'passenger id is required';
  end if;

  if p_page is null or p_page < 0 or p_page > 100000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'phone', p.phone,
    'preferred_locale', p.preferred_locale,
    'created_at', p.created_at
  )
  into v_profile
  from public.profiles p
  where p.id = p_passenger_id;

  if v_profile is null then
    raise exception using errcode = 'P0002', message = 'passenger not found';
  end if;

  select
    count(*)::integer,
    jsonb_build_object(
      'booking_count', count(*)::integer,
      'pending_booking_count', count(*) filter (where b.status = 'pending')::integer,
      'confirmed_booking_count', count(*) filter (where b.status = 'confirmed')::integer,
      'cancelled_booking_count', count(*) filter (where b.status = 'cancelled')::integer,
      'expired_booking_count', count(*) filter (where b.status = 'expired')::integer,
      'refunded_booking_count', count(*) filter (where b.status = 'refunded')::integer,
      'completed_trip_record_count', count(*) filter (
        where t.status = 'completed' and b.status = 'confirmed'
      )::integer,
      'last_past_departure_at', max(t.departure_at) filter (
        where t.departure_at < now() and b.status not in ('cancelled', 'expired')
      ),
      'next_departure_at', min(t.departure_at) filter (
        where t.departure_at >= now()
          and t.status in ('scheduled', 'active')
          and b.status in ('pending', 'confirmed')
      )
    )
  into v_booking_count, v_summary
  from public.bookings b
  left join public.trips t on t.id = b.trip_id
  where b.passenger_id = p_passenger_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'booking_number', page.booking_number,
        'status', page.status,
        'currency', page.currency,
        'total_amount', page.total_amount,
        'created_at', page.created_at,
        'confirmed_at', page.confirmed_at,
        'trip', case when page.trip_id is null then null else jsonb_build_object(
          'departure_at', page.departure_at,
          'arrival_at', page.arrival_at,
          'carrier', page.carrier,
          'status', page.trip_status,
          'from_city', page.from_city,
          'to_city', page.to_city
        ) end,
        'booking_passengers', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'full_name', bp.full_name,
              'email', bp.email,
              'phone', bp.phone,
              'seat_number', bp.seat_number
            )
            order by bp.id
          )
          from public.booking_passengers bp
          where bp.booking_id = page.id
        ), '[]'::jsonb),
        'cancellation_requests', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'status', cr.status,
              'resolution', cr.resolution,
              'created_at', cr.created_at
            )
            order by cr.created_at desc
          )
          from public.booking_cancellation_requests cr
          where cr.booking_id = page.id
        ), '[]'::jsonb)
      )
      order by page.departure_at desc nulls last, page.created_at desc
    ),
    '[]'::jsonb
  )
  into v_bookings
  from (
    select
      b.id,
      b.booking_number,
      b.status,
      b.currency,
      b.total_amount,
      b.created_at,
      b.confirmed_at,
      b.trip_id,
      t.departure_at,
      t.arrival_at,
      t.carrier,
      t.status as trip_status,
      origin.name_uk as from_city,
      destination.name_uk as to_city
    from public.bookings b
    left join public.trips t on t.id = b.trip_id
    left join public.routes r on r.id = t.route_id
    left join public.locations origin on origin.id = r.from_location_id
    left join public.locations destination on destination.id = r.to_location_id
    where b.passenger_id = p_passenger_id
    order by t.departure_at desc nulls last, b.created_at desc
    limit p_page_size
    offset (p_page * p_page_size)
  ) page;

  return jsonb_build_object(
    'profile', v_profile,
    'summary', v_summary,
    'page', p_page,
    'page_size', p_page_size,
    'has_more', ((p_page + 1) * p_page_size < v_booking_count),
    'bookings', v_bookings
  );
end;
$$;

revoke all on function public.admin_get_passenger_assistant_card(uuid, integer, integer)
  from public, anon, service_role;
grant execute on function public.admin_get_passenger_assistant_card(uuid, integer, integer)
  to authenticated;
