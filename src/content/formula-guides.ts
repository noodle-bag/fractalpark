import {
  getFormulaContentBySlug,
  FORMULA_CONTENT_MANIFEST,
  type FormulaContentEntry,
} from './formula-manifest';
import {
  resolveStandardAliasV1,
  STANDARD_MANIFEST_INDEX_V1,
} from '@/engine/formulas/v1/standard-manifest';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';

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

export function getPublishedFormulaGuideFormulaId(
  entry: FormulaContentEntry
): FormulaIdV1 {
  const formulaId = resolveStandardAliasV1('guide-slug', entry.slug);
  if (!formulaId) {
    throw new Error(`Missing canonical Formula ID for Guide slug: ${entry.slug}`);
  }
  return formulaId;
}

/**
 * @deprecated Capability-level lookup. Call only through
 * `content/teaching/guide-route-policy` so publication and frozen selection
 * are checked before deep Guide content is returned.
 */
export function getPublishedFormulaGuideByFormulaId(
  formulaId: FormulaIdV1
): FormulaContentEntry | undefined {
  const guideAlias = STANDARD_MANIFEST_INDEX_V1.aliasesFor(formulaId).find(
    (alias) => alias.kind === 'guide-slug'
  );
  return guideAlias
    ? getPublishedFormulaGuideBySlug(guideAlias.value)
    : undefined;
}

export function formulaGuidePath(
  entry: FormulaContentEntry
): `/formulas/${string}` {
  return `/formulas/${getPublishedFormulaGuideFormulaId(entry)}`;
}

export function formulaGuideLegacyPath(
  entry: FormulaContentEntry
): `/formulas/${string}` {
  return `/formulas/${entry.slug}`;
}

export function formulaGuideImagePath(
  entry: FormulaContentEntry
): `/images/formulas/guides/${string}.jpg` {
  return `/images/formulas/guides/${entry.slug}.jpg`;
}

export function formulaGuideOpenGraphImagePath(
  entry: FormulaContentEntry
): `/images/formulas/og/${string}.jpg` {
  return `/images/formulas/og/${entry.slug}.jpg`;
}
