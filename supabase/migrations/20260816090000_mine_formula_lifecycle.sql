-- v0.4.19 Slice 2 candidate: forward-only Mine Formula lifecycle.
-- This migration is intentionally inert until the application-side writer gate is
-- explicitly enabled. It does not replace legacy custom_formulas source fields.

create table public.custom_formula_revisions (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references public.custom_formulas(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  source_revision text not null check (source_revision ~ '^[0-9a-f]{64}$'),
  profile_revision text not null check (profile_revision ~ '^[0-9a-f]{64}$'),
  runnable boolean not null,
  diagnostics jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnostics) = 'array'),
  supersedes uuid references public.custom_formula_revisions(id) on delete cascade,
  imported_from_formula_id uuid,
  remixed_from_formula_id uuid,
  lineage_source_revision text check (lineage_source_revision is null or lineage_source_revision ~ '^[0-9a-f]{64}$'),
  lineage_profile_revision text check (lineage_profile_revision is null or lineage_profile_revision ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (not runnable or jsonb_array_length(diagnostics) = 0),
  check (runnable or jsonb_array_length(diagnostics) > 0),
  check ((definition->>'formulaId') is not distinct from formula_id::text),
  check ((profile->>'formulaId') is not distinct from formula_id::text),
  check ((definition->>'sourceRevision') is not distinct from source_revision),
  check ((profile->>'sourceRevision') is not distinct from source_revision),
  check ((profile->>'profileRevision') is not distinct from profile_revision),
  check (imported_from_formula_id is null or remixed_from_formula_id is null),
  check (((imported_from_formula_id is not null or remixed_from_formula_id is not null)) = (lineage_source_revision is not null))
);

create unique index custom_formula_revisions_formula_revision_idx
  on public.custom_formula_revisions(formula_id, revision);
create unique index custom_formula_revisions_head_identity_idx
  on public.custom_formula_revisions(id, formula_id, owner_id);
create index custom_formula_revisions_owner_formula_created_idx
  on public.custom_formula_revisions(owner_id, formula_id, created_at desc);

alter table public.custom_formulas
  add column editable_head_revision_id uuid,
  add column active_runnable_revision_id uuid;

alter table public.custom_formulas
  add constraint custom_formulas_editable_head_revision_fk
  foreign key (editable_head_revision_id, id, owner_id)
  references public.custom_formula_revisions(id, formula_id, owner_id)
  on delete no action deferrable initially deferred,
  add constraint custom_formulas_active_runnable_revision_fk
  foreign key (active_runnable_revision_id, id, owner_id)
  references public.custom_formula_revisions(id, formula_id, owner_id)
  on delete no action deferrable initially deferred;

alter table public.custom_formula_revisions enable row level security;
alter table public.custom_formula_revisions force row level security;
revoke all privileges on table public.custom_formula_revisions from public, anon, authenticated, service_role;

create function public.fractalpark_custom_formula_revision_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'immutable_revision: Mine Formula revisions are append-only';
end;
$$;

create trigger custom_formula_revisions_immutable
before update or delete on public.custom_formula_revisions
for each row execute function public.fractalpark_custom_formula_revision_immutable();

create function public.fractalpark_custom_formula_runnable_head_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_runnable_revision_id is not null and not exists (
    select 1
    from public.custom_formula_revisions r
    where r.id = new.active_runnable_revision_id
      and r.formula_id = new.id
      and r.owner_id = new.owner_id
      and r.runnable
  ) then
    raise exception 'validation_failed: active runnable head must reference a runnable owner revision';
  end if;
  return new;
end;
$$;

create trigger custom_formulas_runnable_head_guard
before insert or update of active_runnable_revision_id, owner_id, id
on public.custom_formulas
for each row execute function public.fractalpark_custom_formula_runnable_head_guard();

revoke execute on function public.fractalpark_custom_formula_revision_immutable() from public, anon, authenticated, service_role;
revoke execute on function public.fractalpark_custom_formula_runnable_head_guard() from public, anon, authenticated, service_role;

