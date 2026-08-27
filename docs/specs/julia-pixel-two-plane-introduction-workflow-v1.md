# Julia / Pixel two-plane introduction workflow v1

Status: **7E-A contract frozen; product inactive**. This specification defines the reusable recovery workflow inserted after Slice 7E 29g and before the separately authorized 29h activation. It does not generate candidates, replace the live Julia census, wire runtime controls, expose generalized modes, or authorize 29h.

## 1. Authority boundary

The workflow is:

```text
frozen exact-534 lineage
  → source-bound production IR
  → role discovery
  → authority repair or isolated rewrite
  → Tier 0/1
  → frozen candidate-set manifest / waveId
  → Tier 2 and one sealed E1 holdout
  → sealed final census v2
  → independent activation handoff
  → separately authorized 29h
```

The existing 29b–29g assets remain immutable historical evidence. The v2 workflow may reuse a 29g row only through its exact row hash and complete transitive bindings. It never copies `supported` as a grandfathered status.

The normative machine contract is `resources/formula-library/v1/julia-pixel-recovery-contract.v1.json`. Its parser is browser-safe and direct-import only; it is deliberately absent from the live formula barrel. The deterministic builder and independent verifier are separate entry points.

## 2. Orthogonal projection schema

Each exact-534 projection row has one value for `modeClass`, `supportLane`, `remediationLane`, `rewriteClass`, and `finalStatus`. `roles` is an ordered, unique multi-label set.

### Roles

- `role:pixel-seed`
- `role:pixel-constant`
- `role:julia-constant`
- `role:derived-pixel-constant`
- `role:formula-parameter`
- `role:dynamic-orbit-state`
- `role:bailout-control`
- `role:unresolved`

Names, display families, Profile labels, old capability flags, and formula IDs are not role evidence.

### Mode class

- `classic-julia`
- `generalized-two-plane`
- `undetermined`
- `not-applicable`

Classic Julia requires a direct pixel seed. SSA copies, component-preserving packs, and no-op type wrappers may preserve directness; a non-trivial `f(pixel)` seed is generalized and cannot be activated by workflow v1.

### Support lane

- `existing-system-c`
- `parameter-binding`
- `source-split-direct`
- `source-split-transitive`
- `state-separated`
- `none`

The support lane describes a proven implementation route, not a status. No consumer may infer support from a non-`none` lane.

### Remediation lane

- `none`
- `canonical-rebind`
- `role-discovery`
- `mutable-state-separation`
- `tier1-numeric-diagnosis`
- `renderer-diagnosis`
- `identity-review`

### Rewrite class

- `none`
- `E0-operational-equivalence`
- `E1-mathematical-identity`
- `identity-change`

### Final status

- `supported`
- `held`
- `unknown`
- `blocked`
- `not-applicable`

`candidate` is intentionally absent. Candidate state belongs only to isolated intermediate assets.

## 3. Legal-combination matrix

The parser rejects illegal combinations before candidate generation.

- `supported` requires `classic-julia`, a non-`none` support lane, sealed authority, Tier 0/1/2 `pass`, no unresolved role, rewrite class `none`, E0, or E1, and content-addressed role-discovery, source-authority, direct-pixel-seed, and Tier 0/1/2 receipts.
- `generalized-two-plane` can never be `supported` in v1. It remains held, unknown, blocked, or—after dual review—not applicable.
- E1 with any required review or holdout state pending must be `held`; a failed E1 requirement must be `blocked`.
- E1 support additionally requires identity review, the public supplement contract, and the sealed holdout to pass.
- `identity-change` requires `supportLane=none` and an external `sha256:` proposal reference. It cannot become supported or not applicable, cannot add a census row, and does not authorize implementation.
- `not-applicable` requires `supportLane=none`, a sealed authority, and a versioned technical-author plus independent-review decision represented by `notApplicableReview=pass`.
- Every final projection row must be sealed, including held, unknown, blocked, and not-applicable rows. Draft, withdrawn, or superseded authority cannot feed the final census or handoff.
- Extra row keys—including per-ID thresholds, tolerances, whitelist, or allowlist fields—are rejected.

## 4. Lineage lock

The contract binds:

