# Julia two-plane capability contract v1

Status: **29b infrastructure contract with 29c–29f pre-GPU evidence and closure**. This specification defines typed candidates, the CPU evidence harness, three versioned Tier 0–1 decision surfaces, and their inactive pre-GPU closure. It does not mutate the published 534-row capability census, activate Julia editing, or establish final capability.

## 1. Two-plane semantics

A Julia-like mode has two independently observable inputs:

1. the point plane supplies the initial orbit state (`z0`); and
2. a fixed orbit constant is supplied through an explicit binding.

`classic-julia` requires `z0Role = pixel-seed`. A mode in which the point is not the initial orbit state is `generalized-two-plane`; it must receive a separate product name and never count as classic Julia. A formula without a proven orbit-constant binding is `unsupported` for this contract.

The fixed orbit constant may bind through:

- `system-c`: the runtime `c` input;
- `parameter`: one declared complex parameter slot;
- `source-split`: a new immutable source revision that separates seed and constant roles; or
- `none`: no proven slot.

`none` is not a shortcut for an unresearched row. A final `none` / not-applicable decision requires technical authorship, independent review, and dynamic negative evidence in later Slice 7E commits.

## 2. Typed contract

```ts
type OrbitConstantBindingV1 =
  | { kind: "system-c" }
  | { kind: "parameter"; slotName: string }
  | { kind: "source-split"; sourceRevision: string }
  | { kind: "none" };

type JuliaBindingContractV1 = {
  binding: OrbitConstantBindingV1;
  modeClass: "classic-julia" | "generalized-two-plane" | "unsupported";
  supportLane:
    "existing-system-c" | "parameter-binding" | "source-split" | "none";
  candidateKind?: "source-split" | "identity-change";
  z0Role: "pixel-seed" | "parameter" | "zero" | "none";
  invariant: "parameter-plane-bit-identical" | "semantic-extension";
};
```

The lane must match the binding. Classic Julia requires an active binding and a pixel seed. Generalized two-plane requires an active binding and a parameter/zero initial state. Unsupported requires `binding=none` and `z0Role=none`.

The existing exact published census remains 534/534 `status=unknown` after 29b. This commit freezes the row contract but does not bulk-project typed rows or create a successor census asset. Later row-authoring commits populate typed fields only with their required lane evidence; “not researched” is never serialized as a terminal `binding=none` or `modeClass=unsupported` conclusion.

## 3. Static classifier authority

The static classifier consumes validated `FrmLikeV1Ir` plus an explicit proposed binding. It may establish only:

- the parameter exists and is complex;
- the proposed constant reaches the loop recurrence after initialization/overwrite flow;
- the Julia (`ismand=false`) initialization has an unambiguous `z0Role`; and
- the binding/lane/mode combination is structurally coherent.

Its output is always `static-candidate-only` and requires CPU evidence. It never infers capability from formula ID, display name, family, existing profile, or a historical `supportsJulia` flag. Ambiguous control/data flow, dead reads, read-then-overwrite, fixed constants, pixel-only recurrence, missing slots, wrong slot types, and unreviewed `none` all fail closed.

## 4. CPU candidate harness

The v1 reference grid is 3 distinct points × 3 distinct Julia constants × eight distinct depths (1, 2, 4, 8, 16, 32, 64, and 128) under the production `standard32` CPU backend. A candidate pass requires all of:

- parameter-plane traces are byte-identical with and without the proposed Julia binding;
- repeated fixed-map runs are deterministic;
- every baseline, parameter-plane, and Julia-plane evidence trace is finite and contains at least one completed step;
- changing the point changes at least one common finite orbit checkpoint while the Julia constant is fixed; and
- changing the Julia constant changes at least one common finite orbit checkpoint while the point is fixed.

Non-finite events, crashes, event-only differences, duplicate/underpowered grids, single-point coincidences, fixed constants, algebraic cancellation, and pixel-only response do not count as sensitivity evidence.

