-- Preserve the legacy read model as the last-successful runnable projection.
-- The lifecycle reader exposes the editable head while enabled; if the writer
-- kill switch is turned off later, legacy readers must not compile an invalid
-- editable draft in place of the active runnable revision.

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
      source = case
        when new.runnable then new.definition ->> 'source'
        when custom_formulas.active_runnable_revision_id is null
          and custom_formulas.source = new.definition ->> 'source' then ' '
        else custom_formulas.source
      end,
      source_bytes = case
        when new.runnable then pg_catalog.octet_length(
          pg_catalog.convert_to(new.definition ->> 'source', 'UTF8')
        )
        when custom_formulas.active_runnable_revision_id is null
          and custom_formulas.source = new.definition ->> 'source' then 1
        else custom_formulas.source_bytes
      end,
      experience_hint = case
        when new.runnable then pg_catalog.jsonb_build_object(
          'bounds',
          pg_catalog.jsonb_build_object(
            'centerX', new.profile #> '{view,centerX}',
            'centerY', new.profile #> '{view,centerY}',
            'zoom', new.profile #> '{view,zoom}',
            'rotation', new.profile #> '{view,rotation}'
          )
        )
        when custom_formulas.active_runnable_revision_id is null
          and custom_formulas.source = new.definition ->> 'source' then null
        else custom_formulas.experience_hint
      end,
      frm_semantics_version = 2,
      updated_at = pg_catalog.now()
  where id = new.formula_id;
  return new;
end;
$$;

revoke all on function public.fractalpark_sync_custom_formula_lifecycle_projection()
from public, anon, authenticated;
