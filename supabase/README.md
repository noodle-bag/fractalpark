# FractalPark creation-loop database workspace

This directory holds the Supabase local development stack and the migration
workspace for the v0.4.15 web creation loop. Contracts:
`docs/specs/web-creation-loop-v1.md` and
`docs/testing/v0.4.15-regression-matrix.md`.

## Topology

```text
local development         → local Supabase stack (this directory)
integration preview (one) → staging Supabase project (synthetic data)
production                → production Supabase project (provisioned later,
                            under a separate approval gate)
```

Staging and production projects are provisioned outside the repository and
share the same migrations/RLS/bucket contracts. Credentials are never
shared between environments and never committed.

## Local workflow

```bash
npm run db:start       # start the local stack (Docker required)
npm run db:preflight -- --local   # env contract + schema parity
npm run db:migrate -- --local --confirm   # apply pending migrations
npm run db:reset       # replay migrations + seed from scratch
npm run db:test        # schema/RLS/policy test battery (constraints,
                       # frozen-field triggers, grants, RPC boundaries,
                       # counters, cleanup lifecycle, storage posture)
npm run db:stop        # stop the stack
```

Local OTP codes are captured by Inbucket (http://localhost:54324); no real
email leaves the local stack.

## Migration owner discipline

- Migrations run only through `npm run db:migrate` at the explicit hand of
  the designated migration owner of a pull request. They never run during
  build, application start, preview deployment, or health checks.
- One owner, one target, serial execution. Before applying, the tool prints
  the repo migration set, the applied set, and the rollback boundary, and
  requires `--confirm`.
- Forward-only: never edit an applied migration file. Revert the
  application to a compatible version for rollback; `npm run db:reset` is
  the local recovery path.
- The linked target requires `FRACTALPARK_MIGRATION_TARGET=staging` in the
  owner environment. Production is never a target of this tool.
- Dashboard changes must be written back as reproducible migrations; ad-hoc
  console edits are not a schema source.

## Seeds

`seed.sql` is synthetic only: no real user data, real email addresses, or
production content. Staging uses the same synthetic seed; production is
never seeded.

## Fail closed

`npm run db:preflight` fails when the environment contract or schema parity
breaks. An old deployment that meets an incompatible schema must fail
closed and wait for the migration owner, never attempt repairs.
