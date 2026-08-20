import {
  getFormulaDirectoryEntryV1,
  type FormulaDirectoryFamilyV1,
} from '@/engine/formulas/v1/directory';
import { STANDARD_MANIFEST_INDEX_V1 } from '@/engine/formulas/v1/standard-manifest';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import {
  FORMULA_RECORD_REVISION_V1,
  buildFormulaRecordV1,
  type PublicFormulaRecordV1,
} from '@/lib/formula-records';

export const FORMULA_ROUTE_RECORD_REVISION_V1 =
  `standard-directory-v1-${FORMULA_RECORD_REVISION_V1}` as const;

export type FormulaRouteResolutionV1 =
  | Readonly<{
      kind: 'canonical';
      formulaId: FormulaIdV1;
    }>
  | Readonly<{
      kind: 'legacy-redirect';
      formulaId: FormulaIdV1;
    }>
  | Readonly<{
      kind: 'not-found';
    }>;

export interface FormulaRouteRecordV1 {
  readonly formulaId: FormulaIdV1;
  readonly recordRevision: typeof FORMULA_ROUTE_RECORD_REVISION_V1;
  readonly locale: string;
  readonly displayName: string;
  readonly primaryFamily: FormulaDirectoryFamilyV1;
  readonly formulaRecord: PublicFormulaRecordV1;
}

const NOT_FOUND = Object.freeze({ kind: 'not-found' } as const);

export function resolveFormulaRouteV1(
  routeValue: unknown,
): FormulaRouteResolutionV1 {
  if (STANDARD_MANIFEST_INDEX_V1.hasFormulaId(routeValue)) {
    return Object.freeze({ kind: 'canonical', formulaId: routeValue });
  }
  if (typeof routeValue !== 'string') return NOT_FOUND;

  const formulaId = STANDARD_MANIFEST_INDEX_V1.resolveAlias(
    'guide-slug',
    routeValue,
  );
  return formulaId
    ? Object.freeze({ kind: 'legacy-redirect', formulaId })
    : NOT_FOUND;
}

export function buildFormulaCanonicalPathV1(
  formulaId: FormulaIdV1,
): `/formulas/${FormulaIdV1}` {
  if (!STANDARD_MANIFEST_INDEX_V1.hasFormulaId(formulaId)) {
    throw new Error('unknown-standard-formula-id');
  }
  return `/formulas/${formulaId}`;
}

export function buildFormulaRouteRecordV1(
  formulaId: FormulaIdV1,
  recordRevision: string,
  locale: string,
): FormulaRouteRecordV1 | undefined {
  if (
    recordRevision !== FORMULA_ROUTE_RECORD_REVISION_V1 ||
    typeof locale !== 'string' ||
    locale.length === 0
  ) {
    return undefined;
  }

  const entry = getFormulaDirectoryEntryV1(formulaId);
  const formulaRecord = buildFormulaRecordV1(formulaId, locale);
  if (!entry || !formulaRecord) return undefined;

  return Object.freeze({
    formulaId: entry.formulaId,
    recordRevision: FORMULA_ROUTE_RECORD_REVISION_V1,
    locale,
    displayName: entry.displayName,
    primaryFamily: entry.primaryFamily,
    formulaRecord,
  });
}
