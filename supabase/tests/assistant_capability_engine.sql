\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'capability-super-admin@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'capability-admin@example.test');

insert into public.admin_profiles (user_id, role, active)
values
  ('00000000-0000-4000-8000-000000000001', 'super_admin', true),
  ('00000000-0000-4000-8000-000000000002', 'admin', true);

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.assistant_capabilities;
  if visible_count <> 100 then
    raise exception 'RLS did not expose exactly 100 seeded capabilities to an active admin';
  end if;
  if has_table_privilege('authenticated', 'public.assistant_capabilities', 'UPDATE') then
    raise exception 'Authenticated users must not have direct capability update privileges';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.assistant_record_capability_test_run(text,text,text,text,text,text,text,text,integer,integer,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users must not be able to record trusted test runs';
  end if;
  begin
    perform public.assistant_update_capability('bookings.summary', 'in_development');
    raise exception 'An ordinary admin unexpectedly changed a capability';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select public.assistant_update_capability(
  p_capability_key => 'bookings.summary',
  p_status => 'in_development',
  p_tool_id => 'test.bookings',
  p_tool_version => '1.0.0',
  p_handler_reference => 'src/test/bookings.ts'
);

select public.assistant_update_capability(
  p_capability_key => 'bookings.summary',
  p_status => 'in_development'
);

do $$
begin
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'in_development',
      p_tool_status => 'active'
    );
    raise exception 'An untested tool version was activated';
  exception when check_violation then
    null;
  end;
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'verified'
    );
    raise exception 'A capability was verified without a successful test run';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.assistant_capabilities
    where capability_key = 'bookings.summary'
      and tool_id = 'test.bookings'
      and tool_version = '1.0.0'
  ) then
    raise exception 'A status-only update unexpectedly cleared the tool link';
  end if;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local role service_role;

select public.assistant_record_capability_test_run(
  'bookings.summary',
  'test.bookings',
  '1.0.0',
  'local capability integration',
  'supabase/tests/assistant_capability_engine.sql',
  repeat('a', 40),
  'local_supabase',
  'passed',
  8,
  0,
  now() - interval '1 minute',
  now()
) as passing_test_run_id \gset

select public.assistant_record_capability_test_run(
  'bookings.summary',
  'test.bookings',
  '1.0.0',
  'expired test fixture',
  'supabase/tests/assistant_capability_engine.sql',
  repeat('c', 40),
  'local_supabase',
  'passed',
  2,
  0,
  now() - interval '31 days 1 minute',
  now() - interval '31 days'
) as expired_test_run_id \gset

select public.assistant_record_capability_test_run(
  'bookings.summary',
  'test.bookings',
  '1.0.0',
  'failed test fixture',
  'supabase/tests/assistant_capability_engine.sql',
  repeat('d', 40),
  'local_supabase',
  'failed',
  1,
  1,
  now() - interval '1 minute',
  now()
) as failed_test_run_id \gset

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select public.assistant_update_capability(
  p_capability_key => 'bookings.summary',
  p_status => 'in_development',
  p_test_run_id => :'passing_test_run_id'::uuid
);

do $$
begin
  if not exists (
    select 1 from public.assistant_tool_registry
    where tool_id = 'test.bookings'
      and tool_version = '1.0.0'
      and status = 'candidate'
  ) then
    raise exception 'Recording passing evidence unexpectedly activated the tool';
  end if;
end;
$$;

select public.assistant_update_capability(
  p_capability_key => 'bookings.summary',
  p_status => 'verified',
  p_test_run_id => :'passing_test_run_id'::uuid,
  p_tool_status => 'active'
);

do $$
begin
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'verified',
      p_test_run_id => (
        select id from public.assistant_capability_test_runs
        where capability_key = 'bookings.summary' and result = 'failed'
        order by completed_at desc limit 1
      )
    );
    raise exception 'Failed test evidence unexpectedly verified a capability';
  exception when check_violation then
    null;
  end;
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'operational',
      p_operational_check_id => null
    );
    raise exception 'Operational status was set without an operational check';
  exception when check_violation then
    null;
  end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local role service_role;

select public.assistant_record_operational_check(
  'bookings.summary',
  'test.bookings',
  '1.0.0',
  :'passing_test_run_id'::uuid,
  'passed',
  'local test execution',
  'local_supabase',
  now() - interval '10 seconds',
  now()
) as passing_operational_check_id \gset

select public.assistant_record_operational_check(
  'bookings.summary',
  'test.bookings',
  '1.0.0',
  :'passing_test_run_id'::uuid,
  'failed',
  'failed local execution fixture',
  'local_supabase',
  now() - interval '10 seconds',
  now()
) as failed_operational_check_id \gset

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select public.assistant_update_capability(
  p_capability_key => 'bookings.summary',
  p_status => 'operational',
  p_operational_check_id => :'passing_operational_check_id'::uuid
);

