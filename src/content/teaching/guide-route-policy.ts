import selectionAsset from '../../../resources/formula-library/v1/teaching-selection.v1.json';
import {
  PUBLISHED_FORMULA_GUIDES,
  formulaGuidePath,
  getPublishedFormulaGuideFormulaId,
  getPublishedFormulaGuideByFormulaId,
} from '@/content/formula-guides';
import type { FormulaContentEntry } from '@/content/formula-manifest';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import type { PublicFormulaRecordV1 } from '@/lib/formula-records';

const selectedFormulaIds = new Set(
  selectionAsset.rows.map((row) => row.formulaId),
);
const guideRecordPathByLegacyFormulaId = new Map(
  PUBLISHED_FORMULA_GUIDES.map((entry) => [entry.formulaId, formulaGuidePath(entry)]),
);

export const PUBLISHED_TEACHING_GUIDES_V1 = Object.freeze(
  PUBLISHED_FORMULA_GUIDES.filter((entry) =>
    selectedFormulaIds.has(getPublishedFormulaGuideFormulaId(entry)),
  ),
);

export function isSelectedTeachingFormulaV1(formulaId: string): boolean {
  return selectedFormulaIds.has(formulaId);
}

export function getLegacyGuideRecordPathV1(
  legacyFormulaId: string,
): `/formulas/${string}` | undefined {
  return guideRecordPathByLegacyFormulaId.get(legacyFormulaId);
}

/**
 * Fail closed before the legacy Guide branch can expose teaching/runtime UI.
 * Publication alone is insufficient: a formula must also be in the frozen
 * teaching selection, so a future hold -> publish decision cannot silently
 * enable teaching content.
 */
export function getTeachingGuideForFormulaRecordV1(
  formulaRecord: Pick<PublicFormulaRecordV1, 'formulaId' | 'availability'>,
): FormulaContentEntry | undefined {
  if (formulaRecord.availability !== 'published') return undefined;
  if (!isSelectedTeachingFormulaV1(formulaRecord.formulaId)) return undefined;
  return getPublishedFormulaGuideByFormulaId(
    formulaRecord.formulaId as FormulaIdV1,
  );
}
