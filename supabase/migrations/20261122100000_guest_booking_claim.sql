create extension if not exists pgcrypto;

alter table public.bookings
  add column if not exists guest_claim_token_hash text,
  add column if not exists guest_claim_expires_at timestamptz;

create index if not exists bookings_guest_claim_hash_idx
  on public.bookings(guest_claim_token_hash)
  where guest_claim_token_hash is not null;

create or replace function public.claim_guest_booking(
  p_booking_id uuid,
  p_claim_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_auth_email text;
  v_booking_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_claim_token is null or char_length(p_claim_token) < 32 then
    raise exception 'Invalid claim token';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found
     or v_booking.passenger_id is not null
     or v_booking.guest_claim_token_hash is null
     or v_booking.guest_claim_expires_at <= now()
     or v_booking.guest_claim_token_hash
       <> encode(digest(p_claim_token, 'sha256'), 'hex')
  then
    raise exception 'Booking cannot be claimed';
  end if;

  select lower(btrim(auth.email()))
  into v_auth_email;

  select lower(btrim(bp.email))
  into v_booking_email
  from public.booking_passengers bp
  where bp.booking_id = p_booking_id
    and bp.email is not null
  order by bp.id
  limit 1;

  if v_auth_email is null
     or v_booking_email is null
     or v_auth_email <> v_booking_email
  then
    raise exception 'Claim email does not match';
  end if;

  update public.bookings
  set passenger_id = auth.uid(),
      guest_claim_token_hash = null,
      guest_claim_expires_at = null
  where id = p_booking_id;

  return true;
end;
$$;

revoke all on function public.claim_guest_booking(uuid, text) from public, anon;
grant execute on function public.claim_guest_booking(uuid, text) to authenticated;
