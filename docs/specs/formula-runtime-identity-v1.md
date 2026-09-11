# Formula runtime identity compatibility v1

Parameter ownership, input, and mode semantics are defined by
[Formula Parameters and Mode Semantics v1](formula-parameters-and-mode-semantics-v1.md).

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
- Reviewed rendering variants additionally require their exact refined fingerprint
  and published source revision. Their qualification does not authorize a new
  quantization scale or an arbitrary rendering override.
- The renderer receives the existing plugin and parameter values unchanged.
  Capability resolution is not a conversion from native uniforms to published
  descriptors and does not silently load a different Definition or Profile.
- Unknown, custom, unreviewed, and currently unsupported identities stay
  disabled. Persisted Julia intent and constants continue to round-trip.

Regression coverage must bind the alias directory, current activation, native
execution fingerprints, reviewed variant fingerprints, unchanged persistence, cache/source
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

## Rendering implementation change contract

### Reviewed application rendering exception

Mandelbox, coshMandelb, and zaslavskyMap remove only their explicit orbit-rounding
calls in application rendering. Their native initialization, approximations,
escape timing, smoothing, and coloring remain unchanged. Published Mandelbox
reads the real component of its published scale uniform; legacy native artwork
keeps its existing scalar uniform and ID. Native projections require the exact
`applicationNativeFingerprint`; published projections require the exact source,
native implementation, parameter interface, and `refinedFingerprint`.

Explore's existing resolver registers the reviewed native projection; its Worker
snapshot and export therefore use the same implementation. Published selection
and restoration use the existing shared adapter. Gallery hover, detail, and Drift
reuse it only after their existing canonical authority and Julia eligibility
checks. Unsupported playback remains unavailable. This is a numerical correction,
not a claim of equivalence to previously quantized pixels or canonical lifecycle.

Frozen Definitions, native source modules, generated images, CLI/raw-source
rendering and asset-generation inputs are not rewritten. Existing JPGs may differ
from corrected live output and require separate visual acceptance and asset
authorization. Other formulas retain their existing rendering policy. Regression
coverage compares both modes and keyframes through the actual playback resolver,
native Explore registration, and tiled renderer under equal sampling settings.

These requirements govern future rendering changes; they do not certify that
all existing recovered-formula paths comply. Identity qualification alone is
not rendering compatibility. Capability resolution remains separate from any
explicitly reviewed parameter adapter; it must not perform hidden conversion.

Newton Cosh has a separate exact-source application correction. Its reviewed
native implementation uses the shared built-in sinh/cosh functions instead of
the recovered polynomial approximations. Initial state, clamping, denominator
guard, convergence epsilon/timing, and iteration coloring remain unchanged.
The correction is shared by native/published Explore and published-artwork
playback; it does not qualify Julia or change frozen Definitions, native modules,
presets or assets. Same-input historical comparisons must isolate math from
antialiasing and convergence before accepting further numeric changes.

### R1. Classify the change

Before replacing a plugin, review its initialization, complete mutable state,
uniform names/types/defaults, iteration order, numeric guards, quantization,
approximate functions, bailout/event timing, smoothing, and shader cache keys.
Changing orbit rounding is a numerical change even if described as higher
quality. Keeping source identity unchanged does not establish equivalence.
New execution fingerprints require corresponding compatibility review; do not
rewrite sealed source or evidence bytes to make a changed implementation pass.

### R2. Follow all consumers

Review Explore selection and restoration, Gallery hover, artwork detail playback,
Drift, formula previews, Worker rendering, export, and asset generation. For each
affected path, establish the execution revision, effective parameters, mode,
numeric policy, and fallback behavior. Record unaffected paths with a reason.
No second resolver architecture is required: use named existing boundaries and
shared adapters where appropriate. Equivalent inputs must not silently select
different mathematics because they enter through different pages.

Resolution, DPR, antialiasing, and display treatment can differ intentionally;
state those differences when comparing images. Gallery retaining a static image
on unavailable Julia playback is not permission to render another plane instead.

### R3. Prove interface behavior before visual improvement

