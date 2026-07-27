import {
  getFormulaContentBySlug,
  FORMULA_CONTENT_MANIFEST,
  type FormulaContentEntry,
} from './formula-manifest';

export const PUBLISHED_FORMULA_GUIDES: readonly FormulaContentEntry[] =
  FORMULA_CONTENT_MANIFEST;

export const PUBLISHED_FORMULA_GUIDE_IDS = PUBLISHED_FORMULA_GUIDES.map(
  ({ formulaId }) => formulaId
);

const publishedFormulaGuideIds = new Set<string>(
  PUBLISHED_FORMULA_GUIDE_IDS
);

export function isPublishedFormulaGuideId(
  formulaId: string
): boolean {
  return publishedFormulaGuideIds.has(formulaId);
}

export function getPublishedFormulaGuideBySlug(
  slug: string
): FormulaContentEntry | undefined {
  const entry = getFormulaContentBySlug(slug);

  return entry && isPublishedFormulaGuideId(entry.formulaId)
    ? entry
    : undefined;
}

export function formulaGuidePath(
  entry: FormulaContentEntry
): `/formulas/${string}` {
  return `/formulas/${entry.slug}`;
}

export function formulaGuideImagePath(
  entry: FormulaContentEntry
): `/images/formulas/${string}.jpg` {
  return `/images/formulas/${entry.slug}.jpg`;
}
