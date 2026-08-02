-- v0.4.15 PR 2 / commit 7 review hardening (forward-only; the original
-- 20260802140000 stays byte-identical as pushed).
--   N2: the unique_violation handlers re-raised the raw 23505 when the
--       retry was not a replay; commit 5's draft RPCs translate every
--       post-lock key collision to idempotency_conflict, and the
--       publication RPCs now match that contract.
--   N3: a replayed operation whose publication_id is null (only reachable
--       via FK ON DELETE SET NULL after account deletion) returned
--       200 + null id; both RPCs now answer not_found instead.

create or replace function public.fractalpark_publish_draft(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_draft_id uuid,
  p_expected_revision integer,
  p_title text,
  p_description text,
  p_envelope jsonb,
  p_config_bytes integer,
  p_rights_attestation_version text,
  p_license_version text,
  p_publish_quota integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_display_name text;
  v_draft public.artwork_drafts%rowtype;
  v_op public.artwork_operations%rowtype;
  v_publication_id uuid;
  v_now timestamptz := now();
  v_rate record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  insert into public.profiles (user_id) values (p_owner_id)
  on conflict (user_id) do nothing;

  select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    select * into v_op from public.artwork_operations
     where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
    if v_op.publication_id is null then
      raise exception 'not_found: publication no longer exists';
    end if;
    return jsonb_build_object('replayed', true, 'publication_id', v_op.publication_id);
  end if;

  insert into public.artwork_operations (owner_id, idempotency_key, operation_type, request_hash)
  values (p_owner_id, p_idempotency_key, 'publish_draft', p_request_hash)
  returning id into v_operation_id;

  -- The attribution snapshot requires a display name set before publishing.
  select p.display_name into v_display_name
  from public.profiles p where p.user_id = p_owner_id;
  if v_display_name is null then
    raise exception 'validation_failed: display name is required before publishing';
  end if;

  select * into v_draft
  from public.artwork_drafts
  where id = p_draft_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'not_found: draft not found';
  end if;
  if v_draft.revision <> p_expected_revision then
    raise exception 'revision_conflict: expected %, current %',
      p_expected_revision, v_draft.revision;
  end if;

  -- Publish quota: successful publications per 24h, consumed atomically.
  select * into v_rate
  from public.fractalpark_rate_limit_consume(
    'publish_user_day', md5(p_owner_id::text), p_publish_quota, 86400);
  if not v_rate.allowed then
    raise exception 'rate_limited: %', v_rate.retry_after;
  end if;

  insert into public.artwork_publications (
    owner_id, author_display_name, title, description, envelope,
    thumbnail_path, thumbnail_status,
    rights_attestation_version, license_version, rights_attested_at,
    remix_source_type, remix_source_id,
    status, published_at
  ) values (
    p_owner_id, v_display_name, p_title, p_description, p_envelope,
    null, 'pending',
    p_rights_attestation_version, p_license_version, v_now,
    v_draft.remix_source_type, v_draft.remix_source_id,
    'published', v_now
  )
  returning id into v_publication_id;

  -- The source draft leaves Drafts on success (spec 4.3); its private
  -- thumbnail object is collected asynchronously.
  if v_draft.thumbnail_path is not null then
    insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
    values (v_operation_id, p_owner_id, 'draft_thumbnail', v_draft.thumbnail_path);
  end if;
  delete from public.artwork_drafts where id = v_draft.id;

  update public.artwork_operations
  set status = 'succeeded', publication_id = v_publication_id, updated_at = v_now
  where id = v_operation_id;

  return jsonb_build_object(
    'publication_id', v_publication_id,
    'status', 'published',
    'title', p_title,
    'thumbnail_status', 'pending',
    'published_at', v_now
  );
exception
  when unique_violation then
    select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      select * into v_op from public.artwork_operations
       where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
      if v_op.publication_id is null then
        raise exception 'not_found: publication no longer exists';
      end if;
      return jsonb_build_object('replayed', true, 'publication_id', v_op.publication_id);
    end if;
    raise exception 'idempotency_conflict: same key with a different request';
end;
$$;

create or replace function public.fractalpark_withdraw_publication(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_publication_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate record;
  v_operation_id uuid;
  v_op public.artwork_operations%rowtype;
  v_pub public.artwork_publications%rowtype;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    select * into v_op from public.artwork_operations
     where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
    if v_op.publication_id is null then
      raise exception 'not_found: publication no longer exists';
    end if;
    return jsonb_build_object('replayed', true, 'publication_id', v_op.publication_id);
  end if;

  insert into public.artwork_operations (owner_id, idempotency_key, operation_type, request_hash)
  values (p_owner_id, p_idempotency_key, 'withdraw_publication', p_request_hash)
  returning id into v_operation_id;

  select * into v_pub
  from public.artwork_publications
  where id = p_publication_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'not_found: publication not found';
  end if;

  if v_pub.status = 'withdrawn' then
    update public.artwork_operations
    set status = 'succeeded', publication_id = v_pub.id, updated_at = v_now
    where id = v_operation_id;
    return jsonb_build_object(
      'publication_id', v_pub.id, 'status', 'withdrawn', 'withdrawn_at', v_pub.withdrawn_at);
  end if;

  if v_pub.thumbnail_path is not null then
    insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
    values (v_operation_id, p_owner_id, 'publication_thumbnail', v_pub.thumbnail_path);
  end if;

  -- Withdrawal clears envelope/description; the frozen-field trigger only
  -- allows that inside a privileged lifecycle mutation (spec section 9).
  perform set_config('fractalpark.privileged_mutation', 'on', true);
  update public.artwork_publications
  set status = 'withdrawn',
      withdrawn_at = v_now,
      envelope = null,
      description = null,
      thumbnail_path = null
  where id = v_pub.id;

  update public.artwork_operations
  set status = 'succeeded', publication_id = v_pub.id, updated_at = v_now
  where id = v_operation_id;

  return jsonb_build_object(
    'publication_id', v_pub.id, 'status', 'withdrawn', 'withdrawn_at', v_now);
exception
  when unique_violation then
    select * into v_gate from public.fractalpark_operation_gate(p_owner_id, p_idempotency_key, p_request_hash);
    if v_gate.outcome = 'replay' then
      select * into v_op from public.artwork_operations
       where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
      if v_op.publication_id is null then
        raise exception 'not_found: publication no longer exists';
      end if;
      return jsonb_build_object('replayed', true, 'publication_id', v_op.publication_id);
    end if;
    raise exception 'idempotency_conflict: same key with a different request';
end;
$$;

revoke execute on function public.fractalpark_publish_draft(
  uuid, uuid, text, uuid, integer, text, text, jsonb, integer, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.fractalpark_withdraw_publication(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fractalpark_publish_draft(
  uuid, uuid, text, uuid, integer, text, text, jsonb, integer, text, text, integer)
  to service_role;
grant execute on function public.fractalpark_withdraw_publication(uuid, uuid, text, uuid)
  to service_role;
