# Unified Formula Library and FRM-like Language Contract v1

- Status: Accepted contract; production activation is gated
- Date: 2026-08-15
- Target release: FractalPark v0.4.19
- Related: [FRM Compatibility and Migration Contracts v1](frm-compatibility-v1.md)
- Related: [Fractal Document v2 and Envelope v1](fractal-document-v2.md)
- Decision: [ADR 0008](../adr/0008-unified-formula-library-contract.md)

## Purpose

v0.4.19 turns formulas into the durable center of FractalPark. Standard, Mine,
and future Community formulas use one language, one compiler path, one safety
envelope, and the same four asset layers. Legacy B94/F588 labels remain migration
inputs only; they are not public product tiers or runtime trust signals.

This document freezes the v1 language, asset, identity, rights, safety, and
migration contracts. The grammar was frozen only after the Slice 0 parser,
round-trip, all-677 projection, UI-schema, hash-layering, and ownership fixtures
passed. Those fixtures remain prototype evidence; this document does not claim
that the production parser, 677-Formula migration, new writers, hosted schema,
or discovery UI are active.

## Non-negotiable invariants

1. Canonical readable source is the only mathematical source of truth:
   `source -> typed semantic IR -> execution IR/backend`.
2. No Formula ID, scope, provenance class, or trusted flag may receive parser,
   compiler, runtime, or resource-limit exceptions.
3. Formula Definition, Formula Profile, Formula Record, and FractalDocument are
   separate revision domains.
4. Every saved, shared, published, imported, or remixed work pins exact source,
   profile, language, stdlib, and NumericProfile revisions.
5. A portable v3 work embeds the Formula Snapshot needed to validate and compile
   offline. A later Standard catalog or cloud read is not required for replay.
6. New executable Formula Definitions are limited to 65,536 UTF-8 bytes in every
   scope and entry point. The 256 KiB ceiling is legacy-read-only.
7. Document v3 / Envelope v2 are reader-first. Production writers remain legacy
   until the separate writer gate is explicitly enabled.
8. Public source is published only through an approved direct-adaptation or
   clean-room lane. Private source and reversible intermediates never leak into
   public artifacts.

## 1. FRM-like Language v1

### 1.1 Public name and dialect boundary

The public language name is **FractalPark FRM-like Language v1**.

- `frm-like/1` is the canonical authoring language.
- Classic Fractint FRM remains an import dialect. It is scanned, selected,
  lowered, diagnosed, and then compiled through the same typed pipeline.
- FDL remains a future research name and does not describe this runtime.
- GLSL, WASM, Rust, compiled caches, and generated shaders are backend artifacts,
  never authoring source or durable facts.

Canonical source begins with these semantic directives:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

Although directives use comment markers for Classic-reader tolerance, the three
recognized directives are semantic input. Changing one changes semanticHash.
They appear exactly once in the preamble; a directive-looking comment elsewhere
is fatal. Ordinary comments use `;` at the start of a physical line or whitespace
followed by `;` after executable text. Ordinary comments and insignificant ASCII
whitespace around declaration/expression punctuation do not change semanticHash.

### 1.2 Frozen formula and parameter grammar

The grammar below passed the named Slice 0 evidence in regression rows A1–A3,
A6, and A14 and is now the v1 compatibility promise. Production activation is a
separate gate: the prototype does not replace the released parser/compiler, and
any implementation must reproduce these fixtures rather than reinterpret them.

The v1 parameter form is deliberately small and line-oriented:

```ebnf
source          = semanticDirective*, formula ;
formula         = identifier, "{", parameters?, init, loop, bailout, "}" ;
parameters      = "parameters", ":", NEWLINE, parameterDeclaration* ;
parameterDeclaration
                = identifier, ":", parameterType, "=", parameterDefault,
                  domain?, classicBinding?, NEWLINE ;
parameterType   = "real" | "complex" | "function" ;
parameterDefault
                = realLiteral | complexLiteral | functionName ;
domain          = "domain", "[", realLiteral, ",", realLiteral, "]" ;
classicBinding  = "classic", ("p1" | "p2" | "p3" | "p4" | "p5" |
                                     "fn1" | "fn2" | "fn3" | "fn4") ;
init            = "init", ":", statement* ;
loop            = "loop", ":", statement* ;
bailout         = "bailout", ":", expression ;
```

