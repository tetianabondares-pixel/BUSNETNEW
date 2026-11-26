create or replace function public.update_booking_status(p_booking_id uuid, p_status text)
returns table(booking_id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid()
      and active = true
      and role in ('super_admin', 'admin')
  ) then
    raise exception 'authorization denied';
  end if;
  if p_status not in ('pending','confirmed','cancelled','expired','refunded') then
    raise exception 'invalid booking status';
  end if;
  update public.bookings
    set status = p_status,
        confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end
    where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;
  return query select p_booking_id, p_status;
end;
$function$;