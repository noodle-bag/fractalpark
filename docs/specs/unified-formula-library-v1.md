# Unified Formula Library and FRM-like Language Contract v1

- Status: Accepted asset and lifecycle contract; activation remains gated per surface
- Date: 2026-08-15
- Amended: 2026-08-17 (677 identities; implementation publication is per-row; publication decision ledger asset frozen)
- Amended: 2026-08-17 (stdlib v1 adds `identity`; Classic fn-slot defaults without an explicit `function=` mapping resolve to `identity`)
- Amended: 2026-08-24 (decision revision 4; 534 published Definitions active after the exact 21/21 recovery gate)
- Target release: FractalPark v0.4.19
- Normative language: [FractalPark FRM-like Language v1](frm-like-language-v1.md)
- Related: [FRM Compatibility and Migration Contracts v1](frm-compatibility-v1.md)
- Related: [Fractal Document v2 and Envelope v1](fractal-document-v2.md)
- Decision: [ADR 0008](../adr/0008-unified-formula-library-contract.md)

## Purpose

v0.4.19 turns formulas into the durable center of FractalPark. Standard, Mine,
and future Community formulas use one language, one compiler path, one safety
envelope, and the same four asset layers. Legacy B94/F588 labels remain migration
inputs only; they are not public product tiers or runtime trust signals.

This document freezes the v1 asset, identity, rights, safety, and migration
contracts. The executable language semantics now live in the dedicated
[normative English reference](frm-like-language-v1.md), which governs whenever
older design-history wording differs. The v1 parser/backend is active on the 534
published Standard Record runtime path, including pinned source/Profile artifacts
and one-shot Open/Remix handoff (the E5/A19 evidence scope). C1 remains partial
and C10 remains pending. Canonical writer/import, unified selector, full
offline replay, hosted schema, new cloud writer, and remaining discovery/release
gates keep their separate implementation status.

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
8. Public source is published only for a row with a recorded implementation
   basis, zero prohibited-source leakage, and a `publish` decision. Identity
   presence alone never implies a runnable implementation. Private source and
   reversible intermediates never leak into public artifacts.

## 1. FRM-like Language v1

The executable language is specified normatively by
[FractalPark FRM-like Language v1](frm-like-language-v1.md). This asset and
lifecycle contract does not duplicate its grammar or numeric semantics. The
following subsection map preserves references from design notes and code review:

### 1.1 Public name and dialect boundary

See normative §§1–2 for `frm-like/1`, semantic directives, conformance language,
and the Classic import boundary. `frmSemanticsVersion` remains a separate legacy
compatibility axis.

### 1.2 Frozen formula and parameter grammar

See normative §§2 and 4 for source structure, parameter declarations, Classic
bindings, system values, reserved names, and fail-closed parsing.

### 1.3 Statements, evaluation, and termination

See normative §§3, 6, and 7 for typed expressions, definite assignment, source-
order evaluation, after-step continuation, `standard32`, `nonFinite`, and the
Universal Safety Envelope.

### 1.4 Standard library v1

See normative §5 for the complete stdlib v1 vocabulary, principal functions,
branch cuts, `identity`, deterministic rounding, and evidence-backed Classic
guards.

### 1.5 NumericProfile `standard32`

See normative §6. Unsupported profiles remain read-only and are never silently
downgraded.

### 1.6 Revisions and hashes

See normative §8 for canonicalization, `sourceRevision`, `semanticHash`, and
compiler conformance. The two non-language revision domains remain frozen here:

- `profileRevision`: lowercase SHA-256 of canonical JSON for Formula Profile,
  excluding only the recursive `profileRevision` field. The projection includes
  Formula ID and `sourceRevision`; object keys use locale-independent code-unit
  order, arrays preserve order, `-0` becomes `0`, and non-finite numbers,
  undefined values, sparse arrays, lone surrogates, cycles, and non-plain objects
  are fatal.
- `backendRevision`: `{ schemaVersion: 1, buildId, artifactSha256 }`, where
  `buildId` is a stable 1–128 character ASCII build token and
  `artifactSha256` is lowercase SHA-256 of the immutable backend artifact.

