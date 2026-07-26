# ADR 0003: Use One Canonical State Model with Surface Read Projections

- Status: Accepted
- Date: 2026-07-26
- Target release: FractalPark v0.4.13

## Context

FractalPark already has a durable `FractalDocument`, but several older UI
paths still use convenience shapes and repeated conversions. Published
presets can be parsed into runtime parameters, converted to `SavedFractal`,
and then migrated back into a Document. The homepage, Gallery, artwork pages,
thumbnail scripts, and Remix links risk interpreting the same preset
independently.

v0.4.13 adds Formula Atlas, 21 formula pages, 26 artwork pages, a redesigned
Gallery, and a standalone FRM Editor. Allowing each surface to introduce its
own state or persistence model would make later feature work and compatibility
maintenance increasingly unsafe.

## Decision

Adopt the
[Fractal Content and Creation Model](../specs/fractal-content-and-creation-model.md)
as a cross-release architecture contract.

- `FractalDocument` is the canonical rendering-state boundary.
- Built-in formula facts remain in the catalog and plugin registry.
- Published preset facts remain in `gallery-presets.json`.
- Formula and artwork manifests own editorial and routing content only.
- Local artwork remains in `ArtworkRepository`.
- Local custom formulas have one storage, compile, and resolution pipeline
  shared by the FRM Editor and Explore.
- Formula and preset builders produce canonical Documents once.
- Homepage, Gallery, content pages, playback, Remix, and asset generation
  consume explicit read projections from those builders.

The migration strategy is additive:

```text
add canonical builder/projection
  -> migrate one consumer with tests
  -> keep compatibility readers
  -> remove obsolete adapter only after all consumers migrate
```

Each intermediate commit must remain buildable and usable.

## Consequences

- Some legacy adapters remain temporarily, but their role and removal
  condition become explicit.
- Published and local artwork may use different read models because their
  permissions and persistence differ.
- Page components become simpler and cannot silently redefine render state.
- Contract tests become mandatory when authoritative data or adapters change.
- A large shared interface is not required; normalization occurs at explicit
  boundaries instead.

## Rejected Alternatives

### Keep surface-specific models

This minimizes short-term edits but permits homepage, Gallery, artwork pages,
and generated assets to drift. It was rejected because v0.4.13 materially
increases the number of consumers.

### Use `SavedFractal` for every surface

`SavedFractal` mixes runtime, persistence, gallery, and UI concerns and is
already a legacy compatibility shape. Expanding it would make published
content depend on local-artwork semantics.

### Create one universal formula/artwork/editor interface

Published artwork, local artwork, formula editorial content, and FRM source
have different lifecycles and permissions. A universal interface would hide
those differences and accumulate optional fields rather than establish one
source of truth.

### Introduce Document v3 in v0.4.13

The release can unify constructors and projections without changing the
durable schema. A schema migration would add risk without solving the source
ownership problem.
