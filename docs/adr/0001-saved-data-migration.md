# ADR 0001: Migrate Saved Artwork with Dual Read and Single Write

- Status: Accepted
- Date: 2026-07-25
- Target release: FractalPark v0.4.12

## Context

Saved artwork currently lives under `myfrac-saved-fractals` as
`SavedFractal`, with a flattened `FractalParams` payload. Rewriting that key in
place would make rollback unsafe and could damage data that older deployments
still understand.

## Decision

Introduce an `ArtworkRepository` with these storage boundaries:

```text
read legacy:  myfrac-saved-fractals
read current: fractalpark-artworks-v1
write current Envelope v1 only
project both formats to a shared GalleryItem read model
```

- Never perform a background rewrite of the legacy key.
- Explicitly saving a legacy artwork creates a new Envelope item and retains
  the legacy item.
- Sort mixed items by starred status first, then by
  `updatedAt ?? createdAt` descending.
- Keep `myfrac-starred-builtins` unchanged.
- Return typed errors for quota, serialization, validation, and missing
  assets. A failed save must not produce success UI.
- Treat `SavedFractal` as a legacy read model after the new writer is enabled.

## Consequences

This adds an adapter and requires deduplication decisions in the Gallery, but
it separates rollback domains. The new writer can be disabled without
removing the tolerant reader or changing legacy data.

## Rejected alternative

Storing legacy and Envelope records in the same key was rejected because a
mixed array is harder for old code to read safely and makes rollback depend on
in-place migration correctness.
