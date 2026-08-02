-- v0.4.15 PR 2 / commit 5: owner draft RPCs (spec sections 4.2, 5, 6, 7, 9).
--
-- The browser never touches base tables; the same-origin BFF calls these
-- narrow security-definer functions with the service role. Each write packs
-- idempotency replay, quota enforcement, and the optimistic-concurrency
-- contract into one transaction so concurrent or retried requests converge
-- to a single business effect (spec section 6).
--
-- Error signaling: raise exception with a '<code>: <message>' prefix; the
-- API layer maps the prefix to the frozen error envelope codes.

-- ---------------------------------------------------------------------------
-- Shared helper: resolve an existing idempotency record.
-- Returns:
--   'replay'      -> same key, same hash, succeeded: caller returns the stored result
--   'proceed'     -> no row, or a stale processing/failed row (deleted here)
-- Raises idempotency_conflict for the same key with a different hash.
-- ---------------------------------------------------------------------------
create or replace function public.fractalpark_operation_gate(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (outcome text, replay_draft_id uuid, replay_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.artwork_operations%rowtype;
begin
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
    return query select 'replay', v_op.draft_id, v_op.result_revision;
    return;
  end if;

  -- A processing/failed row is the residue of an interrupted attempt: nothing
  -- committed, so the retry may proceed once the stale row is removed.
  delete from public.artwork_operations where id = v_op.id;
  return query select 'proceed', null::uuid, null::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create a draft. Quotas (spec section 7): 100 drafts and 50 MB account
-- storage, checked atomically inside the transaction. Title/envelope/bytes
-- arrive pre-validated and server-serialized from the API layer; the database
-- constraints remain the last line of defense (spec section 9).
-- ---------------------------------------------------------------------------
create or replace function public.fractalpark_draft_create(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_title text,
  p_envelope jsonb,
  p_thumbnail_path text,
  p_config_bytes integer,
  p_thumbnail_bytes integer,
  p_remix_source_type text default null,
  p_remix_source_id text default null,
  p_draft_quota integer default 100,
  p_storage_quota_bytes bigint default 52428800,
  p_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_draft public.artwork_drafts%rowtype;
  v_count integer;
  v_used bigint;
begin
  insert into public.profiles (user_id) values (p_owner_id)
  on conflict (user_id) do nothing;

  select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    return jsonb_build_object('replayed', true, 'draft_id', v_gate.replay_draft_id, 'revision', v_gate.replay_revision);
  end if;

  select count(*), coalesce(sum(config_bytes + thumbnail_bytes), 0)
    into v_count, v_used
    from public.artwork_drafts
   where owner_id = p_owner_id;
  if v_count >= p_draft_quota
     or v_used + p_config_bytes + p_thumbnail_bytes > p_storage_quota_bytes then
    raise exception 'quota_exceeded: draft count or account storage quota reached';
  end if;

  insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
  values (p_idempotency_key, p_owner_id, 'save_draft', p_request_hash, 'processing')
  returning id into v_operation_id;

  insert into public.artwork_drafts (
    id, owner_id, title, envelope, thumbnail_path,
    remix_source_type, remix_source_id, config_bytes, thumbnail_bytes
  ) values (
    coalesce(p_draft_id, gen_random_uuid()), p_owner_id, p_title, p_envelope, p_thumbnail_path,
    p_remix_source_type, p_remix_source_id, p_config_bytes, p_thumbnail_bytes
  ) returning * into v_draft;

  update public.artwork_operations
     set status = 'succeeded', draft_id = v_draft.id, result_revision = v_draft.revision
   where id = v_operation_id;

  return jsonb_build_object('replayed', false, 'draft', to_jsonb(v_draft));
exception
  when unique_violation then
    -- Concurrent identical requests converge: the loser replays the winner's
    -- committed operation instead of failing (spec section 6).
    select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      return jsonb_build_object('replayed', true, 'draft_id', v_gate.replay_draft_id, 'revision', v_gate.replay_revision);
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

-- ---------------------------------------------------------------------------
-- Update a draft with optimistic concurrency (spec section 4.2): the client's
-- expected revision must match, a mismatch never overwrites the server
-- version. The frozen-field trigger enforces revision += 1 exactly. Storage
-- quota applies to the delta; existing drafts may keep updating while at the
-- draft-count quota (spec section 7). Replacing or clearing the thumbnail
-- registers a cleanup job for the old object.
-- ---------------------------------------------------------------------------
create or replace function public.fractalpark_draft_update(
  p_owner_id uuid,
  p_draft_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_expected_revision integer,
  p_title text,
  p_envelope jsonb,
  p_thumbnail_path text,
  p_config_bytes integer,
  p_thumbnail_bytes integer,
  p_storage_quota_bytes bigint default 52428800
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_draft public.artwork_drafts%rowtype;
  v_old_path text;
  v_used bigint;
  v_delta bigint;
begin
  select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    return jsonb_build_object('replayed', true, 'draft_id', v_gate.replay_draft_id, 'revision', v_gate.replay_revision);
  end if;

  select * into v_draft from public.artwork_drafts where id = p_draft_id for update;
  if not found or v_draft.owner_id <> p_owner_id then
    -- Uniform: never leak whether the draft exists under another owner.
    raise exception 'not_found: draft not found';
  end if;
  if v_draft.revision <> p_expected_revision then
    raise exception 'revision_conflict: expected revision mismatch';
  end if;

  select coalesce(sum(config_bytes + thumbnail_bytes), 0) into v_used
    from public.artwork_drafts where owner_id = p_owner_id;
  v_delta := (p_config_bytes + p_thumbnail_bytes) - (v_draft.config_bytes + v_draft.thumbnail_bytes);
  if v_used + v_delta > p_storage_quota_bytes then
    raise exception 'quota_exceeded: account storage quota reached';
  end if;

  insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
  values (p_idempotency_key, p_owner_id, 'save_draft', p_request_hash, 'processing')
  returning id into v_operation_id;

  v_old_path := v_draft.thumbnail_path;
  update public.artwork_drafts
     set title = p_title,
         envelope = p_envelope,
         thumbnail_path = p_thumbnail_path,
         config_bytes = p_config_bytes,
         thumbnail_bytes = p_thumbnail_bytes,
         revision = revision + 1
   where id = p_draft_id
  returning * into v_draft;

  if v_old_path is not null and v_old_path is distinct from v_draft.thumbnail_path then
    insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
    values (v_operation_id, p_owner_id, 'draft_thumbnail', v_old_path);
  end if;

  update public.artwork_operations
     set status = 'succeeded', draft_id = v_draft.id, result_revision = v_draft.revision
   where id = v_operation_id;

  return jsonb_build_object('replayed', false, 'draft', to_jsonb(v_draft));
exception
  when unique_violation then
    select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      return jsonb_build_object('replayed', true, 'draft_id', v_gate.replay_draft_id, 'revision', v_gate.replay_revision);
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete a draft (spec section 4.2): permanent, and the private thumbnail is
-- cleaned through a registered job. Uniform not_found across owners.
-- ---------------------------------------------------------------------------
create or replace function public.fractalpark_draft_delete(
  p_owner_id uuid,
  p_draft_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_draft public.artwork_drafts%rowtype;
begin
  select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    return jsonb_build_object('replayed', true, 'deleted', true);
  end if;

  select * into v_draft from public.artwork_drafts where id = p_draft_id for update;
  if not found or v_draft.owner_id <> p_owner_id then
    raise exception 'not_found: draft not found';
  end if;

  insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status)
  values (p_idempotency_key, p_owner_id, 'delete_draft', p_request_hash, 'processing')
  returning id into v_operation_id;

  if v_draft.thumbnail_path is not null then
    insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
    values (v_operation_id, p_owner_id, 'draft_thumbnail', v_draft.thumbnail_path);
  end if;

  delete from public.artwork_drafts where id = p_draft_id;

  update public.artwork_operations
     set status = 'succeeded', draft_id = null, result_revision = null
   where id = v_operation_id;

  return jsonb_build_object('replayed', false, 'deleted', true);
exception
  when unique_violation then
    select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      return jsonb_build_object('replayed', true, 'deleted', true);
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

revoke execute on function public.fractalpark_operation_gate(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fractalpark_operation_gate(uuid, uuid, text) to service_role;
revoke execute on function public.fractalpark_draft_create(uuid, uuid, text, text, jsonb, text, integer, integer, text, text, integer, bigint, uuid) from public, anon, authenticated;
grant execute on function public.fractalpark_draft_create(uuid, uuid, text, text, jsonb, text, integer, integer, text, text, integer, bigint, uuid) to service_role;
revoke execute on function public.fractalpark_draft_update(uuid, uuid, uuid, text, integer, text, jsonb, text, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.fractalpark_draft_update(uuid, uuid, uuid, text, integer, text, jsonb, text, integer, integer, bigint) to service_role;
revoke execute on function public.fractalpark_draft_delete(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fractalpark_draft_delete(uuid, uuid, uuid, text) to service_role;
