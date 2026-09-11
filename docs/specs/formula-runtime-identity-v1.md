# Formula runtime identity compatibility v1

This application-boundary contract preserves existing artwork identifiers,
native rendering, parameters, and coloring while resolving Julia capability.
It does not introduce user-selectable implementation versions or migrate saved
documents. The immutable published activation set is not widened.

- Published plugins carry `sourceRevision` separately from `cacheFingerprint`.
  Source qualification must never use, parse, or strip a rendering cache key.
- Legacy native execution is retained. `native-rendering-bindings.v1.json`
  binds each reviewed runtime ID to its published identity and exact execution
  fingerprint. Both a matching implementation and current canonical activation
  are required. Historical `supportsJulia` flags do not grant capability.
- The fingerprint covers GLSL, initialization, uniforms, bailout, lifecycle,
  and smoothing semantics. Changed implementations fail closed until their
  compatibility checks and binding are reviewed together. Names and shader
  cache keys are not execution semantics.
- Existing q1024 variants additionally require their exact refined fingerprint
  and published source revision. Their qualification does not authorize a new
  quantization scale or an arbitrary rendering override.
- The renderer receives the existing plugin and parameter values unchanged.
  Capability resolution is not a conversion from native uniforms to published
  descriptors and does not silently load a different Definition or Profile.
- Unknown, custom, unreviewed, and currently unsupported identities stay
  disabled. Persisted Julia intent and constants continue to round-trip.

Regression coverage must bind the alias directory, current activation, native
execution fingerprints, q1024 fingerprints, unchanged persistence, cache/source
invalidation, and mutation rejection. Browser checks exercise Julia edits and
reload through the production renderer; preset playback retains its existing
canonical loading path and frame-zero contract. Fingerprint equality is a
change-detection mechanism, not a mathematical proof of cross-device parity.
