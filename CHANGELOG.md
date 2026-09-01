# Changelog

## 0.4.19 - Unreleased

Unified Formula Library: FractalPark now publishes a source-readable Standard catalog while keeping the existing Classic runtime as an explicit overlapping collection rather than the public total.

### Added

- Added 534 published Standard Definitions with pinned FRM-like v1 source, default Profiles, Record pages, and deterministic previews; unavailable catalog identities expose no runnable action.
- Added the Formula Atlas and server-rendered directory with exact category membership, 21 in-depth Guides, seven-locale Record metadata, canonical URLs, hreflang, JSON-LD, and sitemap coverage for the published set.
- Added source/remix workspaces, lazy runtime loading, Julia activation behind fail-closed release verification, and cloud-backed Mine formula lifecycle paths behind fail-closed writer gates.
- Added release-grade publication-isolation, source-derived Record image, performance, rights, rollback-floor, Guide/SEO, old-URL, and Julia verification gates.

### Changed

- Public product facts now distinguish all 534 published Standard Definitions from the overlapping 94-formula Classic collection instead of presenting Classic as the complete catalog.
- Formula discovery, Record navigation, Guide routing, source actions, and published-library selection now share the same revision-4 publication decision ledger.
- Record previews now cover all 534 published Definitions; 43 accepted deviations remain explicitly policy-bound instead of being hidden or relabeled as anomaly-free.

### Fixed

- Restored four held Guide identities only after source, runtime, preview, route, SEO, localization, and maintainer-review closure, bringing the public Guide count to 21 without exposing held content.
- Closed stale source-binding and rollback-evidence hashes after the final CI/release workflow wiring while preserving real-device, screen-reader, and deployed rollback evidence as fail-closed release requirements.

## 0.4.18 - 2026-08-14

Trusted classic FRM compatibility: one versioned compiler path now preserves existing v1 visuals while making strict v2 semantics explicit, inspectable, and reversible.

### Added

- Added the authoritative classic `.frm` scanner and frontend lowering pipeline, including selected-entry handling, classic syntax, parameters and `fn1`–`fn4`, assignment expressions, line continuation, and the compatibility extensions required by the frozen target set.
- Added strict-v2 bailout descriptors (C1, C2, C4-R, and C5), exact comparison direction, classic after-step timing, parameter-driven thresholds, and three-tier Smooth coloring capability with deterministic fallback.
- Added a real Upgrade & Compare flow: the stored source compiles under legacy v1 and strict v2 side by side, with isolated visual previews, semantic summaries, and diagnostics; only explicit confirmation changes the persisted version, and reverting restores v1.
- Added four-level Editor classification (Supported, Supported with adaptations, Read-only, Invalid source), structured diagnostics, source navigation, and manifest-driven compatibility facts in the FRM Guide.
- Added public Level 1 drift gates and a private-corpus Level 2 report contract. The frozen 588-target baseline is reported honestly as 579 strict-v2 passes plus 9 documented waivers, with 117 separate exclusions carrying stable reasons.

### Changed

- New cloud formulas use strict v2; existing rows and portable assets with a missing version remain on frozen legacy v1. Ordinary save, reopen, publish, import, sync, and remix paths preserve the stored version and never auto-upgrade.
- Formula semantics versions now round-trip through cloud DTOs, session assets, drafts, portable projects, public previews, publication validation, and the renderer pipeline.
- Added the forward-only cloud schema pair for semantics versioning: the nullable compatibility column plus the version-aware custom-formula save RPC, where ordinary updates preserve the stored version and explicit Upgrade/Revert writes persist `2`/`1`.
- The FRM Guide, frozen Spec, ADR, regression matrix, and seven locales now consume the same versioned capability and migration contract without presenting waivers as verified passes.

### Fixed

