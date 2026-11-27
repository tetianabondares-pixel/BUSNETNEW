create table if not exists public.assistant_tool_registry (
  tool_id text not null check (char_length(tool_id) between 3 and 120),
  tool_version text not null check (char_length(tool_version) between 1 and 40),
  handler_reference text not null check (char_length(btrim(handler_reference)) between 1 and 240),
  status text not null default 'candidate'
    check (status in ('candidate', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tool_id, tool_version)
);

create table if not exists public.assistant_capabilities (
  capability_key text primary key check (char_length(capability_key) between 3 and 120),
  module text not null check (char_length(module) between 1 and 120),
  title text not null check (char_length(title) between 1 and 200),
  acceptance_criteria text not null check (char_length(acceptance_criteria) between 1 and 2000),
  status text not null default 'planned'
    check (status in ('planned', 'in_development', 'verified', 'operational', 'retired')),
  tool_id text,
  tool_version text,
  test_run_id uuid,
  operational_check_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_capabilities_tool_fk
    foreign key (tool_id, tool_version)
    references public.assistant_tool_registry (tool_id, tool_version),
  constraint assistant_capabilities_tool_pair_check
    check ((tool_id is null) = (tool_version is null)),
  constraint assistant_capabilities_test_evidence_check
    check (status not in ('verified', 'operational') or test_run_id is not null),
  constraint assistant_capabilities_operational_evidence_check
    check (status <> 'operational' or operational_check_id is not null)
);

create table if not exists public.assistant_capability_test_runs (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null references public.assistant_capabilities (capability_key),
  tool_id text not null,
  tool_version text not null,
  suite_name text not null check (char_length(btrim(suite_name)) between 1 and 160),
  test_reference text not null check (char_length(btrim(test_reference)) between 1 and 500),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  runner_identity text not null
    check (runner_identity in ('github_actions', 'local_supabase')),
  result text not null check (result in ('passed', 'failed')),
  tests_run integer not null check (tests_run >= 0),
  tests_failed integer not null check (tests_failed >= 0 and tests_failed <= tests_run),
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  recorded_at timestamptz not null default now(),
  constraint assistant_capability_test_runs_passed_counts_check
    check (result <> 'passed' or (tests_run > 0 and tests_failed = 0)),
  constraint assistant_capability_test_runs_tool_fk
    foreign key (tool_id, tool_version)
    references public.assistant_tool_registry (tool_id, tool_version),
  constraint assistant_capability_test_runs_mapping_unique
    unique (id, capability_key, tool_id, tool_version)
);

create table if not exists public.assistant_capability_operational_checks (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null,
  tool_id text not null,
  tool_version text not null,
  test_run_id uuid not null,
  result text not null check (result in ('passed', 'failed')),
  execution_reference text not null check (char_length(btrim(execution_reference)) between 1 and 500),
  runner_identity text not null
    check (runner_identity in ('assistant_execution_service', 'local_supabase')),
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  recorded_at timestamptz not null default now(),
  constraint assistant_capability_operational_checks_test_fk
    foreign key (test_run_id, capability_key, tool_id, tool_version)
    references public.assistant_capability_test_runs (id, capability_key, tool_id, tool_version),
  constraint assistant_capability_operational_checks_mapping_unique
    unique (id, test_run_id, capability_key, tool_id, tool_version)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assistant_capabilities'::regclass
      and conname = 'assistant_capabilities_test_run_fk'
  ) then
    alter table public.assistant_capabilities
      add constraint assistant_capabilities_test_run_fk
      foreign key (test_run_id, capability_key, tool_id, tool_version)
      references public.assistant_capability_test_runs (id, capability_key, tool_id, tool_version);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assistant_capabilities'::regclass
      and conname = 'assistant_capabilities_operational_check_fk'
  ) then
    alter table public.assistant_capabilities
      add constraint assistant_capabilities_operational_check_fk
      foreign key (operational_check_id, test_run_id, capability_key, tool_id, tool_version)
      references public.assistant_capability_operational_checks (id, test_run_id, capability_key, tool_id, tool_version);
  end if;
end;
$$;

