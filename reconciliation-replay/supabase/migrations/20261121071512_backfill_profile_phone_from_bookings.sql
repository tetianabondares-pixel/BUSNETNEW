update public.profiles as profile
set
  phone = recent.phone,
  updated_at = now()
from (
  select distinct on (account.id)
    account.id as passenger_id,
    passenger.phone
  from public.profiles as account
  join public.bookings as booking
    on booking.passenger_id = account.id
  join public.booking_passengers as passenger
    on passenger.booking_id = booking.id
  where nullif(btrim(passenger.phone), '') is not null
  order by
    account.id,
    booking.created_at desc,
    (lower(btrim(passenger.full_name)) = lower(btrim(account.full_name))) desc,
    passenger.id
) as recent
where profile.id = recent.passenger_id
  and nullif(btrim(profile.phone), '') is null;