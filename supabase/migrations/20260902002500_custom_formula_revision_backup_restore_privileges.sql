-- v0.4.19 release closeout: let owner-operated logical backup and
-- fresh-project restore tooling include immutable Mine Formula revisions.
-- Runtime lifecycle mutations remain RPC-only; service_role receives SELECT
-- for backup but no direct revision INSERT, UPDATE, or DELETE privilege.

grant select on table public.custom_formula_revisions to service_role;
revoke insert, update, delete on table public.custom_formula_revisions from service_role;
revoke all privileges on table public.custom_formula_revisions from public, anon, authenticated;

-- Formula rows and revision rows form a circular FK graph through the two head
-- pointers. A fresh restore inserts formulas with null heads, restores ordered
-- revisions through a narrow RPC, then restores the pointers through a second
-- narrow RPC. The transaction-local GUC exists only inside those RPC calls.
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

  if current_setting('fractalpark.formula_restore', true) = 'on' then
    if (to_jsonb(new)
          - 'editable_head_revision_id'
          - 'active_runnable_revision_id'
          - 'updated_at')
       is distinct from
       (to_jsonb(old)
          - 'editable_head_revision_id'
          - 'active_runnable_revision_id'
          - 'updated_at') then
      raise exception 'formula restore may only change lifecycle head pointers';
    end if;
    return new;
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'custom formula revision must increment by exactly one';
  end if;
  return new;
end;
$$;

-- The normal lifecycle projection must not replay while an exact legacy
-- formula projection is being restored. Outside the transaction-local restore
-- GUC, this function retains the existing runtime behavior byte-for-byte.
create or replace function public.fractalpark_sync_custom_formula_lifecycle_projection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('fractalpark.formula_restore', true) = 'on' then
    return new;
  end if;

  update public.custom_formulas
  set name = pg_catalog.left(
        coalesce(nullif(new.definition ->> 'name', ''), custom_formulas.name),
        80
      ),
      source = new.definition ->> 'source',
      source_bytes = pg_catalog.octet_length(
        pg_catalog.convert_to(new.definition ->> 'source', 'UTF8')
      ),
      experience_hint = pg_catalog.jsonb_build_object(
        'bounds',
        pg_catalog.jsonb_build_object(
          'centerX', new.profile #> '{view,centerX}',
          'centerY', new.profile #> '{view,centerY}',
          'zoom', new.profile #> '{view,zoom}',
          'rotation', new.profile #> '{view,rotation}'
        )
      ),
      frm_semantics_version = 2,
      updated_at = pg_catalog.now()
  where id = new.formula_id;
  return new;
end;
$$;

create function public.fractalpark_custom_formula_restore_revision(
  p_revision jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.custom_formula_revisions%rowtype;
  v_inserted public.custom_formula_revisions%rowtype;
begin
  if p_revision is null or jsonb_typeof(p_revision) <> 'object' then
    raise exception 'validation_failed: restore revision object is required';
  end if;

  select * into v_revision
  from pg_catalog.jsonb_populate_record(
    null::public.custom_formula_revisions,
    p_revision
  );
  if v_revision.id is null
     or v_revision.formula_id is null
     or v_revision.owner_id is null then
    raise exception 'validation_failed: restore revision identity is required';
  end if;

  perform set_config('fractalpark.formula_restore', 'on', true);
  insert into public.custom_formula_revisions (
    id,
    formula_id,
    owner_id,
    revision,
    definition,
    profile,
    source_revision,
    profile_revision,
    runnable,
    diagnostics,
    supersedes,
    imported_from_formula_id,
    remixed_from_formula_id,
    lineage_source_revision,
    lineage_profile_revision,
    created_at
  ) values (
    v_revision.id,
    v_revision.formula_id,
    v_revision.owner_id,
    v_revision.revision,
    v_revision.definition,
    v_revision.profile,
    v_revision.source_revision,
    v_revision.profile_revision,
    v_revision.runnable,
    v_revision.diagnostics,
    v_revision.supersedes,
    v_revision.imported_from_formula_id,
    v_revision.remixed_from_formula_id,
    v_revision.lineage_source_revision,
    v_revision.lineage_profile_revision,
    v_revision.created_at
  ) returning * into v_inserted;
  perform set_config('fractalpark.formula_restore', 'off', true);

  return to_jsonb(v_inserted);
end;
$$;

create function public.fractalpark_custom_formula_restore_heads(
  p_formula_id uuid,
  p_owner_id uuid,
  p_editable_head_revision_id uuid,
  p_active_runnable_revision_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formula public.custom_formulas%rowtype;
begin
  if p_formula_id is null or p_owner_id is null then
    raise exception 'validation_failed: restore formula identity is required';
  end if;

  perform set_config('fractalpark.formula_restore', 'on', true);
  update public.custom_formulas
  set editable_head_revision_id = p_editable_head_revision_id,
      active_runnable_revision_id = p_active_runnable_revision_id
  where id = p_formula_id
    and owner_id = p_owner_id
  returning * into v_formula;
  perform set_config('fractalpark.formula_restore', 'off', true);

  if v_formula.id is null then
    raise exception 'not_found: custom formula not found';
  end if;

  return jsonb_build_object(
    'id', v_formula.id,
    'editable_head_revision_id', v_formula.editable_head_revision_id,
    'active_runnable_revision_id', v_formula.active_runnable_revision_id
  );
end;
$$;

revoke execute on function public.fractalpark_custom_formula_restore_revision(jsonb)
  from public, anon, authenticated;
grant execute on function public.fractalpark_custom_formula_restore_revision(jsonb)
  to service_role;
revoke execute on function public.fractalpark_custom_formula_restore_heads(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fractalpark_custom_formula_restore_heads(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