A source-split candidate must supply the exact new source bytes and SHA-256 revision to the classifier. The classifier reparses those bytes and requires the resulting IR to equal the candidate IR. The previous parameter-plane baseline is likewise supplied as exact source bytes plus its distinct verified SHA-256 revision and reparsed by the harness; caller-asserted revision strings or arbitrary baseline IR are rejected. A byte-identical parameter-plane result promotes only the candidate contract's `invariant` to `parameter-plane-bit-identical`.

A harness pass is `tier1-candidate-only`. It does not satisfy source/rights review (Tier 0), WebGL parity (Tier 2), physical-device scope (Tier 3), Profile/URL/UI gates, or final census digest binding.

## 5. Reference fixture

The published `ismand_demo` separated independent rewrite is the parameter-binding reference:

- parameter plane: `z0=0`, `orbitConstant=pixel`;
- Julia plane: `z0=pixel`, `orbitConstant=juliaConstant`;
- recurrence: `z = recip(sqr(z) + orbitConstant)`.

29b tests read the public canonical definition by its immutable source revision. They also include system-c positive coverage and fixed-constant, read-then-overwrite, pixel-only, algebraic-cancellation, pixel-insensitive, and non-finite negative controls.

## 6. Invalidation and activation boundary

A binding change creates a new immutable binding revision in later commits and invalidates semantic/runtime/Profile/evidence bindings even if source bytes do not change. A source split additionally changes source revision and the full source-derived asset chain.

Only a final census row with matching source, binding, Profile, backend, tolerance, evidence revisions, and final census digest may activate product editing. Missing, stale, unknown, blocked, not-applicable, or candidate rows remain fail closed. Legacy URL/Document/Profile `mode` and `juliaC` continue to read, render, and round-trip without being overwritten.

## 7. Existing-system-c Tier 0–1 evidence

29c freezes `resources/formula-library/v1/julia-existing-system-c-evidence.v1.json`. Its queue is derived by running the static classifier over all exact 534 published definitions with the explicit `{ kind: "system-c" }` proposal; it is not selected by formula name, family, or an old `supportsJulia` flag. Every queued row binds the exact published source and semantic revisions, the current publication/rights decision, a successful Safety Envelope replay, an immutable binding revision, and the full eight-depth CPU summary. The artifact additionally binds the exact tracked parser, classifier, standard32 CPU backend, stdlib, Safety Envelope, publication, and generator closure by source hash so any evidence implementation drift invalidates the checked-in bytes.

The fixture records 76 structural candidates, of which 74 pass Tier 1 and 2 remain blocked by non-finite evidence on the frozen probe grid. These counts describe this exact evidence revision only. The number 76 is neither a whitelist nor a quota, and the 74 passing rows remain `tier1-candidate-only`: no row becomes `supported`, no live capability census row changes from `unknown`, and Tier 2 GPU evidence plus the later final-census binding are still required before activation.

## 8. Parameter-binding Tier 0–1 evidence

29d freezes `resources/formula-library/v1/julia-parameter-binding-evidence.v1.json`. It evaluates all exact 534 published definitions and every declared complex parameter slot without using formula names, families, or old capability flags. The decision surface contains 293 formulas with 371 complex slots: 185 slots fail the static role classifier, while 186 slots across 175 formulas reach the CPU harness. The frozen CPU grid records 170 passing slots and 16 blocked slots. At formula level, 162 rows have exactly one passing slot (107 classic and 55 generalized), four have multiple passing slots and therefore remain ambiguous, and nine static-candidate rows have no passing slot.

Tier 0 then fails closed for all 175 static-candidate formulas because their exact published source bytes are rejected as `source-not-canonical` by the current Safety Envelope. A separate byte diagnostic found that 163 differ from the canonical serializer only by one terminal newline; the remaining 12 have other canonical byte differences. 29d does not strip or rewrite those bytes: doing so would create a new source revision and belongs to a later source-revision lane. The artifact therefore preserves the CPU slot results and immutable binding revisions for replay, but its formula-level adjudication has zero eligible parameter-binding candidates.

