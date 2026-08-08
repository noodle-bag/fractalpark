-- v0.4.16 hosted privilege hardening (forward-only).
--
-- Supabase hosted projects can carry default privileges that grant new
-- public-schema tables to anon/authenticated. custom_formulas has FORCE RLS
-- with no policies, so those roles could not read or mutate rows, but the
-- table ACL still violated the service-role-only defense-in-depth contract.
-- Revoke the hosted defaults explicitly; do not rewrite the already-applied
-- 20260803120000 migration.

revoke all privileges on table public.custom_formulas
  from public, anon, authenticated;

grant select, insert, update, delete on table public.custom_formulas
  to service_role;

-- Keep the public runtime probe aligned with the final repository migration
-- set so operators can distinguish this hardened schema from 20260808202734.
create or replace function public.fractalpark_schema_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select '20260809001201'::text $$;

revoke execute on function public.fractalpark_schema_version() from public;
grant execute on function public.fractalpark_schema_version()
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
