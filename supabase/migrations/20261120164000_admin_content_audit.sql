create table if not exists public.public_content (
  id uuid primary key default gen_random_uuid(),
  content_key text not null,
  locale text not null check (locale in ('uk', 'en', 'it')),
  content jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (content_key, locale)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.public_content enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "public content public read" on public.public_content;
create policy "public content public read"
  on public.public_content
  for select using (active = true);

drop policy if exists "public content admin manage" on public.public_content;
create policy "public content admin manage"
  on public.public_content
  for all using (
    exists (
      select 1 from public.admin_profiles
      where user_id = auth.uid()
        and active = true
        and role in ('super_admin', 'admin', 'content_manager')
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles
      where user_id = auth.uid()
        and active = true
        and role in ('super_admin', 'admin', 'content_manager')
    )
  );

drop policy if exists "audit logs admin read" on public.audit_logs;
create policy "audit logs admin read"
  on public.audit_logs
  for select using (public.is_admin());

create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'authorization denied';
  end if;
  insert into public.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    left(btrim(p_action), 100),
    left(btrim(p_target_type), 100),
    nullif(left(btrim(coalesce(p_target_id, '')), 200), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;