Test the real descriptor-to-selected-plugin mapping, including explicit
name/type conversion and current/default values. Use a nondegenerate Mandelbox
scale witness and a Julia constant witness; assert delivered uniform values and
resulting computation. Exercise save/reload, mode exit, legacy native input,
canonical input, and unknown/stale rejection. A cache-key or GLSL-string test
alone cannot establish that a user's parameter edit reaches rendering.

### R4. Numerical and visual evidence

Freeze source/execution revisions, viewport, backing dimensions, DPR, camera,
parameters, Julia constant, iterations, bailout, coloring, transforms, frame time,
browser/GPU, and sampling settings. Change one suspected cause at a time:
quantization, math approximation, termination policy, then sampling/display.
Compare default and deep-zoom compositions and animation times
`0`, `0.25`, `0.5`, `0.75`, and `1`. Preview must match frame zero under matching
render settings. Inspect orbit/terminal evidence as well as color output.

Animation endpoints retain the stored camera values, including negative rotation,
rather than applying angle normalization or logarithmic round-trips. Equivalent
angles can produce different GPU pixels. The existing minimum-zoom guard remains;
interior interpolation and timeline durations are unchanged.

Use deterministic same-environment baselines, explicit justified tolerances,
unaffected formula controls, and visual review. Neither cross-GPU pixel equality
nor an arbitrary blur/noise threshold is a universal correctness criterion.
Record latency and mobile responsiveness so image improvement cannot silently
remove usability. A default-view pass does not certify deep zoom or all devices.

### R5. Compatibility and enforcement limits

List affected presets and ordinary/Julia saved-artwork behavior before choosing
a numerical policy. Do not silently rewrite their parameters, composition,
keyframes, or static assets. Asset regeneration and identity/schema migration
require separate approval. Neither q1024 nor removal of rounding is pre-approved
by this contract. Any approved exception must identify its scope, rationale,
evidence, and compatibility consequences rather than use a global waiver.

`src/test/recovered-quantization-rendering-v1.test.ts` checks adapter/cache
behavior, the published interfaces of all thirteen refined formulas, and
Mandelbox mismatch rejection. `tests/e2e/recovered-parameters.spec.ts` checks
Mandelbox uniform delivery, unquantized-native equivalence, parameter/Julia sensitivity,
Worker editing, reload, mode exit, and tiled export. This is not the full
numerical/interface contract above.
`src/test/published-artwork-runtime.test.ts` is a playback-boundary starting point,
not proof of equivalent recovered-formula output across every surface. Required
regressions must first expose the faulty baseline, then pass the repaired path.
The interface audit, fixed-frame comparisons, and reviewed numerical policy
remain implementation work; this documentation does not install a new CI gate.

### Reviewed Mandelbox parameter adapter

The published Mandelbox adapter reads the existing real parameter as
`frmV1_mandelboxScale.x` from the compiler's `vec2(value, 0)` representation.
It retains native fold arithmetic, bailout, and lifecycle; native-ID artwork
continues to read `u_mandelboxScale` as a float. The adapter requires the exact
reviewed native implementation, published source revision, and parameter interface.
Its cache revision includes `parameters-v1`, and its exact refined fingerprint
is bound separately from the unchanged native fingerprint. This repairs the
previously ignored published edit; saved nondefault published values can now
change the rendered image.

### Reviewed Mandelbox orbit-rounding exception

Only the exact Mandelbox native-derived Explore adapter removes the final
orbit-rounding call. Its cache revision is `mandelbox-unquantized-v1:parameters-v1`;
the reviewed refined fingerprint changes, but the native fingerprint and sealed
published Definition do not. Initialization, pre-step escape checks, smoothing,
orbit statistics, and the descriptor-owned parameter interface remain intact.
The other twelve recovered adapters retain q1024; the shared quantization helper,
compiler, and renderer framework are unchanged.

This exception addresses detail loss in deep zoom. Reopening published-ID artwork
through this Explore adapter can change detail and local colors without changing
stored parameters. It adds no version selector or document migration. Canonical
Gallery playback, native-ID execution, and generated assets are not changed;
cross-surface numerical alignment remains incomplete. Same-device reference
comparisons are not a guarantee of cross-GPU pixel equality or all-domain parity.
