# Fractal Content and Creation Model

- Status: Accepted
- Date: 2026-07-26
- Introduced in: FractalPark v0.4.13
- Scope: Cross-release architecture contract

## Purpose

FractalPark presents the same formulas and artwork through multiple surfaces:
the Drift playback page, Formula Atlas, Gallery, artwork pages, Explore, the
FRM Editor, generated thumbnails, and exported projects. These surfaces must
not create independent representations of the same rendering or authoring
state.

This specification defines one source of truth for each fact, a canonical
`FractalDocument` rendering boundary, and explicit read projections for each
surface. It complements
[Fractal Document v2 and Envelope v1](fractal-document-v2.md); it does not
replace or version the persistence schema.

## Architectural Rule

FractalPark uses **one canonical state model with multiple read projections**.
Unified modeling does not mean that published artwork, local artwork, formula
content, and editor records share one large interface. It means:

- each fact has one authoritative owner;
- state conversion happens in one named boundary;
- consumers receive derived read models instead of reparsing source data;
- persistence models are not reused as convenient UI models;
- compatibility adapters are temporary and have explicit removal conditions.

No page, component, screenshot script, or analytics helper may create a second
default formula state, preset state, ordering rule, or custom-formula store.

## Source-of-Truth Map

| Fact | Authoritative source | Derived consumers |
|---|---|---|
| Built-in formula identity, family, capabilities, and approved defaults | `src/engine/plugins/formula-catalog.ts` and the plugin registry | Explore, Formula Atlas, formula pages, canonical formula documents |
| Formula editorial content, public slug, references, and relationships | `FormulaContentManifest` plus locale messages | Formula Atlas and formula pages |
| Published preset identity, order, localized title, state query, animation input, and asset path | `public/gallery-presets.json` | Drift, Collection, artwork pages, playback, Remix, thumbnail generation |
| Published artwork editorial content, public slug, license metadata, and relationships | `ArtworkContentManifest` plus locale messages | Collection, artwork pages, sitemap, structured data |
| Durable render state | `FractalDocument` | Renderer, URL adapters, artwork storage, playback projections, exports |
| ~~Local saved artwork~~ (retired v0.4.16; superseded by cloud drafts) | — | — |
| Cloud private drafts | `artwork_drafts` (server, owner-scoped) | My Works Drafts, cloud save and reopen |
| Public community revisions | `artwork_publications` (server) | Community, public artwork pages, Remix |
| Cloud identity and session | Auth user record and sealed server session (ADR 0005) | Same-origin Auth API, owner-scoped RPC |
| Custom formula source and experience hint | `custom_formulas` cloud library + session registration (ADR 0006) | FRM Editor, Explore formula resolver, project import/export |
| FRM syntax and compatibility behavior | lexer, parser, validator, type system, code generator, and `compileFrm` tests | FRM Editor, FRM Guide, examples |

Content manifests may reference runtime entities by stable ID but must not
repeat their render state, ordering, formula capabilities, or localized names
when those facts already have an authoritative owner.

## Canonical State Boundaries

### Formula defaults

A single formula document builder derives an editable `FractalDocument` from
the approved formula catalog entry. Formula-page previews, thumbnail
generation, Remix links, and default-state tests consume this same result.

The builder must:

1. read formula identity and approved defaults from the catalog;
2. apply the shared Document defaults;
3. normalize the document;
4. produce a state that survives the supported URL encode/decode round trip.

Consumers must not patch the result with page-specific visual defaults.

### Published presets

A single preset document builder parses a validated
`GalleryPresetConfig.url` and produces the canonical `FractalDocument` for
that preset. Parsing a preset query directly in Drift, Gallery,
artwork page, playback component, or thumbnail script is prohibited.

A published artwork projection joins, by `presetId`:

```text
GalleryPresetConfig
  + canonical preset FractalDocument
  + ArtworkContentManifest entry
  + localized messages
  = PublishedArtwork
```

The exact TypeScript name may follow nearby conventions, but there must be
one implementation and one validation path.

The canonical static composition comes from the preset's current view.
Animation keyframes affect playback only. If a generated drift remains as a
fallback for presets without explicit keyframes, it must be produced by one
shared playback projection and must not modify the canonical document,
poster, thumbnail, or Remix state.

### Custom formulas

The FRM Editor and Explore use the same persisted custom-formula record,
compiler, plugin registration, cache invalidation, and experience-hint
handling. The Editor must not create a second storage key or a second compiler
pipeline.

A persisted formula is resolved from the owner-scoped cloud library (or from a
session/portable snapshot) before a document that references it is rendered.
Missing, invalid, or inaccessible formula IDs produce an explicit error and
must not silently resolve to a built-in formula or a browser-persisted store.

### Local artwork

`ArtworkRepository` owns local artwork persistence and compatibility reads.
My Works consumes its read projection. Published presets are not inserted into
the local repository, and local artwork is not treated as public,
server-rendered content.

`SavedFractal` remains a legacy/runtime compatibility shape where required; it
is not the canonical model for new published preset or persistence work.

## Surface Contracts

### Explore landing

- Explore is the default landing and the canonical product entity page; the
  legacy locale roots respond with an explicit HTTP 301 to it.
- Product metadata, Open Graph, and the shared `SoftwareApplication` JSON-LD
  are owned by Explore; facts come from the public-project content contract.
- Visible, bilingual SSR product content follows the workspace; a fixed-size
  static poster precedes WebGL progressive enhancement. Crawler-only hidden
  copy is prohibited.

### Drift playback

