# Published Formula runtime loader runbook

This runbook covers the v0.4.19 engine-only runtime projection that joins the
immutable rev3 C339 and rev4 A106/P89 assets into the exact 534 published
Definitions authorized by publication decision revision 4.

It does **not** activate a selector, parameter UI, Lucky/Profile ranking,
portable writer, deployment, Release, or Production behavior.

## Public output contract

`public/formula-library/v1/runtime/published/` contains:

- `manifest.json`: pins the source manifests, decision revision/content hash,
  row count, byte index hash, code-side canonical whole-index commitment, and
  Definition count;
- `index.json`: light metadata, immutable revisions, versioned parameter binding
  descriptors, and one verified mechanical or family-fallback Profile per row;
- `definitions/<sourceRevision>.frm`: exactly one content-addressed canonical
  Definition body per published row.

The index must contain no Definition source body. Held and excluded Formula IDs
must appear in none of these assets. A Definition filename is its SHA-256
`sourceRevision`; `semanticHash` remains the independently derived semantic IR
hash.

## Deterministic regeneration and drift check

No private path or environment variable is required. Inputs are only the public,
hash-pinned rev3/rev4 manifests and decision revision 4.

```bash
npm run formula:runtime-rev4:verify
npm run formula:published-runtime:write
npm run formula:published-runtime
npx vitest run \
  src/test/published-formula-adapter.test.ts \
  src/test/published-formula-runtime.test.ts
```

Expected accounting:

```text
rows = 534
separated-independent-rewrite = 339
direct-adaptation = 106
project-owned = 89
definition bodies = 534
profileQuality none = 0
```

The write command constructs a complete sibling directory before replacing the
old generated directory. The non-write command is the drift gate and must report
`drift: false`.

## Engine loading behavior

1. Parse and validate `index.json`, then recompute its canonical whole-index
   SHA-256 against the commitment compiled into the v1 loader before exposing
   any row. Counts and self-asserted revision strings alone are not authority.
2. Lookup uses neutral Formula ID only.
3. Fetch only the selected `definitionPath`.
4. Recompute `sourceRevision`, parse the Definition, recompute `semanticHash`,
   and compile through the v1 backend.
5. Produce a namespaced candidate-C FormulaPlugin with reset and arbitrary
   continue-predicate hooks.
6. Include `sourceRevision` in the shader cache key.
7. On any miss, malformed body, hash mismatch, parse error, or backend error,
   return a stable failure code. Never substitute a legacy formula.

The framework calls `frmV1ResetState` for every orbit, including every
supersample, before `initFormula`. It evaluates `frmV1ShouldContinue` after each
iteration. Legacy B94 and classic-FRM shaders do not receive either hook and
must remain byte-identical.

## WebGL gate

The exhaustive gate links the complete framework shader and runs two bounded,
single-step CPU/GPU candidate-orbit probe pairs for every published row
under headless SwiftShader. Event and continue channels match exactly; bounded
complex components use the frozen relative tolerance so the gate measures
binding/lifecycle parity rather than deep-orbit double/float chaos:

```bash
npm run formula:published-runtime:webgl
```

For constrained hosts, split the sorted Formula-ID set into disjoint ranges:

```bash
npm run formula:published-runtime:webgl -- \
  --start=0 --limit=129 --chunk-size=3 --report=/tmp/shard-0.json
```

All reports must be merged by Formula ID and prove exact equality with the published
index IDs: no gap, duplicate, or extra row. A partial shard is evidence for that
range only and must not be described as the full gate.

## Failure handling

- Exact-set, decision, source-manifest, shard, sourceRevision, semanticHash,
  parameter-schema, Profile, parse, backend, or WebGL mismatch is a hard stop.
- Do not hand-edit generated `index.json`, `manifest.json`, or Definition files.
  Fix the builder/compiler/adapter and regenerate the entire directory.
- Do not weaken the CPU/GPU tolerance, skip a failed Formula ID, or replace it
  with a legacy formula.
- Do not add Definition bodies to a TypeScript import or eager route payload.

## Rollback

Before selector/UI activation, rollback is a normal commit revert of the
published runtime builder/assets, loader, and candidate-C adapter. Rev3 and rev4
source projections remain immutable.

After a consumer is activated, disable that consumer first, then revert to the
last-known-good published runtime manifest. Never rewrite a referenced
`definitions/<sourceRevision>.frm` body in place. This runbook does not permit
merge, deployment, tag, Release, or Production actions.