Example:

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
PowerJulia {
  parameters:
    power: real = 2 domain [1, 16] classic p1
    offset: complex = (-0.75, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z ^ power) + offset
  bailout:
    |z| <= 4
}
```

Rules:

- One parameter declaration occupies one physical line.
- Canonical executable sections emit one statement per physical line. A semicolon
  is a comment marker only in the forms defined above; any residual semicolon or
  unsupported punctuation after comment stripping is fatal.
- ASCII whitespace around `:`, `=`, comma, brackets, and expression operators is
  insignificant. The canonical exporter emits the example spacing above.
- `real` defaults are finite real literals. An optional inclusive hard domain is
  mathematical validation, not a UI hint; `min <= default <= max` is required.
- `complex` defaults are `(real, imaginary)` and do not use v1 scalar domains.
- `function` defaults name a unary v1 stdlib function. `atan2` remains available
  only as a direct two-argument call and cannot populate a `function`/`fn1`–`fn4`
  selector.
- A `classic` binding is optional for native formulas and unique within one
  definition. It records import/export interoperability; it is not the runtime
  parameter name. `real`/`complex` parameters bind only to `p1`–`p5`; `function`
  parameters bind only to `fn1`–`fn4`. A direct `fn1`–`fn4` call is valid only
  when the same Definition declares the matching `function` binding; an unmapped
  slot is fatal. Backend lowering resolves every bound `pN`/`fnN` read to that
  named parameter, so CPU and GLSL never depend on duplicate host values.
- UI range, step, grouping, labels, current values, view, palette, and coloring
  do not belong in a parameter declaration. They belong to Profile or Record.
- External inputs must be declared. Assignment introduces a local only when the
  name is not a parameter, system input, builtin constant, section keyword, or
  stdlib function.
- `pixel`, `c`, `zPrev`, `LastSqr`, `pi`, `e`, `maxit`, `ismand`, `p1`–`p5`,
  `fn1`–`fn4`, language keywords, and stdlib names cannot be assigned or
  shadowed. `z` is the writable orbit state. Import lowering may introduce a
  fresh local binding; it may not make an immutable host input mutable.
- Unknown semantic directives, duplicate parameters/bindings, undeclared reads,
  out-of-domain defaults, and trailing executable tokens are fatal for canonical
  source. Import diagnostics may remain more descriptive but cannot silently
  accept a different program.

### 1.3 Statements, evaluation, and termination

v1 retains the released arithmetic, assignment, component-store, conditional,
and bailout vocabulary described by the compatibility spec, with these frozen
clarifications:

- evaluation order is source order and left-to-right within an expression;
- exponentiation remains right-associative;
- numeric scalars promote to complex as `(value, 0)` when assigned to complex
  state or consumed by a complex operation; booleans promote as `false = 0` and
  `true = 1`; function values are callable only and never numeric values;
- `<`, `>`, `<=`, and `>=` compare the real projection; complex `==` and `!=`
  compare both components; logical operators use zero/nonzero numeric truthiness;
- complex exponentiation retains the released real-exponent contract: the right
  operand uses its real projection. `|x|` is the true absolute value for real
  inputs and true Euclidean magnitude for complex inputs, not squared magnitude;
- `real(x) = value` and `imag(x) = value` require an already definitely
  initialized complex target and store the real projection of `value`;
- a backend may not reassociate floating-point expressions unless the
  NumericProfile explicitly permits it and conformance evidence remains green;
- the bailout expression is the **continue-iteration predicate**, evaluated
  after the current loop body;
- a non-finite required orbit value emits the versioned `nonFinite` termination
  event and stops; it is never converted silently to zero;
- generated backend code may optimize typed IR but may not become a second
  formula definition.

### 1.4 Standard library v1

`stdlibVersion: 1` contains the released arithmetic and complex functions plus
the general additions needed by the frozen Standard migration:

- arithmetic/helpers: `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`, `conj`,
  `flip`, `real`, `imag`, `cabs`, `round`, and `atan2`;
- circular: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`;
- hyperbolic: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `cotanh`;
- compatibility functions: `cosxx` and declared `fn1`–`fn4` mappings.

Frozen semantics:

- `standard32` canonicalizes every exact zero component, including `-0`, to
  `+0` at language-visible operation boundaries and before branch-sensitive
  stdlib evaluation. Nonzero one-sided branch-cut inputs retain their sign.
  This rule avoids backend-specific sign-bit probes that WebGL 1 cannot provide
  portably; exact-cut values use the canonical upper-cut side.
