create or replace function public.knowledge_search(p_query text default null, p_category text default null, p_status text default null, p_module text default null, p_scope text default null, p_limit integer default 50, p_offset integer default 0)
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
  if auth.uid() is null or not public.has_admin_role(array['super_admin', 'admin', 'content_manager', 'support', 'provider_operator']) then
    raise exception 'Knowledge access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;
  if v_query is not null and char_length(v_query) > 200 then
    raise exception 'Search query is too long' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('busnet_knowledge', 'business_rule', 'experience', 'learned_knowledge', 'document', 'technical_knowledge', 'problem_solution', 'proposal') then
    raise exception 'Invalid knowledge category' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('new', 'needs_verification', 'verified', 'stale_or_conflict', 'rejected', 'archived') then
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
    and (v_query is null or e.title ilike '%' || v_query || '%' or e.summary ilike '%' || v_query || '%' or e.content ilike '%' || v_query || '%');

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
               'confidence', s.confidence,
               'source_task_id', s.source_task_id
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
      and (v_query is null or e.title ilike '%' || v_query || '%' or e.summary ilike '%' || v_query || '%' or e.content ilike '%' || v_query || '%')
    order by e.updated_at desc, e.id
    limit p_limit offset p_offset
  ) rows;

  return jsonb_build_object('items', v_items, 'total_count', v_total);
end;
$$;
revoke all on function public.knowledge_search(text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.knowledge_search(text, text, text, text, text, integer, integer) to authenticated;