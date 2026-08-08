/**
 * Browser-safe mirrors of the attestation versions. The sources of truth are
 * in `src/lib/cloud/publications.ts` (which imports node:crypto and cannot be
 * bundled for the client). Unit tests lock both sides equal.
 */
export const RIGHTS_ATTESTATION_VERSION = '2026-08-02.v1';
export const FORMULA_SOURCE_ATTESTATION_VERSION = '2026-08-08.v1';
