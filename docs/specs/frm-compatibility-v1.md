# FRM Compatibility and Migration Contracts v1

- Status: Frozen (v0.4.18, Release)
- Date: 2026-08-12
- Last verified: 2026-08-12 (commit 0bf85b7, PR #19, all slices completed)

## Purpose

This spec freezes the contracts that every FRM consumer (Editor, API,
resolver, cloud publication, CLI, harness) must share when importing,
compiling, and running classic `.frm` formula sources. It exists so that
compatibility claims are verifiable against a single semantic pipeline
instead of per-consumer ad-hoc behavior.

Out of scope: publishing third-party formula sources, a unified formula
library, per-formula public pages (deferred to a later release).

## 1. Single semantic pipeline

All consumers must flow through one pipeline:

```text
source
  → authoritative scanner / selected entry
  → native or Classic frontend
  → canonical IR
  → validator + capability resolver
  → codegen / plugin / assembler
  → runtime + versioned reports
```

Analysis tooling (ledger projectors, compatibility reporters) must call the
production compiler API only. A shadow parser, classifier, or numeric
reimplementation invalidates the evidence it produces.

## 2. Authoritative entry contract

- The scanner returns an entry list with exact source ranges, header
  metadata, diagnostics, and a stable selection key per entry.
- The classic header grammar is
  `NAME [(SYMMETRY)] [[option=value ...]] [=] {`; the option block is
  recorded verbatim on the entry. The optional `=` may glue to the name
  (`T={`) or stand alone (`T = {`); a name may itself contain `=`
  (`z^3-1=0`) when it does not trail the token. `function=fn1/fn2/...`
  pre-specifies the fn slots positionally (classic would otherwise prompt
  at run time); known names become the compiled plugin's u_fnN uniform
  descriptor defaults — executable unless the caller overrides them —
  while unknown names record raw in `plugin.fnDefaults` and keep the
  engine default.
- A single-entry file may select its only entry implicitly. A multi-entry
  file must be selected explicitly by the user or caller.
- Unselected multi-entry sources and broken entry boundaries are rejected
  consistently in Editor, API, resolver, publication, and CLI paths.
  Trailing content after a complete entry is classified by shape: content
  bearing a `{` may be a corrupted entry header and stays rejected; bare
  prose paragraphs (a classic corpus convention — `;`-less comment blocks
  between entries) are annotated, never blocking — and the annotations ride
  the compile result (`scanAnnotations`) so an unrecognized region is
  always visible to the caller. Duplicated entry names
  are annotated and resolve deterministically by unique selection key —
  a bare name selects the first occurrence, later duplicates require the
  suffixed key the scanner assigned (`#2`, `#3`, … — the suffix is the
  duplicate ordinal and may skip when a literal name collides).
- Compile entry points accept a selected source range or entry key. The
  "take the first entry and compile" shadow path is forbidden.
- The source file is never mutated by scanning, selection, or compilation;
  entry-level execution must not break file-level editing, copying, or
  download.

## 3. Semantics versioning (`frmSemanticsVersion`)

`frmSemanticsVersion` is the compile-semantics contract of an FRM source:

| Version | Behavior |
|---|---|
| missing / `1` | Legacy v1. Exactly preserves the current parser, bailout
  extraction, timing, and published visuals — including the known defects:
  a numeric literal on the left side of a comparison is read as the
  threshold, the comparison direction is discarded, and unknown predicates
  fall back to `4.0`. Frozen means visually compatible, not semantically
  correct. |
| `2` | Strict v2. Selected-entry, bailout descriptors, after-step timing,
  and strict rejection of unknown predicates take effect. |

Rules:

- New formulas default to v2. Existing cloud rows, portable assets, and
  historical Documents with a missing version are read as v1.
- Ordinary save, reopen, publish, import, and sync must never auto-upgrade.
- "Upgrade & Compare" renders v1 and v2 side by side, shows semantic,
  diagnostic, and visual differences, and persists only after explicit
  user confirmation.
- The v1/v2 visual corpus must cover swapped operands (`4 < |z|`),
  unknown-predicate fallback, and normal right-side thresholds. Legacy
  content is judged by v1 visual stability; strict v2 is judged by
  directional correctness or an explicit Read-only verdict.
- Migrations are additive. Writers may be rolled back; readers stay
  v1-compatible indefinitely.
- `coloring.pipelineVersion` describes the coloring pipeline only and is
  persisted and migrated separately from `frmSemanticsVersion`.

## 4. Canonical IR and bailout descriptors

- Bailout descriptors allow exactly five kinds: C1 (fixed radial), C2
  (parametrised radial), C4-R (real-projection in `abs-real` / `real`
  forms), and C5 (squared magnitude via the `LastSqr` side-channel). The
  five-kind vocabulary is a runtime constant gated by a build-time
  bidirectional exhaustiveness assertion — adding a descriptor kind
  without updating the list fails the build.
- Comparison and logical operators (`< <= > >= == != && ||`) are allowed
  in C2 threshold expressions when their operands are loop-invariant; they
  produce classic 0/1 reals. `real()` is an allowed threshold function;
  `imag()` is intentionally excluded (its scalar default is always 0).
- Comparison direction (`<`, `<=`, `>`, `>=`) is preserved exactly; operand
  swapping must not smuggle in a changed meaning.
- Legacy v1 mis-extraction of swapped operands may exist only inside the
  compatibility reader/controls — never in v2 descriptors, capability
  conclusions, or strict-pass evidence.
- The classic `if(p2<=0)test=4else test=real(p2)endif` threshold idiom is
  synthesised by the compile-time binding collector: when every branch of
  an init `if`/`elseif`/`else` (exhaustive else required) assigns the SAME
  target exactly once — and no other init or loop assignment touches that
  target — the collector derives a right-folded expression `c1*A +
  (1-c1)*(c2*B + (1-c2)*C)` (exact for 0/1 conditions; the synthesis
  gate restricts condition roots to comparisons and logicals). The
  derived expression then passes through the same invariance gate as any
  hand-written threshold.
- A branch-uniform final |z| refresh — every branch of a trailing
  `if`/`else` ends with the same `x = |z|` — proves x is a final `|z|`
  alias, enabling the descriptor to recognise radial magnitude forms that
  run through a per-iteration branch (e.g. `inandout02`).
- Classic v2 evaluates the continue condition after executing the current
  loop body. B94/native v1 keeps the existing pre-step contract.
- `LastSqr`, complex relations, `abs`, `flip`, truthiness, and inverse
  functions are defined solely by the canonical IR.
- Unsupported predicates produce a stable structured reason and land in
  Read-only; they never silently default to radial.

### 4.1 Assignment expressions and boolean arithmetic (v0.4.18 Slice 6b2)

Classic `.frm` sources may embed assignments inside expressions
(`z = flip(z=1)`). The lowering transforms these into sequenced
temporaries: `frmseq<N>` variables are assigned in deterministic
target-first order (`z = A; frmseq1 = z` — the temp carries the
*stored* value, not a pre-store snapshot), preserving left-to-right
classic order where semantics depend on it. The lowering rejects
assignments in bailout expressions, `&&`/`||` right-hand sides,
`elseif` conditions, and component-assignments (`real(x)=1`) at the
statement level — these forms are well-known to produce implementation-
defined behaviour in Fractint and are refused loudly.

Boolean arithmetic (`(x<10)*(4 - (x<10)*3)`) relies on comparisons
producing exact 0/1 reals. The evaluator, codegen, and invariance
gates treat `< <= > >= == != && ||` as 0/1-producing; `&&`/`||`
coerce operands via the real-part truthiness rule (`.x != 0` → 1, else
0). Implicit multiplication between a number and an adjacent identifier
(`3z`) is lexical only — the parser drops `NEWLINE` tokens, so the
adjacency must be literal in the source text; `3 z` is a syntax error.
Scientific notation (`1e-12`) is a single lexer token; malformed
exponents (`2e`, `e5`) fall back to two tokens (`2`, `e` the Euler
constant) so classic truthiness edge cases stay intact.

## 5. Parameters and function slots

- The parameter schema unifies dedicated scalar uniforms, `p1`–`p5`, and
  `fn1`–`fn4`; only actually used slots are surfaced.
- For every runnable formula, slots marked as used must be editable in the
  Explore parameter area: complex parameters via Re/Im numeric inputs,
  dedicated scalar uniforms via type-appropriate numeric controls, and used
  `fn1`–`fn4` via function selectors. Unused slots must not render.
- Labels, types, defaults, soft ranges, and steps come only from the
  verified schema. Without a reliable range source, no fake hard clamp is
  shown, and "show actual parameters" must not degrade to read-only text.
- Parameter and fn updates travel over the existing uniform + GLSL
  dispatch chain: ordinary adjustments update uniforms only and must not
  trigger shader recompiles.
- Default sources in priority order: `.frm default` → `.frm Try` →
  official `.par` → provably safe inherited zero → curated manual seed.
- Parameters, fn, mode, bailout threshold, and semantics version must
  round-trip through Editor, Explore, URL, Document, and portable asset.

## 6. Compatibility status and diagnostics

Every recognized entry gets exactly one product status:

| Status | Meaning | Runnable |
|---|---|---|
| Supported | Semantics directly supported | yes |
| Supported with adaptations | Uses declared and verified adaptations | yes |
| Read-only | Source readable; semantics outside this release's boundary | no |
| Invalid source | Structure insufficient to form a valid entry/IR | no |

Status is orthogonal to error/warning/note severity, to verification
evidence, and to the `review-required` publication flag. The adaptation
vocabulary (each declared and verified by the engine's own gates) is:

- **Bailout descriptor kinds** C2 / C4-R / C5 — exotic but verified
  forms; C1 is not an adaptation.
- **Smooth capability** `adapted` (transcendental/non-polynomial) and
  `unavailable` (C4-R / inverse-radial → deterministic Escape Time
  fallback).
- **Default-bailout injected** — the classic frontend records a note
  when it applies the default `|z|<=4` contract to an entry that lacked a
  predicate line.
- **c-init-rebinding** — classic c-rebinding renamed by the frontend.

After-step timing is the uniform classic-v2 truth and is deliberately NOT
an adaptation. `function=` slot defaults and `float=` options are recorded
as informational notes (visible, never blocking).

Lint, compile results, and status cards dedupe by `reasonCode + location`. Mobile keeps a single-line summary with on-demand details. Read-only/Invalid entries keep editing, copying, download, and source navigation.

## 7. Coloring capability

- Capability derives from AST/dataflow plus the current profile — never
  from family, name, `supportsPower`, or a default `u_power=2` guess.
- `Supported` uses proven classic/polynomial smooth coloring; `Adapted`
  uses the explicitly labeled `radial-crossing-v1`; `Unavailable` falls
  back to deterministic Escape Time.
- C4-R does not reuse radial crossing by default.
- Requested coloring preference and effective method are stored
  separately; when capability is temporarily unavailable the preference is
  preserved and deterministically restored.
- B94, historical Documents/URLs/artworks stay on pipeline v1; strict
  FRM paths use v2. The renderer/assembler must actually consume
  `pipelineVersion`.
- Normal-map/DEM is not implied by Smooth availability; it requires its
  own capability.

## 8. Private corpus, licensing, and public artifacts

- A user's local import grants no redistribution rights to FractalPark.
- Private gate corpora are injected via local paths; only source, version,
  hash, and results are persisted — never into the public repo, vault,
  bundle, or public assets.
- Public tests use minimal clean-room fixtures that are project-authored,
  public domain, or explicitly licensed.
- Unconfirmed author/year/license defaults to `review-required` and must
  not display verbatim source.
- Public content in this release is limited to capability boundaries,
  aggregate numbers, the reason taxonomy, and project-owned examples.

## 9. Verification gates

Five layers, split across two execution levels:

| Layer | Content | Final threshold |
|---|---|---|
| File | entry boundary, selected entry, trailing source | corpus fully determined |
| Syntax | native/Classic → canonical IR | target set generatable, exclusions definitively rejected |
| Semantics | descriptor, params/fn, timing, capability | unknown = 0 (all five descriptor kinds verified) |
| Orbit | per-iteration z/LastSqr/continue/iteration | full target set |
| WebGL | compile/link/first frame/NaN/basic interaction | starter-profile smoke (sampled CI) / full-coverage smoke (maintainer Level 2) |

- **Level 1 (public PR CI)** runs clean-room fixtures, project-owned B94
  controls, v1/v2 round-trips, message key-set/interpolation parity across
  all supported locales, capability-manifest drift checks (7a), compat-
  report schema verifier (7d), leakage scan, lint, unit, build, and
  affected Playwright. It must not require private corpora. The sampled
  smoke runs a deterministic stride of the ledger and always stays green
  in CI.
- **Level 2 (maintainer-local pre-merge hard gate)** injects the private
  corpus via local path on the same candidate commit that passed Level 1,
  and persists only report schema/version, compiler commit, source
  snapshot hash, selector version, device/environment, aggregate results,
  duration, and report content hash — never corpus text or local paths.
  The full-coverage smoke mode (`FRM_SMOKE_FULL=1`) covers every corpus-
  resolvable ledger row including anchor-reconstructed entries (source
  text derived from the ledger's sha256-anchored normalised cells); a
  single row of chaotic-f32-boundary divergence is documented with
  per-round trajectory evidence and gated by an exact GPU/CPU fingerprint
  (Slice 7d).

## 10. Compatibility facts baseline (frozen at Slice 7, Release)

- Resolution: 588 target entries (362 T0 / 174 T1 / 52 T2) + 117
  exclusions with documented reasons = 705 total ledger rows.
- Descriptor kinds: C1 / C2 / C4-R / C5 (all five verified across the
  target set). Reject reasons: `unknown-predicate`, `unknown-magnitude-
  form`, `threshold-not-loop-invariant`, `chained-logical`, and per-row
  dialect gaps (inverse-trig family `asin`/`acos`/`atan`, system-var
  writes, read-only constant shadowing).
- Supported locales: `en`, `zh`, `pt`, `ko`, `ru`, `es`, `fr` (single
  registry source of truth). HTML lang: `en`, `zh-CN`, `pt-BR`, `ko-KR`,
  `ru-RU`, `es-ES`, `fr-FR`; OG locale uses the underscore mapping.
- Public formula count remains `94`; the unified-library fact-source move
  belongs to a later release.
- Public version facts (`package.json`, `SITE.version`, `CHANGELOG.md`)
  are aligned to the currently deployed release before any v0.4.18 bump.

## 11. Private ledger entry point

The private compatibility ledger (corpus of record: 705 sources → 588
target entries + 117 exclusions; tiers T0/T1/T2 = 362/194/32; C1/C2/C4-R =
465/110/13) lives outside the public repository. The public side of the
ledger is only its schema:

```ts
interface CompatibilityLedgerEntry {
  sourceId: string;            // opaque internal id, never a file name
  sourceVersion: string;       // corpus snapshot version
  sourceHash: string;          // content hash of the source
  classification: 'target' | 'excluded';
  tier?: 'T0' | 'T1' | 'T2';   // target entries only
  bailoutClass?: 'C1' | 'C2' | 'C4-R';
  exclusionReasonCode?: string; // excluded entries only, from the frozen taxonomy
  semantics: 'v1-control' | 'v2-strict';
  compilerVersion: string;     // compiler commit that produced the verdict
  reportVersion: string;       // report schema version
}
```

Ledger numbers must be self-consistent at freeze time (target + excluded =
corpus size; tier sum = target size; classification unknown = 0). The
ledger is consumed by the Level 2 harness only and never serialized into
the public bundle, docs, or messages.