- Drift hosts the immersive published-preset slideshow migrated from the
  legacy homepage; it is `noindex, follow` and excluded from the sitemap.
- Uses the shared published-preset projection and playback controller.
- May choose a presentation order without changing Collection order.
- Does not parse preset URLs or manufacture a separate artwork record.
- Playback controls shared with artwork pages come from one component or one
  controller contract; Drift keeps only Play/Pause, Previous, and Next.

### Gallery and artwork playback

- Gallery cards retain their static published images for SSR, no-JavaScript,
  touch, non-animated presets, and WebGL failure. Hover-capable pointers may
  lazy-load only the currently hovered animated preset.
- Published artwork pages automatically play the current artwork after
  hydration, both inline and after View Fullscreen. The page has no separate
  Play action; fullscreen keeps Pause/Resume and Exit controls.
- Opening fullscreen replaces the inline renderer instead of keeping two
  WebGL contexts alive for the same artwork.

### Formula Atlas and formula pages

- Formula identity and defaults come from the catalog and canonical formula
  document builder.
- Editorial copy and references come from the content manifest and messages.
- Formula pages do not persist or duplicate renderer state.

### Gallery

- FractalPark Collection uses the published artwork projection and preserves
  `gallery-presets.json` order.
- My Works uses the local artwork repository projection.
- A shared card layout may accept separate published and local view models;
  it must not erase their different navigation and management permissions.

### Cloud creation surfaces

Cloud drafts and community publications extend this model without creating
new artwork facts. The durable render state stays `FractalDocument`; the
server tables own lifecycle, ownership, and permission metadata plus the
same Envelope v1 payload. Cloud boundaries, state machines, and the
permission matrix are frozen in
[Web Creation Loop v1](web-creation-loop-v1.md); session mechanics are
decided in [ADR 0005](../adr/0005-same-origin-cloud-session.md).

- My Works gains owner-only Drafts and Published views alongside the
  anonymous On this device view.
- Community consumes the published projection from `artwork_publications`
  only; private drafts and local artwork never become public content.
- Remix provenance keeps ADR 0004 namespaced semantics and gains a stable
  `publication` source type.

### Artwork pages

- Join published preset state with artwork content by stable `presetId`.
- Static image, poster, playback, Remix, and metadata reference the same
  published artwork projection.
- Fullscreen playback may add transient UI state but cannot mutate the
  canonical document.

### FRM Editor and Explore

- Share editor/compiler primitives, custom-formula persistence, and formula
  resolution.
- Editor-to-Explore handoff passes an owner-scoped cloud formula identity, not
  source text in a URL. Explore may rescue a fresh-tab handoff through the
  owner detail API; a disabled/unavailable cloud fails closed.
- Explore remains the full creation surface; the Editor owns source authoring,
  diagnostics, compile preview, and formula defaults.

## Persistence and Compatibility

- `FractalDocument` and Envelope changes continue to follow
  `fractal-document-v2.md`.
- v0.4.13 does not require Document schema v3 or a new URL codec.
- Existing URL, local artwork, and custom-formula readers remain compatible
  while consumers migrate to the shared projections.
- Model migration follows add-adapter, migrate-consumer, remove-legacy-adapter
  order. A commit must not require a later commit to restore a working UI.
- No background destructive rewrite of browser storage is allowed.

## Change Rules

A change to a governed boundary must update, in the same logical change:

1. this specification when the contract changes;
2. the relevant ADR when a new architectural decision supersedes an old one;
3. constructors, adapters, or resolvers;
4. compatibility fixtures and contract tests;
5. affected surface tests and the active release regression matrix.

Before implementation, a P0 scope change must identify impact on:

- authoritative sources and duplicated fields;
- Document and URL compatibility;
- local storage and imported files;
- SSR, metadata, sitemap, and canonical routes;
- Drift, Gallery, artwork, Explore, and Editor consumers;
- generated assets and visual baselines.

## Required Contract Tests

At minimum, automated tests must prove:

- formula and preset builders are deterministic;
- Document-to-URL round trips preserve supported fields;
- all manifest references resolve to authoritative records;
- every published preset has one content entry and one canonical document;
- Collection order equals preset source order;
- Drift, artwork-page, Remix, and thumbnail projections identify the same
  preset and canonical state;
- Editor and Explore resolve the same persisted custom formula;
- legacy artwork, Document v1/v2, future read-only documents, legacy URLs, and
  missing/inaccessible formula IDs retain their documented behavior.

Release-specific coverage and execution gates are defined in the active test
plan: [v0.4.15 Regression Matrix](../testing/v0.4.15-regression-matrix.md),
succeeding
[v0.4.13 Regression Matrix](../testing/v0.4.13-regression-matrix.md).

## Custom Formula Persistence (v0.4.16)

With ADR 0006 the source-of-truth map gains one row: **My Formulas** is owned
by the cloud `custom_formulas` table (owner-scoped, revisioned). The browser
holds only session-scoped caches and in-memory registrations; no browser
storage is a persistence fact. Surfaces consume formulas through two named
boundaries:

- **Library boundary** — owner list (summary) / detail reads and
  revision-checked writes through the same-origin formula API.
- **Snapshot boundary** — an artwork envelope embeds the referenced formula
  source/hash at save time; draft rendering compiles the embedded asset and
  is immune to later library changes. Publication freezes the same snapshot
  publicly under the MIT license (scope `formula_source`), independent of
  the image layer's CC BY 4.0.

No surface may reintroduce a browser-persisted formula store or a second
compile/registry path for persisted formulas.
