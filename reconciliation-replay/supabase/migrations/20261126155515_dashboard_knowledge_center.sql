create table if not exists public.knowledge_role_module_access (
  role text not null check (role in (
    'super_admin', 'admin', 'content_manager', 'support', 'provider_operator'
  )),
  module text not null,
  can_read boolean not null default false,
  can_propose boolean not null default false,
  primary key (role, module)
);

insert into public.knowledge_role_module_access (role, module, can_read, can_propose)
values
  ('super_admin', '*', true, true),
  ('admin', '*', true, true),
  ('support', 'operations.bookings', true, true),
  ('support', 'operations.passengers', true, true),
  ('provider_operator', 'operations.routes', true, true),
  ('content_manager', 'platform.content', true, true)
on conflict (role, module) do nothing;

create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'busnet_knowledge', 'business_rule', 'experience', 'learned_knowledge',
    'document', 'technical_knowledge', 'problem_solution', 'proposal'
  )),
  scope text not null check (scope in ('shared', 'module', 'owner')),
  department text not null default 'systems' check (char_length(department) <= 80),
  module text not null default 'general' check (char_length(module) <= 120),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  status text not null check (status in (
    'new', 'needs_verification', 'verified', 'stale_or_conflict', 'rejected', 'archived'
  )),
  confidence numeric(4, 3) not null default 0.500 check (confidence between 0 and 1),
  current_version integer not null default 0 check (current_version >= 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  verified_version integer,
  verification_source text,
  source_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_entries_scope_owner_check
    check ((scope = 'owner' and owner_id is not null) or (scope <> 'owner' and owner_id is null)),
  constraint knowledge_entries_verified_snapshot_check
    check (
      status <> 'verified'
      or (
        verified_by is not null
        and verified_at is not null
        and verified_version = current_version
        and nullif(btrim(verification_source), '') is not null
      )
    )
);

create table if not exists public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.knowledge_entries(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  category text not null check (category in (
    'busnet_knowledge', 'business_rule', 'experience', 'learned_knowledge',
    'document', 'technical_knowledge', 'problem_solution', 'proposal'
  )),
  scope text not null check (scope in ('shared', 'module', 'owner')),
  department text not null check (char_length(department) <= 80),
  module text not null check (char_length(module) <= 120),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  status text not null check (status in (
    'new', 'needs_verification', 'verified', 'stale_or_conflict', 'rejected', 'archived'
  )),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  change_type text not null check (change_type in (
    'created', 'updated', 'verified', 'conflict_reported', 'conflict_resolved',
    'archived', 'restored', 'imported'
  )),
  change_note text not null default '' check (char_length(change_note) <= 1000),
  source_task_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  verification_source text,
  unique (entry_id, version_no),
  constraint knowledge_versions_scope_owner_check
    check ((scope = 'owner' and owner_id is not null) or (scope <> 'owner' and owner_id is null)),
  constraint knowledge_versions_verified_snapshot_check
    check (
      status <> 'verified'
      or (
        verified_by is not null
        and verified_at is not null
        and nullif(btrim(verification_source), '') is not null
      )
    )
);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.knowledge_versions(id) on delete restrict,
  source_type text not null check (source_type in (
    'owner_input', 'platform_source', 'task_experience'
  )),
  source_reference text not null check (char_length(btrim(source_reference)) between 1 and 2048),
  source_revision text check (source_revision is null or char_length(source_revision) <= 200),
  evidence text not null default '' check (char_length(evidence) <= 10000),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  source_task_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.knowledge_entries(id) on delete restrict,
  base_version integer check (base_version is null or base_version > 0),
  action text not null check (action in ('create', 'update', 'conflict')),
  status text not null default 'pending' check (status in (
    'pending', 'needs_verification', 'verified', 'rejected', 'conflict'
  )),
  category text not null check (category in (
    'busnet_knowledge', 'business_rule', 'experience', 'learned_knowledge',
    'document', 'technical_knowledge', 'problem_solution', 'proposal'
  )),
  scope text not null check (scope in ('shared', 'module', 'owner')),
  department text not null default 'systems' check (char_length(department) <= 80),
  module text not null default 'general' check (char_length(module) <= 120),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  source_type text not null check (source_type in (
    'owner_input', 'platform_source', 'task_experience'
  )),
  source_reference text not null check (char_length(btrim(source_reference)) between 1 and 2048),
  source_revision text check (source_revision is null or char_length(source_revision) <= 200),
  evidence text not null default '' check (char_length(evidence) <= 10000),
  confidence numeric(4, 3) not null default 0.500 check (confidence between 0 and 1),
  source_task_id uuid,
  legacy_id text check (legacy_id is null or char_length(legacy_id) <= 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 1000),
  constraint knowledge_proposals_action_target_check
    check (
      (action = 'create' and entry_id is null and base_version is null)
      or (action in ('update', 'conflict') and entry_id is not null and base_version is not null)
    ),
  constraint knowledge_proposals_scope_owner_check
    check ((scope = 'owner' and owner_id is not null) or (scope <> 'owner' and owner_id is null))
);

create unique index if not exists knowledge_proposals_legacy_owner_id_idx
  on public.knowledge_proposals (created_by, legacy_id)
  where legacy_id is not null;

create table if not exists public.knowledge_conflicts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.knowledge_entries(id) on delete restrict,
  proposal_id uuid not null unique references public.knowledge_proposals(id) on delete restrict,
  summary text not null check (char_length(btrim(summary)) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  constraint knowledge_conflicts_state_check
    check ((status = 'open' and resolved_by is null and resolved_at is null) or status <> 'open')
);

