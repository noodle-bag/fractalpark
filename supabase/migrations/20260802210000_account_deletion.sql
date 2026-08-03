-- PR 3 commit 11: secure account deletion workflow (spec sections 2, 4.4, 10.2).
--
-- Contract (spec 10.2): after step-up OTP and an explicit second
-- confirmation, the database first locks the delete_account operation,
-- rejects the owner's ordinary RPCs, and revokes sessions; then one
-- transaction deletes private facts, withdraws publications, and registers
-- cleanup jobs. Storage cleanup must succeed before the auth user is
-- physically removed. During cleanup the account can neither log in nor
-- write, and the flow is idempotently retryable.
--
-- Mechanism:
--   1. artwork_operations gains `deletion_stage` ('stepped_up' | 'locked'),
--      null for every other operation type. The delete_account operation row
--      is the step-up proof AND the active deletion record (spec 4.4).
--   2. fractalpark_operation_gate is the single choke point every ordinary
--      owner RPC already calls; it now raises account_deleting when a locked
--      deletion is active for the owner.
--   3. step_up creates the proof (single active proof per owner, 10-minute
--      window enforced at confirm time, single use).
--   4. confirm consumes the proof (stage -> locked) and performs the whole
--      private-fact transaction. Session revocation and physical auth-user
--      removal are app/worker stages outside the database.

alter table public.artwork_operations
  add column deletion_stage text;

-- The deletion endpoints get their own daily policy (spec section 7).
alter table public.rate_limit_counters
  drop constraint rate_limit_counters_policy_key_check;
alter table public.rate_limit_counters
  add constraint rate_limit_counters_policy_key_check
  check (policy_key in (
    'otp_email_minute', 'otp_email_hour', 'otp_ip_hour',
    'draft_save_5s', 'publish_user_day', 'backup_user_day',
    'account_delete_day'));

alter table public.artwork_operations
  add constraint artwork_operations_deletion_stage_check
  check (
    deletion_stage is null
    or (operation_type = 'delete_account' and deletion_stage in ('stepped_up', 'locked'))
  );

comment on column public.artwork_operations.deletion_stage is
  'delete_account stage: stepped_up (proof issued, 10-minute window, single use) '
  'or locked (proof consumed; ordinary owner RPCs are rejected until cleanup finishes).';

-- Single choke point: every ordinary owner RPC calls this gate first. A
-- locked delete_account operation rejects them all with a stable code.
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
    return query select 'replay', v_op.draft_id, v_op.result_revision;
    return;
  end if;

  -- A processing/failed row is the residue of an interrupted attempt: nothing
  -- committed, so the retry may proceed once the stale row is removed.
  delete from public.artwork_operations where id = v_op.id;
  return query select 'proceed', null::uuid, null::integer;
end;
$$;

-- Step-up proof: the app calls this only AFTER a fresh OTP verify. One
-- active proof per owner; re-requesting returns the same proof (idempotent).
create or replace function public.fractalpark_account_deletion_step_up(
  p_owner_id uuid,
  p_proof_key uuid,
  p_window interval default '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.artwork_operations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 11));

  -- A locked deletion is already running: the flow is idempotently
  -- retryable, but a new proof is meaningless.
  select * into v_op
    from public.artwork_operations
   where owner_id = p_owner_id
     and operation_type = 'delete_account'
     and status = 'processing'
   order by created_at desc
   limit 1;

  if found then
    -- An expired proof is dead weight: retire it and issue a fresh one so
    -- the user is never locked out of deleting their own account.
    if v_op.deletion_stage = 'stepped_up' and v_op.created_at < now() - p_window then
      update public.artwork_operations
      set status = 'failed', error_code = 'step_up_expired', updated_at = now()
      where id = v_op.id;
    else
      return jsonb_build_object(
        'operation_id', v_op.id,
        'deletion_stage', v_op.deletion_stage,
        'expires_at', v_op.created_at + p_window,
        'replayed', true);
    end if;
  end if;

  insert into public.artwork_operations (
      owner_id, idempotency_key, operation_type, request_hash, deletion_stage)
  values (
    p_owner_id, p_proof_key, 'delete_account',
    'account-deletion-step-up-v1::proof', 'stepped_up')
  returning * into v_op;

  return jsonb_build_object(
    'operation_id', v_op.id,
    'deletion_stage', v_op.deletion_stage,
    'expires_at', v_op.created_at + p_window);
end;
$$;

-- Confirm: consumes the proof (single use, 10-minute window) and performs
-- the entire private-fact transaction. Session revocation happens in the
-- app right after this returns; storage + auth-user removal converge via
-- the registered cleanup jobs.
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
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 11));

  select * into v_op
    from public.artwork_operations
   where id = p_operation_id
     and owner_id = p_owner_id
     and operation_type = 'delete_account'
   for update;
  if not found then
    raise exception 'not_found: delete_account operation not found';
  end if;

  -- Idempotent retry: the proof is already consumed and the transaction
  -- already committed once (its auth_user job is the durable marker).
  -- Return the current state without registering duplicate jobs.
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

  -- First lock, so ordinary RPCs reject from this transaction on.
  update public.artwork_operations
  set deletion_stage = 'locked', updated_at = now()
  where id = v_op.id;

  -- Withdraw every remaining publication (tombstones keep attribution).
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

  -- Delete every draft and register thumbnail cleanup.
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

  delete from public.profiles where user_id = p_owner_id;

  -- Physical auth-user removal waits for storage cleanup; the worker only
  -- runs this job after every other job of this owner converged.
  insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
  values (v_op.id, p_owner_id, 'auth_user', p_owner_id::text);

  return jsonb_build_object(
    'operation_id', v_op.id,
    'status', 'deleting',
    'drafts_deleted', v_drafts,
    'publications_withdrawn', v_pubs);
