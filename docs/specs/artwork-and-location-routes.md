# Artwork and Location Route Contract

- Status: Accepted
- Date: 2026-07-26
- Target release: FractalPark v0.4.13
- Scope: Published artwork, Gallery, local artwork, and future named locations

## Purpose

This specification freezes the identity, route, projection, and presentation
contracts for FractalPark's 26 published presets. It also reserves the
separate named-location route family without making locations a v0.4.13
release requirement.

Published artwork and device-local artwork remain different read models.
They may share presentation components, but they do not share persistence,
public routing, or management permissions.

## Authoritative Sources

| Fact | Owner |
|---|---|
| Preset ID, source order, localized title, render query, animation input, and image path | `public/gallery-presets.json` |
| Public artwork slug and related artwork | `ArtworkContentManifest` |
| Canonical render state | `buildCanonicalPresetDocument` |
| Local artwork records and compatibility reads | `ArtworkRepository` |
| Published creator and image license | Collection-level constants |
| Localized artwork summary and visual note | locale messages |

The content manifest must not repeat preset title, formula, state query,
thumbnail path, order, creator, or license.

## Artwork Content Model

`src/content/artwork-manifest.ts` will expose:

```ts
interface ArtworkContentEntry {
  presetId: string;
  slug: string;
  relatedPresetIds: string[];
}
```

The manifest contains exactly one entry for every preset and no additional
entry. Display content follows these message keys:

```text
artworks.entries.<presetId>.summary
artworks.entries.<presetId>.visualNote
```

English and Chinese values are required and non-empty. Formula identity,
palette, view, and other state summaries are derived from the canonical
preset Document.

## Frozen Published Artwork Set

The following mapping is permanent once released. Slugs are manually
reviewed, begin with the owning formula's public slug, and remove redundant
formula words from the artwork-title suffix.

| # | Preset ID | Formula ID | Canonical artwork slug |
|---:|---|---|---|
| 1 | `preset-newton-deep-spiral` | `newton3` | `newton-3-deep-spiral` |
| 2 | `preset-lambda-julia-vortex` | `lambda` | `lambda-vortex` |
| 3 | `preset-spider-julia-abyss` | `spider` | `spider-abyss` |
| 4 | `preset-buffalo-julia-eclipse` | `buffalo` | `buffalo-eclipse` |
| 5 | `preset-mandelbrot-deep-escape` | `mandelbrot` | `mandelbrot-deep-escape` |
| 6 | `preset-mandelbrot-crown` | `mandelbrot` | `mandelbrot-crown` |
| 7 | `preset-buffalo-julia-spiral-gate` | `buffalo` | `buffalo-crest` |
| 8 | `preset-lambda-julia-ice-veil` | `lambda` | `lambda-frost-bloom` |
| 9 | `preset-magnet-julia-ember-reach` | `magnet1` | `magnet-type-1-copper-spores` |
| 10 | `preset-julia-aqua-compass` | `mandelbrot` | `mandelbrot-porcelain-lattice` |
| 11 | `preset-mcmullen-azure-whorl` | `mcMullen23` | `mcmullen-2-3-azure-whorl` |
| 12 | `preset-inverted-lambda-obsidian-knot` | `invertedLambda` | `inverted-lambda-midnight-faultline` |
| 13 | `preset-circle-inversion-citrine-spine` | `circleInversion` | `circle-inversion-citrine-spine` |
| 14 | `preset-rational-map-sapphire-fan` | `rationalMap1` | `rational-map-1-sapphire-fan` |
| 15 | `preset-perpendicular-celtic-porcelain-halo` | `perpendicularCeltic` | `perpendicular-celtic-porcelain-halo` |
| 16 | `preset-burning-ship-cinder-rift` | `burningShip` | `burning-ship-cinder-rift` |
| 17 | `preset-magnet-julia-rust-cross` | `magnet2` | `magnet-type-2-rust-cross` |
| 18 | `preset-zaslavsky-penitent-mandala` | `zaslavskyMap` | `zaslavsky-map-penitent-mandala` |
| 19 | `preset-zubieta-kaleido-amber-mandala` | `zubieta` | `zubieta-amber-mandala` |
| 20 | `preset-airship-inversion-seafoam-wings` | `airship` | `airship-fluorescent-manta` |
| 21 | `preset-newton-cosh-ember-meridian` | `newtonCosh` | `newton-cosh-ember-meridian` |
| 22 | `preset-mandelbox-cobalt-bastion` | `mandelbox` | `mandelbox-cobalt-bastion` |
| 23 | `preset-cosh-mandelbrot-gilded-plumes` | `coshMandelb` | `cosh-mandelbrot-gilded-plumes` |
| 24 | `preset-quad-julia-ivory-filigree-seal` | `quadJulia` | `quartic-julia-ivory-filigree-seal` |
| 25 | `preset-magnet-julia-moonstone-reef` | `magnet2` | `magnet-type-2-moonstone-reef` |
| 26 | `preset-phoenix-multi-ember-compass` | `phoenixMulti` | `multi-phoenix-ember-compass` |

