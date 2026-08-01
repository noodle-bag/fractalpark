# ADR 0004: Carry Remix Provenance Outside the Legacy URL Codec

- Status: Accepted
- Date: 2026-07-26
- Target release: FractalPark v0.4.13

## Context

Formula guides and published artwork pages need to open an exact editable
state in Explore. When a user later saves or downloads that state,
FractalPark also needs to distinguish a formula-derived Remix from a
preset-derived Remix.

The existing Explore query is a rendering-state protocol. Adding editorial
source fields to `FractalUrlState`, `decodeParams`, or `encodeParams` would
couple provenance to a legacy codec and create compatibility risk. Formula
IDs and preset IDs can also overlap, so an unqualified `sourceId` is
ambiguous.

`FractalDocumentMetadata` already supports `source: 'remix'` and a string
`sourceId`. v0.4.13 does not require Document schema v3.

## Decision

Use a one-time navigation parameter outside the rendering-state codec:

```text
remix=formula:<formulaId>
remix=preset:<presetId>
```

On the first Explore load, a dedicated helper validates this parameter
against the formula catalog or published preset source. A valid value is
written to the normalized Document as:

```ts
metadata: {
  source: 'remix',
  sourceId: 'formula:<formulaId>' | 'preset:<presetId>'
}
```

The type namespace remains part of `sourceId`. It is not split or discarded.

### Link construction

- Formula pages build state with
  `documentToExploreHref(buildFormulaDefaultDocument(formulaId), locale)`.
- Artwork pages build state with
  `builtinPresetConfigToExploreHref(preset, locale)`.
- A shared helper appends exactly one `remix` parameter after the state href
  is constructed.
- The Remix parameter never substitutes for, repairs, or overrides rendering
  state.

### Validation

The parser accepts exactly one decoded value with one of the two known
prefixes.

- Formula IDs must resolve in the built-in formula catalog.
- Preset IDs must resolve in `gallery-presets.json`.
- Empty IDs, unknown prefixes, unknown IDs, repeated parameters, control
  characters, and decoded values longer than 128 characters are invalid.
- Invalid values are ignored for compatibility and must not prevent the
  rendering state from loading.

The helper returns a typed result or `null`; page components do not parse the
string independently.

### Consumption

Explore decodes and normalizes the render state first, then applies valid
Remix metadata. The navigation parameter is consumed once.

The first canonical URL synchronization omits `remix` because the parameter
is not part of `FractalUrlState`. This prevents a temporary attribution
intent from being replayed on later URL-only visits.

If another explicit load action replaces the Document before consumption,
provenance follows the Document actually created by the Remix action, not an
unrelated previous Document.

### Persistence

Saving artwork or downloading a project preserves normalized Document
metadata in Envelope v1. Import, migration, and local artwork reads retain
the namespaced `sourceId`.

The legacy Explore query does not serialize metadata. Copying the mutable
Explore URL therefore shares render state but does not claim durable Remix
provenance. Durable provenance is carried by saved artwork and project files.

Gallery does not display provenance in v0.4.13. A later UI may read the
metadata but cannot reinterpret or rewrite historical values without a new
decision.

### Analytics

`start_remix` records the initiating click with separate `source_type` and
`source_id` properties. Analytics is not the source of persisted provenance,
and metadata is not reconstructed from analytics.

## Consequences

- Existing query and Document schemas remain unchanged.
- Old readers ignore the unknown navigation parameter and continue restoring
  rendering state.
- Formula and preset IDs remain unambiguous in persisted metadata.
- Remix intent disappears from the address bar after Explore canonicalizes
  state, while saved or exported Documents retain attribution.
- Content routes, state builders, provenance parsing, and analytics have
  separate responsibilities and can be tested independently.

## Rejected Alternatives

### Add `remix` to the legacy state codec

This would make editorial provenance a rendering parameter and extend a
compatibility-sensitive protocol for no rendering benefit.

### Store an unqualified source ID

Formula and preset namespaces can collide. The source type would be lost when
the Document is persisted.

### Encode full source-page URLs

Localized slugs and route structures can change independently of stable
formula and preset identities. Full URLs also add unnecessary user-controlled
data to persisted metadata.

### Infer provenance from render state

Different origins may produce the same Document, and edited state quickly
diverges. Provenance is an explicit user navigation intent, not a state
fingerprint.

## Required Tests

- both source types parse and write exact namespaced metadata;
- unknown, empty, repeated, malformed, and overlong values are ignored;
- a valid parameter cannot alter the decoded rendering state;
- canonical URL synchronization removes only the navigation parameter;
- formula and preset Remix links restore their canonical Documents;
- saved artwork and project round trips retain `source` and `sourceId`;
- legacy URLs and Documents without Remix metadata remain unchanged;
- one initiating click emits one `start_remix` event.

## Amendment (v0.4.15): Publication Source Type

The namespaced provenance model defined here extends to a third source
type, `publication:<publicationId>`, for remixes of community-published
works. This amendment supersedes three body statements: the parser accepts
one of three known prefixes; validation resolves `publication` IDs against
the real published revision through the server; and the required tests
extend to all three source types. All other rules apply unchanged: the
namespace stays inside `sourceId`, values are immutable once written, and
frozen values are never rewritten. The cloud-side validation and provenance
semantics are frozen in
[Web Creation Loop v1](../specs/web-creation-loop-v1.md); session and trust
boundaries are decided in [ADR 0005](0005-same-origin-cloud-session.md).

Community Remix activations emit `community_remix_started` instead of
`start_remix`; the one-click-one-event rule moves to that event on the
community surface.