Zero eligible candidates is the result of this exact Tier 0 contract, not a claim that parameter binding is mathematically impossible and not a final Julia support count. The live capability census remains 534/534 `unknown`; no adapter, renderer, Profile, URL, Document, or UI path consumes the 29d asset. Any later normalization or source enhancement must produce new source revisions, rerun rights/Safety evidence and Tier 1, resolve multi-slot ambiguity explicitly, and still pass Tier 2 plus final-census binding before activation.

## 9. Source-split Tier 0–1 evidence

29e freezes `resources/formula-library/v1/julia-source-split-evidence.v1.json` and an isolated exact set under `resources/formula-library/v1/julia-source-split-candidates/definitions/`. The lane first excludes the 76 existing-system-c rows and 175 parameter-binding rows, then evaluates the remaining 283 definitions without formula-ID, display-name, or family inference. A mechanical proposal is allowed only when the loop directly reads `pixel`, or when a top-level complex local is initialized from `pixel`, remains live in the loop, and is never assigned or component-assigned there. The candidate keeps that value equal to `pixel` on the parameter plane, binds it to `c` on the Julia plane, and sets `z0=pixel` only when `ismand=false`.

The frozen decision surface records 117 source-split proposals: 82 direct-pixel rewrites and 35 immutable complex pixel-alias rewrites. Another 149 evaluated rows have no mechanical role split under this deliberately narrow transformer, while 17 contain a live pixel alias that is assigned or component-assigned in the loop and therefore fail closed before proposal generation. All 166 remain not selected for this lane and are not promoted to `not-applicable` or `identity-change`. All 117 proposals bind a new canonical source revision and semantic hash, preserve formula ID, formula name, and the parameter contract, retain the published rights/leakage decision, pass the Safety Envelope, and reproduce the exact prior parameter-plane traces.

Tier 1 admits 111 `candidate-only` rows (78 direct-pixel and 33 immutable pixel-alias) and blocks six. Across the blocked rows, five include `pixel-insensitive` and two include `constant-insensitive`; one row has both reasons. Only the 111 passing revisions are written to the isolated content-addressed candidate directory. Blocked attempts retain their revisions and CPU summaries in evidence but receive no candidate definition path. No identity-changing rewrite is attempted or serialized (`identityChangeCandidateCount=0`).

These 111 rows are pre-GPU source-split candidates, not supported formulas, a whitelist, a product quota, or a UI exposure promise. They are not imported by the public runtime index and do not change the 534-row published membership or the live 534/534 `unknown` census. Later closure must still adjudicate unresolved rows, clear every candidate state, and pass Tier 2, final census, Profile, URL, Document, renderer, and UI gates before any product activation.

## 10. Pre-GPU capability closure

29f freezes `resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json` as an inactive, exact-534 successor evidence surface. It is derived from the ordered existing-system-c, parameter-binding, and source-split lanes and independently binds their content hashes. It does not replace or feed the live capability census. Every row records its baseline and evaluated source/semantic revisions, selected lane when one is proven, binding revision and closed contract when available, attempted stages, minimum unresolved evidence, and the exact upstream evidence revision.

The closure contains no `supported` or `candidate` status. The 74 existing-system-c and 111 source-split rows that passed Tier 0–1 become 185 `unknown / tier2-pending` rows; their contracts no longer carry `candidateKind`, but they remain inactive until Tier 2 and final-census binding. Another 200 rows are `blocked`: 2 existing-system-c Tier 1 failures, all 175 parameter-binding rows blocked by exact-source Tier 0, 6 source-split Tier 1 failures, and 17 mutable pixel-alias rejections. The remaining 149 rows are `unknown / not-applicable-review-inconclusive` because the three mechanical lanes do not exhaust fixed-literal lifting or identity-changing alternatives. They are deliberately not labeled `not-applicable` without the required technical-author and independent-reviewer decisions.

