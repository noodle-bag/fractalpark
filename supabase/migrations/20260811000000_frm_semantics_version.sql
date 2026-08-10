-- v0.4.18 frmSemanticsVersion column for custom formulas.
--
-- PENDING hosted-ops review — do not apply to prod before staging+backup
-- verified.
--
-- frmSemanticsVersion is the compile-semantics contract of an FRM source
-- (docs/specs/frm-compatibility-v1.md §3, docs/adr/0007-frm-semantics-versioning.md):
--   1 = legacy v1 (frozen — known defects preserved);
--   2 = strict v2 (selected-entry, bailout descriptors, after-step timing,
--       strict rejection of unknown predicates).
-- NULL means legacy v1. Existing rows are intentionally NOT backfilled:
-- ordinary save must never auto-upgrade a formula's semantics version, so a
-- missing value keeps reading as v1 indefinitely (readers stay
-- v1-compatible; the "Upgrade & Compare" flow persists v2 only after
-- explicit user confirmation).
-- Rollback: drop column public.custom_formulas.frm_semantics_version;

alter table public.custom_formulas
  add column if not exists frm_semantics_version smallint null
  check (frm_semantics_version in (1, 2));

comment on column public.custom_formulas.frm_semantics_version is
  'FRM compile-semantics contract: 1 = legacy v1 (frozen), 2 = strict v2; NULL = legacy v1 (not backfilled; ordinary saves never auto-upgrade).';