create table if not exists public.knowledge_usage (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  version_no integer not null,
  task_id uuid,
  consumer text not null check (char_length(btrim(consumer)) between 1 and 120),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (entry_id, version_no)
    references public.knowledge_versions(entry_id, version_no) on delete restrict
);

create index if not exists knowledge_entries_status_category_updated_idx
  on public.knowledge_entries (status, category, updated_at desc);
create index if not exists knowledge_entries_module_status_updated_idx
  on public.knowledge_entries (module, status, updated_at desc);
create index if not exists knowledge_proposals_status_created_idx
  on public.knowledge_proposals (status, created_at desc);
create index if not exists knowledge_conflicts_status_created_idx
  on public.knowledge_conflicts (status, created_at desc);
create index if not exists knowledge_usage_entry_version_created_idx
  on public.knowledge_usage (entry_id, version_no, created_at desc);

alter table public.knowledge_role_module_access enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.knowledge_versions enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_proposals enable row level security;
alter table public.knowledge_conflicts enable row level security;
alter table public.knowledge_usage enable row level security;

create or replace function public.knowledge_can_read_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.knowledge_entries e
    join public.admin_profiles ap
      on ap.user_id = auth.uid()
     and ap.active = true
    where e.id = p_entry_id
      and (
        (e.scope = 'owner' and e.owner_id = auth.uid())
        or (
          e.scope = 'shared'
          and (
            e.status = 'verified'
            or e.created_by = auth.uid()
            or ap.role in ('super_admin', 'admin')
          )
        )
        or (
          e.scope = 'module'
          and (
            ap.role in ('super_admin', 'admin')
            or exists (
              select 1
              from public.knowledge_role_module_access access
              where access.role = ap.role
                and access.module in (e.module, '*')
                and access.can_read = true
            )
          )
          and (
            e.status = 'verified'
            or e.created_by = auth.uid()
            or ap.role = 'super_admin'
            or ap.role = 'admin'
          )
        )
      )
  );
$$;

create or replace function public.knowledge_can_propose(
  p_module text,
  p_scope text,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = auth.uid()
      and ap.active = true
      and (
        (p_scope = 'owner' and p_owner_id = auth.uid())
        or (
          p_scope <> 'owner'
          and exists (
            select 1
            from public.knowledge_role_module_access access
            where access.role = ap.role
              and access.module in (coalesce(nullif(p_module, ''), 'general'), '*')
              and access.can_propose = true
          )
        )
      )
  );
$$;

create or replace function public.prevent_knowledge_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Knowledge history is immutable'
    using errcode = '55000';
end;
$$;

drop trigger if exists knowledge_versions_immutable on public.knowledge_versions;
create trigger knowledge_versions_immutable
  before update or delete on public.knowledge_versions
  for each row execute function public.prevent_knowledge_history_mutation();

drop trigger if exists knowledge_sources_immutable on public.knowledge_sources;
create trigger knowledge_sources_immutable
  before update or delete on public.knowledge_sources
  for each row execute function public.prevent_knowledge_history_mutation();

drop trigger if exists knowledge_usage_immutable on public.knowledge_usage;
create trigger knowledge_usage_immutable
  before update or delete on public.knowledge_usage
  for each row execute function public.prevent_knowledge_history_mutation();

drop policy if exists "knowledge module access curator read" on public.knowledge_role_module_access;
create policy "knowledge module access curator read"
  on public.knowledge_role_module_access
  for select to authenticated
  using (public.has_admin_role(array['super_admin']));

drop policy if exists "knowledge entries scoped read" on public.knowledge_entries;
create policy "knowledge entries scoped read"
  on public.knowledge_entries
  for select to authenticated
  using (public.knowledge_can_read_entry(id));

drop policy if exists "knowledge versions scoped read" on public.knowledge_versions;
create policy "knowledge versions scoped read"
  on public.knowledge_versions
  for select to authenticated
  using (public.knowledge_can_read_entry(entry_id));

drop policy if exists "knowledge sources scoped read" on public.knowledge_sources;
create policy "knowledge sources scoped read"
  on public.knowledge_sources
  for select to authenticated
  using (
    exists (
      select 1
      from public.knowledge_versions v
      where v.id = version_id
        and public.knowledge_can_read_entry(v.entry_id)
    )
  );

drop policy if exists "knowledge proposals scoped read" on public.knowledge_proposals;
create policy "knowledge proposals scoped read"
  on public.knowledge_proposals
  for select to authenticated
  using (created_by = auth.uid() or public.has_admin_role(array['super_admin']));

drop policy if exists "knowledge conflicts scoped read" on public.knowledge_conflicts;
create policy "knowledge conflicts scoped read"
  on public.knowledge_conflicts
  for select to authenticated
  using (
    reported_by = auth.uid()
    or public.has_admin_role(array['super_admin'])
    or public.knowledge_can_read_entry(entry_id)
  );

drop policy if exists "knowledge usage scoped read" on public.knowledge_usage;
create policy "knowledge usage scoped read"
  on public.knowledge_usage
  for select to authenticated
  using (public.knowledge_can_read_entry(entry_id));

revoke all on public.knowledge_role_module_access,
  public.knowledge_entries,
  public.knowledge_versions,
  public.knowledge_sources,
  public.knowledge_proposals,
  public.knowledge_conflicts,
  public.knowledge_usage
  from public, anon, authenticated;

grant select on public.knowledge_entries,
  public.knowledge_versions,
  public.knowledge_sources,
  public.knowledge_proposals,
  public.knowledge_conflicts,
  public.knowledge_usage
  to authenticated;

