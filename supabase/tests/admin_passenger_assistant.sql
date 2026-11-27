begin;

do $test$
declare
  v_admin_id constant uuid := 'da100000-0000-4000-8000-000000000001';
  v_passenger_id constant uuid := 'da100000-0000-4000-8000-000000000002';
  v_second_passenger_id constant uuid := 'da100000-0000-4000-8000-000000000003';
  v_origin_id constant uuid := 'da100000-0000-4000-8000-000000000004';
  v_destination_id constant uuid := 'da100000-0000-4000-8000-000000000005';
  v_route_id constant uuid := 'da100000-0000-4000-8000-000000000006';
  v_past_trip_id constant uuid := 'da100000-0000-4000-8000-000000000007';
  v_future_trip_id constant uuid := 'da100000-0000-4000-8000-000000000008';
  v_count integer;
  v_denied boolean;
  v_card jsonb;
  v_next_page jsonb;
  v_booking jsonb;
  v_sqlstate text;
  v_message text;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    (v_admin_id, 'authenticated', 'authenticated', 'assistant-admin@example.invalid', '', now(), now()),
    (v_passenger_id, 'authenticated', 'authenticated', 'olena.assistant@example.invalid', '', now(), now()),
    (v_second_passenger_id, 'authenticated', 'authenticated', 'olena.second@example.invalid', '', now(), now());

  insert into public.admin_profiles (user_id, role, active)
  values (v_admin_id, 'admin', true);

  insert into public.profiles (id, full_name, email, phone, preferred_locale)
  values
    (v_passenger_id, 'Olena Assistant Test', 'olena.assistant@example.invalid', '+380000000123', 'uk'),
    (v_second_passenger_id, 'Olena Assistant Test', 'olena.second@example.invalid', '+380000000456', 'uk')
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      preferred_locale = excluded.preferred_locale;

  insert into public.locations (id, name_uk, normalized_name)
  values
    (v_origin_id, 'Test origin', 'test-origin'),
    (v_destination_id, 'Test destination', 'test-destination');

  insert into public.routes (id, from_location_id, to_location_id, provider_route_id)
  values (v_route_id, v_origin_id, v_destination_id, 'assistant-test-route');

  insert into public.trips (id, route_id, departure_at, arrival_at, carrier, status)
  values
    (v_past_trip_id, v_route_id, now() - interval '30 days', now() - interval '29 days', 'Test carrier', 'completed'),
    (v_future_trip_id, v_route_id, now() + interval '30 days', now() + interval '31 days', 'Test carrier', 'scheduled');

  insert into public.bookings (
    booking_number, passenger_id, trip_id, status, currency, total_amount, created_at, confirmed_at
  )
  select
    'ASSISTANT-TEST-' || series::text,
    v_passenger_id,
    case when series = 26 then v_future_trip_id else v_past_trip_id end,
    case
      when series = 1 then 'cancelled'
      when series = 2 then 'refunded'
      when series in (3, 26) then 'pending'
      else 'confirmed'
    end,
    'UAH',
    100 + series,
    now() - (series || ' days')::interval,
    case when series not in (1, 3, 26) then now() - (series || ' days')::interval else null end
  from generate_series(1, 26) as generated(series);

  insert into public.booking_passengers (
    booking_id, full_name, email, phone, seat_number, document_number
  )
  select
    b.id,
    'Olena Snapshot Test',
    'olena.assistant@example.invalid',
    '+380000000123',
    'A' || row_number() over (order by b.created_at)::text,
    'MUST-NOT-BE-RETURNED'
  from public.bookings b
  where b.passenger_id = v_passenger_id
    and b.booking_number like 'ASSISTANT-TEST-%';

  insert into public.booking_cancellation_requests (booking_id, passenger_id, reason, status)
  select id, v_passenger_id, 'Synthetic test request', 'new'
  from public.bookings
  where booking_number = 'ASSISTANT-TEST-1';

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  select count(*) into v_count
  from public.admin_search_passengers('olena.assistant@example.invalid', null, 0, 20)
  where id = v_passenger_id;
  if v_count <> 1 then raise exception 'email search did not return the expected profile'; end if;

  select count(*) into v_count
  from public.admin_search_passengers('+380000000123', null, 0, 20)
  where id = v_passenger_id;
  if v_count <> 1 then raise exception 'phone search did not return the expected profile'; end if;

  select count(*) into v_count
  from public.admin_search_passengers('Olena Assistant Test', null, 0, 20);
  if v_count <> 2 then raise exception 'ambiguous full-name search did not return both profiles'; end if;

  select count(*) into v_count
  from public.admin_search_passengers('Olena', null, 0, 20);
  if v_count <> 2 then raise exception 'partial-name search did not return both profiles'; end if;

  select count(*) into v_count
  from public.admin_search_passengers('missing-assistant-test-record', null, 0, 20);
  if v_count <> 0 then raise exception 'non-matching search unexpectedly returned profiles'; end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_get_passenger_assistant_card(uuid,integer,integer)',
    'EXECUTE'
  ) then raise exception 'authenticated role cannot execute the card RPC'; end if;

  if has_function_privilege(
    'anon',
    'public.admin_get_passenger_assistant_card(uuid,integer,integer)',
    'EXECUTE'
  ) then raise exception 'anon role can execute the card RPC'; end if;

  if has_function_privilege(
    'service_role',
    'public.admin_get_passenger_assistant_card(uuid,integer,integer)',
    'EXECUTE'
  ) then raise exception 'service_role can execute the card RPC'; end if;

  v_card := public.admin_get_passenger_assistant_card(v_passenger_id, 0, 25);
  if v_card #>> '{profile,email}' <> 'olena.assistant@example.invalid' then
    raise exception 'card did not return the expected profile';
  end if;
  if (v_card #>> '{summary,booking_count}')::integer <> 26 then
    raise exception 'card booking summary is incorrect';
  end if;
  if (v_card #>> '{summary,cancelled_booking_count}')::integer <> 1
    or (v_card #>> '{summary,refunded_booking_count}')::integer <> 1
    or (v_card #>> '{summary,pending_booking_count}')::integer <> 2
    or (v_card #>> '{summary,confirmed_booking_count}')::integer <> 22 then
    raise exception 'card booking-status summary is incorrect';
  end if;
  if (v_card #>> '{summary,completed_trip_record_count}')::integer <> 22 then
    raise exception 'completed-trip summary is incorrect';
  end if;
  if v_card ->> 'has_more' <> 'true'
    or jsonb_array_length(v_card -> 'bookings') <> 25 then
    raise exception 'first history page is not paginated correctly';
  end if;
  if position('document_number' in v_card::text) > 0
    or position('MUST-NOT-BE-RETURNED' in v_card::text) > 0 then
    raise exception 'card exposed a passenger document field';
  end if;

  select entry.value into v_booking
  from jsonb_array_elements(v_card -> 'bookings') as entry(value)
  where entry.value ->> 'booking_number' = 'ASSISTANT-TEST-1';
  if v_booking is null or jsonb_array_length(v_booking -> 'cancellation_requests') <> 1 then
    raise exception 'card did not return the cancellation request history';
  end if;

  v_next_page := public.admin_get_passenger_assistant_card(v_passenger_id, 1, 25);
  if v_next_page ->> 'has_more' <> 'false'
    or jsonb_array_length(v_next_page -> 'bookings') <> 1 then
    raise exception 'second history page is not returned correctly';
  end if;

  perform set_config('request.jwt.claim.sub', v_second_passenger_id::text, true);
  v_denied := false;
  begin
    perform public.admin_get_passenger_assistant_card(v_passenger_id, 0, 25);
  exception
    when insufficient_privilege then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
      v_denied := v_sqlstate = '42501' and v_message = 'authorization denied';
  end;
  if not v_denied then raise exception 'non-admin profile could access the card RPC'; end if;
end;
$test$;

rollback;
