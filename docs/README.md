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

## Test Plans

- [v0.4.13 Regression Matrix](testing/v0.4.13-regression-matrix.md) defines
  commit, slice, and release gates for the Formula Atlas and artwork release.
- [v0.4.15 Regression Matrix](testing/v0.4.15-regression-matrix.md) defines
  commit, pull request, and production enablement gates for the web creation
  loop release.

## Maintenance

- Specifications are living contracts. Update them in the same change that
  intentionally changes a governed boundary.
- ADRs record accepted decisions and should not be rewritten to describe a
  different decision. Add a superseding ADR instead.
- Release-specific test plans remain versioned records after release.
