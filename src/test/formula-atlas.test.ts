import { describe, expect, it } from 'vitest';
import {
  buildFormulaAtlas,
  FORMULA_FAMILY_ORDER,
} from '@/content/formula-atlas';
import { PUBLISHED_FORMULA_GUIDE_IDS } from '@/content/formula-guides';
import { decodeParams } from '@/lib/url-params';

describe('Formula Atlas projection', () => {
  it('publishes 94 unique formulas, seven families, and 21 guide identities', () => {
    const atlas = buildFormulaAtlas('en');

    expect(atlas.formulas).toHaveLength(94);
    expect(new Set(atlas.formulas.map(({ metadata }) => metadata.id)).size).toBe(
      94
    );
    expect(atlas.families.map(({ id }) => id)).toEqual(FORMULA_FAMILY_ORDER);
    expect(atlas.families.every(({ formulas }) => formulas.length > 0)).toBe(
      true
    );
    expect(atlas.guides).toHaveLength(21);
  });

  it('links every directory entry to its localized canonical Explore state', () => {
    const atlas = buildFormulaAtlas('zh');

    for (const entry of atlas.formulas) {
      const url = new URL(entry.exploreHref, 'https://www.fractalpark.com');
      const decoded = decodeParams(url.searchParams);

      expect(url.pathname).toBe('/zh/explore');
      expect(decoded.formula ?? 'mandelbrot').toBe(entry.metadata.id);
      expect(url.searchParams.get('remix')).toBe(
        `formula:${entry.metadata.id}`
      );
    }
  });

  it('routes all 21 published guides to editorial pages', () => {
    const atlas = buildFormulaAtlas('en');
    const publishedGuides = atlas.guides.filter(({ guideHref }) => guideHref);

    expect(publishedGuides.map(({ metadata }) => metadata.id)).toEqual(
      expect.arrayContaining(PUBLISHED_FORMULA_GUIDE_IDS)
    );
    expect(publishedGuides).toHaveLength(21);

    for (const entry of atlas.formulas) {
      expect(entry.destinationHref).toBe(
        entry.guideHref
          ? `/en${entry.guideHref}`
          : entry.exploreHref
      );
    }
  });

  it('keeps guide membership derived from the manifest', () => {
    const atlas = buildFormulaAtlas('en');
    const groupedGuideIds = atlas.families.flatMap(({ guides }) =>
      guides.map(({ metadata }) => metadata.id)
    );

    expect(new Set(groupedGuideIds)).toEqual(
      new Set(atlas.guides.map(({ metadata }) => metadata.id))
    );
    expect(new Set(groupedGuideIds).size).toBe(21);
  });
});
