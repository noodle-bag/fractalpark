# Fractal Document v2 and Envelope v1

- Status: Accepted
- Date: 2026-07-25
- Target release: FractalPark v0.4.12

## Purpose

Fractal Document v2 is the durable source of truth for an artwork. Runtime
`FractalParams` remains a renderer DTO and is not a persistence format.

Envelope v1 packages a v2 document with portable assets for browser storage
and `.fractal.json` files.

## Fractal Document v2

```ts
interface FractalDocumentV2 {
  schemaVersion: 2;
  scene: SceneState;
  formula: FormulaState;
  coloring: {
    pipelineVersion: 1 | 2;
    paletteIndex: number;
    customGradient: GradientStop[] | null;
    outsideColoringId: string;
    insideColoringId: string;
    orbitTrap: OrbitTrapConfig;
    lighting: LightingConfig;
    style?: {
      styleId: string;
      detail?: ColoringStyleDetailState;
      post?: ColorPostState;
    };
    params?: ColoringParamsState;
  };
  transform: TransformState;
  render: RenderState;
  animation?: {
    viewKeyframes?: Keyframe[];
    tracks?: AnimationTrack[];
  };
  assets?: {
    formula?: AssetReference;
    colorScript?: AssetReference;
    animationScript?: AssetReference;
  };
  metadata?: {
    name?: string;
    createdAt?: number;
    updatedAt?: number;
    source?: 'builtin' | 'saved' | 'imported' | 'remix';
    sourceId?: string;
  };
}
```

### Version rules

- `schemaVersion` is an integer and is always `2` for an editable current
  document.
- v1 documents migrate to v2 with `coloring.pipelineVersion = 1`.
- v1 `animation.keyframes` migrates to `animation.viewKeyframes`.
- `animation.tracks` reserves the container and stable target-ID boundary. It
  does not enable parameter animation in v0.4.12.
- `coloring.style.detail` and `coloring.style.post` accept only explicitly
  supported fields. Unknown fields are not copied into editable v2 documents.
- Normalization applies only to known current or older versions. It must never
  silently downgrade a future document.
- Runtime projections must preserve the visual semantics of v1 documents.

### Asset references

Built-in formulas require only their registry ID. A document can reference a
portable asset by ID and hash, while the source itself lives in the envelope.
Document asset references must resolve before an import can commit.

### Metadata

Metadata describes the artwork and its provenance. It must not affect
rendering. Readers may retain the legacy `shared` source value while migrating
old query URLs, but new v2 writers do not emit it.

## Envelope v1

```ts
interface FractalDocumentEnvelopeV1 {
  envelopeVersion: 1;
  document: FractalDocumentV2;
  assets?: {
    formulas?: PortableFormulaAsset[];
  };
}

interface PortableFormulaAsset {
  id: string;
  language: 'frm';
  name?: string;
  source: string;
  hash: string;
}
```

### File format

- Extension: `.fractal.json`
- Encoding: UTF-8
- MIME type: `application/json`
- Serialization: formatted, uncompressed JSON
- Filename: `fractalpark-{safe-name-or-timestamp}.fractal.json`
- Maximum input size: 1 MiB
- Maximum individual FRM source size: 256 KiB
- Hash: SHA-256 of the exact UTF-8 source

### Transactional import

The required sequence is:

```text
parse -> validate -> migrate -> validate assets -> compile -> prepare -> commit
```

No call that replaces the current Explore document or mutates the custom
formula library may occur before every preceding step succeeds.

### Formula asset conflicts

- Same ID and same hash: reuse the local asset.
- Same ID and different hash: derive `custom-imported-{hashPrefix}`.
- Check the built-in registry and local custom IDs before assigning the ID.
- Extend the hash prefix until the generated ID is unique.
- A hash mismatch or compile failure rejects the entire import.

## Reader contract

```ts
type DocumentReadResult =
  | {
      mode: 'editable';
      document: FractalDocumentV2;
      migratedFrom?: number;
    }
  | {
      mode: 'readonly-future';
      document: FractalDocumentV2;
      sourceVersion: number;
      original: unknown;
      warnings: string[];
    }
  | {
      mode: 'invalid';
      errors: DocumentReadError[];
    };
```

A future document may be projected through known fields for preview, but all
write entry points must reject `readonly-future`. The raw input remains
available for lossless re-download. Converting it into an editable current
copy requires an explicit user action that warns about unknown-field loss.

## Cloud write profile

v0.4.15 keeps this schema unchanged and adds a server-side validation
profile, `CloudArtworkEnvelopeV1`, for cloud drafts and publications. The
profile reuses the readers and the 1 MiB limit defined here, adds runtime
allowlists, budgets, canonical-byte accounting, and server-verified
provenance, and rejects future read-only or uncanonicalizable input for
cloud writes. Local reads and imports keep the behavior defined in this
document. The profile and its rejection semantics are frozen in
[Web Creation Loop v1](web-creation-loop-v1.md).

## Deferred work

v0.4.12 does not define a link codec, compressed or fragment URLs, checksums,
short links, cloud sync, Smart PNG, modern Coloring UI/shaders, automatic
drafts, or parameter-animation behavior. Legacy query URLs remain readable but
do not gain Document v2 fields. v0.4.15 defines the cloud lifecycle of
Envelope v1 in [Web Creation Loop v1](web-creation-loop-v1.md) without
changing this schema.
