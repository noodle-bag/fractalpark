-- v0.4.16 commit 2: owner custom formula cloud store (ADR 0006, spec §17.1).
--
-- My Formulas moves from browser localStorage to an owner-scoped cloud
-- table. The browser never touches the base table; the same-origin BFF
-- calls these narrow security-definer functions with the service role,
-- mirroring the v0.4.15 draft contract: idempotency replay, quota, and
-- optimistic concurrency packed into one transaction per write.
--
-- Contracts frozen here (new in v0.4.16, not inherited): 50 records per
-- account, 64 KiB UTF-8 source budget. compile/builtin-conflict validation
-- runs in the API layer (Node engine); the database remains the last line
-- of defense for shape, bytes, identity, and revision semantics.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table public.custom_formulas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  source text not null,
  experience_hint jsonb check (experience_hint is null or jsonb_typeof(experience_hint) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  source_bytes integer not null check (source_bytes between 1 and 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_bytes = octet_length(source))
);

create index custom_formulas_owner_updated_idx
  on public.custom_formulas (owner_id, updated_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 2. Triggers: updated_at maintenance + frozen identity/revision semantics
-- ---------------------------------------------------------------------------

create trigger custom_formulas_touch before update on public.custom_formulas
  for each row execute function public.fractalpark_touch_updated_at();

create or replace function public.fractalpark_custom_formulas_frozen_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.owner_id <> old.owner_id
     or new.created_at <> old.created_at then
    raise exception 'frozen custom formula field update rejected';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'custom formula revision must increment by exactly one';
  end if;
  return new;
end;
$$;

create trigger custom_formulas_frozen before update on public.custom_formulas
  for each row execute function public.fractalpark_custom_formulas_frozen_fields();

-- ---------------------------------------------------------------------------
-- 3. RLS default-deny posture + grants (mirrors the v0.4.15 base tables)
-- ---------------------------------------------------------------------------

alter table public.custom_formulas enable row level security;
alter table public.custom_formulas force row level security;

grant select, insert, update, delete on public.custom_formulas to service_role;

-- ---------------------------------------------------------------------------
-- 4. Operation-gate enums and formula reference (forward-only alters)
-- ---------------------------------------------------------------------------

alter table public.artwork_operations
  drop constraint artwork_operations_operation_type_check;
alter table public.artwork_operations
  add constraint artwork_operations_operation_type_check
  check (operation_type in (
    'save_draft', 'publish_draft', 'delete_draft', 'withdraw_publication',
    'delete_account', 'save_custom_formula', 'delete_custom_formula'
  ));

alter table public.artwork_operations
  add column formula_id uuid references public.custom_formulas (id) on delete set null;

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_policy_key_check;
alter table public.rate_limit_counters
  add constraint rate_limit_counters_policy_key_check
  check (policy_key in (
    'otp_email_minute', 'otp_email_hour', 'otp_ip_hour', 'draft_save_5s',
    'publish_user_day', 'backup_user_day', 'account_delete_day',
    'custom_formula_save_5s'
  ));

-- ---------------------------------------------------------------------------
-- 5. Formula operation gate: same semantics as fractalpark_operation_gate,
--    replaying the stored formula id + revision.
-- ---------------------------------------------------------------------------

create or replace function public.fractalpark_custom_formula_gate(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (outcome text, replay_formula_id uuid, replay_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.artwork_operations%rowtype;
begin
  -- Same write-block as the draft gate: while a delete_account operation is
  -- locked, ordinary owner RPCs reject until cleanup finishes (spec §4.4).
  if exists (
    select 1
      from public.artwork_operations
     where owner_id = p_owner_id
       and operation_type = 'delete_account'
       and status = 'processing'
       and deletion_stage = 'locked'
  ) then
    raise exception 'account_deleting: account deletion in progress';
  end if;

  select * into v_op
    from public.artwork_operations
   where owner_id = p_owner_id and idempotency_key = p_idempotency_key
   for update;

  if not found then
    return query select 'proceed', null::uuid, null::integer;
    return;
  end if;

  if v_op.request_hash <> p_request_hash then
    raise exception 'idempotency_conflict: same key with a different request';
  end if;

  if v_op.status = 'succeeded' then
    return query select 'replay', v_op.formula_id, v_op.result_revision;
    return;
  end if;

  delete from public.artwork_operations where id = v_op.id;
  return query select 'proceed', null::uuid, null::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Save (create or update) a custom formula.
--    p_expected_revision null -> create (quota-checked; the id may be
--    pre-generated by the caller so compile validation can use the final
--    runtime id, mirroring fractalpark_draft_create's coalesce pattern);
--    otherwise update with optimistic concurrency against p_formula_id.
--    The per-owner advisory lock (seed 0, shared with account deletion)
--    serializes writes against the deletion transaction, closing the
--    check-then-act race.
-- ---------------------------------------------------------------------------

create or replace function public.fractalpark_custom_formula_save(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_name text,
  p_source text,
  p_experience_hint jsonb default null,
  p_formula_id uuid default null,
  p_expected_revision integer default null,
  p_quota integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_formula public.custom_formulas%rowtype;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  insert into public.profiles (user_id) values (p_owner_id)
  on conflict (user_id) do nothing;

  select * into v_gate
    from public.fractalpark_custom_formula_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    return jsonb_build_object(
      'replayed', true,
      'formula_id', v_gate.replay_formula_id,
      'revision', v_gate.replay_revision);
  end if;

  if p_expected_revision is null then
    select count(*) into v_count
      from public.custom_formulas
     where owner_id = p_owner_id;
    if v_count >= p_quota then
      raise exception 'quota_exceeded: custom formula count quota reached';
    end if;

    insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
    values (p_idempotency_key, p_owner_id, 'save_custom_formula', p_request_hash, 'processing')
    returning id into v_operation_id;

    insert into public.custom_formulas (id, owner_id, name, source, experience_hint, source_bytes)
    values (coalesce(p_formula_id, gen_random_uuid()), p_owner_id, p_name, p_source, p_experience_hint, octet_length(p_source))
    returning * into v_formula;
  else
    if p_formula_id is null then
      raise exception 'not_found: custom formula not found';
    end if;
    select * into v_formula
      from public.custom_formulas
     where id = p_formula_id
     for update;
    if not found or v_formula.owner_id <> p_owner_id then
      raise exception 'not_found: custom formula not found';
    end if;
    if v_formula.revision <> p_expected_revision then
      raise exception 'revision_conflict: expected revision mismatch';
    end if;

    insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
    values (p_idempotency_key, p_owner_id, 'save_custom_formula', p_request_hash, 'processing')
    returning id into v_operation_id;

    update public.custom_formulas
       set name = p_name,
           source = p_source,
           experience_hint = p_experience_hint,
           source_bytes = octet_length(p_source),
           revision = revision + 1
     where id = p_formula_id
     returning * into v_formula;
  end if;

  update public.artwork_operations
     set status = 'succeeded', formula_id = v_formula.id, result_revision = v_formula.revision
   where id = v_operation_id;

  return jsonb_build_object('replayed', false, 'formula', to_jsonb(v_formula));
exception
  when unique_violation then
    select * into v_gate
      from public.fractalpark_custom_formula_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      return jsonb_build_object(
        'replayed', true,
        'formula_id', v_gate.replay_formula_id,
        'revision', v_gate.replay_revision);
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Delete a custom formula (owner-checked, idempotent). Revision is
--    optional here: the UI always knows it, but a stale delete of an already
--    changed record is a client bug, not a data-integrity risk — still, when
--    provided it must match, mirroring the update contract.
-- ---------------------------------------------------------------------------

create or replace function public.fractalpark_custom_formula_delete(
  p_owner_id uuid,
  p_formula_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_formula public.custom_formulas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  select * into v_gate
    from public.fractalpark_custom_formula_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    return jsonb_build_object(
      'replayed', true,
      'formula_id', v_gate.replay_formula_id,
      'revision', v_gate.replay_revision);
  end if;

  select * into v_formula
    from public.custom_formulas
   where id = p_formula_id
   for update;
  if not found or v_formula.owner_id <> p_owner_id then
    raise exception 'not_found: custom formula not found';
  end if;
  if p_expected_revision is not null and v_formula.revision <> p_expected_revision then
    raise exception 'revision_conflict: expected revision mismatch';
  end if;

  insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
  values (p_idempotency_key, p_owner_id, 'delete_custom_formula', p_request_hash, 'processing')
  returning id into v_operation_id;

  delete from public.custom_formulas where id = p_formula_id;

  update public.artwork_operations
     set status = 'succeeded', result_revision = v_formula.revision
   where id = v_operation_id;

  return jsonb_build_object('replayed', false, 'deleted', true);
exception
  when unique_violation then
    select * into v_gate
      from public.fractalpark_custom_formula_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      return jsonb_build_object(
        'replayed', true,
        'formula_id', v_gate.replay_formula_id,
        'revision', v_gate.replay_revision);
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Account deletion: purge custom formulas inside the same staged
--    transaction (spec §17.1). Redefines the v0.4.15 confirm function with
--    the formula purge appended; all other semantics unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.fractalpark_account_deletion_confirm(
  p_owner_id uuid,
  p_operation_id uuid,
  p_window interval default '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.artwork_operations%rowtype;
  v_pub record;
  v_draft record;
  v_drafts integer := 0;
  v_pubs integer := 0;
  v_formulas integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  select * into v_op
    from public.artwork_operations
   where id = p_operation_id
     and owner_id = p_owner_id
     and operation_type = 'delete_account'
   for update;
  if not found then
    raise exception 'not_found: delete_account operation not found';
  end if;

  if v_op.deletion_stage = 'locked' then
    if exists (
      select 1 from public.resource_cleanup_jobs
      where operation_id = v_op.id and resource_type = 'auth_user'
    ) then
      return jsonb_build_object(
        'operation_id', v_op.id,
        'status', 'deleting',
        'drafts_deleted', 0,
        'publications_withdrawn', 0,
        'formulas_deleted', 0,
        'replayed', true);
    end if;
  elsif v_op.deletion_stage = 'stepped_up' then
    if v_op.created_at < now() - p_window then
      raise exception 'step_up_expired: step-up proof expired';
    end if;
  else
    raise exception 'validation_failed: delete_account operation has no stage';
  end if;

  perform set_config('fractalpark.privileged_mutation', 'on', true);

  update public.artwork_operations
  set deletion_stage = 'locked', updated_at = now()
  where id = v_op.id;

  for v_pub in
    select id, thumbnail_path
      from public.artwork_publications
     where owner_id = p_owner_id and status in ('published', 'hidden')
     for update
  loop
    if v_pub.thumbnail_path is not null then
      insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
      values (v_op.id, p_owner_id, 'publication_thumbnail', v_pub.thumbnail_path);
    end if;
    update public.artwork_publications
    set status = 'withdrawn',
        withdrawn_at = now(),
        envelope = null,
        description = null,
        thumbnail_path = null
    where id = v_pub.id;
    v_pubs := v_pubs + 1;
  end loop;

  for v_draft in
    select id, thumbnail_path
      from public.artwork_drafts
     where owner_id = p_owner_id
     for update
  loop
    if v_draft.thumbnail_path is not null then
      insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
      values (v_op.id, p_owner_id, 'draft_thumbnail', v_draft.thumbnail_path);
    end if;
    delete from public.artwork_drafts where id = v_draft.id;
    v_drafts := v_drafts + 1;
  end loop;

  -- v0.4.16: My Formulas are private facts of the account and leave with it.
  delete from public.custom_formulas where owner_id = p_owner_id;
  get diagnostics v_formulas = row_count;

  delete from public.profiles where user_id = p_owner_id;

  insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
  values (v_op.id, p_owner_id, 'auth_user', p_owner_id::text);

  return jsonb_build_object(
    'operation_id', v_op.id,
    'status', 'deleting',
    'drafts_deleted', v_drafts,
    'publications_withdrawn', v_pubs,
    'formulas_deleted', v_formulas);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Retention: terminal formula save/delete operations age out on the same
--    30-day contract as draft operations (spec §4.4).
-- ---------------------------------------------------------------------------

create or replace function public.fractalpark_purge_expired_operations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.artwork_operations
  where operation_type in ('save_draft', 'delete_draft', 'save_custom_formula', 'delete_custom_formula')
    and status in ('succeeded', 'failed')
    and created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants: RPCs are service-role only, mirroring the draft RPC posture.
-- ---------------------------------------------------------------------------

revoke execute on function public.fractalpark_custom_formula_gate(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.fractalpark_custom_formula_save(uuid, uuid, text, text, text, jsonb, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.fractalpark_custom_formula_delete(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.fractalpark_custom_formula_gate(uuid, uuid, text)
  to service_role;
grant execute on function public.fractalpark_custom_formula_save(uuid, uuid, text, text, text, jsonb, uuid, integer, integer)
  to service_role;
grant execute on function public.fractalpark_custom_formula_delete(uuid, uuid, uuid, text, integer)
  to service_role;
