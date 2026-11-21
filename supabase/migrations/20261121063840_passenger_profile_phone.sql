alter table public.profiles
  add column if not exists phone text;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, preferred_locale, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    case coalesce(
      nullif(new.raw_user_meta_data->>'preferred_locale', ''),
      nullif(new.raw_user_meta_data->>'preferred_language', '')
    )
      when 'en' then 'en'
      when 'it' then 'it'
      else 'uk'
    end,
    coalesce(
      nullif(new.raw_user_meta_data->>'phone', ''),
      nullif(new.phone, '')
    )
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    updated_at = now();
  return new;
end;
$$;