create or replace function public._knowledge_append_version(
  p_entry_id uuid,
  p_category text,
  p_scope text,
  p_department text,
  p_module text,
  p_owner_id uuid,
  p_title text,
  p_summary text,
  p_content text,
  p_status text,
  p_confidence numeric,
  p_change_type text,
  p_change_note text,
  p_source_type text,
  p_source_reference text,
  p_source_revision text,
  p_evidence text,
  p_source_task_id uuid,
  p_verified_by uuid default null,
  p_verification_source text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.knowledge_entries%rowtype;
  v_version integer;
  v_verified_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into v_entry
  from public.knowledge_entries
  where id = p_entry_id
  for update;
  if not found then
    raise exception 'Knowledge entry not found' using errcode = 'P0002';
  end if;

  v_version := v_entry.current_version + 1;
  v_verified_at := case when p_status = 'verified' then now() else null end;

  update public.knowledge_entries
  set category = p_category,
      scope = p_scope,
      department = p_department,
      module = p_module,
      owner_id = p_owner_id,
      title = p_title,
      summary = p_summary,
      content = p_content,
      status = p_status,
      confidence = p_confidence,
      current_version = v_version,
      updated_by = auth.uid(),
      updated_at = now(),
      verified_by = case when p_status = 'verified' then coalesce(p_verified_by, auth.uid()) else verified_by end,
      verified_at = case when p_status = 'verified' then v_verified_at else verified_at end,
      verified_version = case when p_status = 'verified' then v_version else verified_version end,
      verification_source = case when p_status = 'verified' then p_verification_source else verification_source end,
      source_task_id = p_source_task_id
  where id = p_entry_id;

  insert into public.knowledge_versions (
    entry_id, version_no, category, scope, department, module, owner_id,
    title, summary, content, status, confidence, change_type, change_note,
    source_task_id, created_by, verified_by, verified_at, verification_source
  ) values (
    p_entry_id, v_version, p_category, p_scope, p_department, p_module, p_owner_id,
    p_title, p_summary, p_content, p_status, p_confidence, p_change_type, p_change_note,
    p_source_task_id, auth.uid(),
    case when p_status = 'verified' then coalesce(p_verified_by, auth.uid()) else null end,
    v_verified_at,
    case when p_status = 'verified' then p_verification_source else null end
  );

  insert into public.knowledge_sources (
    version_id, source_type, source_reference, source_revision,
    evidence, confidence, source_task_id, created_by
  )
  select v.id, p_source_type, p_source_reference, p_source_revision,
         coalesce(p_evidence, ''), p_confidence, p_source_task_id, auth.uid()
  from public.knowledge_versions v
  where v.entry_id = p_entry_id and v.version_no = v_version;

  perform public.log_admin_action(
    'knowledge.version_created',
    'knowledge_entry',
    p_entry_id::text,
    jsonb_build_object(
      'version', v_version,
      'status', p_status,
      'change_type', p_change_type
    )
  );
  return v_version;
end;
$$;

create or replace function public.knowledge_search(
  p_query text default null,
  p_category text default null,
  p_status text default null,
  p_module text default null,
  p_scope text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
  v_total integer;
  v_query text := nullif(btrim(p_query), '');
begin
  if auth.uid() is null or not public.has_admin_role(array[
    'super_admin', 'admin', 'content_manager', 'support', 'provider_operator'
  ]) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;
  if v_query is not null and char_length(v_query) > 200 then
    raise exception 'Search query is too long' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in (
    'busnet_knowledge', 'business_rule', 'experience', 'learned_knowledge',
    'document', 'technical_knowledge', 'problem_solution', 'proposal'
  ) then
    raise exception 'Invalid knowledge category' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'new', 'needs_verification', 'verified', 'stale_or_conflict', 'rejected', 'archived'
  ) then
    raise exception 'Invalid knowledge status' using errcode = '22023';
  end if;
  if p_scope is not null and p_scope not in ('shared', 'module', 'owner') then
    raise exception 'Invalid knowledge scope' using errcode = '22023';
  end if;

  select count(*)::integer into v_total
  from public.knowledge_entries e
  where public.knowledge_can_read_entry(e.id)
    and (p_category is null or e.category = p_category)
    and (p_status is null or e.status = p_status)
    and (p_module is null or e.module = p_module)
    and (p_scope is null or e.scope = p_scope)
    and (
      v_query is null
      or e.title ilike '%' || v_query || '%'
      or e.summary ilike '%' || v_query || '%'
      or e.content ilike '%' || v_query || '%'
    );

  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into v_items
  from (
    select e.id, e.category, e.scope, e.department, e.module, e.owner_id,
           e.title, e.summary, e.content, e.status, e.confidence,
           e.current_version, e.created_by, e.updated_by, e.created_at, e.updated_at,
           e.verified_by, e.verified_at, e.verified_version, e.verification_source,
           e.source_task_id,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'source_type', s.source_type,
               'source_reference', s.source_reference,
               'source_revision', s.source_revision,
               'evidence', s.evidence,
               'confidence', s.confidence
             ) order by s.created_at)
             from public.knowledge_versions v
             join public.knowledge_sources s on s.version_id = v.id
             where v.entry_id = e.id and v.version_no = e.current_version
           ), '[]'::jsonb) as sources
    from public.knowledge_entries e
    where public.knowledge_can_read_entry(e.id)
      and (p_category is null or e.category = p_category)
      and (p_status is null or e.status = p_status)
      and (p_module is null or e.module = p_module)
      and (p_scope is null or e.scope = p_scope)
      and (
        v_query is null
        or e.title ilike '%' || v_query || '%'
        or e.summary ilike '%' || v_query || '%'
        or e.content ilike '%' || v_query || '%'
      )
    order by e.updated_at desc, e.id
    limit p_limit offset p_offset
  ) rows;

  return jsonb_build_object('items', v_items, 'total_count', v_total);
