/**
 * Browser-safe mirror of the attestation version. The source of truth is
 * `RIGHTS_ATTESTATION_VERSION` in `src/lib/cloud/publications.ts` (which
 * imports node:crypto and cannot be bundled for the client). The two are
 * locked equal by `src/test/cloud-publications.test.ts` — if you change
 * one side, change the other.
 */
export const RIGHTS_ATTESTATION_VERSION = '2026-08-02.v1';