end;
$$;

revoke execute on function public.fractalpark_account_deletion_step_up(uuid, uuid, interval)
  from public, anon, authenticated;
revoke execute on function public.fractalpark_account_deletion_confirm(uuid, uuid, interval)
  from public, anon, authenticated;
grant execute on function public.fractalpark_account_deletion_step_up(uuid, uuid, interval)
  to service_role;
grant execute on function public.fractalpark_account_deletion_confirm(uuid, uuid, interval)
  to service_role;

-- Finalize runs only after the auth user is physically removed by the
-- cleanup worker (storage first, spec 10.2). It closes the operation and
-- purges the owner's older operations, keeping the active delete_account
-- operation as the audit record (spec 4.4). Idempotent.
create or replace function public.fractalpark_account_deletion_finalize(
  p_owner_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.artwork_operations%rowtype;
  v_purged integer;
begin
  select * into v_op
    from public.artwork_operations
   where id = p_operation_id
     and operation_type = 'delete_account'
   for update;
  if not found or v_op.owner_id is distinct from p_owner_id then
    raise exception 'not_found: delete_account operation not found';
  end if;
  if v_op.deletion_stage <> 'locked' then
    raise exception 'validation_failed: deletion is not locked';
  end if;
  if v_op.status = 'succeeded' then
    return jsonb_build_object('operation_id', v_op.id, 'status', 'succeeded', 'replayed', true);
  end if;

  update public.artwork_operations
  set status = 'succeeded', updated_at = now()
  where id = v_op.id;

  delete from public.artwork_operations
  where owner_id = p_owner_id and id <> v_op.id;
  get diagnostics v_purged = row_count;

  return jsonb_build_object(
    'operation_id', v_op.id, 'status', 'succeeded', 'operations_purged', v_purged);
end;
$$;

revoke execute on function public.fractalpark_account_deletion_finalize(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fractalpark_account_deletion_finalize(uuid, uuid)
  to service_role;

-- Session revocation for account deletion. GoTrue v2.194 has no admin
-- per-user logout endpoint (POST /admin/users/{id}/logout is 404), and its
-- refresh-token reuse grace would resurrect a merely-revoked token chain:
-- a revoked parent refreshed within the reuse interval is treated as a
-- legitimate rotation and issues a fresh child. Removal has no grace.
-- Sealed access cookies remain bounded zombies per spec 10.2.
create or replace function public.fractalpark_revoke_user_sessions(
  p_owner_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_owner_id is null then
    raise exception 'not_found: owner is required';
  end if;
  delete from auth.refresh_tokens t
  where t.user_id = p_owner_id::text;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.fractalpark_revoke_user_sessions(uuid)
  from public, anon, authenticated;
grant execute on function public.fractalpark_revoke_user_sessions(uuid)
  to service_role;
