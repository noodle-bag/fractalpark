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

## Explicit coordinate parameters

`coordinate-parameter-execution.v1.json` binds the explicitly enumerated
application extensions to exact baseline source/semantic hashes and
new executable source/semantic hashes. It is not a promotion of historical
Julia candidate assets, and does not rewrite the frozen activation census.
The shared application library compiles the new source with the unchanged
compiler, verifies that all original parameter descriptors are preserved,
and appends only these parameters:

- `pixelSource`: 0 (default) follows the canvas coordinate; exactly 1 selects
  the fixed parameter. Other in-domain real values also follow the canvas.
- `pixelConstant`: the fixed complex coordinate, retained when following the
  canvas, but not used in that mode. It has no UI-imposed hard range.

Only the recurrence coefficient's coordinate is selectable. The initial
state remains the original canvas-dependent initial state, including historical
state such as `u` or `cclassic`; original numeric and function parameters remain independent.
Immutable coefficients are evaluated using the selected coordinate. Aliases
shared by coefficients and initial states are separated using their original
source-order expressions, not a global replacement of `pixel`. The default
branch preserves the original initialization and arithmetic evaluation order.
Zero multipliers may legitimately mask coordinate changes; their defaults are
not altered to manufacture a visible response. Existing division/log guards
and singularities are retained, not replaced by new numeric policies.
The controls belong to Formula Parameters. The formerly inert Julia
switches are not exposed or executed by the application; existing saved Julia
intent/constants still round-trip and are never silently mapped to the new
parameters. Other formulas and native implementations are unchanged.

The application descriptor's identity hashes remain those of the baseline
catalog entry; its appended parameters describe the explicit runtime extension.
The plugin carries a separate `executionSourceRevision`, and its cache key
uses that actual source revision. Only a successfully compiled immutable
projection may bind this cache/source pair. Raw source viewing and authoring
continue to expose the original Definition, not the application extension.
No new formula ID, persistence schema, or user-selectable implementation version
is introduced. New parameter values use the existing formula parameter record.

Regression coverage compares original and extended canvas-mode trajectories,
fixed-coordinate sensitivity, independent initial points and original
parameters, source/cache rejection, URL/Document restoration, and production
WebGL canvas/tiled-export output. Sampled equality is not a guarantee over all
function combinations or devices. This extension does not qualify any
formula as classical Julia over its full function-parameter domain.

Fixed-map transition checks normalize the complete mutable orbit state, not
only `z`. WebGL verification also observes final orbit state through test-only
coloring plugins: identical palette colors do not imply identical trajectories.

## Fixed-seed formulas

`fixed-seed-execution.v1.json` reviews a separate, exact-source set whose
original initial point is constant. Simply fixing the recurrence coordinate
would make every pixel follow the same orbit. Their ordinary branch preserves
the original initialization, parameters, arithmetic, guards and exit condition.
Only explicit selection of the reviewed mode changes the initial point to the
canvas coordinate. Dependent initial state is evaluated after that assignment
(for example, `fractalfenderca` recomputes `x` from the selected initial `z`).

- `mode: julia` is reserved here for the eight reviewed complex-polynomial
  recurrence families. It uses the existing Julia intent/constant, with
  `ismand` derived by the existing renderer, not a second writable mode flag.
  The selected constant replaces the coefficient coordinate before any original
  coefficient transform (`sin`, `transform`, or the cardioid mapping).
  No ordinary parameter is overwritten and no coordinate parameters are added.
- `mode: dynamical` uses the existing explicit coordinate-parameter controls,
  labeled **Dynamical plane (fixed parameter)** under Formula Parameters.
  The seven non-classical or conservatively classified cases do not expose a
  Julia switch. `ikenagaabs` retains its special exit predicate and is not
  advertised as a classical escape-time Julia image. Original Julia fields
  still round-trip but do not activate this parameter mode.

The eight Julia families retain their original escape tests and numeric guards;
this is not a proof that every constant gives a nondegenerate polynomial or
that the original escape radius is a certified bound for every parameter.
An old saved Julia intent for these eight now activates the repaired Julia
execution and may change its image; ordinary saved artwork is unchanged.
For `fractalfenderca`, the original initial-value parameter remains stored and
is effective in ordinary mode; the explicitly selected dynamical plane uses
the canvas initial point instead. Returning restores its original meaning.

Regression coverage pins both branches, compares the ordinary trajectory to
the original source and the selected mode to an independently seeded original
orbit, exercises coefficient/seed sensitivity and every individual function
option, and verifies capability, project round-trips, WebGL and UI restoration.
The frozen activation census and language/compiler contracts are unchanged.