- `zPrev` and `LastSqr` both start at canonical `+0` before `init`; they are not
  external runtime inputs. Immediately before each `loop`, the backend snapshots
  `z` into `zPrev`, and after a successful loop it records squared magnitude in
  `LastSqr`.
- `log` uses the principal argument in `(-pi, pi]`; the non-positive real axis
  is its branch cut. `log(0)` produces a non-finite event.
- `cabs` and the radii used by `log`/`sqrt` follow one shared `sqrt(re²+im²)`
  order with per-primitive `standard32` rounding on both CPU and GLSL; no
  separately rounded double-precision `hypot` is permitted on either backend.
  imaginary sign inherited from nonzero one-sided input on the cut; exact
  `+0`/`-0` uses the canonical upper-cut value.
- `asin(z) = -i * log(i*z + sqrt(1 - z*z))`.
- `acos(z) = pi/2 - asin(z)`.
- `atan(z) = (log(1 + i*z) - log(1 - i*z)) / (2*i)`.
- `asinh(z) = log(z + sqrt(z*z + 1))`.
- `acosh(z) = log(z + sqrt(z - 1) * sqrt(z + 1))`.
- `atanh(z) = (log(1 + z) - log(1 - z)) / 2`.
- With the principal `log`/`sqrt` above, `asinh` uses cuts on the imaginary
  axis from `i` and `-i` outward, `acosh` uses the real cut `(-infinity, 1]`,
  and `atanh` uses real cuts `(-infinity, -1]` and `[1, infinity)`.
  `atanh(1)` and `atanh(-1)` produce the versioned non-finite event.
- `round` is component-wise for complex values and rounds exact halves away from
  zero. CPU and GPU implementations must use an explicit equivalent expression,
  not host-dependent rounding.
- division by zero and non-finite function inputs do not throw. They propagate to
  the versioned non-finite termination behavior.

Any visual change to an existing definition caused by stdlib semantics requires
an explicit stdlib upgrade and Upgrade & Compare; it cannot mutate a pinned work.

### 1.5 NumericProfile `standard32`

`standard32` is the only executable NumericProfile required by v1.

- storage and shader arithmetic target IEEE-754 binary32 behavior;
- typed-IR evaluation order is fixed and backend contraction/reassociation is
  disabled unless specifically proven equivalent;
- CPU/WebGL fixtures use declared tolerances and orbit/event evidence; this
  contract does not promise bit-identical output across GPU vendors;
- a work with an unsupported profile opens read-only with preview and metadata;
  it is never silently downgraded;
- an explicitly validated conversion creates an **Open Compatible Copy** with
  lineage to the original. The original is unchanged.

### 1.6 Revisions and hashes

- `sourceRevision`: lowercase SHA-256 of exact canonical UTF-8 source bytes.
- `semanticHash`: lowercase SHA-256 of the versioned canonical serialization of
  typed semantic IR, including parameter declarations and semantic directives,
  but excluding comments, whitespace, Profile, Record, and backend artifacts.
- `profileRevision`: lowercase SHA-256 of canonical JSON for Formula Profile,
  excluding only the recursive `profileRevision` field. The projection includes
  Formula ID and sourceRevision; object keys use locale-independent code-unit
  order, arrays preserve order, `-0` becomes `0`, and non-finite numbers,
  undefined values, sparse arrays, lone surrogates, cycles, and non-plain objects
  are fatal.
- `backendRevision`: `{ schemaVersion: 1, buildId, artifactSha256 }`, where
  `buildId` is a stable 1–128 character ASCII build token and
  `artifactSha256` is the lowercase SHA-256 of the immutable backend artifact.

Text-only changes may alter sourceRevision without altering semanticHash. Backend
optimization never alters either sourceRevision or semanticHash.

## 2. Neutral Formula identity and aliases

### 2.1 Formula ID

A Formula ID is a lowercase RFC 4122 UUID string. It does not encode source tier,
name, author, family, scope, license, source revision, or semantic hash. Scope is
a separate required field: `standard`, `mine`, or future `community`.

For the frozen 677 Standard migration:

- `FORMULA_ID_NAMESPACE_V1 = 4287abf5-af50-5f75-9d2a-f56bec9bdf2b`;
- each ID is UUIDv5 over that namespace and the exact frozen legacy union identity
  encoded as UTF-8;
