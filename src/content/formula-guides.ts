import {
  getFormulaContentById,
  getFormulaContentBySlug,
  type FormulaContentEntry,
} from './formula-manifest';

export const FORMULA_GUIDE_VALIDATION_IDS = [
  'mandelbrot',
  'burningShip',
  'newton3',
  'mandelbox',
] as const;

export type PublishedFormulaGuideId =
  (typeof FORMULA_GUIDE_VALIDATION_IDS)[number];

const publishedFormulaGuideIds = new Set<string>(
  FORMULA_GUIDE_VALIDATION_IDS
);

export const PUBLISHED_FORMULA_GUIDES: readonly FormulaContentEntry[] =
  FORMULA_GUIDE_VALIDATION_IDS.map((formulaId) => {
    const entry = getFormulaContentById(formulaId);

    if (!entry) {
      throw new Error(`Missing formula guide content: ${formulaId}`);
    }

    return entry;
  });

export function isPublishedFormulaGuideId(
  formulaId: string
): formulaId is PublishedFormulaGuideId {
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
