import { describe, expect, it } from 'vitest';
import {
  buildFormulaAtlas,
  FORMULA_FAMILY_ORDER,
} from '@/content/formula-atlas';
import { PUBLISHED_TEACHING_GUIDES_V1 } from '@/content/teaching/guide-route-policy';
import aliasesAsset from '../../resources/formula-library/v1/legacy-formula-aliases.json';
import decisionsAsset from '../../resources/formula-library/v1/publication-decisions.json';
import restoredGuideAsset from '../../resources/formula-library/v1/teaching-restored-guide-projection.v1.json';
import { decodeParams } from '@/lib/url-params';

describe('Formula Atlas projection', () => {
  it('projects 94 published identities, seven families, and 21 Guides', () => {
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
    expect(atlas.formulas.filter(({ recordHref }) => recordHref)).toHaveLength(0);
    expect(atlas.formulas.filter(({ exploreHref }) => exploreHref)).toHaveLength(94);
  });

  it('routes every published runtime identity to Explore with restored Guides separately authorized', () => {
    const atlas = buildFormulaAtlas('zh');
    const runtimeIds = new Map(
      aliasesAsset.aliases
        .filter((alias) => alias.kind === 'runtime-id')
        .map((alias) => [alias.value, alias.formulaId]),
    );
    const decisions = new Map(
      decisionsAsset.rows.map((row) => [row.formulaId, row.publicationDecision]),
    );

    for (const entry of atlas.formulas) {
      const formulaId = runtimeIds.get(entry.metadata.id);
      if (!formulaId) throw new Error(`Missing runtime alias for ${entry.metadata.id}`);
      expect(entry.recordHref).toBeUndefined();
      expect(decisions.get(formulaId)).toBe('publish');
      expect(entry.exploreHref).toBeDefined();
      if (!entry.exploreHref) continue;
      const url = new URL(entry.exploreHref, 'https://www.fractalpark.com');
      const decoded = decodeParams(url.searchParams);

      expect(url.pathname).toBe('/zh/explore');
      expect(decoded.formula ?? 'mandelbrot').toBe(entry.metadata.id);
      expect(url.searchParams.get('remix')).toBe(
        `formula:${entry.metadata.id}`
      );
    }
    const recordIds = new Set(
      atlas.formulas.flatMap((entry) =>
        entry.recordHref ? [entry.recordHref.slice('/formulas/'.length)] : [],
      ),
    );
    expect(recordIds.size).toBe(0);
    expect(
      restoredGuideAsset.rows.every(
        (row) =>
          decisions.get(row.formulaId) === 'publish' &&
          row.guideAvailability === 'published',
      ),
    ).toBe(true);
  });

  it('routes all 21 selected or restored published Guides to editorial pages', () => {
    const atlas = buildFormulaAtlas('en');
    const publishedGuides = atlas.guides.filter(({ guideHref }) => guideHref);

    expect(publishedGuides.map(({ metadata }) => metadata.id)).toEqual(
      expect.arrayContaining(
        PUBLISHED_TEACHING_GUIDES_V1.map((guide) => guide.formulaId),
      ),
    );
    expect(publishedGuides).toHaveLength(21);

    for (const entry of atlas.formulas) {
      expect(entry.destinationHref).toBe(
        entry.guideHref
          ? `/en${entry.guideHref}`
          : entry.recordHref
            ? `/en${entry.recordHref}`
            : entry.exploreHref,
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