create index if not exists assistant_capabilities_module_status_idx
  on public.assistant_capabilities (module, status, capability_key);
create index if not exists assistant_capability_test_runs_lookup_idx
  on public.assistant_capability_test_runs (capability_key, tool_id, tool_version, completed_at desc);
create index if not exists assistant_capability_operational_checks_lookup_idx
  on public.assistant_capability_operational_checks (capability_key, tool_id, tool_version, completed_at desc);

alter table public.assistant_capabilities enable row level security;
alter table public.assistant_tool_registry enable row level security;
alter table public.assistant_capability_test_runs enable row level security;
alter table public.assistant_capability_operational_checks enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assistant_capabilities',
    'assistant_tool_registry',
    'assistant_capability_test_runs',
    'assistant_capability_operational_checks'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = table_name || ' admin read'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.has_admin_role(array[''super_admin'', ''admin'', ''content_manager'', ''support'', ''provider_operator'']))',
        table_name || ' admin read',
        table_name
      );
    end if;
  end loop;
end;
$$;

revoke all on public.assistant_capabilities,
  public.assistant_tool_registry,
  public.assistant_capability_test_runs,
  public.assistant_capability_operational_checks
  from public, anon, authenticated, service_role;
grant select on public.assistant_capabilities,
  public.assistant_tool_registry,
  public.assistant_capability_test_runs,
  public.assistant_capability_operational_checks
  to authenticated;

create or replace function public.guard_assistant_tool_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if not exists (
    select 1
    from public.assistant_capability_test_runs tr
    where tr.tool_id = new.tool_id
      and tr.tool_version = new.tool_version
      and tr.result = 'passed'
      and tr.tests_run > 0
      and tr.tests_failed = 0
      and tr.completed_at >= now() - interval '30 days'
      and tr.completed_at <= now()
  ) then
    raise exception 'Active tool versions require a recent passing trusted test run'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_tool_activation_guard on public.assistant_tool_registry;
create trigger assistant_tool_activation_guard
  before insert or update of status on public.assistant_tool_registry
  for each row execute function public.guard_assistant_tool_activation();

create or replace function public.guard_assistant_capability_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  test_is_valid boolean;
  operational_check_is_valid boolean;
begin
  if new.status not in ('verified', 'operational') then
    return new;
  end if;

  select exists (
    select 1
    from public.assistant_capability_test_runs tr
    where tr.id = new.test_run_id
      and tr.capability_key = new.capability_key
      and tr.tool_id = new.tool_id
      and tr.tool_version = new.tool_version
      and tr.result = 'passed'
      and tr.tests_run > 0
      and tr.tests_failed = 0
      and tr.completed_at >= now() - interval '30 days'
      and tr.completed_at <= now()
  ) into test_is_valid;

  if not test_is_valid then
    raise exception 'Verified capability requires a recent passing trusted test run for this exact tool version'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.assistant_tool_registry t
    where t.tool_id = new.tool_id
      and t.tool_version = new.tool_version
      and t.status = 'active'
  ) then
    raise exception 'Verified capability requires an active registered tool version'
      using errcode = '23514';
  end if;

  if new.status = 'operational' then
    select exists (
      select 1
      from public.assistant_capability_operational_checks oc
      where oc.id = new.operational_check_id
        and oc.test_run_id = new.test_run_id
        and oc.capability_key = new.capability_key
        and oc.tool_id = new.tool_id
        and oc.tool_version = new.tool_version
        and oc.result = 'passed'
        and oc.completed_at >= now() - interval '7 days'
        and oc.completed_at <= now()
    ) into operational_check_is_valid;

    if not operational_check_is_valid then
      raise exception 'Operational capability requires a recent successful server execution check for the same test and tool version'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_capabilities_evidence_guard on public.assistant_capabilities;
create trigger assistant_capabilities_evidence_guard
  before insert or update of status, tool_id, tool_version, test_run_id, operational_check_id
  on public.assistant_capabilities
  for each row execute function public.guard_assistant_capability_evidence();

