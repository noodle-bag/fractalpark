/**
 * FRM semantics versioning (docs/specs/frm-compatibility-v1.md §3,
 * docs/adr/0007-frm-semantics-versioning.md).
 *
 * `frmSemanticsVersion` is the compile-semantics contract of an FRM source:
 * missing / `1` = legacy v1 (frozen — known defects preserved), `2` = strict
 * v2 (selected-entry, bailout descriptors, after-step timing, strict
 * rejection of unknown predicates). At the mechanism layer both versions
 * compile identically; the v2 semantic differences land in a later Slice.
 */

/** Compile-semantics contract version of an FRM source. */
export type FrmSemanticsVersion = 1 | 2;

/** Runtime vocabulary of the semantics-version union; the bidirectional
 * assertion fails the build if a v3 ever lands without updating this list
 * (Slice 7a review). */
export const FRM_SEMANTICS_VERSIONS = [1, 2] as const;
type AssertExactVersions =
  [FrmSemanticsVersion] extends [(typeof FRM_SEMANTICS_VERSIONS)[number]]
    ? ([(typeof FRM_SEMANTICS_VERSIONS)[number]] extends [FrmSemanticsVersion] ? true : never)
    : never;
const _semanticsVersionsExhaustive: AssertExactVersions = true;
void _semanticsVersionsExhaustive;

/** Version used for new compiles; existing content with a missing version reads as v1. */
export const DEFAULT_FRM_SEMANTICS_VERSION: FrmSemanticsVersion = 1;

/** The strict contract: selected-entry, bailout descriptors, after-step. */
export const STRICT_FRM_SEMANTICS_VERSION: FrmSemanticsVersion = 2;

/**
 * Lenient reader for untrusted inputs (cloud rows, portable assets, URL
 * params): missing/null/undefined/1 → 1, 2 → 2, any other value → 1 with a
 * warning. Strict validation is left to upper layers.
 */
export function resolveFrmSemanticsVersion(raw: unknown): FrmSemanticsVersion {
  if (raw === undefined || raw === null || raw === 1) {
    return 1;
  }
  if (raw === 2) {
    return 2;
  }
  console.warn(
    `[frm] Unexpected frmSemanticsVersion ${JSON.stringify(raw)}; reading as legacy v1.`
  );
  return 1;
}