do $$
begin
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'operational',
      p_operational_check_id => (
        select id from public.assistant_capability_operational_checks
        where capability_key = 'bookings.summary' and result = 'failed'
        limit 1
      )
    );
    raise exception 'A failed operational check unexpectedly remained valid evidence';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
declare
  original_test_run_id uuid;
  original_check_id uuid;
begin
  select test_run_id, operational_check_id
  into original_test_run_id, original_check_id
  from public.assistant_capabilities
  where capability_key = 'bookings.summary';

  perform public.assistant_update_capability('bookings.summary', 'verified');
  perform public.assistant_update_capability('bookings.summary', 'operational');

  if not exists (
    select 1 from public.assistant_capabilities
    where capability_key = 'bookings.summary'
      and status = 'operational'
      and test_run_id = original_test_run_id
      and operational_check_id = original_check_id
      and tool_id = 'test.bookings'
      and tool_version = '1.0.0'
  ) then
    raise exception 'Status-only updates cleared linked tool or evidence';
  end if;
end;
$$;

select public.assistant_update_capability(
  p_capability_key => 'bookings.search',
  p_status => 'in_development',
  p_tool_id => 'test.bookings',
  p_tool_version => '1.0.0',
  p_handler_reference => 'src/test/bookings.ts'
);

reset role;
set local request.jwt.claim.role = 'service_role';
set local role service_role;

select public.assistant_record_capability_test_run(
  'bookings.search',
  'test.bookings',
  '1.0.0',
  'local capability integration',
  'supabase/tests/assistant_capability_engine.sql',
  repeat('b', 40),
  'local_supabase',
  'passed',
  4,
  0,
  now() - interval '1 minute',
  now()
) as search_test_run_id \gset

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local role authenticated;

select public.assistant_update_capability(
  p_capability_key => 'bookings.search',
  p_status => 'verified',
  p_test_run_id => :'search_test_run_id'::uuid
);

do $$
declare
  current_status text;
  linked_run_count integer;
begin
  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'verified',
      p_test_run_id => (
        select test_run_id from public.assistant_capabilities
        where capability_key = 'bookings.search'
      )
    );
    raise exception 'A test run for another capability was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'in_development',
      p_tool_status => 'candidate'
    );
    raise exception 'A tool was downgraded while another verified capability depended on it';
  exception when check_violation then
    null;
  end;

  select status into current_status
  from public.assistant_capabilities
  where capability_key = 'bookings.summary';
  if current_status <> 'operational' then
    raise exception 'A rejected tool downgrade changed the dependent capability';
  end if;

  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'verified',
      p_test_run_id => (
        select id from public.assistant_capability_test_runs
        where capability_key = 'bookings.summary'
          and completed_at < now() - interval '30 days'
        limit 1
      )
    );
    raise exception 'Expired evidence unexpectedly verified a capability';
  exception when check_violation then
    null;
  end;

  begin
    perform public.assistant_update_capability(
      p_capability_key => 'bookings.summary',
      p_status => 'verified',
      p_tool_id => 'test.bookings',
      p_tool_version => '2.0.0',
      p_handler_reference => 'src/test/bookings-v2.ts',
      p_test_run_id => (
        select id from public.assistant_capability_test_runs
        where capability_key = 'bookings.summary'
          and tool_version = '1.0.0'
          and result = 'passed'
        limit 1
      )
    );
    raise exception 'A test run for another tool version was accepted';
  exception when check_violation then
    null;
  end;

  select count(*) into linked_run_count
  from public.assistant_capability_test_runs
  where capability_key = 'bookings.summary';
  if linked_run_count < 1 then
    raise exception 'Test run history was not retained';
  end if;
end;
$$;

select public.assistant_update_capability(
  p_capability_key => 'bookings.search',
  p_status => 'retired'
);

select public.assistant_update_capability(
  p_capability_key => 'bookings.search',
  p_status => 'retired',
  p_clear_tool => true
);

do $$
declare
  audit_count integer;
begin
  if not exists (
    select 1 from public.assistant_capabilities
    where capability_key = 'bookings.search'
      and status = 'retired'
      and tool_id is null
      and test_run_id is null
  ) then
    raise exception 'Explicit unlink did not clear the selected link';
  end if;
  select count(*) into audit_count
  from public.audit_logs
  where target_type = 'assistant_tool'
    and action in ('assistant.tool_registered', 'assistant.tool_registry_updated');
  if audit_count < 1 then
    raise exception 'Tool registration/update was not separately audited';
  end if;
end;
$$;

rollback;