end;
$$;

create or replace function public.knowledge_get_proposals(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null or not public.has_admin_role(array[
    'super_admin', 'admin', 'content_manager', 'support', 'provider_operator'
  ]) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into v_items
  from (
    select p.id, p.entry_id, p.base_version, p.action, p.status, p.category,
           p.scope, p.department, p.module, p.owner_id, p.title, p.summary,
           p.content, p.source_type, p.source_reference, p.source_revision,
           p.evidence, p.confidence, p.source_task_id, p.created_by,
           p.created_at, p.reviewed_by, p.reviewed_at, p.review_note
    from public.knowledge_proposals p
    where (
      p.created_by = auth.uid()
      or (
        public.has_admin_role(array['super_admin'])
        and (p.scope <> 'owner' or p.owner_id = auth.uid())
      )
    )
      and p.status in ('pending', 'needs_verification', 'conflict')
    order by p.created_at desc
    limit p_limit
  ) rows;
  return v_items;
end;
$$;

create or replace function public.knowledge_get_conflicts(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null or not public.has_admin_role(array[
    'super_admin', 'admin', 'content_manager', 'support', 'provider_operator'
  ]) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into v_items
  from (
    select c.id, c.entry_id, c.proposal_id, c.summary, c.status,
           c.reported_by, c.created_at, c.resolved_by, c.resolved_at,
           c.resolution, p.title as proposed_title, p.content as proposed_content,
           p.source_type, p.source_reference, p.evidence, p.confidence
    from public.knowledge_conflicts c
    join public.knowledge_proposals p on p.id = c.proposal_id
    where (c.reported_by = auth.uid() or public.has_admin_role(array['super_admin']))
      and public.knowledge_can_read_entry(c.entry_id)
      and c.status = 'open'
    order by c.created_at desc
    limit p_limit
  ) rows;
  return v_items;
end;
$$;

create or replace function public.knowledge_get_history(p_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null or not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.version_no desc), '[]'::jsonb)
    into v_items
  from (
    select v.id, v.entry_id, v.version_no, v.category, v.scope, v.department,
           v.module, v.owner_id, v.title, v.summary, v.content, v.status,
           v.confidence, v.change_type, v.change_note, v.source_task_id,
           v.created_by, v.created_at, v.verified_by, v.verified_at,
           v.verification_source,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'source_type', s.source_type,
               'source_reference', s.source_reference,
               'source_revision', s.source_revision,
               'evidence', s.evidence,
               'confidence', s.confidence,
               'source_task_id', s.source_task_id
             ) order by s.created_at)
             from public.knowledge_sources s
             where s.version_id = v.id
           ), '[]'::jsonb) as sources
    from public.knowledge_versions v
    where v.entry_id = p_entry_id
  ) rows;
  return v_items;
end;
$$;

create or replace function public.knowledge_get_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_verified integer;
  v_pending integer;
  v_conflicts integer;
  v_usage integer;
begin
  if auth.uid() is null or not public.has_admin_role(array[
    'super_admin', 'admin', 'content_manager', 'support', 'provider_operator'
  ]) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  select count(*)::integer,
         count(*) filter (where e.status = 'verified')::integer,
         count(*) filter (where e.status = 'needs_verification')::integer
    into v_total, v_verified, v_pending
  from public.knowledge_entries e
  where public.knowledge_can_read_entry(e.id);
  select count(*)::integer into v_conflicts
  from public.knowledge_conflicts c
  where c.status = 'open'
    and public.knowledge_can_read_entry(c.entry_id);
  select count(*)::integer into v_usage
  from public.knowledge_usage u
  where public.knowledge_can_read_entry(u.entry_id);
  return jsonb_build_object(
    'total', v_total,
    'verified', v_verified,
    'needs_verification', v_pending,
    'open_conflicts', v_conflicts,
    'usage_count', v_usage
  );
end;
$$;

