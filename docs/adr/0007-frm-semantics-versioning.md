# ADR 0007: FRM semantics versioning with legacy v1 freeze

- Status: Accepted
- Date: 2026-08-10
- Target release: FractalPark v0.4.18
- Spec: docs/specs/frm-compatibility-v1.md

## Context

Classic `.frm` compatibility requires correcting several semantic defects
in the current compiler path: bailout extraction that misreads swapped
operands (`4 < |z|` becomes threshold `4.0` with the direction discarded),
unknown predicates falling back to `4.0`, and per-consumer entry handling
that can silently compile the wrong entry of a multi-entry file.

Fixing these inline would silently change the visuals of existing user
artworks, cloud formulas, portable assets, and shared URLs. That is
unacceptable: published fractal images are user content, and a compiler
upgrade must not rewrite history.

## Decision

Introduce `frmSemanticsVersion` as an explicit, persisted compile-semantics
contract with two versions:

- **v1 (legacy, frozen)**: preserves current behavior exactly, including
  known defects. Missing version reads as v1.
- **v2 (strict)**: selected-entry compilation, bailout descriptors with
  exact comparison direction, after-step timing, and strict rejection of
  unknown predicates.

New formulas default to v2. No automatic upgrade anywhere (save, reopen,
publish, import, sync). Upgrades happen only through an explicit
"Upgrade & Compare" flow that renders both versions side by side and
persists solely on user confirmation.

Migrations are additive; readers stay v1-compatible indefinitely; writers
can be disabled for rollback without deleting v2 fields or user sources.
`coloring.pipelineVersion` remains a separate, independently persisted
contract.

## Consequences

- Old visuals are stable by construction; v1 defects are documented as
  compatibility behavior rather than correctness.
- Every consumer shares one authoritative scanner/entry contract, ending
  Editor-only preflight divergence.
- Verification splits into public Level 1 CI (clean-room fixtures) and
  maintainer-local Level 2 (private corpus, same candidate commit), so
  external contributors are never blocked by corpora they cannot hold.
- Rollback disables v2 writers/entry points while readers keep working.

## Alternatives considered

- **Silent inline fixes**: rejected — rewrites existing user visuals.
- **Forced migration on save**: rejected — violates the no-auto-upgrade
  rule and destroys downgrade paths.
- **Per-consumer gating**: rejected — recreates the double-semantics
  problem the authoritative entry contract eliminates.