- Fixed swapped-operand bailout direction, exact C1 equality boundaries, unknown-predicate fallback, loop timing, C2 threshold coercion, registry-backed descriptor-aware shader cache keys, and strict-v2 rendering paths without changing legacy v1 output.
- Fixed Classic special-name `comment { ... }` blocks appearing as selectable formulas, section-keyword variable collisions (`init`, `loop`, `bailout`), and strict constant thresholds using `pi`/`e`.
- Fixed Upgrade & Compare being only a confirmation dialog; comparison is now read-only until confirmation and strict-v2 failures block the write with actionable diagnostics.
- Fixed same-source portable assets with different semantics versions being treated as interchangeable, and fixed successful version changes leaving the active session on a stale compiled plugin.
- Fixed native Editor sources being sent through the classic-only classifier, legacy-v1 custom assets inheriting a document's v2 renderer pipeline, and stale semantics confirmations bypassing revision conflict handling.
- Fixed custom-formula reads masking unrelated PostgREST failures as legacy-v1 data, owner pre-read errors losing their API mapping, and rename-only PATCH requests being rejected instead of preserving stored source, hint, and semantics.
- Fixed the standalone Editor's remaining local-storage copy and E2E assumptions: cloud-disabled saves now fail closed without navigation or a local write, while the real Supabase/Mailpit journey verifies strict-v2 cloud persistence before the Explore handoff.
- Fixed B94/native-v1 shaders failing compilation after the FRM `LastSqr` side channel was added: declarations remain FRM-owned, the assembler now gates per-orbit resets for every FRM formula that carries the channel (including non-C5 loop reads), and the project-owned maintainer WebGL gate covers LastSqr GPU/CPU orbits plus four pipeline-v1 compile/link/draw controls.
- Fixed compact navigation, Explore stacking, and Editor footer overflow across desktop, tablet, mobile, and long localized labels.
- Fixed unnamed custom-formula rename, edit, and delete icon actions with localized accessible names.

## 0.4.17 - 2026-08-09

Five-language international expansion: the full UI and content surface now ships in Portuguese, Korean, Russian, Spanish, and French alongside English and Chinese.

### Added

- Added pt/ko/ru/es/fr UI translations and localized content across Explore, Gallery, Formula Atlas, About, privacy, terms, and community rules.
- Added localized `og:locale`, HTML `lang`, and gallery date formatting for every route.

### Fixed

- Fixed the Explore tab overflow on localized navigation bars.
- Fixed `og:locale` and `lang` drifting from the active locale on localized routes.

## 0.4.16 - 2026-08-04

Cloud-first creation: accounts stop being an optional sync layer and become the single place where artworks and formulas live. Rendering stays entirely in the browser; creating needs no account; saving does.

### Added

- Added the private custom-formula cloud APIs (list/detail/save/delete) with owner-locked RPC writes, per-account quotas, optimistic concurrency, idempotency keys, and server-side compile and builtin-conflict validation.
- Added one-shot sign-in intents: saving an artwork or a formula while anonymous freezes the exact write, opens the OTP dialog, and resumes after verification — dismissed dialogs settle the caller explicitly instead of hanging it.
- Added MIT-licensed formula publishing: an artwork that carries a custom formula passes a server-side gate (single hash-matched asset, size cap, document reference, no builtin conflict) and publishes with its FRM source publicly downloadable, while the rendered image stays under CC BY 4.0.
- Added the FRM Guide sharing section and the dual-license display on community artwork pages.

### Changed

- Navigation is a single compact bar on every page: locale switcher, sign-in state, and a mobile sheet; My Works and the cloud surfaces share one session provider with a five-state model (loading, anonymous, authenticated, unavailable, disabled).
- Explore saves are cloud-authoritative: the draft identity lives in the URL (`?draft=`), refreshes and cross-device opens restore the same draft, revision conflicts offer reload/save-as-new exits, and a cloud outage says so instead of faking success.
- My Works is cloud-only; remix handoffs are transient (authenticated remixes open as cloud drafts, anonymous ones carry their bytes through an in-memory, one-time handoff); project-file imports register their formulas for the session without persisting them.
- My Formulas lives in the cloud library; the Explore canvas resolves session-registered formulas and rescues unknown ids through the detail API, including fresh-tab editor handoffs.
- Browser storage is out of the creation loop: the artwork and formula localStorage modules are deleted, a static guard test keeps the retired keys out of app source, and a Playwright probe verifies legacy keys are never read.
- The README, llms.txt, landing, About, and editor copy describe the real account/cloud model instead of the retired local-first claims.