The exact closure is therefore `534 = 334 unknown + 200 blocked`, with `supported=0`, `candidate=0`, and `not-applicable=0`. Its 185 Tier 2 queues are evidence sets, not a supported-formula count, whitelist, quota, or UI promise. The 111 isolated source-split Definitions remain content-addressed evidence assets; 29f verifies their exact file set and hashes but does not publish or activate them. The published membership and live census remain 534/534 `unknown`. Tier 2 GPU parity, fixed candidate Profile digests, final verified census binding, and all runtime/product surfaces remain later gates.

## 11. Renderer parity and final verified census

29g freezes `resources/formula-library/v1/julia-renderer-evidence.v1.json` and `resources/formula-library/v1/julia-final-capability-census.v1.json` without changing the live capability census. The Tier 2 authority set is exactly the 185 `tier2-pending` rows from 29f. Every row is source-, semantic-, binding-, Profile-, backend-, tolerance-, and harness-bound. Existing-system-c rows compile the exact published source; source-split rows compile the isolated evaluated source revision without inserting it into the public runtime index.

Each Tier 2 row must compile and link the exact complete production shader, then enter a production-backend CPU/WebGL differential on both planes. One frozen, lane-independent production-framework witness also executes a finite, bit-deterministic `1 × 1 × 1` Julia draw through the same assembled framework and its real `u_isJulia` / `u_juliaC` path, with only both static `10000` loop caps replaced by `1` for SwiftShader JIT feasibility. This witness proves framework/backend integration without pretending that the bounded draw replaces row-level parity; source-split rows remain individually covered by exact production compile/link plus the CPU/WebGL trace and state-image oracle. A passing row completes the frozen trace grid of three parameter-plane points and nine Julia point/constant combinations at depths `1, 2, 4, 8, 16, 32, 64, 128`, for 96 state/event/continuation comparisons, then completes a fixed `8 × 6`, 32-iteration state image for two Julia constants, for 96 CPU/GPU pixel comparisons, at least one constant-sensitive pixel, and bit-identical repeated GPU draws. A failing row stops at its first semantic or anti-vacuity mismatch and records a stable failure class; its canonical comparison counts remain zero rather than claiming the unexecuted suffix. Thus the checked asset proves complete `96 + 96` coverage for all 170 passed rows and first-failure evidence for the 15 blocked rows. The Profile digest is an evidence binding, explicitly not a default-selection or aesthetic-quality decision; the 32-iteration image is a complementary differential and does not replace the eight-depth trace through 128. The minimal production draw is an integration-path proof, not a substitute for either differential.

The checked Tier 2 result is `185 = 170 passed + 15 blocked`: the passed set is `72 existing-system-c + 98 source-split`; the blocked set is `2 existing-system-c + 13 source-split`, partitioned into `7 trace-state-mismatch + 6 image-state-mismatch + 2 image-constant-insensitive`. The exact final census therefore closes as `534 = 170 supported + 149 unknown + 215 blocked`, with `not-applicable=0`. The product remains inactive: supported means evidence-eligible for 29h, not runtime activation.

The checked Tier 2 renderer class is Chromium WebGL 1 through SwiftShader software. That is real browser/WebGL execution suitable for deterministic CI, but it is not physical-device evidence. The versioned Tier 3 scope therefore remains `pending-physical-device-evidence`, records zero physical-device samples, and makes no cross-device guarantee. Nothing in 29g may relabel software rendering as a real GPU result.

The final census classifies all 534 rows and contains no candidate state. A Tier 2 pass may become `supported` and activation-eligible in this inactive evidence surface only when its exact Profile and renderer evidence digests match; a Tier 2 failure becomes `blocked`; the 200 earlier blocked rows and 149 review-inconclusive rows retain their prior fail-closed outcomes. Product behavior remains unchanged: the final census is `inactive-awaiting-29h`, the public runtime and live census are not rewritten, and URL, Document, Profile, renderer controls, and UI exposure remain gated on the separate 29h activation commit.
