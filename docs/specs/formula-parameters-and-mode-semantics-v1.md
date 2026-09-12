# Formula Parameters and Mode Semantics v1

- Status: Accepted contract; implementation conformance is partial
- Date: 2026-09-11
- Scope: Application parameter, mode, and execution boundaries

## Authority and adoption

MUST and MUST NOT express requirements for changes touching this boundary, not
a claim that all existing paths comply. Read this contract before changing
parameter controls, runtime adapters, Julia eligibility, or artwork restoration.
The coverage inventory below distinguishes existing tests from required additions.
Documentation alone does not add CI enforcement or activate a formula.

This contract complements [the language](frm-like-language-v1.md),
[Document v2](fractal-document-v2.md),
[the content model](fractal-content-and-creation-model.md), and
[runtime identity compatibility](formula-runtime-identity-v1.md).
It introduces no storage schema, language feature, mode selector, or authority
to rewrite sealed Julia evidence. Existing exact-source activation rules and
reviewed coordinate/fixed-seed extensions remain governed by runtime identity.
Historical evidence classifications are not automatically reclassified by this
document. A conflict requires explicit review, not silent activation.

## P1. Ownership and resolution

| Fact | Owner | Derived use |
|---|---|---|
| Declared type, default, hard domain, expression | Definition / typed IR | Validated descriptors |
| Recommended initial composition | Profile | New artwork initialization |
| Current values, Julia intent and constant | Document | Read-only runtime and frame projections |
| Eligibility for an exact implementation | Reviewed capability evidence | Effective mode and reason |
| Parameter aliases and backend representation | Explicit execution adapter | CPU/GPU/Worker/export inputs |
| Soft window, display precision, input draft | Controls | User value submission |

Every effective value MUST have one resolved owner. Restoring existing valid
Document values MUST NOT replace them with current Profile defaults. Animation
MUST derive frame values without writing them back into the base Document.
Fallbacks for invalid or missing input MUST be distinguishable from accepted
user values; existing codec compatibility rules are not silently changed.

## P2. Parameter identity and backend interfaces

A reviewed parameter contract MUST identify its key, declared type, default,
hard domain if any, aliases, scope, mathematical role, and mode dependencies.
This is a review requirement, not a requirement to add persisted fields.
Roles may be conditional, composite, or unknown. Names such as `rate`, `offset`,
`p1`, and the type `complex` do not establish a mathematical role.

UI descriptors and the selected execution plugin MUST agree on parameter
names and types, or use an explicit tested adapter. Scalar-to-vector encoding,
component extraction, defaults, function-option encoding, and legacy aliases
MUST be specified, not inferred from similar names. No descriptor-backed edit
may be silently ignored while a plugin reads its own default.
Unknown or mismatched bindings MUST NOT be reported as successful execution;
use the surface's established unavailable/error behavior and preserve the
Document. Do not invent a second parameter store to repair the mismatch.

Function option reordering MUST preserve saved meaning through the existing
codec contract or undergo an explicit compatibility review.

## P3. Julia, coordinate parameters, and effective mode

Julia is not the name of a complex picker. A changed image, a `supportsJulia`
flag, a support-lane label, or the presence of `pixel` is not eligibility proof.
Review mathematical category separately from the route used to implement it.
For a fixed-map claim, coefficients MUST be independent of the observation
pixel after mode resolution; initial state may depend on that pixel. Mutable
history, seed transforms, function options, and conditional domains MUST be
included in the claim. A fixed map alone does not prove classical Julia status.

`isJulia` represents saved intent. Effective mode MUST also respect exact-source
eligibility. `ismand` MUST derive from effective mode, never become an independent
writable mode control. A load or qualification failure MUST retain saved intent
and a reason; it MUST NOT masquerade as successful Julia rendering.

`pixel` remains a language coordinate. Only a reviewed application extension
may expose a selected coordinate under Formula Parameters. Existing
`pixelSource` / `pixelConstant` and fixed-seed behavior retain the exact rules
in the runtime identity contract. Do not globally replace `pixel`, overwrite
initial-state dependencies, or map saved Julia constants into ordinary parameters.

Ordinary parameters MUST remain independent of Julia constants unless an exact
binding has been separately reviewed. Any future shared-slot binding MUST define
one effective writer, preserve the ordinary base value, restore it on leaving
the mode, and expose the ownership in the UI. This clause grants no new binding.
Competing animation channels MUST have a declared precedence or rejection rule,
not depend on update order.

## P4. Editing and persistence

Numeric parameters MUST retain precise numeric input alongside convenience
controls. Function parameters use their validated option set. A soft slider or
plane window MUST NOT clip an otherwise legal saved value or invent a hard
domain. Unknown interaction semantics retain generic typed input.

Input drafts (including incomplete numbers) MUST remain separate from committed
values. Invalid input MUST NOT silently commit zero or a default. Display
rounding MUST NOT rewrite Document precision. Backend numeric rounding follows
the reviewed numeric contract, not the text field's formatting.
Complex pairs MUST submit atomically. Dragging, typing, URL/import restoration,
Undo/Redo, and preset loading MUST converge on the same value-resolution rules,
with explicit distinctions between interactive errors and legacy input recovery.
Mode changes, formula changes, reset, asynchronous loading, and animation stop
MUST have tested preservation/initialization behavior, not hidden synchronization.