create or replace function public.knowledge_propose(
  p_action text,
  p_entry_id uuid,
  p_base_version integer,
  p_category text,
  p_scope text,
  p_department text,
  p_module text,
  p_owner_id uuid,
  p_title text,
  p_summary text,
  p_content text,
  p_source_type text,
  p_source_reference text,
  p_source_revision text default null,
  p_evidence text default '',
  p_confidence numeric default 0.5,
  p_source_task_id uuid default null,
  p_legacy_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal_id uuid;
  v_conflict_id uuid;
  v_entry public.knowledge_entries%rowtype;
  v_status text := 'pending';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_action not in ('create', 'update')
     or (p_action = 'create' and (p_entry_id is not null or p_base_version is not null))
     or (p_action = 'update' and (p_entry_id is null or p_base_version is null)) then
    raise exception 'Invalid proposal target' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_content, ''))) not between 1 and 20000
     or char_length(coalesce(p_summary, '')) > 1000
     or char_length(btrim(coalesce(p_source_reference, ''))) not between 1 and 2048
     or char_length(coalesce(p_evidence, '')) > 10000
     or p_confidence < 0 or p_confidence > 1 then
    raise exception 'Invalid proposal fields' using errcode = '22023';
  end if;
  if not public.knowledge_can_propose(p_module, p_scope, p_owner_id) then
    raise exception 'Knowledge proposal denied for this role/module' using errcode = '42501';
  end if;
  if p_action = 'update' then
    select * into v_entry from public.knowledge_entries where id = p_entry_id for update;
    if not found or not public.knowledge_can_read_entry(p_entry_id) then
      raise exception 'Knowledge entry not found or not accessible' using errcode = '42501';
    end if;
    if v_entry.status = 'archived' then
      raise exception 'Archived entries must be restored before proposing changes' using errcode = '55000';
    end if;
    if p_scope <> v_entry.scope or p_owner_id is distinct from v_entry.owner_id then
      raise exception 'Entry scope and owner are immutable; create a separate entry to change access' using errcode = '42501';
    end if;
  end if;

  if p_legacy_id is not null then
    select id into v_proposal_id
    from public.knowledge_proposals
    where created_by = auth.uid() and legacy_id = p_legacy_id;
    if v_proposal_id is not null then
      return jsonb_build_object('proposal_id', v_proposal_id, 'status', 'already_imported');
    end if;
  end if;

  if p_action = 'update' and v_entry.current_version <> p_base_version then
    v_status := 'conflict';
  end if;

  insert into public.knowledge_proposals (
    entry_id, base_version, action, status, category, scope, department, module,
    owner_id, title, summary, content, source_type, source_reference,
    source_revision, evidence, confidence, source_task_id, legacy_id, created_by
  ) values (
    p_entry_id, p_base_version, p_action, v_status, p_category, p_scope,
    coalesce(nullif(p_department, ''), 'systems'), coalesce(nullif(p_module, ''), 'general'),
    p_owner_id, btrim(p_title), coalesce(p_summary, ''), btrim(p_content),
    p_source_type, btrim(p_source_reference), p_source_revision, coalesce(p_evidence, ''),
    p_confidence, p_source_task_id, p_legacy_id, auth.uid()
  ) returning id into v_proposal_id;

  if v_status = 'conflict' then
    insert into public.knowledge_conflicts (
      entry_id, proposal_id, summary, reported_by
    ) values (
      p_entry_id, v_proposal_id,
      'Knowledge changed after the proposal was prepared; curator review is required.',
      auth.uid()
    ) returning id into v_conflict_id;
    if v_entry.status = 'verified' then
      perform public._knowledge_append_version(
        v_entry.id, v_entry.category, v_entry.scope, v_entry.department, v_entry.module,
        v_entry.owner_id, v_entry.title, v_entry.summary, v_entry.content,
        'stale_or_conflict', v_entry.confidence, 'conflict_reported',
        'A concurrent proposal used a stale base version.',
        p_source_type, p_source_reference, p_source_revision, p_evidence,
        p_source_task_id
      );
    end if;
    perform public.log_admin_action(
      'knowledge.conflict_registered', 'knowledge_entry', p_entry_id::text,
      jsonb_build_object('proposal_id', v_proposal_id, 'conflict_id', v_conflict_id)
    );
    return jsonb_build_object(
      'proposal_id', v_proposal_id, 'conflict_id', v_conflict_id, 'status', 'conflict'
    );
  end if;

  perform public.log_admin_action(
    'knowledge.proposal_created', 'knowledge_proposal', v_proposal_id::text,
    jsonb_build_object('action', p_action, 'entry_id', p_entry_id, 'legacy_id', p_legacy_id)
  );
  return jsonb_build_object('proposal_id', v_proposal_id, 'status', v_status);
end;
$$;

create or replace function public.knowledge_review_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.knowledge_proposals%rowtype;
  v_entry public.knowledge_entries%rowtype;
  v_entry_id uuid;
  v_status text;
  v_change_type text;
  v_version integer;
  v_conflict_id uuid;
