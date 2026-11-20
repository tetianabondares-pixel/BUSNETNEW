drop policy if exists "booking passengers admin read" on public.booking_passengers;
create policy "booking passengers admin read" on public.booking_passengers
  for select using (public.is_admin());

drop policy if exists "bookings admin update" on public.bookings;
create policy "bookings admin update" on public.bookings
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "popular routes admin manage" on public.popular_routes;
create policy "popular routes admin manage" on public.popular_routes
  for all using (
    exists (
      select 1
      from public.admin_profiles
      where user_id = auth.uid()
        and active = true
        and role in ('super_admin', 'admin', 'content_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.admin_profiles
      where user_id = auth.uid()
        and active = true
        and role in ('super_admin', 'admin', 'content_manager')
    )
  );

create or replace function public.update_booking_status(
  p_booking_id uuid,
  p_status text
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
  v_allowed boolean := public.is_admin();
begin
  if not v_allowed then
    raise exception 'authorization denied';
  end if;
  if p_status not in ('pending', 'confirmed', 'cancelled', 'expired', 'refunded') then
    raise exception 'invalid booking status';
  end if;

  update public.bookings
  set status = p_status,
      confirmed_at = case
        when p_status = 'confirmed' then coalesce(confirmed_at, now())
        else confirmed_at
      end
  where id = p_booking_id;

  if not found then
    raise exception 'booking not found';
  end if;

  return query select p_booking_id, p_status;
end;
$$;

revoke all on function public.update_booking_status(uuid, text) from public;
grant execute on function public.update_booking_status(uuid, text) to authenticated;