## P5. Consumers and compatibility

CPU, GPU, Worker, playback, and export MUST consume the same effective parameter
and mode meaning. Equivalent artwork inputs include exact execution revision,
camera, parameters, Julia intent/constant, frame time, and numeric policy.
Surface-specific unavailable UI is permitted; surface-specific reinterpretation
of those inputs is not. Preview remains anchored to animation frame zero.

Compatibility claims MUST distinguish ordinary artwork, repaired formerly inert
Julia intent, coordinate-parameter extensions, and affected presets. Do not
promise both repaired behavior and preservation of every formerly incorrect
image. Changes require the rendering review in the runtime identity contract;
no automatic migration, version-switch button, or mass asset regeneration follows.

### Reset Artwork

The explicit Reset Artwork action loads the same published Mandelbrot alias and
profile as a fresh Explore entry, including its editable power parameter. Apply
that profile to the default document, not the previous artwork. Install the
loaded plugin and reset the document atomically through the existing selection
coordinator. Clear draft identity only on successful application; a failed or
superseded load must preserve the current artwork. Reset retains the existing
animation-stop and history-clearing behavior. A repeated reset of the same
render state must not emit a new creator-change event.

## Verification and coverage inventory

### Historical evidence versus current release inputs

Historical Julia regression tests MAY reconstruct the exact sealed package
inputs for the reviewed 0.4.19-to-0.4.20 metadata-only transition. The complete
current package/lock pair MUST match independently pinned hashes before changing
only `package.version`, `lock.version`, and `lock.packages[""].version`; the
reconstructed raw bytes MUST match the original sealed hashes. No JSON
normalization, blanket version stripping, dependency exemption, or unknown
version transition is allowed. Every other bound input remains byte-exact.

This test-only reconstruction MUST NOT enter runtime consumers, generators,
independent current-source verifiers, or release qualification. Historical
assets and their hashes remain unchanged. The historical review-pending handoff
still rejects activation, and unmodified current inputs still fail its original
source-binding check. These tests do not renew Record previews, performance,
device measurements, or approval receipts for the current candidate.

Release qualification MAY preserve the sealed pre-GPU authority only through a
separate, version-specific verifier. That verifier MUST authenticate the complete
current package/lock bytes, reconstruct and hash the three reviewed root-version
fields, require every executable source binding to remain byte-exact, and reject
unknown versions or any other change. It MUST NOT run the historical generator,
rewrite the sealed asset, or claim renewed renderer, performance, or device
evidence. Renderer evidence still has to run against the exact release candidate.
Its release verifier MAY compare freshly verified renderer rows with the sealed
artifact using the same version-specific binding transition, but every renderer
row and every non-package source binding MUST remain exact.

Coverage: `historical-julia-source-inputs.test.ts` rejects dependency, lock
integrity, scripts, engines, extra fields, mixed/unknown versions, and raw-byte
tampering; `julia-final-recovery-v2.test.ts` retains both historical
review-pending and current-source rejection cases. Future input changes require
review, not an automatic update of the pinned hashes.

### Application coverage

Existing test files are starting points, not proof of full conformance:

| Requirement | Existing coverage to extend | Required additional evidence |
|---|---|---|
| P1/P2 values and aliases | `src/test/published-formula-params.test.ts`, `src/test/recovered-quantization-rendering-v1.test.ts` | Extend the thirteen-formula interface audit when adding or changing adapters |
| P3 mode and source binding | `src/test/formula-runtime-capability-v1.test.ts` | Changed source/type rejection across affected adapters |
| P3 coordinate and fixed-seed semantics | `src/test/published-coordinate-parameters.test.ts`, `src/test/published-fixed-seed.test.ts` | Preserve fixed-map counterexamples and full-state checks when extending the set |
| P4 controls and restoration | `src/test/published-parameter-interactions.test.ts`, `tests/e2e/coordinate-parameters.spec.ts`, `tests/e2e/fixed-seed-modes.spec.ts` | Affected parameter edit/save/reload/mode-transition cases |
| P5 rendering and playback | `tests/e2e/coordinate-rendering.spec.ts`, `tests/e2e/recovered-parameters.spec.ts`, `src/test/published-artwork-runtime.test.ts` | Same-input cross-surface and recovered-formula fixed-frame comparison beyond the Mandelbox interface repair |

New interface regressions MUST demonstrate failure on the faulty baseline and
pass after repair. Assert resolved backend values and observable computation,
not just control presence or changed URL text. Use nondegenerate sensitivity
witnesses; zero multipliers, symmetry, or capped regions can legitimately mask
changes. Include inactive-parameter preservation and unaffected controls.

For fixed-map counterexamples, compare a transition at the same complete mutable
state while varying the observation pixel and recomputing pixel-derived immutable
coefficients. Do not freeze away the dependency being tested. Sampling can find
counterexamples; it is not a general mathematical proof of eligibility.

The complete adapter audit and recovered-rendering cross-surface matrix are
required additions, not implemented by publication of this Spec. Agents and
reviewers MUST report missing coverage rather than describe the suite as a
complete automatic gate. Normal test discovery reuses executable tests once
added; no agent-specific testing framework is needed.
