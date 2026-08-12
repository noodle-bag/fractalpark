-- v0.4.18: persist frmSemanticsVersion through the custom-formula save RPC.
--
-- Forward-only follow-up to 20260811000000_frm_semantics_version.sql. The
-- additive column alone is insufficient: PostgREST resolves named arguments
-- against the SQL function signature, so the RPC must accept and persist the
-- explicit version used by new-v2 and Upgrade & Compare writes.
--
-- Contract:
--   - NULL means "preserve" on update and legacy-v1 on old create callers;
--   - 1/2 explicitly set the frozen compile-semantics contract;
--   - ordinary saves never auto-upgrade a legacy row;
--   - the old overload is removed so PostgREST has one unambiguous function.

revoke execute on function public.fractalpark_custom_formula_save(
  uuid, uuid, text, text, text, jsonb, uuid, integer, integer
) from public, anon, authenticated, service_role;

drop function public.fractalpark_custom_formula_save(
  uuid, uuid, text, text, text, jsonb, uuid, integer, integer
);

create function public.fractalpark_custom_formula_save(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_name text,
  p_source text,
  p_experience_hint jsonb default null,
  p_formula_id uuid default null,
  p_expected_revision integer default null,
  p_quota integer default 50,
  p_frm_semantics_version smallint default null
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
  if p_frm_semantics_version is not null
     and p_frm_semantics_version not in (1, 2) then
    raise exception 'validation_failed: frm semantics version must be 1 or 2';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  insert into public.profiles (user_id) values (p_owner_id)
  on conflict (user_id) do nothing;

  select * into v_gate
    from public.fractalpark_custom_formula_gate(
      p_owner_id,
      p_idempotency_key,
      p_request_hash
    );
  if v_gate.outcome = 'replay' then
    return jsonb_build_object(
      'replayed', true,
      'formula_id', v_gate.replay_formula_id,
      'revision', v_gate.replay_revision
    );
  end if;

  if p_expected_revision is null then
    select count(*) into v_count
      from public.custom_formulas
     where owner_id = p_owner_id;
    if v_count >= p_quota then
      raise exception 'quota_exceeded: custom formula count quota reached';
    end if;

    insert into public.artwork_operations (
      idempotency_key,
      owner_id,
      operation_type,
      request_hash,
      status
    ) values (
      p_idempotency_key,
      p_owner_id,
      'save_custom_formula',
      p_request_hash,
      'processing'
    ) returning id into v_operation_id;

    insert into public.custom_formulas (
      id,
      owner_id,
      name,
      source,
      experience_hint,
      source_bytes,
      frm_semantics_version
    ) values (
      coalesce(p_formula_id, gen_random_uuid()),
      p_owner_id,
      p_name,
      p_source,
      p_experience_hint,
      octet_length(p_source),
      p_frm_semantics_version
    ) returning * into v_formula;
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

    insert into public.artwork_operations (
      idempotency_key,
      owner_id,
      operation_type,
      request_hash,
      status
    ) values (
      p_idempotency_key,
      p_owner_id,
      'save_custom_formula',
      p_request_hash,
      'processing'
    ) returning id into v_operation_id;

    update public.custom_formulas
       set name = p_name,
           source = p_source,
           experience_hint = p_experience_hint,
           source_bytes = octet_length(p_source),
           frm_semantics_version = coalesce(
             p_frm_semantics_version,
             v_formula.frm_semantics_version
           ),
           revision = revision + 1
     where id = p_formula_id
     returning * into v_formula;
  end if;

  update public.artwork_operations
     set status = 'succeeded',
         formula_id = v_formula.id,
         result_revision = v_formula.revision
   where id = v_operation_id;

  return jsonb_build_object(
    'replayed', false,
    'formula', to_jsonb(v_formula)
  );
exception
  when unique_violation then
    select * into v_gate
      from public.fractalpark_custom_formula_gate(
        p_owner_id,
        p_idempotency_key,
        p_request_hash
      );
    if v_gate.outcome = 'replay' then
      return jsonb_build_object(
        'replayed', true,
        'formula_id', v_gate.replay_formula_id,
        'revision', v_gate.replay_revision
      );
    end if;
    raise exception 'idempotency_conflict: concurrent request did not converge';
end;
$$;

revoke execute on function public.fractalpark_custom_formula_save(
  uuid, uuid, text, text, text, jsonb, uuid, integer, integer, smallint
) from public, anon, authenticated;

grant execute on function public.fractalpark_custom_formula_save(
  uuid, uuid, text, text, text, jsonb, uuid, integer, integer, smallint
) to service_role;

comment on function public.fractalpark_custom_formula_save(
  uuid, uuid, text, text, text, jsonb, uuid, integer, integer, smallint
) is 'Owner-checked custom formula create/update with idempotency, revision, quota, and explicit/preserved FRM semantics version.';

notify pgrst, 'reload schema';
