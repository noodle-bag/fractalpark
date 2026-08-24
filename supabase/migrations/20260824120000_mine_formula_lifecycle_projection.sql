-- Keep the legacy custom_formulas list/detail projection aligned with the
-- lifecycle editable head while runtime readers continue to use the separate
-- active_runnable_revision_id. This trigger is additive and does not activate
-- the gated lifecycle writer by itself.

create or replace function public.fractalpark_sync_custom_formula_lifecycle_projection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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

revoke all on function public.fractalpark_sync_custom_formula_lifecycle_projection()
from public, anon, authenticated;

drop trigger if exists trg_custom_formula_lifecycle_projection
on public.custom_formula_revisions;

create trigger trg_custom_formula_lifecycle_projection
after insert on public.custom_formula_revisions
for each row
execute function public.fractalpark_sync_custom_formula_lifecycle_projection();
