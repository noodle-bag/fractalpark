/**
 * Standard formula directory (v1): the join of the 677-row identity asset
 * (formulaId/displayName/primaryFamily) with the publication decision
 * ledger (rights/decision/basis). This is the read model behind the Atlas
 * faceted directory (implementation plan commit 15): every Standard
 * identity is reachable here with its current publication status, whether
 * or not it has a published implementation.
 *
 * The directory never derives status: it projects the two pinned assets
 * verbatim and fails closed if they drift apart.
 */

import identityAsset from "../../../../resources/formula-library/v1/standard-formula-ids.json";
import {
  PUBLICATION_DECISION_LEDGER_V1,
  type FormulaImplementationBasisV1,
  type FormulaPublicationDecisionV1,
  type FormulaRightsStatusV1,
} from "./publication-decisions";
import type { FormulaIdV1 } from "./types";

export const FORMULA_DIRECTORY_COUNT_V1 = 677;

export const FORMULA_DIRECTORY_FAMILIES_V1 = [
  "algebraic-power",
  "transcendental",
  "function-composition",
  "rational-reciprocal",
  "orbit-memory",
  "folded-absolute",
  "root-finding",
] as const;

export type FormulaDirectoryFamilyV1 =
  (typeof FORMULA_DIRECTORY_FAMILIES_V1)[number];

export interface FormulaDirectoryEntryV1 {
  readonly formulaId: FormulaIdV1;
  readonly displayName: string;
  readonly primaryFamily: FormulaDirectoryFamilyV1;
  readonly rightsStatus: FormulaRightsStatusV1;
  readonly publicationDecision: FormulaPublicationDecisionV1;
  readonly implementationBasis: FormulaImplementationBasisV1 | null;
}

export interface FormulaDirectoryFacetCountV1 {
  readonly value: string;
  readonly count: number;
}

export interface FormulaDirectoryFacetsV1 {
  readonly families: readonly FormulaDirectoryFacetCountV1[];
  readonly decisions: readonly FormulaDirectoryFacetCountV1[];
  readonly rights: readonly FormulaDirectoryFacetCountV1[];
}

interface IdentityAssetRow {
  readonly formulaId?: unknown;
  readonly displayName?: unknown;
  readonly primaryFamily?: unknown;
}

function isFamily(value: unknown): value is FormulaDirectoryFamilyV1 {
  return (FORMULA_DIRECTORY_FAMILIES_V1 as readonly string[]).includes(
    value as string,
  );
}

function buildDirectory(): readonly FormulaDirectoryEntryV1[] {
  const rawRows = (identityAsset as { formulas?: unknown }).formulas;
  if (!Array.isArray(rawRows) || rawRows.length !== FORMULA_DIRECTORY_COUNT_V1) {
    throw new Error("standard-formula-directory-invalid");
  }
  const entries: FormulaDirectoryEntryV1[] = [];
  const seen = new Set<string>();
  for (const raw of rawRows as readonly IdentityAssetRow[]) {
    const decision = PUBLICATION_DECISION_LEDGER_V1.decisionFor(
      raw.formulaId as FormulaIdV1,
    );
    if (
      typeof raw.formulaId !== "string" ||
      typeof raw.displayName !== "string" ||
      raw.displayName.length === 0 ||
      !isFamily(raw.primaryFamily) ||
      decision === undefined ||
      decision.formulaId !== raw.formulaId ||
      seen.has(raw.formulaId)
    ) {
      throw new Error("standard-formula-directory-invalid");
    }
    seen.add(raw.formulaId);
    entries.push(
      Object.freeze({
        formulaId: decision.formulaId,
        displayName: raw.displayName,
        primaryFamily: raw.primaryFamily,
        rightsStatus: decision.rightsStatus,
        publicationDecision: decision.publicationDecision,
        implementationBasis: decision.implementationBasis,
      }),
    );
  }
  if (entries.length !== FORMULA_DIRECTORY_COUNT_V1) {
    throw new Error("standard-formula-directory-invalid");
  }
  return Object.freeze(entries);
}

/** All 677 Standard identities joined with their publication decisions. */
export const STANDARD_FORMULA_DIRECTORY_V1: readonly FormulaDirectoryEntryV1[] =
  buildDirectory();

const STANDARD_FORMULA_DIRECTORY_BY_ID_V1 = new Map(
  STANDARD_FORMULA_DIRECTORY_V1.map((entry) => [entry.formulaId, entry]),
);

export function getFormulaDirectoryEntryV1(
  formulaId: unknown,
): FormulaDirectoryEntryV1 | undefined {
  return typeof formulaId === "string"
    ? STANDARD_FORMULA_DIRECTORY_BY_ID_V1.get(formulaId as FormulaIdV1)
    : undefined;
}

export interface FormulaDirectoryFilterV1 {
  readonly family?: FormulaDirectoryFamilyV1;
  readonly decision?: FormulaPublicationDecisionV1;
}

export function filterFormulaDirectoryV1(
  filter: FormulaDirectoryFilterV1,
  entries: readonly FormulaDirectoryEntryV1[] = STANDARD_FORMULA_DIRECTORY_V1,
): readonly FormulaDirectoryEntryV1[] {
  return entries.filter(
    (entry) =>
      (filter.family === undefined || entry.primaryFamily === filter.family) &&
      (filter.decision === undefined ||
        entry.publicationDecision === filter.decision),
  );
}

function countBy(
  entries: readonly FormulaDirectoryEntryV1[],
  key: (entry: FormulaDirectoryEntryV1) => string,
  order: readonly string[],
): FormulaDirectoryFacetCountV1[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = key(entry);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return order
    .filter((value) => counts.has(value))
    .map((value) =>
      Object.freeze({ value, count: counts.get(value) ?? 0 }),
    );
}

export function buildFormulaDirectoryFacetsV1(
  entries: readonly FormulaDirectoryEntryV1[] = STANDARD_FORMULA_DIRECTORY_V1,
): FormulaDirectoryFacetsV1 {
  return Object.freeze({
    families: Object.freeze(
      countBy(
        entries,
        (entry) => entry.primaryFamily,
        FORMULA_DIRECTORY_FAMILIES_V1,
      ),
    ),
    decisions: Object.freeze(
      countBy(
        entries,
        (entry) => entry.publicationDecision,
        ["publish", "hold", "exclude"],
      ),
    ),
    rights: Object.freeze(
      countBy(
        entries,
        (entry) => entry.rightsStatus,
        [
          "project-owned",
          "source-declared-public-domain-assumption",
          "gpl-3.0-only",
          "no-explicit-permission",
        ],
      ),
    ),
  });
}