create or replace function public.guard_assistant_tool_retirement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'active' and exists (
    select 1
    from public.assistant_capabilities c
    where c.tool_id = old.tool_id
      and c.tool_version = old.tool_version
      and c.status in ('verified', 'operational')
  ) then
    raise exception 'An active tool version cannot be retired while verified capabilities depend on it'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_tool_registry_retirement_guard
  on public.assistant_tool_registry;
create trigger assistant_tool_registry_retirement_guard
  before update of status on public.assistant_tool_registry
  for each row execute function public.guard_assistant_tool_retirement();

create or replace function public.assistant_record_capability_test_run(
  p_capability_key text,
  p_tool_id text,
  p_tool_version text,
  p_suite_name text,
  p_test_reference text,
  p_commit_sha text,
  p_runner_identity text,
  p_result text,
  p_tests_run integer,
  p_tests_failed integer,
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted test-runner credentials required' using errcode = '42501';
  end if;
  if nullif(btrim(p_capability_key), '') is null
    or nullif(btrim(p_tool_id), '') is null
    or nullif(btrim(p_tool_version), '') is null
    or nullif(btrim(p_suite_name), '') is null
    or nullif(btrim(p_test_reference), '') is null
    or p_commit_sha is null
    or p_commit_sha !~ '^[0-9a-f]{40}$'
    or p_runner_identity is null
    or p_runner_identity not in ('github_actions', 'local_supabase')
    or p_result is null
    or p_result not in ('passed', 'failed')
    or p_tests_run is null
    or p_tests_run < 0
    or p_tests_failed is null
    or p_tests_failed < 0
    or p_tests_failed > p_tests_run
    or (p_result = 'passed' and (p_tests_run = 0 or p_tests_failed <> 0))
    or p_started_at is null
    or p_completed_at is null
    or p_completed_at < p_started_at
    or p_completed_at > now() then
    raise exception 'Invalid trusted test-run report' using errcode = '22023';
  end if;
  perform 1
  from public.assistant_tool_registry t
  where t.tool_id = p_tool_id and t.tool_version = p_tool_version
  for update;
  if not found then
    raise exception 'Tool version is not registered' using errcode = '23503';
  end if;
  perform 1
  from public.assistant_capabilities c
  where c.capability_key = p_capability_key
    and c.tool_id = p_tool_id
    and c.tool_version = p_tool_version
  for update;
  if not found then
    raise exception 'Test run does not match the registered capability and tool version' using errcode = '23514';
  end if;

  insert into public.assistant_capability_test_runs (
    capability_key, tool_id, tool_version, suite_name, test_reference,
    commit_sha, runner_identity, result, tests_run, tests_failed,
    started_at, completed_at
  ) values (
    p_capability_key, p_tool_id, p_tool_version, btrim(p_suite_name), btrim(p_test_reference),
    p_commit_sha, p_runner_identity, p_result, p_tests_run, p_tests_failed,
    p_started_at, p_completed_at
  )
  returning id into v_run_id;
  return v_run_id;
end;
$$;

create or replace function public.assistant_record_operational_check(
  p_capability_key text,
  p_tool_id text,
  p_tool_version text,
  p_test_run_id uuid,
  p_result text,
  p_execution_reference text,
  p_runner_identity text,
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted execution-service credentials required' using errcode = '42501';
  end if;
  if nullif(btrim(p_capability_key), '') is null
    or nullif(btrim(p_tool_id), '') is null
    or nullif(btrim(p_tool_version), '') is null
    or p_test_run_id is null
    or p_result is null
    or p_result not in ('passed', 'failed')
    or nullif(btrim(p_execution_reference), '') is null
    or p_runner_identity is null
    or p_runner_identity not in ('assistant_execution_service', 'local_supabase')
    or p_started_at is null
    or p_completed_at is null
    or p_completed_at < p_started_at
    or p_completed_at > now() then
    raise exception 'Invalid operational check report' using errcode = '22023';
  end if;
  perform 1
  from public.assistant_tool_registry t
  where t.tool_id = p_tool_id and t.tool_version = p_tool_version
  for update;
  if not found then
    raise exception 'Tool version is not registered' using errcode = '23503';
  end if;
  perform 1
  from public.assistant_capabilities c
  where c.capability_key = p_capability_key
    and c.tool_id = p_tool_id
    and c.tool_version = p_tool_version
  for update;
  if not found then
    raise exception 'Operational check does not match the registered capability and tool version'
      using errcode = '23514';
  end if;
  if p_result = 'passed' and not exists (
    select 1
    from public.assistant_capability_test_runs tr
    where tr.id = p_test_run_id
      and tr.capability_key = p_capability_key
      and tr.tool_id = p_tool_id
      and tr.tool_version = p_tool_version
      and tr.result = 'passed'
      and tr.tests_run > 0
      and tr.tests_failed = 0
      and tr.completed_at >= now() - interval '30 days'
      and tr.completed_at <= now()
  ) then
    raise exception 'Operational check requires fresh passing test evidence for the same capability and tool version'
      using errcode = '23514';
  end if;

  insert into public.assistant_capability_operational_checks (
    capability_key, tool_id, tool_version, test_run_id, result,
    execution_reference, runner_identity, started_at, completed_at
  ) values (
    p_capability_key, p_tool_id, p_tool_version, p_test_run_id, p_result,
    btrim(p_execution_reference), p_runner_identity, p_started_at, p_completed_at
  )
  returning id into v_check_id;
  return v_check_id;
end;
$$;

drop function if exists public.assistant_update_capability(text, text, text, text, text, uuid, uuid);
create or replace function public.assistant_update_capability(
  p_capability_key text,
  p_status text,
  p_tool_id text default null,
  p_tool_version text default null,
  p_handler_reference text default null,
  p_test_run_id uuid default null,
  p_operational_check_id uuid default null,
  p_tool_status text default null,
  p_clear_tool boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_old_tool_id text;
  v_old_tool_version text;
  v_old_test_run_id uuid;
  v_old_operational_check_id uuid;
  v_tool_id text;
  v_tool_version text;
  v_handler_reference text;
  v_effective_test_run_id uuid;
  v_effective_operational_check_id uuid;
  v_tool_status text;
  v_old_tool_status text;
  v_old_handler_reference text;
  v_tool_exists boolean;
  v_test_is_valid boolean := false;
  v_operational_check_is_valid boolean := false;
  v_test_run public.assistant_capability_test_runs%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_admin_role(array['super_admin']) then
    raise exception 'Capability registry update denied' using errcode = '42501';
  end if;
  if nullif(btrim(p_capability_key), '') is null
    or p_status is null
    or p_status not in ('planned', 'in_development', 'verified', 'operational', 'retired') then
    raise exception 'Invalid capability update' using errcode = '22023';
  end if;
  if (p_tool_id is null) <> (p_tool_version is null)
    or (p_tool_id is not null and (
      nullif(btrim(p_tool_id), '') is null
      or nullif(btrim(p_tool_version), '') is null
    ))
    or (p_tool_id is null and p_handler_reference is not null)
    or (p_tool_status is not null and p_tool_status not in ('candidate', 'active', 'retired')) then
    raise exception 'Invalid tool registry update'
      using errcode = '22023';
  end if;
  if coalesce(p_clear_tool, false) and (
    p_status in ('verified', 'operational')
    or p_tool_id is not null
    or p_tool_version is not null
    or p_handler_reference is not null
    or p_test_run_id is not null
    or p_operational_check_id is not null
    or p_tool_status is not null
  ) then
    raise exception 'Explicit unlink must be requested alone and cannot set evidence-backed status'
      using errcode = '22023';
  end if;

  select c.status, c.tool_id, c.tool_version
       , c.test_run_id, c.operational_check_id
  into v_old_status, v_old_tool_id, v_old_tool_version,
       v_old_test_run_id, v_old_operational_check_id
  from public.assistant_capabilities c
  where c.capability_key = btrim(p_capability_key);
  if not found then
    raise exception 'Capability not found' using errcode = 'P0002';
  end if;

  if coalesce(p_clear_tool, false) then
    v_tool_id := null;
    v_tool_version := null;
    v_handler_reference := null;
    v_effective_test_run_id := null;
    v_effective_operational_check_id := null;
  else
    v_tool_id := coalesce(nullif(btrim(p_tool_id), ''), v_old_tool_id);
    v_tool_version := coalesce(nullif(btrim(p_tool_version), ''), v_old_tool_version);
    if (v_tool_id is null) <> (v_tool_version is null) then
      raise exception 'Existing tool link is incomplete' using errcode = '23514';
    end if;
    v_handler_reference := nullif(btrim(p_handler_reference), '');
    if v_handler_reference is null and v_tool_id is not null then
      select t.handler_reference into v_handler_reference
      from public.assistant_tool_registry t
      where t.tool_id = v_tool_id and t.tool_version = v_tool_version;
    end if;
    if v_tool_id is not null and v_handler_reference is null then
      raise exception 'A handler reference is required for a new tool version' using errcode = '22023';
    end if;

    v_effective_test_run_id := coalesce(
      p_test_run_id,
      case when v_tool_id = v_old_tool_id and v_tool_version = v_old_tool_version
        then v_old_test_run_id end
    );
    v_effective_operational_check_id := coalesce(
      p_operational_check_id,
      case when v_effective_test_run_id = v_old_test_run_id
        and v_tool_id = v_old_tool_id
        and v_tool_version = v_old_tool_version
        then v_old_operational_check_id end
    );
  end if;

  perform 1
  from public.assistant_tool_registry t
  where (t.tool_id = v_old_tool_id and t.tool_version = v_old_tool_version)
     or (t.tool_id = v_tool_id and t.tool_version = v_tool_version)
  order by t.tool_id, t.tool_version
  for update;

  perform 1
  from public.assistant_capabilities c
  where c.capability_key = btrim(p_capability_key)
  for update;
  if not found then
    raise exception 'Capability not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.assistant_capabilities c
    where c.capability_key = btrim(p_capability_key)
      and (
        c.status is distinct from v_old_status
        or c.tool_id is distinct from v_old_tool_id
        or c.tool_version is distinct from v_old_tool_version
        or c.test_run_id is distinct from v_old_test_run_id
        or c.operational_check_id is distinct from v_old_operational_check_id
      )
  ) then
    raise exception 'Capability changed concurrently; reload and retry' using errcode = '40001';
  end if;

  if v_tool_id is not null then
    select t.status, t.handler_reference
    into v_old_tool_status, v_old_handler_reference
    from public.assistant_tool_registry t
    where t.tool_id = v_tool_id
      and t.tool_version = v_tool_version;
    v_tool_exists := found;
    if v_tool_exists and v_old_handler_reference is distinct from v_handler_reference then
      raise exception 'A registered tool version is immutable; register a new tool version when its handler changes'
        using errcode = '23514';
    end if;
  else
    v_tool_exists := false;
  end if;
  if v_tool_id is null and p_tool_status is not null then
    raise exception 'Tool status cannot be changed without a registered tool link' using errcode = '22023';
  end if;

  if v_effective_test_run_id is not null then
    select * into v_test_run
    from public.assistant_capability_test_runs tr
    where tr.id = v_effective_test_run_id
      and tr.capability_key = btrim(p_capability_key)
      and tr.tool_id = v_tool_id
      and tr.tool_version = v_tool_version;
    if not found then
      raise exception 'Test run does not match this capability and tool version' using errcode = '23514';
    end if;
    if v_test_run.result = 'passed'
      and v_test_run.tests_run > 0
      and v_test_run.tests_failed = 0
      and v_test_run.completed_at >= now() - interval '30 days'
      and v_test_run.completed_at <= now() then
      v_test_is_valid := true;
    end if;
  end if;

  if v_effective_operational_check_id is not null then
    select exists (
      select 1
      from public.assistant_capability_operational_checks oc
      where oc.id = v_effective_operational_check_id
        and oc.test_run_id = v_effective_test_run_id
        and oc.capability_key = btrim(p_capability_key)
        and oc.tool_id = v_tool_id
        and oc.tool_version = v_tool_version
        and oc.result = 'passed'
        and oc.completed_at >= now() - interval '7 days'
        and oc.completed_at <= now()
    ) into v_operational_check_is_valid;
  end if;

  if p_status in ('verified', 'operational') and not v_test_is_valid then
    raise exception 'A recent passing trusted test run is required for this exact capability and tool version'
      using errcode = '23514';
  end if;
  if p_status = 'operational' and not v_operational_check_is_valid then
    raise exception 'A recent successful trusted execution check is required for operational status'
      using errcode = '23514';
  end if;
  if p_tool_status is not null then
    v_tool_status := p_tool_status;
  elsif v_tool_exists then
    v_tool_status := v_old_tool_status;
  else
    v_tool_status := 'candidate';
  end if;

  if p_status not in ('verified', 'operational') then
    update public.assistant_capabilities
    set status = p_status, updated_at = now()
    where capability_key = btrim(p_capability_key);
  end if;

  if v_tool_id is not null then
    insert into public.assistant_tool_registry (
      tool_id, tool_version, handler_reference, status, updated_at
    ) values (
      v_tool_id, v_tool_version, v_handler_reference, v_tool_status, now()
    )
    on conflict (tool_id, tool_version) do update
      set handler_reference = excluded.handler_reference,
          status = excluded.status,
          updated_at = now();

    if not v_tool_exists
      or v_old_tool_status is distinct from v_tool_status
      or v_old_handler_reference is distinct from v_handler_reference then
      perform public.log_admin_action(
        case when v_tool_exists then 'assistant.tool_registry_updated' else 'assistant.tool_registered' end,
        'assistant_tool',
        v_tool_id || '@' || v_tool_version,
        jsonb_build_object(
          'capability_key', p_capability_key,
          'previous_tool_id', v_old_tool_id,
          'previous_version', v_old_tool_version,
          'new_tool_id', v_tool_id,
          'version', v_tool_version,
          'previous_status', v_old_tool_status,
          'status', v_tool_status,
          'previous_handler_reference', v_old_handler_reference,
          'handler_reference', v_handler_reference,
          'test_run_id', v_effective_test_run_id
        )
      );
    end if;
  end if;

  update public.assistant_capabilities
  set status = p_status,
      tool_id = v_tool_id,
      tool_version = v_tool_version,
      test_run_id = v_effective_test_run_id,
      operational_check_id = v_effective_operational_check_id,
      updated_at = now()
  where capability_key = btrim(p_capability_key)
  returning jsonb_build_object(
    'capability_key', capability_key,
    'status', status,
    'tool_id', tool_id,
    'tool_version', tool_version,
    'test_run_id', test_run_id,
    'operational_check_id', operational_check_id
  ) into v_result;

  perform public.log_admin_action(
    'assistant.capability_updated',
    'assistant_capability',
    p_capability_key,
    jsonb_build_object(
      'previous_status', v_old_status,
      'status', p_status,
      'previous_tool_id', v_old_tool_id,
      'previous_tool_version', v_old_tool_version,
      'tool_id', v_tool_id,
      'tool_version', v_tool_version,
      'test_run_id', v_effective_test_run_id,
      'operational_check_id', v_effective_operational_check_id,
      'tool_status', v_tool_status,
      'clear_tool', coalesce(p_clear_tool, false)
    )
  );
  return v_result;
end;
$$;

revoke all on function public.guard_assistant_tool_activation() from public, anon, authenticated;
revoke all on function public.guard_assistant_capability_evidence() from public, anon, authenticated;
revoke all on function public.guard_assistant_tool_retirement() from public, anon, authenticated;
revoke all on function public.assistant_record_capability_test_run(
  text, text, text, text, text, text, text, text, integer, integer, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.assistant_record_operational_check(
  text, text, text, uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.assistant_update_capability(
  text, text, text, text, text, uuid, uuid, text, boolean
) from public, anon;
grant execute on function public.assistant_record_capability_test_run(
  text, text, text, text, text, text, text, text, integer, integer, timestamptz, timestamptz
) to service_role;
grant execute on function public.assistant_record_operational_check(
  text, text, text, uuid, text, text, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.assistant_update_capability(
  text, text, text, text, text, uuid, uuid, text, boolean
) to authenticated;