- after the manifest lands, the UUID is permanent even if name, source, family,
  provenance, or current revision changes.

New Mine/Community assets use cryptographically random UUIDv4 identifiers. Every
scope therefore has the same ID shape and resolver contract.

The canonical route is `/[locale]/formulas/[formulaId]`. A future immutable
revision route is `/[locale]/formulas/[formulaId]/revisions/[sourceRevision]`.

### 2.2 Frozen manifest and typed alias resolver

The Standard identity manifest contains exactly 677 unique Formula IDs. A typed
alias is `(kind, value)`, so equal strings in different legacy namespaces cannot
collide.

The migration gate must account for exactly:

- 588 `f588` aliases;
- 89 B94 canonical legacy mappings;
- 5 B94 runtime aliases;
- 94 released runtime IDs;
- 21 released Guide slugs.

Every expected typed alias occurs exactly once and resolves to exactly one Formula
ID. A Formula ID may intentionally have several aliases. Reverse audit proves
that every frozen legacy identity is represented. Alias resolution happens at a
boundary; compiler/runtime code receives only Formula ID plus Definition/Profile
and cannot branch on alias kind.

Formula ID is public identity, not authorization. Mine assets still require owner
access.

The production resolver is revision-pinned: a request carries exact
`sourceRevision` and `profileRevision`; the injected immutable store is queried by
Formula ID plus those revisions. The resolver validates identity/scope separately,
then passes a projection with no Formula ID, scope, alias, provenance, rights, or
trust fields through the Universal Safety Envelope. Only after Definition/Profile
linkage and both hashes pass may an injected compiler receive
`{ definition, profile, ir }`. Store and compiler failures return stable typed
codes; no fallback to a mutable current catalog is allowed.

## 3. Nine-waiver maintenance disposition

The v0.4.18 handoff contains exactly seven T1 and two T2 waived identities. The
following table records the v0.4.19 maintenance disposition without publishing
private source text, private paths, or reversible intermediates.

| Legacy alias | Released rejection | Evidence availability | v1 classification | General disposition and required evidence |
|---|---|---|---|---|
| `f588:carr2289` | protected input write; missing `asin` | controlled source + public reason codes | IR + stdlib | keep host inputs immutable; clean-room source uses fresh local state; add versioned complex inverse trig; parser/CPU/WebGL fixtures |
| `f588:f'functionike` | malformed continuation / entry boundary | controlled but malformed source | IR rehabilitation | clean-room canonicalization from a non-reversible intent/behavior spec; no permissive trailing-token rule; lineage and negative fixtures |
| `f588:fly` | unresolved predicate shape | controlled source; released behavior not executable | IR rehabilitation | express branches and continue predicate in ordinary v1 control flow from an isolated behavior spec; orbit and negative fixtures |
| `f588:frm-d1` | undeclared symbol; historical example is intentionally invalid | controlled, intentionally non-runnable source | Record + IR rehabilitation | preserve the historical teaching identity and disclose rehabilitation; canonical executable definition uses the independently specified corrected intent; equality with a companion semanticHash is allowed |
| `f588:g-3-03-m` | source missing in frozen corpus; missing `round` | semantic/provenance anchor only | stdlib + clean-room rehabilitation | add deterministic `round`; isolated implementer writes source from non-reversible math/orbit spec; provenance must not claim recovered original source |
| `f588:julia` | executable trailing tokens after entry | controlled source | directly expressible | strict selected-entry extraction and clean canonical source; trailing executable content remains a fatal canonical-source error |
| `f588:mand_1` | executable trailing tokens after entry | controlled source | directly expressible | same general selected-entry extraction; separate identity may share semanticHash with another Record |
| `f588:mandel` | executable trailing tokens after entry | controlled source | directly expressible | same general selected-entry extraction; no name-based parser exception |
| `f588:mandelbrotbc3` | write to builtin constant | controlled source + public reason code | IR rehabilitation | alpha-rename the intended local in clean-room source; builtin constants remain immutable; resolver/type negative fixtures |

Maintenance disposition: all nine remain in the 677 identity set. None receives a
Formula-ID special case. Four malformed/missing/non-runnable rows use the same
rehabilitated clean-room lane and must be visibly identified in Formula Record.
They are not described as recovered originals. Failure to produce clean-room
source plus the required fixtures blocks the **entire** 677 Standard activation;
it does not authorize silent omission or a run-only tier.

