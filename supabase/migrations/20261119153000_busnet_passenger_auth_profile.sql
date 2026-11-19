create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
set row_security to off
as $function$
declare
  v_full text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    ''
  );
  v_first text;
  v_last text;
  v_phone text;
begin
  v_first := coalesce(
    nullif(new.raw_user_meta_data->>'firstName', ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    split_part(v_full, ' ', 1),
    ''
  );
  v_last := coalesce(
    nullif(new.raw_user_meta_data->>'lastName', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    trim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)),
    ''
  );
  v_phone := coalesce(
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.phone, ''),
    ''
  );

  insert into public.users (
    uid,
    email,
    role,
    "firstName",
    "lastName",
    phone,
    status,
    "loyaltyPoints"
  )
  values (
    new.id::text,
    coalesce(new.email, ''),
    'passenger',
    v_first,
    v_last,
    v_phone,
    'active',
    0
  )
  on conflict (uid) do update set
    email = excluded.email,
    "firstName" = case
      when public.users."firstName" is null or btrim(public.users."firstName") = ''
      then excluded."firstName"
      else public.users."firstName"
    end,
    "lastName" = case
      when public.users."lastName" is null or btrim(public.users."lastName") = ''
      then excluded."lastName"
      else public.users."lastName"
    end,
    phone = case
      when public.users.phone is null or btrim(public.users.phone) = ''
      then excluded.phone
      else public.users.phone
    end,
    updated_at = now();

  insert into public.passengers (
    user_id,
    name,
    role,
    first_name,
    last_name
  )
  values (
    new.id::text,
    nullif(btrim(v_full), ''),
    'Пасажир',
    nullif(v_first, ''),
    nullif(v_last, '')
  )
  on conflict (user_id) do update set
    name = case
      when public.passengers.name is null or btrim(public.passengers.name) = ''
      then excluded.name
      else public.passengers.name
    end,
    first_name = case
      when public.passengers.first_name is null or btrim(public.passengers.first_name) = ''
      then excluded.first_name
      else public.passengers.first_name
    end,
    last_name = case
      when public.passengers.last_name is null or btrim(public.passengers.last_name) = ''
      then excluded.last_name
      else public.passengers.last_name
    end;

  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$function$;

create unique index if not exists passengers_user_id_unique_idx
  on public.passengers (user_id);