begin
  if auth.uid() is null or not public.has_admin_role(array['super_admin']) then
    raise exception 'Only a Knowledge Curator can review proposals' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'defer', 'reject') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'Review note is too long' using errcode = '22023';
  end if;
  select * into v_proposal
  from public.knowledge_proposals
  where id = p_proposal_id
  for update;
  if not found or v_proposal.status not in ('pending', 'needs_verification') then
    raise exception 'Proposal is not pending review' using errcode = '55000';
  end if;
  if v_proposal.scope = 'owner' and v_proposal.owner_id <> auth.uid() then
    raise exception 'Private knowledge is only reviewable by its owner' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.knowledge_proposals
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        review_note = coalesce(p_note, '')
    where id = p_proposal_id;
    perform public.log_admin_action(
      'knowledge.proposal_rejected', 'knowledge_proposal', p_proposal_id::text,
      jsonb_build_object('note', p_note)
    );
    return jsonb_build_object('proposal_id', p_proposal_id, 'status', 'rejected');
  end if;

  if p_decision = 'defer' then
    update public.knowledge_proposals
    set status = 'needs_verification', reviewed_by = auth.uid(), reviewed_at = now(),
        review_note = coalesce(p_note, '')
    where id = p_proposal_id;
    perform public.log_admin_action(
      'knowledge.proposal_deferred', 'knowledge_proposal', p_proposal_id::text,
      jsonb_build_object('note', p_note)
    );
    return jsonb_build_object('proposal_id', p_proposal_id, 'status', 'needs_verification');
  end if;

  if v_proposal.action = 'update' then
    select * into v_entry
    from public.knowledge_entries
    where id = v_proposal.entry_id
    for update;
    if not found then
      raise exception 'Knowledge entry no longer exists' using errcode = 'P0002';
    end if;
    if v_entry.current_version <> v_proposal.base_version then
      insert into public.knowledge_conflicts (entry_id, proposal_id, summary, reported_by)
      values (
        v_entry.id, v_proposal.id,
        'Knowledge changed while this proposal was awaiting review.',
        auth.uid()
      ) returning id into v_conflict_id;
      update public.knowledge_proposals
      set status = 'conflict', reviewed_by = auth.uid(), reviewed_at = now(),
          review_note = coalesce(p_note, 'Stale base version')
      where id = v_proposal.id;
      if v_entry.status = 'verified' then
        perform public._knowledge_append_version(
          v_entry.id, v_entry.category, v_entry.scope, v_entry.department, v_entry.module,
          v_entry.owner_id, v_entry.title, v_entry.summary, v_entry.content,
          'stale_or_conflict', v_entry.confidence, 'conflict_reported',
          'The entry changed while an update was awaiting review.',
          v_proposal.source_type, v_proposal.source_reference, v_proposal.source_revision,
          v_proposal.evidence, v_proposal.source_task_id
        );
      end if;
      perform public.log_admin_action(
        'knowledge.conflict_registered', 'knowledge_entry', v_entry.id::text,
        jsonb_build_object('proposal_id', v_proposal.id, 'conflict_id', v_conflict_id)
      );
      return jsonb_build_object(
        'proposal_id', v_proposal.id, 'conflict_id', v_conflict_id, 'status', 'conflict'
      );
    end if;
    v_entry_id := v_entry.id;
  else
    insert into public.knowledge_entries (
      category, scope, department, module, owner_id, title, summary, content,
      status, confidence, current_version, created_by
    ) values (
      v_proposal.category, v_proposal.scope, v_proposal.department, v_proposal.module,
      v_proposal.owner_id, v_proposal.title, v_proposal.summary, v_proposal.content,
      'new', v_proposal.confidence, 0, v_proposal.created_by
    ) returning id into v_entry_id;
  end if;

  v_status := 'verified';
  v_change_type := case
    when v_proposal.action = 'create' then 'created'
    else 'verified'
  end;
  v_version := public._knowledge_append_version(
    v_entry_id, v_proposal.category, v_proposal.scope, v_proposal.department,
    v_proposal.module, v_proposal.owner_id, v_proposal.title, v_proposal.summary,
    v_proposal.content, v_status, v_proposal.confidence, v_change_type,
    coalesce(nullif(p_note, ''), 'Curator review'), v_proposal.source_type,
    v_proposal.source_reference, v_proposal.source_revision, v_proposal.evidence,
    v_proposal.source_task_id,
    auth.uid(),
    v_proposal.source_reference
  );
  update public.knowledge_proposals
  set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = coalesce(p_note, '')
  where id = v_proposal.id;
  perform public.log_admin_action(
    'knowledge.proposal_verified',
    'knowledge_entry', v_entry_id::text,
    jsonb_build_object(
      'proposal_id', v_proposal.id,
      'version', v_version,
      'verified_by', auth.uid()
    )
  );
  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'entry_id', v_entry_id,
    'version', v_version,
    'status', v_status
  );
end;
$$;

create or replace function public.knowledge_report_conflict(
  p_entry_id uuid,
  p_base_version integer,
  p_summary text,
  p_reported_title text,
  p_reported_content text,
  p_source_type text,
  p_source_reference text,
  p_source_revision text default null,
  p_evidence text default '',
  p_confidence numeric default 0.5,
  p_source_task_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.knowledge_entries%rowtype;
  v_proposal_id uuid;
  v_conflict_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into v_entry from public.knowledge_entries where id = p_entry_id for update;
  if not found or not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge entry not found or not accessible' using errcode = '42501';
  end if;
  if not public.knowledge_can_propose(v_entry.module, v_entry.scope, v_entry.owner_id) then
    raise exception 'Conflict reporting denied for this role/module' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_summary, ''))) not between 1 and 1000
     or char_length(btrim(coalesce(p_reported_title, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_reported_content, ''))) not between 1 and 20000
     or char_length(btrim(coalesce(p_source_reference, ''))) not between 1 and 2048
     or p_confidence < 0 or p_confidence > 1 then
    raise exception 'Invalid conflict report' using errcode = '22023';
  end if;
  insert into public.knowledge_proposals (
    entry_id, base_version, action, status, category, scope, department, module,
    owner_id, title, summary, content, source_type, source_reference,
    source_revision, evidence, confidence, source_task_id, created_by
  ) values (
    p_entry_id, p_base_version, 'conflict', 'conflict', v_entry.category, v_entry.scope,
    v_entry.department, v_entry.module, v_entry.owner_id, btrim(p_reported_title),
    btrim(p_summary), btrim(p_reported_content), p_source_type,
    btrim(p_source_reference), p_source_revision, coalesce(p_evidence, ''),
    p_confidence, p_source_task_id, auth.uid()
  ) returning id into v_proposal_id;
  insert into public.knowledge_conflicts (entry_id, proposal_id, summary, reported_by)
  values (p_entry_id, v_proposal_id, btrim(p_summary), auth.uid())
  returning id into v_conflict_id;

  if v_entry.status <> 'stale_or_conflict' then
    perform public._knowledge_append_version(
      v_entry.id, v_entry.category, v_entry.scope, v_entry.department, v_entry.module,
      v_entry.owner_id, v_entry.title, v_entry.summary, v_entry.content,
      'stale_or_conflict', v_entry.confidence, 'conflict_reported',
      btrim(p_summary), p_source_type, btrim(p_source_reference), p_source_revision,
      coalesce(p_evidence, ''), p_source_task_id
    );
  end if;
  perform public.log_admin_action(
    'knowledge.conflict_registered', 'knowledge_entry', p_entry_id::text,
    jsonb_build_object('proposal_id', v_proposal_id, 'conflict_id', v_conflict_id)
  );
  return jsonb_build_object(
    'proposal_id', v_proposal_id, 'conflict_id', v_conflict_id, 'status', 'open'
  );
