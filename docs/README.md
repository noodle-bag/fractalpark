# FractalPark Documentation

This directory contains the architecture contracts and decision records that
govern FractalPark development.

## Specifications

- [Fractal Document v2 and Envelope v1](specs/fractal-document-v2.md) defines
  the durable artwork and portable project formats.
- [Fractal Content and Creation Model](specs/fractal-content-and-creation-model.md)
  defines the cross-surface source-of-truth, projection, and evolution rules
  for formulas, published presets, local artwork, and FRM authoring.
- [Formula Content Manifest and FRM Surface Contract](specs/formula-content-manifest.md)
  freezes Formula Atlas identities, canonical formula state, FRM Guide
  compatibility language, and the standalone Editor boundary.
- [Artwork and Location Route Contract](specs/artwork-and-location-routes.md)
  freezes published artwork identities and routes, Gallery and local-artwork
  boundaries, image licensing, and the future named-location namespace.
- [Web Creation Loop v1](specs/web-creation-loop-v1.md) freezes the
  same-origin cloud creation contracts: identity, private drafts, community
  publication, idempotency, quotas, and permissions.
- [Analytics Event Schema v1](specs/analytics-events-v1.md) registers existing
  events and defines the Formula Atlas, FRM, artwork, and Remix event
  contracts.
- [FRM Compatibility and Migration Contracts v1](specs/frm-compatibility-v1.md)
  freezes the authoritative scanner, v1/v2 semantics, descriptor, diagnostics,
  compatibility-evidence, and migration boundaries for v0.4.18.
- [Unified Formula Library and FRM-like Language Contract v1](specs/unified-formula-library-v1.md)
  defines the gated FRM-like parameter-grammar candidate and freezes v0.4.19's
  source-budget, formula-asset, rights-evidence, reader-first migration, and
  rollback boundaries while retaining v0.4.18 reader compatibility.

## Architecture Decision Records

- [ADR 0001](adr/0001-saved-data-migration.md): saved artwork migration with
  dual read and single write.
- [ADR 0002](adr/0002-coloring-branch-convergence.md): Coloring work converges
  under Document v2.
- [ADR 0003](adr/0003-unified-fractal-content-model.md): one canonical state
  model with surface-specific read projections.
- [ADR 0004](adr/0004-remix-source-metadata.md): namespaced Remix provenance
  carried outside the legacy rendering-state URL codec.
- [ADR 0005](adr/0005-same-origin-cloud-session.md): cloud identity stays
  behind a strict same-origin BFF session; the browser never holds tokens.
- [ADR 0006](adr/0006-cloud-authoritative-creation-persistence.md): cloud
  draft is the only persistence; My Formulas move to the cloud; one-time
  clean cut of business localStorage.
- [ADR 0007](adr/0007-frm-semantics-versioning.md): freeze legacy v1 visuals
  and make strict v2 an explicit, reversible formula contract.
- [ADR 0008](adr/0008-unified-formula-library-contract.md): introduce the
  v0.4.19 neutral formula-asset model and reader-first writer activation.

## Test Plans

- [v0.4.13 Regression Matrix](testing/v0.4.13-regression-matrix.md) defines
  commit, slice, and release gates for the Formula Atlas and artwork release.
- [v0.4.15 Regression Matrix](testing/v0.4.15-regression-matrix.md) defines
  commit, pull request, and production enablement gates for the web creation
  loop release.
- [v0.4.16 Regression Matrix](testing/v0.4.16-regression-matrix.md) defines
  commit and release gates for cloud-first navigation and the unified
  creation experience.
- [v0.4.18 Regression Matrix](testing/v0.4.18-regression-matrix.md) defines
  public Level 1 and maintainer-local Level 2 gates for trusted FRM
  compatibility.
- [v0.4.19 Regression Matrix](testing/v0.4.19-regression-matrix.md) freezes the
  unified formula-language, asset, evidence, and reader-first migration gates
  while keeping implementation status explicit.

## Maintenance

- Specifications are living contracts. Update them in the same change that
  intentionally changes a governed boundary.
- ADRs record accepted decisions and should not be rewritten to describe a
  different decision. Add a superseding ADR instead.
- Release-specific test plans remain versioned records after release.