The private Level 2 ledger must additionally bind each row to provenance evidence,
source availability, spec author, isolated implementer, review status, fixtures,
rights class, and final revision/hash. Public Level 1 verifies cardinality,
schema completeness, dispositions, and absence of source/path leakage.

## 4. Four asset layers

| Layer | Owns | Does not own | Standard authority |
|---|---|---|---|
| Formula Definition | canonical source, parameter schema/default/domain and Classic mapping, program/termination/channels/capabilities, language/stdlib/NumericProfile support, sourceRevision, semanticHash | current values, view, coloring, editorial content | Git |
| Formula Profile | current parameter values, mode/Julia C, view, iterations, coloring, palette, transform, and future recommended visual state | source or public identity | Git for verified defaults; cloud/portable for user profiles |
| Formula Record | Formula ID, scope, names, facets/relations, localized editorial content, provenance/rights, preview, SEO/indexability, related content | executable source or resolved artwork state | Git for Standard |
| FractalDocument | final resolved artwork state and embedded Formula Snapshot | mutable catalog defaults or remote lookups | portable/cloud artwork |

### 4.1 Formula Definition v1

```ts
interface FormulaDefinitionV1 {
  schemaVersion: 1;
  formulaId: string;
  scope: 'standard' | 'mine' | 'community';
  source: string;
  sourceRevision: string;
  semanticHash: string;
  languageVersion: 'frm-like/1';
  stdlibVersion: 1;
  supportedNumericProfiles: readonly ['standard32', ...string[]];
  parameters: FormulaParameterSchemaV1[];
  programModel: 'orbit';
  termination: TerminationContractV1;
  channels: string[];
  capabilities: string[];
}
```

The Definition is the executable asset and is where the 65,536-byte source limit
applies. Its `source` must already equal the canonical formatter output for its
validated typed IR; comments, alternative whitespace, CRLF normalization, or any
other parseable-but-noncanonical spelling are rejected at the asset boundary rather
than stored under a second sourceRevision.

```ts
interface FormulaParameterSchemaV1 {
  name: string;
  type: 'real' | 'complex' | 'function';
  default: number | [number, number] | string;
  hardDomain?: readonly [number, number];
  classicBinding?: 'p1' | 'p2' | 'p3' | 'p4' | 'p5' |
    'fn1' | 'fn2' | 'fn3' | 'fn4';
}

interface TerminationContractV1 {
  predicateMeaning: 'continue-iteration';
  nonFinite: 'terminate-with-event';
  maximumIterations: 'profile-resolved';
}
```

### 4.2 Formula Profile v1

```ts
interface FormulaProfileV1 {
  schemaVersion: 1;
  formulaId: string;
  sourceRevision: string;
  profileRevision: string;
  parameters: Record<string, number | [number, number] | string>;
  mode: 'parameter-plane' | 'julia';
  juliaC?: [number, number];
  view: ViewBoundsV1;
  iterations: number;
  coloring: ColoringStateV1;
  palette: PaletteStateV1;
  transform: TransformStateV1;
}

interface ViewBoundsV1 {
  centerX: number;
  centerY: number;
  zoom: number;
  rotation: number;
}

interface ColoringStateV1 {
  pipelineVersion: 1 | 2;
  outsideColoringId: string;
  insideColoringId: string;
  smooth: boolean;
  measurement?: string;
  channel?: string;
  post?: Readonly<Record<string, number | string | boolean>>;
}

interface PaletteStateV1 {
  paletteId: string;
  colorSpace?: string;
  gradient?: readonly { position: number; color: string }[];
}

interface TransformStateV1 {
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  offsetX: number;
  offsetY: number;
}
```

Every Standard Definition has at least one verified default Profile. UI min/max,
step, grouping, and visual labels are Profile/Record presentation metadata and
cannot weaken Definition hard domains.

### 4.3 Formula Record v1

A Record stores Formula ID/scope, names, facets, explicit evidence-backed
relations, seven-locale structured content, provenance/rights state, preview,
teaching level, SEO/indexability, and related resources. It references but does
not contain or revise the Definition source.

A Record may disclose that a Definition is a clean-room rehabilitation, that two
Records currently share a semanticHash, or that an original is unavailable. It
must not claim historical facts not supported by provenance evidence.

