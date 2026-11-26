-- 1. Таблица запросов на отмену
create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  passenger_id uuid not null references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'new'
    check (status in ('new','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Один открытый запрос на бронь
create unique index if not exists booking_cancellation_one_open_idx
  on public.booking_cancellation_requests (booking_id)
  where status in ('new','in_progress');

create index if not exists booking_cancellation_passenger_idx
  on public.booking_cancellation_requests (passenger_id);
create index if not exists booking_cancellation_status_idx
  on public.booking_cancellation_requests (status);

alter table public.booking_cancellation_requests enable row level security;

-- 2. Политики
drop policy if exists "cancellation requests own read" on public.booking_cancellation_requests;
create policy "cancellation requests own read"
  on public.booking_cancellation_requests
  for select to authenticated
  using (passenger_id = auth.uid() or public.is_admin());

drop policy if exists "cancellation requests admin update" on public.booking_cancellation_requests;
create policy "cancellation requests admin update"
  on public.booking_cancellation_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Функция: пассажир подаёт запрос на отмену
create or replace function public.request_booking_cancellation(
  p_booking_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'Reason too long';
  end if;

  select status into v_status
  from public.bookings
  where id = p_booking_id and passenger_id = auth.uid();

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_status not in ('pending','confirmed') then
    raise exception 'Booking cannot be cancelled in status %', v_status;
  end if;

  select id into v_request_id
  from public.booking_cancellation_requests
  where booking_id = p_booking_id and status in ('new','in_progress');

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.booking_cancellation_requests (booking_id, passenger_id, reason)
  values (p_booking_id, auth.uid(), p_reason)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_booking_cancellation(uuid, text) from public, anon;
grant execute on function public.request_booking_cancellation(uuid, text) to authenticated;