create function public.fractalpark_custom_formula_lifecycle_save(
  p_owner_id uuid,
  p_formula_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_definition jsonb,
  p_profile jsonb,
  p_source_revision text,
  p_profile_revision text,
  p_runnable boolean,
  p_diagnostics jsonb default '[]'::jsonb,
  p_supersedes uuid default null,
  p_imported_from_formula_id uuid default null,
  p_remixed_from_formula_id uuid default null,
  p_lineage_source_revision text default null,
  p_lineage_profile_revision text default null,
  p_quota integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_formula public.custom_formulas%rowtype;
  v_revision public.custom_formula_revisions%rowtype;
  v_count integer;
  v_next_revision integer;
  v_operation_id uuid;
  v_editable_is_runnable boolean;
begin
  if p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or p_profile is null or jsonb_typeof(p_profile) <> 'object'
     or p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'array'
     or p_source_revision !~ '^[0-9a-f]{64}$'
     or p_profile_revision !~ '^[0-9a-f]{64}$'
     or p_formula_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or (p_definition->>'scope') is distinct from 'mine'
     or (p_definition->>'formulaId') is distinct from p_formula_id::text
     or (p_profile->>'formulaId') is distinct from p_formula_id::text
     or octet_length(coalesce(p_definition->>'source', '')) > 65536
     or (p_runnable and jsonb_array_length(p_diagnostics) <> 0)
     or (not p_runnable and jsonb_array_length(p_diagnostics) = 0) then
    raise exception 'validation_failed: invalid formula lifecycle revision';
  end if;
  if p_imported_from_formula_id is not null and p_remixed_from_formula_id is not null then
    raise exception 'validation_failed: import and remix lineage are exclusive';
  end if;
  if coalesce(p_imported_from_formula_id, p_remixed_from_formula_id) is not null then
    if coalesce(p_imported_from_formula_id, p_remixed_from_formula_id)::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_lineage_source_revision !~ '^[0-9a-f]{64}$'
       or (p_lineage_profile_revision is not null and p_lineage_profile_revision !~ '^[0-9a-f]{64}$') then
      raise exception 'validation_failed: lineage identity/revisions are invalid';
    end if;
  elsif p_lineage_source_revision is not null or p_lineage_profile_revision is not null then
    raise exception 'validation_failed: lineage revisions require a parent Formula ID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  select * into v_gate from public.fractalpark_custom_formula_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    select * into v_formula from public.custom_formulas where id = v_gate.replay_formula_id;
    return jsonb_build_object('replayed', true, 'formula_id', v_formula.id, 'revision', v_gate.replay_revision, 'editable_head_revision_id', v_formula.editable_head_revision_id, 'active_runnable_revision_id', v_formula.active_runnable_revision_id);
  end if;

  if p_formula_id is null then
    raise exception 'validation_failed: Mine Formula identity is required';
  end if;
  select * into v_formula from public.custom_formulas where id = p_formula_id for update;
  if not found then
    select count(*) into v_count from public.custom_formulas where owner_id = p_owner_id;
    if v_count >= p_quota then raise exception 'quota_exceeded: custom formula count quota reached'; end if;
    insert into public.custom_formulas (id, owner_id, name, source, source_bytes)
    values (p_formula_id, p_owner_id, coalesce(nullif(p_definition->>'name', ''), 'Untitled'), coalesce(nullif(p_definition->>'source', ''), ' '), octet_length(coalesce(nullif(p_definition->>'source', ''), ' ')))
    returning * into v_formula;
    v_next_revision := v_formula.revision + 1;
  else
    if v_formula.owner_id <> p_owner_id then raise exception 'not_found: custom formula not found'; end if;
    v_next_revision := v_formula.revision + 1;
    if v_formula.editable_head_revision_id is not null then
      select runnable into v_editable_is_runnable from public.custom_formula_revisions where id = v_formula.editable_head_revision_id;
      if p_runnable and not coalesce(v_editable_is_runnable, false) and p_supersedes is distinct from v_formula.editable_head_revision_id then
        raise exception 'validation_failed: runnable rehabilitation must explicitly supersede the invalid editable head';
      end if;
    end if;
    if p_supersedes is not null and not exists (select 1 from public.custom_formula_revisions where id = p_supersedes and formula_id = v_formula.id and owner_id = p_owner_id) then
      raise exception 'validation_failed: supersedes must be an owner revision of this formula';
    end if;
  end if;

  insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
  values (p_idempotency_key, p_owner_id, 'save_custom_formula', p_request_hash, 'processing') returning id into v_operation_id;
  insert into public.custom_formula_revisions (formula_id, owner_id, revision, definition, profile, source_revision, profile_revision, runnable, diagnostics, supersedes, imported_from_formula_id, remixed_from_formula_id, lineage_source_revision, lineage_profile_revision)
  values (v_formula.id, p_owner_id, v_next_revision, p_definition, p_profile, p_source_revision, p_profile_revision, p_runnable, p_diagnostics, p_supersedes, p_imported_from_formula_id, p_remixed_from_formula_id, p_lineage_source_revision, p_lineage_profile_revision)
  returning * into v_revision;

  update public.custom_formulas set
    editable_head_revision_id = v_revision.id,
    active_runnable_revision_id = case when v_revision.runnable then v_revision.id else active_runnable_revision_id end,
    revision = v_next_revision
  where id = v_formula.id returning * into v_formula;
  update public.artwork_operations set status = 'succeeded', formula_id = v_formula.id, result_revision = v_formula.revision where id = v_operation_id;
  return jsonb_build_object('replayed', false, 'formula_id', v_formula.id, 'revision', v_formula.revision, 'editable_head_revision_id', v_formula.editable_head_revision_id, 'active_runnable_revision_id', v_formula.active_runnable_revision_id);
end;
$$;

revoke execute on function public.fractalpark_custom_formula_lifecycle_save(uuid, uuid, uuid, text, jsonb, jsonb, text, text, boolean, jsonb, uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.fractalpark_custom_formula_lifecycle_save(uuid, uuid, uuid, text, jsonb, jsonb, text, text, boolean, jsonb, uuid, uuid, uuid, text, text, integer) to service_role;
notify pgrst, 'reload schema';
