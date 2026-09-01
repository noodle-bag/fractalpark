# Cloud Backup & Recovery Runbook

Operations for backing up and restoring everything the web creation loop
owns (spec sections 10–12). Two independent layers; either one alone is a
single point of failure.

## What must survive

| Asset | Where it lives | Layer that covers it |
|---|---|---|
| Schema, RLS, RPCs, triggers, grants, storage buckets | `supabase/migrations/` in the repo | Migration replay (`db push`) |
| Migration history (what was applied when) | repo + `supabase_migrations.schema_migrations` | Repo is source of truth; platform history is informational |
| Durable rows: `profiles`, `artwork_drafts`, `custom_formulas`, `custom_formula_revisions`, `artwork_publications`, `artwork_operations`, `resource_cleanup_jobs` | Postgres `public` | Platform backup **and** logical export |
| Auth identities (id ↔ email) | GoTrue `auth.users` | Platform backup (full fidelity); logical export keeps the id↔email map for UUID remap |
| Storage objects (draft/publication thumbnails) | Storage buckets | Platform backup; logical export keeps the object manifest (path/size/mtime) |
| `rate_limit_counters` | Postgres | **Deliberately excluded** — ephemeral; restoring it would only resurrect stale limits |

## Layer 1: platform backup

Supabase hosted projects take automatic backups (schedule and retention per
plan). Once a month, open the project Dashboard → Database → Backups and
confirm the most recent backup is present and younger than 24h. Platform
restore is the only path that preserves auth credentials and storage bytes
with full fidelity; use it for real disasters. Document any platform
restore (date, backup point, reason) in the release notes.

## Layer 2: logical export (`scripts/backup-cloud.ts`)

Portable, inspectable JSON rows + manifests. Use it for cross-project
moves, pre-release snapshots, and as the cold fallback when the platform
layer is unavailable.

```bash
# Local stack (or any project whose service key you hold):
SUPABASE_SERVICE_ROLE_KEY=... node --import tsx scripts/backup-cloud.ts \
  --out backups/$(date +%Y%m%d-%H%M)-local

# Staging / hosted project WITHOUT a service key leaving the vault
# (Management API SQL endpoint; token + project ref):
SUPABASE_ACCESS_TOKEN=$(cat ~/.hermes/credentials/supabase-access-token) \
  node --import tsx scripts/backup-cloud.ts --mode=management \
  --ref <project-ref> --out backups/$(date +%Y%m%d-%H%M)-staging
```

Output: one JSON per table (`profiles`, `artwork_drafts`, `custom_formulas`,
`custom_formula_revisions`, `artwork_publications`, `artwork_operations`,
`resource_cleanup_jobs`),
`auth_users.json` (id↔email map only — never credentials), one
`storage_<bucket>.json` manifest per bucket, `schema_migrations.json`, and
`manifest.json` with row counts and a sha256 per file. Verify the manifest
counts are non-zero where expected and copy the directory off-box (the
backup on the same disk as the disaster is not a backup).

Storage object **bytes** are not inlined; re-download by path before any
bucket rebuild (`GET /storage/v1/object/<bucket>/<path>` with the service
key) and re-upload verbatim after.

## Restore (`scripts/restore-cloud.ts`)

1. Create the fresh project (or reset the target).
2. Roll the schema forward: `supabase db push` / `npm run db:migrate` —
   this rebuilds roles, RLS, RPCs, triggers, and buckets from the repo.
3. Restore rows and identities:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
  node --import tsx scripts/restore-cloud.ts --in backups/<dir>
