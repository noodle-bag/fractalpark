# FRM Compatibility and Migration Contracts v1

- Status: Frozen (v0.4.18 Slice 0)
- Date: 2026-08-10
- Target release: FractalPark v0.4.18

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
- A single-entry file may select its only entry implicitly. A multi-entry
  file must be selected explicitly by the user or caller.
- Unselected multi-entry sources, trailing tokens after a complete entry,
  and duplicated or broken entry boundaries are rejected consistently in
  Editor, API, resolver, publication, and CLI paths.
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

- Bailout descriptors allow only: C1 fixed radial, C2 parameterized
  radial, and C4-R in the two normalized forms `abs-real` / `real`.
- Comparison direction (`<`, `<=`, `>`, `>=`) is preserved exactly; operand
  swapping must not smuggle in a changed meaning.
- Legacy v1 mis-extraction of swapped operands may exist only inside the
  compatibility reader/controls — never in v2 descriptors, capability
  conclusions, or strict-pass evidence.
- Thresholds must be loop-invariant expressions: they may reference
  declared parameters, never per-iteration orbit state.
- Classic v2 evaluates the continue condition after executing the current
  loop body. B94/native v1 keeps the existing pre-step contract.
- `LastSqr`, complex relations, `abs`, `flip`, truthiness, and inverse
  functions are defined solely by the canonical IR.
- Unsupported predicates produce a stable structured reason and land in
  Read-only; they never silently default to radial.

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
evidence, and to the `review-required` publication flag. Lint, compile
results, and status cards dedupe by `reasonCode + location`. Mobile keeps
a single-line summary with on-demand details. Read-only/Invalid entries
keep editing, copying, download, and source navigation.

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
| Semantics | descriptor, params/fn, timing, capability | unknown = 0 |
| Orbit | per-iteration z/LastSqr/continue/iteration | full target set |
| WebGL | compile/link/first frame/NaN/basic interaction | starter-profile smoke |

- **Level 1 (public PR CI)** runs clean-room fixtures, project-owned B94
  controls, v1/v2 round-trips, message key-set/interpolation parity across
  all supported locales, manifest/drift checks, leakage scan, lint, unit,
  build, and affected Playwright. It must not require private corpora.
- **Level 2 (maintainer-local pre-merge hard gate)** injects the private
  corpus via local path on the same candidate commit that passed Level 1,
  and persists only report schema/version, compiler commit, source
  snapshot hash, selector version, device/environment, aggregate results,
  duration, and report content hash — never corpus text or local paths.

## 10. Compatibility facts baseline (frozen at Slice 0)

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