Profile and backend revisions remain separate from source and semantic hashes.
A backend optimization cannot alter `sourceRevision` or `semanticHash`.

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
| `f588:julia` | executable trailing tokens after entry | controlled source | directly expressible | strict selected-entry extraction and clean formatter-conformant source; trailing executable content remains a fatal canonical-source error |
| `f588:mand_1` | executable trailing tokens after entry | controlled source | directly expressible | same general selected-entry extraction; separate identity may share semanticHash with another Record |
| `f588:mandel` | executable trailing tokens after entry | controlled source | directly expressible | same general selected-entry extraction; no name-based parser exception |
| `f588:mandelbrotbc3` | write to builtin constant | controlled source + public reason code | IR rehabilitation | alpha-rename the intended local in clean-room source; builtin constants remain immutable; resolver/type negative fixtures |

Maintenance disposition: all nine remain in the 677 identity set. None receives a
Formula-ID special case. A malformed/missing/non-runnable row may use the same
separated independent-rewrite workflow and must be visibly identified in Formula
Record. It is not described as a recovered original. Failure to produce a safe
canonical implementation plus the required fixtures holds that row; it does not
block unrelated published rows or authorize a placeholder/run-only Definition.

The private evidence ledger binds each row to provenance, source availability,
implementation basis, leakage-scan status, publication decision, decision reason,
review time, and final revision/hash when published. Public projections verify
identity cardinality, decision completeness, aggregate counts, and absence of
source/path leakage.

## 4. Four asset layers