## 5. Self-contained formats

### 5.1 Formula Snapshot v1

A Formula Snapshot embedded in a work contains:

- Formula ID and scope;
- exact source, sourceRevision, semanticHash;
- languageVersion, stdlibVersion, NumericProfile;
- parameter schema and resolved parameter values;
- mode/Julia C, iterations, termination parameters and required channels;
- profileRevision when the work began from a named Profile.

The reader re-hashes and re-validates the snapshot before execution. A mismatch,
unsupported profile/version, unsafe source, or future format opens read-only with
static preview/metadata and a stable reason code.

```ts
interface FormulaSnapshotV1 {
  schemaVersion: 1;
  formulaId: string;
  scope: 'standard' | 'mine' | 'community';
  source: string;
  sourceRevision: string;
  semanticHash: string;
  languageVersion: 'frm-like/1';
  stdlibVersion: 1;
  numericProfile: string;
  parameterSchema: FormulaParameterSchemaV1[];
  resolvedParameters: Record<string, number | [number, number] | string>;
  profileRevision?: string;
  mode: 'parameter-plane' | 'julia';
  juliaC?: [number, number];
  iterations: number;
  termination: TerminationContractV1;
  channels: string[];
}
```

### 5.2 FractalDocument v3

Document v3 extends the v2 durable artwork with a required Formula Snapshot and
continues to own final resolved view, transform, inside/outside coloring,
palette/gradient/colorspace, smoothing/measurement/channel/post, lighting, and
supported animation state. Future pattern/material/layer fields may be preserved
but are not enabled by v1.

Its top-level schema is exactly the released FractalDocument v2 durable fields,
with `schemaVersion: 3` and one additional required field:

```ts
interface FractalDocumentV3 extends Omit<FractalDocumentV2, 'schemaVersion'> {
  schemaVersion: 3;
  formulaSnapshot: FormulaSnapshotV1;
}
```

A conforming `.fractal.json` v3 work revalidates and compiles offline without the
Standard catalog, cloud asset, or network. Compiled GLSL/WASM/Rust, cache entries,
DPR, and interactive temporary quality are excluded.

### 5.3 Envelope v2 and formula files

- `.frm`: one canonical Formula Definition source file.
- `.fractal-formula.json`: one Formula Definition plus optional Profile and
  lineage/provenance projection.
- `.fractal.json`: complete FractalDocument v3.
- Envelope v2 packages a v3 document and content-addressed verified external
  assets. External URLs cannot be the only copy.

```ts
interface FractalDocumentEnvelopeV2 {
  envelopeVersion: 2;
  document: FractalDocumentV3;
  assets: readonly ContentAddressedAssetV1[];
}

interface ContentAddressedAssetV1 {
  mediaType: string;
  sha256: string;
  bytesBase64: string;
  sourceUrl?: string;
}
```

## 6. Universal Safety Envelope

All Standard, Mine, and future Community execution passes through one generated
safety schema and the same enforcement stages: import, client compile, worker,
server/API compile, publish, portable writer, and database constraints.

`MAX_EXECUTABLE_FORMULA_SOURCE_BYTES = 65_536` counts UTF-8 bytes, not UTF-16
code units. It applies to every new or rewritten executable Definition.

The existing `262_144`-byte portable ceiling is retained only for legacy reads.
A source in `65_537..262_144` bytes is preserved intact, read-only,
non-executable, non-publishable, non-overwritable, and never silently truncated.
After the user explicitly reduces it to at most 65,536 bytes and passes current
validation, it may be saved as a new Formula Asset.

The generated envelope also owns finite limits for parameter count, AST/IR node
count and depth, control-flow depth, expression complexity, compile time,
generated shader size, iteration count, worker memory/cancellation, GPU timeout
and recovery. Exact non-source numeric limits must be measured and frozen before
compiler/core activation; they may vary by NumericProfile or device capability,
not by Formula ID, scope, provenance, or trust.

A higher source limit is a forward-only contract change requiring coordinated
DB/API migration, worker/GPU budget evidence, and a new rollback floor. One
surface cannot raise it independently.

## 7. Rights and clean-room addendum

### 7.1 Evidence layers

- **Level 1 (public):** neutral Formula IDs, canonical project source, public
  provenance/rights projection, aggregate and schema-completeness gates.