# Add --dry-run first: validates the manifest and prints the row plan without
# querying or mutating the target. UUID remaps are known only during restore.
```

Dry-run does not contact the target or write a remap file. A real restore
imports auth identities first (GoTrue admin; passwordless
project — users sign in with a fresh OTP afterwards), emits
`uuid-remap.json` for every identity that was re-keyed, and rewrites every
`owner_id`/`user_id`/`created_by` reference through the remap before
inserting rows in FK order. It finishes with per-table row counts
(backup vs target).

Formula lifecycle rows use a two-phase restore because formulas and revisions
form a circular foreign-key graph. The first phase inserts formulas with both
head pointers cleared, then inserts revisions; the second phase restores each
formula's head pointers and requires an exact returned representation. The
database runnable-head trigger remains enabled throughout.

The revision table grants `service_role` only `SELECT` for backup. It grants
neither direct `INSERT`, `UPDATE`, nor `DELETE`; restore inserts each ordered
revision through the narrow restore RPC, and normal application lifecycle
writes continue through the gated writer RPC.

Snapshots created before migration `20260816090000` legitimately omit
`custom_formula_revisions.json` and remain restorable. Once that migration
appears in `schema_migrations.json`, the restore treats a missing revisions
payload as corruption and aborts rather than silently losing lifecycle data.

4. Verify: `npm run db:preflight -- --local` (or `--linked`), the row
   counts printed by the restore, and one OTP login smoke per restored
   identity class.
5. Re-upload storage bytes by manifest path.

## Drill record

2026-08-03 (production enablement): full smoke against production — OTP
sign-in via the real Feishu SMTP channel, draft create, publish, public
page, withdraw → 404, staged account deletion, worker finalize. Verified
in the database: draft/profile/auth-identity erased, publication tombstone
(title + attribution, owner nulled), delete_account audit row `succeeded`,
cleanup job `succeeded`. One gap found and fixed in this runbook: the
GoTrue mailer template step was missing, so the first OTP email carried a
magic link instead of a code.

2026-08-03 (commit 13), two directions rehearsed:

- **Local full cycle** — seeded stack → `backup-cloud.ts` (21 profiles /
  14 drafts / 28 publications / 46 operations / 7 cleanup jobs / 31
  identities / 10 storage objects) → `supabase db reset` →
  `restore-cloud.ts` (31 identities re-keyed, all five tables
  count-exact) → `db:preflight --local` green → OTP login smoke as a
  restored identity green → remapped owner reads back their draft.
- **Staging → fresh project** — `backup-cloud.ts --mode=management`
  against staging (1 identity / 3 operations / 7 migrations) → `db
  reset` → `restore-cloud.ts` count-exact → `db:preflight --local`
  green. Proves a hosted project's logical backup is restorable without
  its service key ever leaving the credential vault.

Lesson recorded: the first staging export silently fell back to
postgrest/local because the CLI parser only accepted `--mode management`
while the runbook wrote `--mode=management` — the "staging" manifest
mirrored the local stack exactly. Both scripts now accept either form.
Treat any backup whose contents look identical to another environment as
suspect and probe the source directly (a one-row marker write answered
the question here). Repeat these drills on every schema-affecting
release and after any restore-code change.

## Ops alerts (what must page a human)

- **Cleanup jobs stuck**: any `resource_cleanup_jobs` row in `failed`, or
  `pending`/`processing` rows whose `updated_at` is older than 24h. Query:
  `select status, count(*) from resource_cleanup_jobs group by status;`
  The cleanup worker's `waiting_for_storage_cleanup` requeue (an error
  code in `last_error`, not a status) burns the shared retry budget
  (~8 attempts ≈ 10.6h backoff) — if a deletion hits that ceiling the job
  fails permanently and the account is never physically removed. Manual
  path: fix storage, `update resource_cleanup_jobs set status='pending',
  attempts=0 where id=...`, re-run the worker, then
  `fractalpark_account_deletion_finalize` + GoTrue admin delete per
  docs/specs/web-creation-loop-v1.md §10.2.
- **Deletion op open > 24h**: `select * from artwork_operations where
  operation_type='delete_account' and status='processing';` — confirm +
  worker + finalize should converge in minutes.
- **Backup email failures**: artwork backup request errors are visible to
  users; repeated SMTP failures → check `internal/smtp-probe` (HMAC-gated)
  and the SMTP env contract (spec 9).
- **Rate-limit anomalies**: a sudden count spike in
  `rate_limit_counters` for one policy_key usually means an abuse attempt
  or a client loop — inspect before raising limits.
- **Backup freshness**: logical export older than the retention agreed
  for the environment (staging: weekly; production: daily once enabled).

## What this runbook does NOT cover

- Vercel environment variables, Auth provider keys, session/HMAC keys —
  rotate per the release checklist (spec 14), never restore them from a
  backup.
- Production enablement — the production project is not authorized yet;
  this runbook's staging/local paths are the only rehearsed ones.
