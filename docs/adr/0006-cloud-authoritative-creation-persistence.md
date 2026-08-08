# ADR 0006: Cloud-Authoritative Creation Persistence

- Status: Accepted
- Date: 2026-08-03
- Target release: FractalPark v0.4.16
- Supersedes: the local-first persistence portions of
  [ADR 0001](0001-saved-data-migration.md) and the local–cloud binding
  contract of v0.4.15 (spec `web-creation-loop-v1.md` §11). Those documents
  remain the accurate record of their own releases and are not rewritten.

## Context

v0.4.15 shipped the cloud creation loop as a sync layer on top of
local-first storage: Save wrote the browser repository first and attached
cloud state later, Explore identity was `?artwork=<localId>`, My Formulas
lived entirely in `localStorage`, and My Works rendered three concepts
(cloud drafts, published, on-this-device) at once. The result was three
user-visible truths for the same artwork and no cloud story at all for
custom formulas.

The maintainer confirmed on 2026-08-03 that no real external user holds
browser-side artwork or formula data worth preserving (production cloud
went live the same day), and approved a one-time clean cut instead of a
legacy reader, migration wizard, or double-write window.

## Decision

1. **The cloud draft is the only artwork persistence.** `artwork_drafts`
   Envelope + revision is the authoritative fact for saved artwork. Runtime
   code no longer reads, writes, or deletes the legacy keys
   `fractalpark-artworks-v1`, `myfrac-saved-fractals`, or
   `myfrac-custom-formulas`; no compatibility reader ships.
2. **Explore session identity is `?draft=<uuid>`.** The URL parameter is a
   lookup hint, never an authorization fact; the owner API re-verifies the
   session on every call. `?artwork=<localId>` is removed from the runtime
   contract.
3. **My Formulas becomes an owner-scoped cloud store** (`custom_formulas`
   table, owner RPCs, revision optimistic concurrency, 50-record quota,
   64 KiB source budget — both new contracts introduced by this release,
   not inherited limits). Artwork envelopes snapshot the referenced
   formula source/hash so later library edits or deletion never break
   saved drafts.
4. **Anonymous creation stays intact.** Explore, FRM compile/preview,
   import, download, and community remix require no account; the first
   Save triggers a contextual OTP whose intent (frozen envelope, title,
   thumbnail) resumes automatically after verification. Intents live only
   in React memory — never in storage, URLs, or analytics payloads.
5. **The session state machine has five states.** `loading`, `disabled`
   (feature switch off), `unavailable` (transport/service failure),
   `anonymous`, `authenticated`. UI must never render `unavailable` as
   `anonymous` (a sign-in prompt during an outage is a lie).
6. **First-frame/hydration contract.** While the session or a `?draft=`
   fetch is unresolved, SSR and the first client frame render a
   deterministic placeholder shell — no private data, and never a default
   fractal impersonating content. State transitions happen only after
   mount (the Drift first-frame lesson).
7. **Write idempotency reuses the v0.4.15 operation gate**:
   `Idempotency-Key` + request hash + stored replay on every draft and
   formula create/update/delete; a lost create response never duplicates
   a record.
8. **Custom-formula artworks may be published.** The blanket
   `formula_assets_not_publishable` rejection is replaced by strict
   validation (single referenced asset, hash match, ≤64 KiB, server-side
   compile). The immutable publication snapshot freezes the formula
   source under the **MIT** license with scope `formula_source`, separate
   from the image layer's CC BY 4.0. The publish dialog requires an
   explicit author confirmation that the source becomes public.
9. **Navigation is unified**: a data-driven language dropdown that
   preserves path, query, and hash; Sign in/out fixed in the navbar;
   navbar height 48 px (never below the 44 px touch floor).

## Consequences

- Rollback is application-level: redeploying the previous release restores
  local-first code that reads legacy keys, which is why browsers must not
  be proactively wiped before release. Drafts created under v0.4.16 are
  preserved server-side but are not readable by the rolled-back UI; a
  documented rollback-compatibility check is part of the release gate.
- The clean-cut premise (no external user data) is time-stamped
  2026-08-03 and must be re-verified on release day before the production
  deploy.
- Server-side Draft/Formula data is never destructively rolled back;
  migrations remain forward-only.