### Removed

- Removed local artwork storage, the local formula library, and the `?artwork=` restore path (superseded by cloud drafts).

## 0.4.15 - 2026-08-03

(0.4.14 was skipped during PR 3 development; this release follows 0.4.13.)

### Added

- Added optional cloud accounts with passwordless email sign-in: a one-time code, an encrypted HttpOnly session cookie, and sign-out.
- Added private cloud drafts with optimistic concurrency, per-account quotas, idempotent writes, and cross-device continuation; local saves stay device-local and bound to their cloud copy.
- Added Community publishing: a rights attestation, CC BY 4.0 rendered-image licensing, remix provenance, public artwork pages, a no-store Community list, and Continue-editing/Remix forks.
- Added optional artwork backup emails (off by default) that send the portable `.fractal.json` on publish, or on every manual save, with an explicit unencrypted-attachment notice.
- Added account self-service: profile display name, backup-email preferences, and a two-step account deletion that withdraws publications, deletes drafts, ends sessions, and keeps only a tombstone attribution plus a minimal audit row.
- Added maintainer moderation: hide/restore for published works through a controlled, audited RPC, with a Report/Takedown entry on every public artwork page.
- Added the Privacy Policy, Terms of Service, and Community Rules pages, linked from the footer on every page.
- Added operator tooling: a cleanup worker, a logical cloud backup/restore pair with UUID remapping, and runbooks for moderation, backup/recovery, and production enablement.

### Changed

- Gallery's My Works now shows cloud drafts and published states alongside local works when signed in.
- Publish now presents the public-visibility, attribution, and withdrawal boundaries before the first publish.

## 0.4.13 - 2026-08-01

### Added

- Added the bilingual Formula Atlas with 94 formulas across 7 families, 21 in-depth Formula Guides, canonical formula visuals, and localized metadata.
- Added an SSR FRM Guide and standalone beta FRM Editor with shared examples, diagnostics, local `.frm` import/export, preview, and device-local formula storage.
- Added the FractalPark Collection with 26 localized artwork pages, canonical artwork URLs, CC BY 4.0 render licensing, 16:10 assets, related works, and native fullscreen playback.
- Added Remix provenance for formula and preset entry points, preserving namespaced source metadata when remixed artworks are saved.
- Added content analytics for formula, FRM, artwork, Remix, editor, example, and copy-link journeys.

### Changed

- Explore is now the default localized landing page, while the former preset slideshow is available as the immersive, noindex Drift experience.
- Gallery now separates the public FractalPark Collection from device-local My Works and uses a responsive 1/2/3-column artwork grid with hover playback on supported pointers.
- Public product facts, README/About content, JSON-LD, sitemap, crawler guidance, and llms documentation now share the same formula-first product contract.
- Legacy Explore URLs, saved artworks, Fractal Document v1/v2 data, project imports, and custom formulas remain compatible.

## 0.4.12 - 2026-07-25

### Added

- Added the versioned Fractal Document v2 and project Envelope v1 contracts.
- Added tolerant readers for legacy and future-version documents.
- Added portable `.fractal.json` project download, file-picker import, and drag-and-drop import.
- Added transaction-safe custom FRM import with integrity checks, conflict-safe IDs, and rollback.
- Added persistent Explore actions for Gallery save, project download/import, PNG export, and full artwork reset.
- Added a typed `RenderSnapshot` projection for PNG export.

### Changed

- New Gallery saves now use Document-first envelope records while legacy saved artworks remain readable.
- Reset now restores the complete default artwork after confirmation without deleting Gallery items or the custom formula library.
- Explore artwork actions now expose localized pending, success, and error feedback.
- Artwork analytics now include document version, formula kind, file-size buckets, and stable import error codes.

### Removed

- Removed the Share action from the Explore interface.
- Removed save, export, and reset actions from the Render tab in favor of the persistent canvas toolbar.
