# Julia two-plane capability contract v1

Status: **29b infrastructure contract with 29c–29d Tier 0–1 evidence**. This specification defines typed candidates, the CPU evidence harness, and the first two versioned pre-GPU decision surfaces. It does not mutate the published 534-row capability census, activate Julia editing, or establish final capability.

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
  supportLane: "existing-system-c" | "parameter-binding" | "source-split" | "none";
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
