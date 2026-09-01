# Formula Library Revision-3 Rollback Runbook

Scope: revert decision revision 3 (clean-room bulk publish set + runtime
shards) to the revision-2 state. Revision 3 assets are additive-only by
design; rollback never requires rewriting history.

## Assets introduced by revision 3

| Asset | Path | Introduced |
|---|---|---|
| Publication decisions (rev 3) | `resources/formula-library/v1/publication-decisions.json` | modified in place (rev 2 → rev 3) |
| Runtime shards | `resources/formula-library/v1/runtime/rev3/shard-*.json` + `manifest.json` | new directory |
| Generator/shard pins | `scripts/generate-formula-publication-decisions.ts`, `scripts/build-formula-runtime-shards.ts` | modified / new |

## Rollback procedure

1. `git revert <rev3-commit>` (single commit carries all rev-3 changes), or
   manually:
   - restore `resources/formula-library/v1/publication-decisions.json` to the
     revision-2 content (`git checkout <rev2-sha> -- <path>`);
   - delete `resources/formula-library/v1/runtime/rev3/` entirely;
   - restore `scripts/generate-formula-publication-decisions.ts` (and remove
     `scripts/build-formula-runtime-shards.ts` if reverting fully).
2. Verify:
   - `npx tsx scripts/verify-formula-publication-decisions.ts` reports the
     revision-2 asset green;
   - `npm run test:run -- formula-publication-decisions` passes.
3. Private evidence (`.formula-library-private/`) is NOT deleted on rollback:
   the clean-room receipts chain stays valid for a later revision-4 attempt.

## Failure modes and notes

- The decisions asset is content-hashed; a partial revert is detected by the
  verifier as `decisions-drift` — never ship a mixed state.
- Runtime shard consumers (later commits) must tolerate the directory being
  absent; rev 3 ships no consumer, so rollback has no runtime surface.