The row number is the current `gallery-presets.json` source order. The
manifest does not store an `order` field. A later curated reorder edits the
preset file and receives explicit snapshot review.

## Published Artwork Projection

A published artwork is a read projection, not a persistence object:

```text
GalleryPresetConfig
  + canonical preset FractalDocument
  + ArtworkContentEntry
  + localized messages
  + collection creator/license constants
  = PublishedArtwork
```

The projection exposes the preset ID, canonical slug, localized title,
localized editorial content, image path, related preset IDs, creator,
license, and normalized Document. Exact TypeScript field names may follow
nearby conventions, but there is one join and one validation path.

### Canonical preset Document

`buildCanonicalPresetDocument(config)` is the only boundary that parses the
legacy preset query.

- Input is a validated `GalleryPresetConfig`.
- Output is a normalized `FractalDocument` containing the current view,
  formula, coloring, transform, render state, and explicit view keyframes.
- A malformed or unresolved preset fails validation; consumers do not invent
  fallback content.
- Homepage, Collection, artwork pages, playback, Remix, analytics context,
  and image generation consume this Document or the published projection.
- The current preset view is the static composition. Keyframes affect
  playback only and never replace the thumbnail, Hero, poster, or Remix
  starting state.

Direct preset-query parsing in page components or image scripts is
prohibited.

## Public Route Contract

| Incoming route | v0.4.13 behavior |
|---|---|
| `/[locale]/gallery` | Canonical, indexable FractalPark Collection |
| `/[locale]/gallery?view=mine` | Client-selected My Works view; canonical remains the query-free Gallery |
| `/[locale]/gallery/[canonical-slug]` | Canonical, indexable artwork page |
| `/[locale]/gallery/[presetId]` | Permanent redirect to the same-locale canonical artwork slug |
| `/gallery/[presetId]` | Permanent redirect to `/en/gallery/[canonical-slug]` |
| unknown preset ID or artwork slug | Not found; never redirect to Explore or a different artwork |

The two locales share the same ASCII slug. A title correction does not change
the published URL. Old Explore deep links remain valid and are outside this
redirect migration.

Canonical artwork routes enter the sitemap with localized alternates and
`x-default`. The Gallery index emits server-rendered links to all 26 pages.
Device-local content and `?view=mine` never enter sitemap, metadata,
structured data, or server-rendered user content.

## Artwork Page Contract

Every published artwork page provides:

1. breadcrumb, localized title, summary, and a 16:10 animated Hero with a
   static poster fallback;
2. visible creator credit and image license;
3. optional single-artwork playback and fullscreen viewing;
4. formula and state summary derived from the canonical Document;
5. a link to the owning formula guide when one exists;
6. localized visual note;
7. a normal-link Remix action;
8. Copy page link;
9. at least two configured related artworks.

The static page, poster, metadata, and Remix link do not depend on WebGL or
client JavaScript. Playback is a lazy client enhancement. Its failure cannot
remove the Hero fallback, text, formula link, or Remix action.

### Playback

- The Hero lazy-loads an animated canvas after hydration and automatically
  loops only the current artwork over its static poster fallback.
- View Fullscreen opens the same artwork and starts fullscreen playback
  automatically. There is no separate Play action on the page.
- Controls reuse the homepage's restrained circular, translucent visual
  language.
- Fullscreen artwork playback exposes Pause/Resume and Minimize/Exit, not Previous/Next,
  progress, speed, editing, or automatic artwork changes.
- Background click and Escape close the fullscreen presentation.

## Creator and License

All 26 published works use the collection creator constant `FractalPark`.
Pages visibly render `Created by FractalPark` or its localized equivalent.

The fractal render and its thumbnail, Hero, and size variants use
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Recommended credit
is:

```text
<Artwork title> — FractalPark — CC BY 4.0
```

The license covers the fractal image layer only. It does not relicense source
code, prose, UI, the FractalPark logo, or trademarks. Code remains under the
repository's MIT license.

Artwork `ImageObject` structured data must match visible content:

- `creator` is an `Organization` named `FractalPark`;
- `creditText` is `FractalPark`;
- `license` is `https://creativecommons.org/licenses/by/4.0/`;
- `contentUrl` is crawlable;
- branded composites state that CC BY covers only the fractal artwork layer.

## Gallery Information Architecture

`/[locale]/gallery` has two explicit views:

### FractalPark Collection

- Default and server-rendered.
- Contains all 26 official works in preset source order.
- Official cards navigate only to canonical artwork pages.
- No Featured or Built-in badge, star action, management menu, or Gallery
  fullscreen. On hover-capable pointers, an animated preset lazy-loads WebGL
  only for the hovered card; static presets and all fallback states keep the
  published image.
- The `featured` field and legacy star data may remain temporarily for
  compatibility but cannot affect order or rendering.

### My Works

- Reads only from `ArtworkRepository`.
- Clearly states that works are stored on the current device.
- Keeps restore, rename, and delete behavior outside the primary card link.
- Provides a stable Create in Explorer action and a useful empty state.
- Does not insert published presets into the local repository.
- Preserves legacy and Envelope-backed local artwork through existing
  compatibility readers.

The two views may share a card component only through explicit published and
local view models. A universal persistence-shaped card model is prohibited.

## Gallery Layout and Card Presentation

The artwork grid uses available viewport width with 16, 24, and 32 pixel
responsive page gutters and 16 to 20 pixel gaps.

| Available width | Columns |
|---|---:|
| below 640 px | 1 |
| 640-1023 px | 2 |
| 1024 px and above | 3 |

The last row never stretches individual cards. Official images use native
16:10 containers. Legacy local images use a neutral background and
`object-contain` instead of destructive cropping.

Cards are image-led and visually restrained:

- rounded image, one-pixel neutral boundary, and light shadow;
- 14-16 pixel medium-weight title;
- 12-14 pixel regular muted formula name;
- no thick frame, colored glow, full white panel, bold italic metadata, or
  heavy overlay;
- hover lift of at most two pixels, image scale no greater than 1.015, and a
  subtle shadow change;
- animated presets play only while their card is hovered and release their
  renderer when the pointer leaves;
- explicit focus-visible treatment and no simulated touch hover.

Published static images are true 16:10 renders of at least 1920 by 1200
pixels with a consistent high-resolution antialiasing method. Four
representative works validate the rule once; the remaining homogeneous set
is generated in bulk.

## Local Artwork Projection and Compatibility

`LocalArtwork` is derived from `ArtworkRepository` and preserves:

- stable local ID and display name;
- normalized Document;
- compatible legacy or Envelope-backed storage format;
- local thumbnail and update time when available;
- rename and delete permissions;
- typed read, write, storage, and migration failures.

`SavedFractal` remains a temporary compatibility shape. It is not the source
for published artwork, route identity, or new persistence behavior.

Compatibility migration follows:

```text
add PublishedArtwork and LocalArtwork projections
  -> migrate Collection
  -> migrate My Works
  -> migrate artwork pages, playback, Remix, and image generation
  -> remove an obsolete adapter only after no consumer and no fixture needs it
```

## Named Location Boundary

Named locations are P1 and do not block v0.4.13. Their future public namespace
is reserved as:

```text
/[locale]/locations/[slug]
```

A location identifies a named view within a formula; it is not an artwork,
Gallery preset, or formula guide. A future `LocationContentManifest` may own
its public slug, formula reference, canonical Document reference, editorial
content, and citations. Until that contract is accepted:

- no location routes are generated;
- no location pages enter the sitemap;
- no artwork slug or preset ID is treated as a location;
- the 21 formula and 26 artwork release counts exclude locations.

## Validation

Build-time tests must prove:

- artwork entries and preset IDs form an exact 26-item one-to-one set;
- preset IDs and artwork slugs are unique;
- slugs match `^[a-z0-9-]+$`, begin with the owning formula slug, and contain
  a non-empty artwork suffix;
- every related preset exists, is not self-referential, and each entry has at
  least two relations;
- English and Chinese content keys exist and are non-empty;
- source order is preserved by Collection and sitemap ItemList projections;
- every canonical Document is deterministic and survives its supported URL
  round trip;
- homepage, artwork, playback, Remix, and image inputs agree on preset
  identity and canonical state;
- every image path exists and generated dimensions meet the active asset
  contract;
- canonical routes, legacy redirects, unknown values, locale alternates,
  visible credit, license metadata, and structured data follow this
  specification.
