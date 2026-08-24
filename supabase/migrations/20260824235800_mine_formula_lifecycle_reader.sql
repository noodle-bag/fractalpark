-- Read Mine Formula lifecycle heads without granting direct table access to
-- service_role. The application authenticates the owner before supplying both
-- identifiers; the function still enforces formula + owner identity internally.

create function public.fractalpark_custom_formula_lifecycle_heads(
  p_owner_id uuid,
  p_formula_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formula public.custom_formulas%rowtype;
  v_editable jsonb;
  v_active jsonb;
begin
  select * into v_formula
  from public.custom_formulas
  where id = p_formula_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'not_found: custom formula not found';
  end if;
  if v_formula.editable_head_revision_id is null then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', revision.id,
    'definition', revision.definition,
    'profile', revision.profile,
    'diagnostics', revision.diagnostics,
    'runnable', revision.runnable,
    'remixed_from_formula_id', revision.remixed_from_formula_id,
    'lineage_source_revision', revision.lineage_source_revision,
    'lineage_profile_revision', revision.lineage_profile_revision
  ) into v_editable
  from public.custom_formula_revisions as revision
  where revision.id = v_formula.editable_head_revision_id
    and revision.formula_id = v_formula.id
    and revision.owner_id = p_owner_id;

  if v_editable is null then
    raise exception 'unavailable: editable lifecycle head missing';
  end if;

  if v_formula.active_runnable_revision_id is not null then
    select pg_catalog.jsonb_build_object(
      'id', revision.id,
      'definition', revision.definition,
      'profile', revision.profile,
      'diagnostics', revision.diagnostics,
      'runnable', revision.runnable,
      'remixed_from_formula_id', revision.remixed_from_formula_id,
      'lineage_source_revision', revision.lineage_source_revision,
      'lineage_profile_revision', revision.lineage_profile_revision
    ) into v_active
    from public.custom_formula_revisions as revision
    where revision.id = v_formula.active_runnable_revision_id
      and revision.formula_id = v_formula.id
      and revision.owner_id = p_owner_id
      and revision.runnable;

    if v_active is null then
      raise exception 'unavailable: active runnable lifecycle head missing';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'editable', v_editable,
    'active', v_active
  );
end;
$$;

revoke execute on function public.fractalpark_custom_formula_lifecycle_heads(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.fractalpark_custom_formula_lifecycle_heads(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';
