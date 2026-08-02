/**
 * Shared attestation constants mirrored for the browser bundle. The
 * server-side source of truth lives in `src/lib/cloud/publications.ts`
 * (which imports node:crypto and cannot be bundled for the client); both
 * sides must carry the same version string, enforced by a unit test.
 */
export const RIGHTS_ATTESTATION_VERSION = '2026-08-02.v1';
