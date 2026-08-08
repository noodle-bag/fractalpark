-- v0.4.16 cloud-write audit hardening (forward-only).
--
-- Custom-formula publications have two independent license layers:
--   * rendered artwork image: CC BY 4.0 (existing license/license_scope);
--   * frozen formula source: MIT / formula_source (new nullable tuple).
--
-- Earlier application code overloaded license_version with "MIT" and did not
-- persist a formula scope or a source-attestation version.  That made the
-- public source endpoint reject every formula publication and could not prove
-- the legal snapshot required by spec section 17.2.  Existing publications
-- are intentionally not backfilled: a new explicit source attestation must
-- never be fabricated retrospectively.

alter table public.artwork_publications
  add column if not exists formula_license text,
  add column if not exists formula_license_scope text,
  add column if not exists formula_source_attestation_version text;

alter table public.artwork_publications
  drop constraint if exists artwork_publications_formula_license_tuple,
  add constraint artwork_publications_formula_license_tuple check (
    (
      formula_license is null
      and formula_license_scope is null
      and formula_source_attestation_version is null
    )
    or
    (
      formula_license is not null
      and formula_license_scope is not null
      and formula_source_attestation_version is not null
      and formula_license = 'MIT'
      and formula_license_scope = 'formula_source'
      and formula_source_attestation_version = '2026-08-08.v1'
    )
  );

comment on column public.artwork_publications.formula_license is
  'Frozen license for an embedded custom-formula source; NULL for built-in-only publications.';
comment on column public.artwork_publications.formula_license_scope is
  'Frozen formula license scope (formula_source); independent of the artwork_image layer.';
comment on column public.artwork_publications.formula_source_attestation_version is
  'Explicit author attestation version for making the frozen formula source public under MIT.';

-- Include the formula legal tuple in the immutable publication fields.  The
-- lifecycle escape hatch may clear content, but never rewrite legal facts.
create or replace function public.fractalpark_publications_frozen_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  privileged boolean := coalesce(
    current_setting('fractalpark.privileged_mutation', true) = 'on', false);
begin
  if new.id <> old.id
     or new.author_display_name <> old.author_display_name
     or new.title <> old.title
     or new.published_at <> old.published_at
     or new.rights_attestation_version <> old.rights_attestation_version
     or new.license_version <> old.license_version
     or new.rights_attested_at <> old.rights_attested_at
     or new.license <> old.license
     or new.license_scope <> old.license_scope
     or new.formula_license is distinct from old.formula_license
     or new.formula_license_scope is distinct from old.formula_license_scope
     or new.formula_source_attestation_version is distinct from old.formula_source_attestation_version
     or new.remix_source_type is distinct from old.remix_source_type
     or new.remix_source_id is distinct from old.remix_source_id then
    raise exception 'frozen publication field update rejected';
  end if;
  if new.owner_id is not null and new.owner_id <> old.owner_id then
    raise exception 'owner_id may only be nulled';
  end if;
  if not privileged then
    if new.envelope is distinct from old.envelope
       or new.description is distinct from old.description then
      raise exception 'publication content update rejected outside lifecycle mutation';
    end if;
  else
    if (new.envelope is not null and new.envelope is distinct from old.envelope)
       or (new.description is not null and new.description is distinct from old.description) then
      raise exception 'lifecycle mutations may only clear publication content';
    end if;
  end if;
  return new;
end;
$$;

-- Replace the old signature instead of leaving an overloaded PostgREST RPC.
drop function public.fractalpark_publish_draft(
  uuid, uuid, text, uuid, integer, text, text, jsonb, integer, text, text, integer);

create function public.fractalpark_publish_draft(
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
  p_formula_source_attestation_version text default null,
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

  select * into v_gate from public.fractalpark_operation_gate(
    p_owner_id, p_idempotency_key, p_request_hash);
  if v_gate.outcome = 'replay' then
    select * into v_op from public.artwork_operations
     where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
    if v_op.publication_id is null then
      raise exception 'not_found: publication no longer exists';
    end if;
    return jsonb_build_object('replayed', true, 'publication_id', v_op.publication_id);
  end if;

  if p_license_version <> 'CC-BY-4.0' then
    raise exception 'validation_failed: rendered artwork license must be CC-BY-4.0';
  end if;
  if p_formula_source_attestation_version is not null
     and p_formula_source_attestation_version <> '2026-08-08.v1' then
    raise exception 'validation_failed: stale formula source attestation';
  end if;

  insert into public.artwork_operations (
    owner_id, idempotency_key, operation_type, request_hash)
  values (p_owner_id, p_idempotency_key, 'publish_draft', p_request_hash)
  returning id into v_operation_id;

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

  select * into v_rate
  from public.fractalpark_rate_limit_consume(
    'publish_user_day', md5(p_owner_id::text), p_publish_quota, 86400);
  if not v_rate.allowed then
    raise exception 'rate_limited: %', v_rate.retry_after;
  end if;

  insert into public.artwork_publications (
    owner_id, author_display_name, title, description, envelope,
    thumbnail_path, thumbnail_status,
    license, license_scope,
    rights_attestation_version, license_version, rights_attested_at,
    formula_license, formula_license_scope, formula_source_attestation_version,
    remix_source_type, remix_source_id,
    status, published_at
  ) values (
    p_owner_id, v_display_name, p_title, p_description, p_envelope,
    null, 'pending',
    'CC-BY-4.0', 'artwork_image',
    p_rights_attestation_version, p_license_version, v_now,
    case when p_formula_source_attestation_version is null then null else 'MIT' end,
    case when p_formula_source_attestation_version is null then null else 'formula_source' end,
    p_formula_source_attestation_version,
    v_draft.remix_source_type, v_draft.remix_source_id,
    'published', v_now
  )
  returning id into v_publication_id;

  if v_draft.thumbnail_path is not null then
    insert into public.resource_cleanup_jobs (
      operation_id, owner_id, resource_type, resource_key)
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
    select * into v_gate from public.fractalpark_operation_gate(
      p_owner_id, p_idempotency_key, p_request_hash);
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
  uuid, uuid, text, uuid, integer, text, text, jsonb, integer, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fractalpark_publish_draft(
  uuid, uuid, text, uuid, integer, text, text, jsonb, integer, text, text, text, integer)
  to service_role;

-- Runtime preflight must distinguish this schema from the base creation
-- schema: application readers now select the independent formula tuple.
create or replace function public.fractalpark_schema_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select '20260808202734'::text $$;

revoke execute on function public.fractalpark_schema_version() from public;
grant execute on function public.fractalpark_schema_version() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