| Layer | Owns | Does not own | Standard authority |
|---|---|---|---|
| Formula Definition | pinned Definition source, parameter schema/default/domain and Classic mapping, program/termination/channels/capabilities, language/stdlib/NumericProfile support, sourceRevision, semanticHash | current values, view, coloring, editorial content | Git |
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
applies. Active published bodies are immutable byte-pinned source assets:
`sourceRevision` hashes their exact stored bytes and the reader verifies both
source and semantic revisions. The gated writer path is stricter: before any new
persistence or publication, its Safety Envelope requires source bytes to equal
the deterministic formatter output. The reader/writer distinction and revision
rules are normative in [FRM-like Language v1 §8](frm-like-language-v1.md#8-canonicalization-revisions-and-conformance).

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

The active public v1 projection is exact-set and decision-ledger-backed:

- all 677 Standard identities expose canonical/original names, typed legacy
  aliases, Formula ID, F588/B94 provenance collection, rights status/scope,
  decision/reason, implementation basis, leakage status, review date, and a
  takedown contact in the decision-backed read model;
- the 534 published rows additionally bind a public-safe historical-source
  projection: 89 FractalPark project-owned Definition files, 415 Fractint
  formula-file references, and 30 Iterated Dynamics references. Every resource
  URL pins a repository commit; the projection contains no third-party source
  text, comments, AST/IR, reversible crosswalk, or private evidence locator;
- the streamlined published UI shows Formula ID, canonical/original name,
  historical source, immutable original-resource link, current implementation
  basis, and a source/implementation note. It does not render Author, Original
  version, Provenance collection, Rights status, Public scope, Canonical
  implementation license, or Legacy aliases. Unknown author remains
  `unconfirmed` in the read model and is never guessed;
- a Fractint direct-adaptation note may state that the current implementation
  follows verified formula semantics, but must not claim that FractalPark's
  license terms are identical to Fractint's. Independent rewrites identify the
  historical source and state that original FRM text is not redistributed;
- each of the 534 `publish` rows exposes its content-addressed pinned `.frm`
  Definition source,
  source/semantic revisions, parameter schema, pinned default Profile facts, a
  deterministic 96 x 60 static PNG generated from the pinned source and Profile,
  and locale-preserving Explore/Remix plus view/download-source actions;
- 357 generated previews are anomaly-free and shown by default; 177 report one
  or more deterministic visual diagnostics and are preserved behind an explicit
  diagnostic link instead of being presented as verified imagery;
- each of the 143 `hold` rows, and any future `exclude` row, exposes the factual
  decision and rights projection in the read model but renders only the N1
  minimal page, with no historical-resource link, source, preview, or runnable
  CTA.

`scripts/generate-formula-record-previews.ts` regenerates or byte-verifies the
exact 534-file preview set in four deterministic worker shards. Its content-hash
manifest is public evidence for static preview reproducibility only; it does not
close the representative GPU/device image-difference gate C9.

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

- `.frm`: one content-addressed pinned Formula Definition source file.
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

All Standard, Mine, and future Community execution MUST pass through one Safety
Envelope at every activated stage: import, client compile, worker, server/API
compile, publish, portable writer, and database constraints. The published
Standard Record runtime path is active; cross-surface writer/import/API/database
enforcement remains gated by A8, A9, C1, D5, D6, and D9 rather than being claimed
complete.

`MAX_EXECUTABLE_FORMULA_SOURCE_BYTES = 65_536` counts UTF-8 bytes, not UTF-16
code units. It applies to every new or rewritten executable Definition.

The existing `262_144`-byte portable ceiling is retained only for legacy reads.
A source in `65_537..262_144` bytes is preserved intact, read-only,
non-executable, non-publishable, non-overwritable, and never silently truncated.
After the user explicitly reduces it to at most 65,536 bytes and passes current
validation, it may be saved as a new Formula Asset.

The exact v1 source and non-source limits are delegated to
[normative §7](frm-like-language-v1.md#7-termination-and-safety-envelope) and are
identical for Standard, Mine, and future Community Definitions. Those frozen
source, IR, control-flow, and generated-shader limits MUST NOT vary at runtime by
Formula ID, scope, provenance, trust, or device.

Compile-time, iteration-count, worker memory/cancellation, and GPU
timeout/recovery budgets remain owned by this universal envelope but are not yet
frozen as measured v1 constants; their cross-surface evidence remains pending in
A9 and F2. A future NumericProfile or measured device-capability contract may
vary those runtime budgets, but not by Formula ID, scope, provenance, or trust.

A higher source limit is a forward-only contract change requiring coordinated
DB/API migration, worker/GPU budget evidence, and a new rollback floor. One
surface cannot raise it independently.

## 7. Rights and publication addendum

### 7.1 Evidence layers

- **Public:** neutral Formula IDs, published project source, public
  provenance/rights projection, publication decisions, aggregate counts, and
  schema-completeness gates.
- **Private:** source paths, reversible semantic intermediates, licensing
  evidence, fingerprints, migration joins, and exact technical artifacts.

Public repository, build output, logs, client bundles, route payloads, fixtures,
screenshots, and error messages must not contain private paths, uncontrolled
original source, or reversible private intermediates.

### 7.2 Publication decisions and implementation bases

The exact-677 catalog and the implementation bundle are separate projections.
Each identity has one rights status and one publication decision:

- rights: `project-owned`, `source-declared-public-domain-assumption`,
  `gpl-3.0-only`, or `no-explicit-permission`;
- decision: `publish`, `hold`, or `exclude`.

The current candidate ceiling is 604 (`89 + 137 + 378`). All 73
`gpl-3.0-only` identities are held: their Record and provenance remain visible,
but no canonical implementation, runnable entry, default Profile, or Remix action
ships in the MIT bundle. They may be reconsidered individually if their
publication basis changes.

Project-owned implementations use recorded ownership evidence. A
`source-declared-public-domain-assumption` row additionally records the source's
declaration, author, URL, and artifact hash; this label is not a claim of legally
verified public-domain status. A `no-explicit-permission` row may publish only
through separated independent rewrite: basis-before-code, non-reversible
math/behavior inputs, fresh project expression, leakage scanning, technical
fixtures, and a maintainer decision. A generator that reads private source or
reversible IR is not independent merely because it changes formatting or names.

The ledger records `formulaId`, source name/author/URL/artifact hash,
`rightsStatus`, `implementationBasis`, basis timestamp, `leakageScanStatus`,
`publicationDecision`, decision reason, and review time. Git/PR/CI provide the
engineering audit trail. No custom root, signed registry, credential binding,
multi-role approval, admission, or implementation authorization is required or
claimed.

The decision layer is frozen as the public asset
`resources/formula-library/v1/publication-decisions.json` (schema
`fractalpark-formula-library-publication-decisions/v1`): exactly 677 rows in
Standard-manifest order, one per neutral Formula ID, with rights status,
decision, reason, basis fields, scan status, and review date. Decision revision
4 records `publish = 534`, `hold = 143`, and `exclude = 0`: 106
`direct-adaptation`, 89 `project-owned`, and 339
`separated-independent-rewrite` rows publish; every other row remains held.
The engine validator `src/engine/formulas/v1/publication-decisions.ts` enforces
the exact-677 set, the P89/A137/B73/C378 rights accounting, the
`publish + hold + exclude = 677` decision accounting, the 604 implementation
candidate ceiling, and the fixed `hold` of all 73 `gpl-3.0-only` rows at load
time. `scripts/verify-formula-publication-decisions.ts` independently
recomputes the same accounting from raw bytes and frozen private evidence.

Published Definition bytes are additive, immutable runtime projections rather
than a second source of truth. `runtime/rev3` contains the 339 accepted
clean-room Definitions. `runtime/rev4` contains the low-risk A/P published set (A106 + P89), split into hash-pinned shards. Its controlled build
reconstructs Definitions from the frozen F588 work package/census and accepted
native Recipes, writes 0600 private staging, rereads and rehashes that staging,
and only then emits public shards. The private release-manifest hash, decision
content hash, exact Formula-ID set, sourceRevision, semanticHash, and every
shard byte hash are independently verified by
`scripts/verify-formula-runtime-rev4.ts`. Held/excluded identities must never
appear in either runtime projection.

The engine-facing published runtime is generated at
`public/formula-library/v1/runtime/published/`. It derives its exact 534-ID set
from decision revision 4, joins the 339 rev3 and 195 rev4 rows by Formula ID,
and emits a light `index.json` plus one immutable
`definitions/<sourceRevision>.frm` body per row. The index freezes metadata,
implementation basis, source/semantic revisions, versioned parameter binding
descriptors, and one mechanical or family-fallback default Profile. Before
exposing any row, the runtime recomputes a canonical whole-index SHA-256 against
a commitment compiled into the v1 loader; self-asserted revision strings and
basis counts are not sufficient authority. Definition bodies never enter an
eager JavaScript import; the selected body is fetched and revalidated before
compilation. Missing, duplicate, held, index-commitment-mismatched,
hash-mismatched, parse-invalid, or backend-invalid rows fail closed with no
legacy-formula fallback.

Candidate-C execution compiles a selected Definition through the frozen v1
backend into namespaced `frmV1_*` state, an explicit state-reset hook, an
arbitrary continue-predicate hook, and a source-revision cache fingerprint. The
framework calls reset once per orbit and per supersample, then evaluates the
Definition's own continue predicate after every step. The adapter does not alter
legacy B94 or classic-FRM assembly bytes. The engine capability originally landed
in isolation. The current application now activates Record-scoped published
Definition/Profile resolution, descriptor parameter UI,
and one-shot Record Open/Remix handoff for the 534 published rows. The unified
discovery selector and Lucky eligibility/ranking remain A19/E1/E3/E4-pending.
Canonical writer/import activation, hosted migration, and release remain separate
gates.

Remix shows and exports only a published pinned Definition source. `originalSource`
is separately access-controlled and never copied into public exports when the
rights status forbids it.

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
   Legacy writer remains Production default until exact-677 publication decisions,
   the published-N Definitions, resolver, runtime, cloud lifecycle, and release
   gates close.
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
- exactly 677 publication decisions, with
  `published + held + excluded = 677` and all 73 GPL identities held;
- every published Definition has readable pinned source and a verified default
  Profile; held/excluded identities expose no runnable or placeholder assets;
- all nine waiver dispositions have source, rights, and conformance evidence;
- source/semantic/profile hashes are deterministic and drift-checked;
- Standard and Mine use the same compiler and Safety Envelope;
- Document v3 / Envelope v2 dual-read and offline replay are green;
- 65,536/65,537 and legacy 256 KiB behavior agree across every entry point;
- CPU/WebGL orbit/event and image-difference suites pass declared tolerances;
- public leakage gates and private rights/provenance completeness pass;
- build, test, lint, responsive, accessibility, real-device, and rollback evidence
  is recorded.

Private technical candidates can exist behind test/Preview gates, but they do not
become public implementations without a `publish` decision. The catalog remains
exact-677 while runnable implementation publication is per-row. Hidden run-only
tiers, placeholder assets, and silent omissions are not acceptable completion
states.

## 10. Explicit non-goals for v1

No text search/full-text index, personalized ranking, visual-similarity map,
Community discovery/governance, arbitrary precision, perturbation, extended64,
new coloring/material/layer system, non-orbit program model, WebGPU backend,
native plugin API, third-party/network imports, complete revision timeline, or
automatic three-way merge is added by this contract.