end;
$$;

create or replace function public.knowledge_resolve_conflict(
  p_conflict_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conflict public.knowledge_conflicts%rowtype;
  v_proposal public.knowledge_proposals%rowtype;
  v_entry public.knowledge_entries%rowtype;
  v_status text;
  v_version integer;
  v_conflict_status text;
begin
  if auth.uid() is null or not public.has_admin_role(array['super_admin']) then
    raise exception 'Only a Knowledge Curator can resolve conflicts' using errcode = '42501';
  end if;
  if p_decision not in ('accept_reported', 'reaffirm_current', 'dismiss') then
    raise exception 'Invalid conflict resolution' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'A resolution note is required' using errcode = '22023';
  end if;
  select * into v_conflict
  from public.knowledge_conflicts
  where id = p_conflict_id and status = 'open'
  for update;
  if not found then
    raise exception 'Open conflict not found' using errcode = 'P0002';
  end if;
  select * into v_proposal
  from public.knowledge_proposals
  where id = v_conflict.proposal_id
  for update;
  select * into v_entry
  from public.knowledge_entries
  where id = v_conflict.entry_id
  for update;
  if v_entry.scope = 'owner' and v_entry.owner_id <> auth.uid() then
    raise exception 'Private knowledge is only reviewable by its owner' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.knowledge_conflicts other
    where other.entry_id = v_entry.id
      and other.status = 'open'
      and other.id <> v_conflict.id
  ) then
    raise exception 'Resolve other open conflicts for this entry first' using errcode = '55000';
  end if;
  if p_decision = 'accept_reported' then
    v_status := 'verified';
    v_version := public._knowledge_append_version(
      v_entry.id, v_proposal.category, v_proposal.scope, v_proposal.department,
      v_proposal.module, v_proposal.owner_id, v_proposal.title, v_proposal.summary,
      v_proposal.content, v_status, v_proposal.confidence, 'conflict_resolved',
      btrim(p_note), v_proposal.source_type, v_proposal.source_reference,
      v_proposal.source_revision, v_proposal.evidence, v_proposal.source_task_id,
      auth.uid(), v_proposal.source_reference
    );
    v_conflict_status := 'resolved';
  else
    v_status := case when p_decision = 'reaffirm_current' then 'verified' else 'needs_verification' end;
    v_version := public._knowledge_append_version(
      v_entry.id, v_entry.category, v_entry.scope, v_entry.department, v_entry.module,
      v_entry.owner_id, v_entry.title, v_entry.summary, v_entry.content,
      v_status, v_entry.confidence, 'conflict_resolved', btrim(p_note),
      'owner_input', btrim(p_note), null, btrim(p_note), v_entry.source_task_id,
      case when v_status = 'verified' then auth.uid() else null end,
      case when v_status = 'verified' then btrim(p_note) else null end
    );
    v_conflict_status := case when p_decision = 'dismiss' then 'dismissed' else 'resolved' end;
  end if;
  update public.knowledge_conflicts
  set status = v_conflict_status, resolved_by = auth.uid(), resolved_at = now(),
      resolution = btrim(p_note)
  where id = p_conflict_id;
  update public.knowledge_proposals
  set status = case when p_decision = 'accept_reported' then 'verified' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note)
  where id = v_proposal.id;
  perform public.log_admin_action(
    'knowledge.conflict_resolved', 'knowledge_entry', v_entry.id::text,
    jsonb_build_object('conflict_id', p_conflict_id, 'decision', p_decision, 'version', v_version)
  );
  return jsonb_build_object(
    'conflict_id', p_conflict_id, 'entry_id', v_entry.id,
    'version', v_version, 'status', v_status
  );
end;
$$;

