# Formula library runtime revision 4 runbook

Runtime revision 4 is the additive public Definition projection for the 174
revision-2 published rows:

- 106 `direct-adaptation` rows reconstructed from the frozen F588 work package
  and the pinned census ledger;
- 68 `project-owned` rows reconstructed from accepted native Recipes;
- no `separated-independent-rewrite`, held, excluded, or GPL row.

Runtime revision 3 remains the immutable 339-row clean-room projection. The
published runtime builder combines rev3 + rev4 by Formula ID into a light
513-row engine index plus content-addressed Definition bodies. This runbook does
not authorize selector/UI activation, deployment, merge, or Production changes.

## Preconditions

1. Run from the trusted repository root on the controlled VPS worktree.
2. Worktree scope must pass the bulk-migration controller's allowlist.
3. Inject the existing controlled values for:
   - `FRACTALPARK_FORMULA_HANDOFF`
   - `FRACTALPARK_FRM_CORPUS_DIR`
   - `FRACTALPARK_FORMULA_ORACLE_DIR`
4. The pinned private census ledger must be present at
   `.formula-library-private/formula-library-v1/bulk-migration-ledger.json`.
5. Do not log or commit private paths, source locators, corpus bytes, or staging.

## Controlled regeneration

```bash
npm run formula:runtime-rev4:write
npm run formula:runtime-rev4
npm run formula:runtime-rev4:verify
npx vitest run src/test/formula-runtime-rev4.test.ts
```

The write command first reconstructs and validates all 174 Definitions, writes
0600 files to
`.formula-library-private/formula-library-v1/runtime-rev4-staging/`, rereads
those bytes, and only then writes `resources/formula-library/v1/runtime/rev4/`.
The check command must report `drift: false`. The independent verifier imports
neither the generator nor the migration controller.

Expected accounting:

```text
runtimeRevision = 4
decisionRevision = 3
rows = 174
directAdaptation = 106
projectOwned = 68
shards = 3 (64 + 64 + 46)
```

## Failure handling

- Any preflight, census, sourceRevision, semanticHash, exact-set, parser,
  native-Recipe, staging-mode, release-manifest, or shard-hash mismatch is a
  hard stop. Do not copy old bytes around the failed gate.
- A missing controlled environment variable is not permission to infer or
  commit a private path.
- Do not edit a staged `.frm` or public shard by hand. Fix the controlled source
  or pipeline, then regenerate from zero.
- Public output is not accepted until the independent verifier and public-only
  Vitest gate both pass.

## Rollback

Before the rev4 loader is activated, rollback is a normal commit revert that
removes the rev4 public assets and their build/verification code. Private
staging may be retained for forensic comparison but is never committed.

After a loader begins consuming rev4, revert the loader activation first and
confirm it resolves only the previous immutable runtime set. Never rewrite or
replace an already referenced shard in place; issue a new runtime revision.
This runbook does not permit rollback below the dual-reader floor or any
Production deployment action.
