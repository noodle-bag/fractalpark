# Julia two-plane capability contract v1

Status: **29b infrastructure contract**. This specification defines typed candidates and a CPU evidence harness. It does not classify the published 534-row census, activate Julia editing, or establish final capability.

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

The v1 reference grid is 3 distinct points × 3 distinct Julia constants × depths 1, 2, 4, and 8 under the production `standard32` CPU backend. A candidate pass requires all of:

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
