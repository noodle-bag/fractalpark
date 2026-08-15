# ADR 0008: Unified Formula Library with reader-first activation

- Status: Accepted
- Date: 2026-08-15
- Target release: FractalPark v0.4.19
- Spec: [Unified Formula Library and FRM-like Language Contract v1](../specs/unified-formula-library-v1.md)
- Extends: [ADR 0007](0007-frm-semantics-versioning.md)

## Context

v0.4.18 established trusted Classic import and explicit FRM semantic versions,
but the product still has several competing identities and facts: 94 plugin
runtime IDs, 588 migration candidates, 21 Guide slugs, cloud custom-formula IDs,
registry-loaded execution state, and portable assets that may depend on a later
catalog lookup.

v0.4.19 must make formulas durable, editable, discoverable assets without
creating a privileged Standard runtime or weakening the rights boundary. The
approved migration target contains 677 frozen Standard identities, including
nine v0.4.18 waivers and four malformed/missing/non-runnable historical sources.
The release also needs a self-contained work format, but a writer-first migration
would make rollback unsafe.

## Decision

### One language and one execution policy

Adopt FractalPark FRM-like Language v1, stdlib v1, and NumericProfile
`standard32`. The parameter spelling froze only after the Slice 0 parser, 677
projection, round-trip, UI-schema, hash-layering, and ownership evidence passed;
the prototype is not production activation. Standard, Mine, and future Community
definitions compile through one typed pipeline and Universal Safety Envelope.
Formula ID, scope, provenance, rights class, alias, or trust cannot affect
language acceptance or resource limits.

### Neutral identity

Use lowercase UUID Formula IDs with scope stored separately. The 677 Standard IDs
are deterministic UUIDv5 values under frozen namespace
`4287abf5-af50-5f75-9d2a-f56bec9bdf2b`; Mine/future Community IDs use UUIDv4.
Legacy B94/F588/runtime/Guide identifiers become typed resolver aliases only.

### Four independent asset layers

- Formula Definition owns canonical source and executable semantics.
- Formula Profile owns current parameter and visual state.
- Formula Record owns public identity, content, provenance/rights, and discovery.
- FractalDocument owns final resolved artwork state plus an embedded Formula
  Snapshot.

Each layer has an independent revision domain. A Record or backend change cannot
silently change a saved work's math.

### Self-contained works and reader-first formats

Introduce reader-compatible FractalDocument v3 / Envelope v2 with an embedded,
revalidated Formula Snapshot. Ship dual readers before any new production writer.
The writer is separately feature-gated; Production schema migration and writer
enablement require separate authorization. The first deployed dual-reader commit
that can read v3/v2 becomes the rollback floor before the first production write.

### One source budget

Freeze 65,536 UTF-8 bytes as the maximum for every new or rewritten executable
Formula Definition across client, portable, API, compiler, publish, and database
surfaces. Keep 256 KiB only as a legacy preserve/read ceiling; over-64-KiB legacy
source is non-executable, non-publishable, and non-overwritable until explicitly
reduced and revalidated.

### Rights lanes and nine-waiver disposition

Public canonical source enters Git only through a proven direct-adaptation lane
or an isolated clean-room lane. Private original source and reversible semantic
intermediates remain Level 2 evidence and never enter public artifacts.

This is an explicit addendum to the earlier rights protocol: its B/C/R run-only
rule continues to govern third-party `originalSource`, but no longer forbids a
separately proven FractalPark-owned canonical implementation from being MIT and
source-visible. The distinction and implementation relationship are both shown
in Formula Record.

All nine waived identities remain in the 677 set. The four malformed, missing,
or intentionally non-runnable rows use a general rehabilitated clean-room lane:
their Records disclose the interpretation, and their Definitions require
independent specs, isolated implementation, and conformance fixtures. No ID gets
a parser/runtime exception. Failure of any row blocks all-or-nothing Standard
activation.

## Consequences

### Positive

- One editable source format connects Atlas discovery, Formula Records, Explore,
  Remix, My Formulas, cloud, and portable works.
- Neutral IDs and pinned revisions survive renames and implementation upgrades.
- Offline replay no longer depends on a mutable registry or network catalog.
- Standard and user formulas share security and performance rules.
- Reader-first deployment keeps rollback honest after new-format writes exist.
- Rights status is explicit without publishing controlled source.

### Cost

- The plugin registry can no longer serve as the catalog of truth.
- Existing Document, Envelope, cloud, resolver, import/export, Remix, and editor
  paths require coordinated dual-read migration.
- 677 public Definitions and default Profiles need deterministic generation,
  clean-room isolation where required, and CPU/WebGL evidence.
- Build payload, lazy loading, previews, localization, SEO, and device QA must be
  treated as release engineering, not deferred polish.

### Rejected alternatives

- Keep B94/F588 as public product tiers: rejected because provenance is not a
  user-facing capability or trust boundary.
- Publish hidden/run-only formulas: rejected because it breaks the editable
  Formula Definition promise.
- Let Standard exceed user safety limits: rejected because it creates privileged
  runtime paths and untestable security drift.
- Make Record own source: rejected because editorial revisions would become
  mathematical revisions.
- Save only Formula ID and re-read current catalog defaults: rejected because a
  work would not be reproducible or offline.
- Enable v3/v2 writers before dual readers: rejected because rollback would lose
  readability.
- Mechanically reformat controlled source and call it clean-room: rejected because
  reversible transformation is still derived implementation.

## Follow-up constraints

1. Prototype grammar, IDs/aliases, hashes, 677 size projection, dual reads, route
   seams, content package shape, and baselines before production implementation.
2. Land language/compiler core together with enforceable Safety Envelope limits;
   do not create an ungated core interval.
3. Do not enable a new writer, Production migration, deployment, tag, release, or
   IndexNow submission without its explicit gate and evidence.
4. Record the exact rollback floor before first production v3/v2 write.
