# Formula library rights and publication testing

This document describes the independent publication-isolation gate for the v1 Standard formula library. It is a test contract, not a publication-decision mechanism: the frozen population remains **677 identities = 513 published + 164 held**, with all **73 B-source GPL rows held**.

## Gates

| Gate | Command | Environment | What it proves |
| --- | --- | --- | --- |
| Public checkout | `npm run formula:rights:verify` | ordinary checkout | Frozen decision/index identity-set anchors; exact published runtime projection; held/B73 absence from implementations, previews and actions; forbidden private fields absent from public JSON; private evidence paths remain ignored and untracked; the pinned private-evidence attestation is byte-exact. |
| Built artifacts | `npm run formula:rights:verify-build` | successful production build | The public gate plus leakage scanning of `.next` client/server/RSC/SSR/API output and `out`; source maps contain no embedded source content and no private path markers. |
| Controlled evidence | `npm run formula:rights:private-build` | fixed secure evidence host after production build | The public/build gates plus independent reconstruction from the hash-pinned 677-row handoff, release manifest, final census, clean-room receipts, archived allowed inputs, transcripts, outputs, pilot scanner gates and private-source/locator scans. |
| Release checkout | `npm run formula:rights:release` | ordinary release runner after production build | The build-output gate plus the byte-pinned controlled-evidence attestation. No private evidence body is copied to a public runner. |

The controlled-evidence command uses one fixed handoff path and its frozen SHA-256; callers cannot substitute an arbitrary handoff through an environment variable. It fails when the private root is not a real `0700` directory or when any pinned evidence byte drifts. The public attestation contains hashes and counts only, and its complete file hash is frozen in the verifier.

The private gate also preserves a historical distinction instead of erasing it: 26 bulk receipts refer to a final receipt-spec hash that differs from the archived implementer-input spec hash. For those rows it independently verifies the archived allowed input bytes, the transcript, the accepted output, and the final parser/CPU/WebGL acceptance receipt, and freezes the exact drift count. A new or removed mismatch fails closed.

## Portable files

All enabled `.frm`, `.fractal-formula.json`, `.fractal` and document-envelope writers call the publication policy before serialization. A Standard formula whose decision is not `publish` returns `formula-not-published`; writer flags and feature flags cannot promote it. Mine/community formulas retain their existing local lifecycle.

## Negative fixtures

`src/test/formula-publication-isolation.test.ts` exercises the verifier with repaired self-hashes and deliberate mutations:

- substitution of a held formula into the runtime projection;
- modification of a clean-room decision while recomputing the decision ledger hash;
- injection of actions or forbidden private fields into held records;
- private path, source-fragment and locator leakage into bundle/API/portable/source-map-like surfaces.

`src/test/formula-portable-lifecycle-v1.test.ts` separately proves that every portable writer rejects a held Standard formula even when the writer is explicitly enabled.

## CI and release behavior

The ordinary CI workflow runs the public gate before the production build and the build-output gate after it. The Published Formula WebGL workflow is also triggered by decisions, isolation contracts, the private attestation, preview assets, runtime sources and verifier/generator changes. The release workflow verifies the pinned attestation and scans its own build output; refreshing the attestation requires a separate controlled-evidence run and code review.

A passing rights gate does **not** waive performance, accessibility, real-device, Preview rollback or deployment evidence. Those release gates remain independent.