- **Level 2 (private):** source paths, reversible semantic intermediates,
  licensing evidence, fingerprints, migration joins, clean-room role records,
  and exact acceptance artifacts.

Public repository, build output, logs, client bundles, route payloads, fixtures,
screenshots, and error messages must not contain private paths, uncontrolled
original source, or reversible private intermediates.

### 7.2 Publication lanes

This section is the v0.4.19 clean-room addendum to the earlier internal rights
protocol. It supersedes that protocol only where `run-only` was previously
applied to a future FractalPark-owned canonical implementation. B/C/R third-party
`originalSource` and every reversible derivative remain run-only and private;
an independently implemented `canonicalSource` may be MIT and source-visible
only after the lane gate below passes.

1. **Direct adaptation:** allowed only when the private ledger proves a compatible
   license/ownership and records attribution/notice obligations. Project-owned
   code is included here.
2. **Clean-room implementation:** required when original publication rights are
   absent, incompatible, uncertain, or deliberately avoided. The implementer
   receives only a non-reversible mathematical/behavior specification and public
   API contract. They must not inspect original source, normalized source cells,
   reversible semantic IR, or private fingerprints.
3. **Rehabilitated clean-room:** the same isolation as clean-room, plus a Record
   disclosure when the historical source is missing, malformed, or intentionally
   non-runnable. The canonical source is a project interpretation, not a recovered
   original.
4. **Blocked:** no public canonical source, no Standard activation, and no claim
   of support until the evidence/implementation gate closes.

The private ledger records rights class, lane, original availability, spec author,
implementer isolation, review, attribution, sourceRevision, semanticHash, and
fixtures. A source generator that reads private source or reversible IR is not
clean-room merely because it changes formatting or variable names.

Remix shows and exports only the approved canonical Definition. `originalSource`
is separately access-controlled and never copied into public exports when the
rights class forbids it.

## 8. Reader-first migration and rollback

Activation order is fixed:

```text
legacy reader + legacy writer
-> dual reader + legacy writer
-> dual reader + new writer gated
-> dual reader + new writer default
```

1. Dual readers must ship and pass legacy v1/v2, v3/v2, future-format,
   corrupted/tampered, cloud, and portable fixtures before any production v3/v2
   write.
2. Representative Standard/Mine walking skeletons are Preview/test evidence only.
   Legacy writer remains Production default until the 677 Definitions, resolver,
   runtime, cloud lifecycle, and release gates close.
3. The new writer has an independent feature flag. Production schema migration
   and writer enablement are separate authorization gates. Backup/restore,
   deployed-reader reread, and writer-off smoke are required first.
4. Before the first production v3/v2 write, record the minimum dual-reader commit
   and deployment as the rollback floor. After first write, rollback cannot go
   below it. v0.4.18 is not a valid whole-product rollback target because it
   cannot read Envelope v2 and treats future Documents only as read-only.
5. Atlas, Library, Lucky, new editor entry points, and new writer may be disabled.
   Dual readers, ID resolver, published Definitions/runtime assets, historical
   source revisions, and last-known-good reader/runtime must remain available.
   A database down migration is not the product rollback plan.

## 9. Activation gates

No production Standard activation is complete until evidence proves:

- exactly 677 neutral IDs and the complete typed alias accounting;
- every Definition has readable canonical source and verified default Profile;
- all nine waiver dispositions have source, rights, and conformance evidence;
- source/semantic/profile hashes are deterministic and drift-checked;
- Standard and Mine use the same compiler and Safety Envelope;
- Document v3 / Envelope v2 dual-read and offline replay are green;
- 65,536/65,537 and legacy 256 KiB behavior agree across every entry point;
- CPU/WebGL orbit/event and image-difference suites pass declared tolerances;
- public leakage gates and private rights/provenance completeness pass;
- build, test, lint, responsive, accessibility, real-device, and rollback evidence
  is recorded.

A partial 677 candidate can exist behind test/Preview gates, but public Standard
activation is all-or-nothing. Run-only hidden tiers and silent omissions are not
acceptable completion states.

## 10. Explicit non-goals for v1

No text search/full-text index, personalized ranking, visual-similarity map,
Community discovery/governance, arbitrary precision, perturbation, extended64,
new coloring/material/layer system, non-orbit program model, WebGPU backend,
native plugin API, third-party/network imports, complete revision timeline, or
automatic three-way merge is added by this contract.