- baseline repository revision before 7E-A;
- the exact published runtime-index canonical digest;
- all 534 ordered UUIDv5 formula IDs and their ordered-set digest;
- the live census, 29f pre-GPU census, 29g renderer evidence, and 29g final census content hashes;
- the exact parser, classifier, CPU harness, renderer schema, analyzer, fixture, builder, private-state sealer, verifier, package, and specification bytes.

Any bound byte change makes the checked contract stale. The independent verifier recomputes every binding from disk.

## 5. Changed-region and reachability authority

`julia-pixel-changed-region.ts` freezes the v1 diff-to-production-IR algorithm.

1. Both revisions bind one exact formula ID, exact source bytes, source revision, semantic revision, source-authority content hash, and a production parse-to-IR result. ID replay, source drift, semantic drift, or source-authority omission fails closed.
2. Both revisions must pass the production parser and IR validator; supplied IR cannot replace the source-to-IR check.
3. The analyzer flattens semantic metadata, parameters, locals, statements, and expressions to canonical IR paths. Composite nodes use shallow fingerprints, so a changed statically unreachable child does not falsely mark its reachable parent as changed.
4. Each changed path receives a content-derived region ID and a canonical-IR source-span reference.
5. Reachability is calculated separately for parameter and Julia planes using a path-sensitive static over-approximation under `standard32`; primitive numeric operations are rounded to float32 before static comparisons. Exact `ismand` and constant conditions may close a branch; unresolved conditions remain `unknown`.
6. `unknown` always requires coverage. Authors cannot submit a reachability label.
7. Coverage is complete only when every required region is covered in every required mode. The permitted uncovered reachable-or-unknown count is exactly zero.

A fixture with a real static path but a claimed unreachable result must fail because coverage is checked against analyzer output, not the claim.

## 6. E0 and E1

### E0

E0 permits new source bytes only when the parameter plane remains operationally identical: operation order, state timing, events, non-finite behavior, and full contract traces are bit-identical. The rewrite receipt binds both source revisions, semantic revisions, identity fields, the changed-region analysis revision, and zero uncovered reachable-or-unknown regions.

### E1

E1 is not a tolerance waiver. It preserves the mathematical identity while allowing non-bit-identical floating trajectories under one preregistered global supplement:

- per-step, per-complex-component combined error;
- absolute tolerance `0.000001`;
- relative tolerance `0.0005` with normalization floor `1`;
- maximum normalized component error `1`;
- maximum mean normalized component error `0.25`;
- exact terminal event, completed step, and terminal class;
- finite baseline and candidate evidence;
- image relative tolerance remains `0.005` and minimum differing pixels remains `1`;
- no per-ID override.

A row with identity ambiguity exits to held/blocked or a separate identity-change proposal.

## 7. Frozen Tier 0–2 base contract

Tier 0 requires source, identity, rights, and Safety Envelope authority.

Tier 1 retains the 29g public grid:

- 3 points;
- 3 Julia constants;
- depths `1, 2, 4, 8, 16, 32, 64, 128`;
- parameter-plane contract, determinism, finite evidence, pixel sensitivity, and constant sensitivity.

Tier 2 v2 is frozen as Chromium WebGL2 through SwiftShader software rendering:

- the same points, constants, depths, and `standard32` profile;
- trace scope `128` orbit steps × `18` state dimensions;
- image scope `8 × 6`, `32` iterations, 2 constants, 96 pixel comparisons;
- minimum differing pixels `1`;
- relative tolerance `0.005`;
- deterministic double draw;
- one lane-independent full-framework capped witness.

This is not physical-device evidence. Tier 3 remains `physicalDeviceSampleCount=0` and `crossDeviceGuarantee=false`.

## 8. Blind holdout and single-wave rule

Before any candidate source exists, the A unit creates one current private corpus using `generate-julia-pixel-blind-holdout.ts`. The private artifact contains the seed and case values, is mode `0600`, single-link, and installed with an exclusive no-follow create at its versioned path. Public authority exposes only:

- schema;
- generator, private-state-sealer, and independent-verifier revisions;
- sealed corpus digest;
- case-key-set digest and count;
- historical corpus/generator/case-key-set digests and counts;
- immutable private history-manifest and attempt-ledger digests;
- intersection and attempt-count verdicts.

