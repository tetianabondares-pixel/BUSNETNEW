create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns table (
  booking_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_is_admin boolean := public.is_admin();
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking not found';
  end if;

  if auth.uid() is null then
    raise exception 'authorization required';
  end if;

  if v_booking.passenger_id is distinct from auth.uid() and not v_is_admin then
    raise exception 'authorization denied';
  end if;

  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'booking cannot be cancelled';
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = p_booking_id;

  return query
  select p_booking_id, 'cancelled'::text;
end;
$$;

revoke all on function public.cancel_booking(uuid, text) from public;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