create or replace function public.knowledge_archive_entry(
  p_entry_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.knowledge_entries%rowtype;
  v_version integer;
begin
  if auth.uid() is null or not public.has_admin_role(array['super_admin']) then
    raise exception 'Only a Knowledge Curator can archive entries' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'An archive reason is required' using errcode = '22023';
  end if;
  select * into v_entry from public.knowledge_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Knowledge entry not found' using errcode = 'P0002';
  end if;
  if not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  v_version := public._knowledge_append_version(
    v_entry.id, v_entry.category, v_entry.scope, v_entry.department, v_entry.module,
    v_entry.owner_id, v_entry.title, v_entry.summary, v_entry.content, 'archived',
    v_entry.confidence, 'archived', btrim(p_note), 'owner_input', btrim(p_note),
    null, btrim(p_note), v_entry.source_task_id
  );
  return jsonb_build_object('entry_id', p_entry_id, 'version', v_version, 'status', 'archived');
end;
$$;

create or replace function public.knowledge_restore_version(
  p_entry_id uuid,
  p_version integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.knowledge_entries%rowtype;
  v_version public.knowledge_versions%rowtype;
  v_source public.knowledge_sources%rowtype;
  v_status text;
  v_new_version integer;
begin
  if auth.uid() is null or not public.has_admin_role(array['super_admin']) then
    raise exception 'Only a Knowledge Curator can restore versions' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'A restore reason is required' using errcode = '22023';
  end if;
  select * into v_entry from public.knowledge_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Knowledge entry not found' using errcode = 'P0002';
  end if;
  if not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  select * into v_version
  from public.knowledge_versions
  where entry_id = p_entry_id and version_no = p_version;
  if not found then
    raise exception 'Knowledge version not found' using errcode = 'P0002';
  end if;
  select * into v_source
  from public.knowledge_sources
  where version_id = v_version.id
  order by created_at
  limit 1;
  v_status := case when v_version.status = 'verified' then 'verified' else 'needs_verification' end;
  v_new_version := public._knowledge_append_version(
    p_entry_id, v_version.category, v_version.scope, v_version.department,
    v_version.module, v_version.owner_id, v_version.title, v_version.summary,
    v_version.content, v_status, v_version.confidence, 'restored',
    format('Restored from version %s. %s', p_version, btrim(p_note)),
    coalesce(v_source.source_type, 'owner_input'),
    format('Restored from version %s: %s', p_version, coalesce(v_source.source_reference, btrim(p_note))),
    v_source.source_revision, coalesce(v_source.evidence, btrim(p_note)),
    v_version.source_task_id,
    case when v_status = 'verified' then auth.uid() else null end,
    case when v_status = 'verified'
      then format('Curator restoration of version %s: %s', p_version, btrim(p_note))
      else null
    end
  );
  perform public.log_admin_action(
    'knowledge.version_restored', 'knowledge_entry', p_entry_id::text,
    jsonb_build_object('restored_from', p_version, 'new_version', v_new_version)
  );
  return jsonb_build_object(
    'entry_id', p_entry_id, 'restored_from', p_version,
    'version', v_new_version, 'status', v_status
  );
end;
$$;

create or replace function public.knowledge_record_usage(
  p_entry_id uuid,
  p_version integer,
  p_task_id uuid default null,
  p_consumer text default 'busnet_intelligence'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage_id uuid;
begin
  if auth.uid() is null or not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.knowledge_versions
    where entry_id = p_entry_id and version_no = p_version and status = 'verified'
  ) then
    raise exception 'Only a verified knowledge version can be recorded as used' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_consumer, ''))) not between 1 and 120 then
    raise exception 'Invalid consumer' using errcode = '22023';
  end if;
  insert into public.knowledge_usage (entry_id, version_no, task_id, consumer, actor_id)
  values (p_entry_id, p_version, p_task_id, btrim(p_consumer), auth.uid())
  returning id into v_usage_id;
  return v_usage_id;
end;
$$;

create or replace function public.knowledge_get_usage(p_entry_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null or not public.knowledge_can_read_entry(p_entry_id) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into v_items
  from (
    select id, entry_id, version_no, task_id, consumer, actor_id, created_at
    from public.knowledge_usage
    where entry_id = p_entry_id
    order by created_at desc
    limit p_limit
  ) rows;
  return v_items;
end;
$$;

revoke all on function public.knowledge_can_read_entry(uuid) from public, anon, authenticated;
grant execute on function public.knowledge_can_read_entry(uuid) to authenticated;
revoke all on function public.knowledge_can_propose(text, text, uuid) from public, anon, authenticated;
revoke all on function public.prevent_knowledge_history_mutation() from public, anon, authenticated;
revoke all on function public._knowledge_append_version(
  uuid, text, text, text, text, uuid, text, text, text, text, numeric, text, text,
  text, text, text, text, uuid, uuid, text
) from public, anon, authenticated;

revoke all on function public.knowledge_search(text, text, text, text, text, integer, integer) from public, anon;
revoke all on function public.knowledge_get_proposals(integer) from public, anon;
revoke all on function public.knowledge_get_conflicts(integer) from public, anon;
revoke all on function public.knowledge_get_history(uuid) from public, anon;
revoke all on function public.knowledge_get_stats() from public, anon;
revoke all on function public.knowledge_propose(
  text, uuid, integer, text, text, text, text, uuid, text, text, text,
  text, text, text, text, numeric, uuid, text
) from public, anon;
revoke all on function public.knowledge_review_proposal(uuid, text, text) from public, anon;
revoke all on function public.knowledge_report_conflict(
  uuid, integer, text, text, text, text, text, text, text, numeric, uuid
) from public, anon;
revoke all on function public.knowledge_resolve_conflict(uuid, text, text) from public, anon;
revoke all on function public.knowledge_archive_entry(uuid, text) from public, anon;
revoke all on function public.knowledge_restore_version(uuid, integer, text) from public, anon;
revoke all on function public.knowledge_record_usage(uuid, integer, uuid, text) from public, anon;
revoke all on function public.knowledge_get_usage(uuid, integer) from public, anon;

grant execute on function public.knowledge_search(text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.knowledge_get_proposals(integer) to authenticated;
grant execute on function public.knowledge_get_conflicts(integer) to authenticated;
grant execute on function public.knowledge_get_history(uuid) to authenticated;
grant execute on function public.knowledge_get_stats() to authenticated;
grant execute on function public.knowledge_propose(
  text, uuid, integer, text, text, text, text, uuid, text, text, text,
  text, text, text, text, numeric, uuid, text
) to authenticated;
grant execute on function public.knowledge_review_proposal(uuid, text, text) to authenticated;
grant execute on function public.knowledge_report_conflict(
  uuid, integer, text, text, text, text, text, text, text, numeric, uuid
) to authenticated;
grant execute on function public.knowledge_resolve_conflict(uuid, text, text) to authenticated;
grant execute on function public.knowledge_archive_entry(uuid, text) to authenticated;
grant execute on function public.knowledge_restore_version(uuid, integer, text) to authenticated;
grant execute on function public.knowledge_record_usage(uuid, integer, uuid, text) to authenticated;
grant execute on function public.knowledge_get_usage(uuid, integer) to authenticated;