The independent verifier has no optional history path. It always reconstructs every case from the fixed current corpus, validates the fixed historical set named by workflow v1, verifies the private history manifest and attempt ledger, and performs exact case-key intersections. Whole-corpus digest inequality is not an intersection proof, and omitting a command-line argument cannot turn history into an empty set.

This remains the first official recovery wave. A pre-freeze v1 corpus rejected during review is retained as historical evidence rather than deleted; the hardened v2 current corpus has zero case-key intersection with it. Later waves require a new workflow/evidence revision and explicit maintainer plus independent-review approval.

7E-F will freeze the only candidate-set manifest. Its content digest is the waveId. After that point no candidate or revision may be added or replaced. The private attempt ledger has exact stages `pre-candidate → wave-frozen → sealed`; `transition-julia-pixel-holdout-attempt-ledger.ts` writes every successor to a new exclusive/no-follow versioned file. `freeze-wave` parses the sealed candidate manifest; `seal-attempts` requires the exact E1 candidate-ID set, literal attempt number `1`, one independently re-read private sealed receipt per row, and no duplicate or omitted row. The wave-frozen stage has zero attempts. Failure cannot trigger threshold, fixture, source, or candidate changes.

## 9. Immutable authority lifecycle

Every candidate/evidence authority has one state:

- `draft`
- `sealed`
- `withdrawn`
- `superseded`

Authority bytes are immutable. Withdrawal and supersession are new manifest references (`sha256:`), not edits to old bytes. Final inputs must be sealed. A draft, withdrawn, or superseded input is invalid even when its evidence payload says pass.

## 10. Activation handoff

The sealed final census and activation authority are separate objects.

- `review-pending`: required when the v2 regression set is non-empty and no maintainer acknowledgment receipt exists.
- `activation-eligible`: allowed when the regression set is empty, or when a new immutable handoff binds a maintainer acknowledgment receipt for the non-empty set.

Acknowledgment never rewrites the sealed census. A handoff must itself be sealed and bind the final-census digest, final-authority-manifest digest, supported-classic set digest/count, regression-set digest/count, and optional acknowledgment digest. Syntactic parsing is not consumption authority. **7E-A deliberately exports no handoff-consumption function**: a digest-shaped receipt reference is not proof of its contents, issuer, source-to-role derivation, or Tier execution. 7E-H must implement an independent verifier that opens every referenced authority artifact, validates its sealed issuer/tool/source bindings, rebuilds role and Tier conclusions, parses all 534 ordered final rows, and independently rebuilds the supported and regression sets against the exact 170-row 29g baseline. Until that verifier exists and passes, even a syntactically `activation-eligible` handoff is non-consumable. 29h remains a separate authorized commit.

## 11. Fixtures and anti-vacuity

The self-authored fixture set covers:

- direct pixel constant;
- transitive pixel constant and alpha renaming;
- loop mutation, component writes, read-then-overwrite, and path-incomplete initialization;
- literal recurrence review versus control literal rejection;
- non-trivial derived pixel seed forced to generalized;
- a statically possible branch that cannot be called unreachable;
- analyzer-unknown control flow, which must be covered as reachable.

Later analyzer units may add fixtures only through a new bound source revision. A fixture failure invalidates every constrained evidence cone.

## 12. Commands and explicit exclusions

```bash
npx tsx scripts/generate-julia-pixel-blind-holdout.ts --write
npx tsx scripts/seal-julia-pixel-blind-holdout-state.ts --write
npx tsx scripts/verify-julia-pixel-blind-holdout.ts
npx tsx scripts/build-julia-pixel-recovery-contract.ts
npx tsx scripts/verify-julia-pixel-recovery-contract.ts
npx vitest run src/test/julia-pixel-recovery-contract.test.ts
```

`build-julia-pixel-recovery-contract.ts --write` is the public-contract authoring operation; normal verification does not rewrite assets. These commands intentionally remain direct scripts: changing `package.json` would invalidate the immutable 29f/29g source bindings.

7E-A explicitly excludes candidate generation, role census projection, source rewrites, Tier 1/2 reruns, final census v2, live census changes, runtime/UI/Profile/URL/Document changes, 29h, PR Ready, merge, Production, migration, cleanup, tag, and Release.
