# ADR 0002: Converge Coloring Work under Document v2

- Status: Accepted
- Date: 2026-07-25
- Target release: FractalPark v0.4.12

## Context

`origin/feat/coloring-pipeline-v2` and
`origin/codex/color-adjustments-schema-v2` both introduced a schema version 2,
but assigned modern style and post-processing data differently. Merging either
branch wholesale would make that branch's schema an accidental persistence
contract.

## Decision

Document v2 owns one coloring boundary:

```text
coloring
├─ pipelineVersion
├─ legacy palette/coloring fields
├─ style
│  ├─ styleId
│  ├─ detail
│  └─ post
└─ params
```

- Preserve legacy rendering with `pipelineVersion = 1`.
- Place modern measurement/style controls under `coloring.style.detail`.
- Place color adjustments and RGB curves under `coloring.style.post`.
- Use explicit types and field allowlists for both containers.
- Do not define another schema v2 on either feature branch.
- Extract implementation ideas or focused commits only after rebasing them
  onto the accepted Document v2 contract.

## Scope

v0.4.12 freezes the data boundary only. It does not ship the modern Coloring
UI, measurement shaders, RGB curves, or visual-regression baselines from
either branch.

## Consequences

Some branch code will require manual adaptation later. That cost is accepted
to avoid two incompatible v2 formats and to keep persistence independent from
unfinished renderer work.
