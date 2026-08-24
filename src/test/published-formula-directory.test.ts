import classicAsset from '../../resources/formula-library/v1/classic-formula-exact-set.v1.json';
import heldSeoAsset from '../../resources/formula-library/v1/held-formula-record-seo-projection.v1.json';
import directoryAsset from '../../public/formula-library/v1/directory/index.json';
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_FORMULA_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_V1,
  PUBLISHED_FORMULA_GUIDE_COUNT_V1,
  filterPublishedFormulaDirectoryV1,
  resolveClassicAliasDeepLinkV1,
} from '@/content/published-formula-directory';
import {
  HELD_FORMULA_RECORD_COUNT_V1,
  HELD_FORMULA_RECORD_SEO_ROWS_V1,
} from '@/content/held-formula-record-seo-projection';
import {
  isPublishedFormulaRecordIndexableV1,
  loadFormulaRecordSeoSetsV1,
} from '@/content/formula-record-seo-policy';
import { getPublishedFormulaGuideFormulaId } from '@/content/formula-guides';
import { PUBLISHED_TEACHING_GUIDES_V1 } from '@/content/teaching/guide-route-policy';
import { PUBLICATION_DECISION_LEDGER_V1 } from '@/engine/formulas/v1/publication-decisions';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import { buildPublishedFormulaDirectoryV1 } from '../../scripts/generate-published-formula-directory';

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

describe('published Formula Directory projection', () => {
  it('regenerates both checked-in projections byte-equivalently', () => {
    const generated = buildPublishedFormulaDirectoryV1(process.cwd());
    expect(generated.directory).toEqual(directoryAsset);
    expect(generated.heldSeo).toEqual(heldSeoAsset);
  });

  it('is the exact published-only 534 set and exposes no governance fields', () => {
    const published = PUBLICATION_DECISION_LEDGER_V1.rows
      .filter((row) => row.publicationDecision === 'publish')
      .map((row) => row.formulaId);
    expect(PUBLISHED_FORMULA_DIRECTORY_V1.rows).toHaveLength(
      PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
    );
    expect(sorted(PUBLISHED_FORMULA_DIRECTORY_V1.rows.map((row) => row.formulaId))).toEqual(
      sorted(published),
    );
    expect(Object.keys(directoryAsset.counts).sort()).toEqual(
      ['categoryMemberships', 'classic', 'guides', 'published'].sort(),
    );
    const serialized = JSON.stringify({
      counts: directoryAsset.counts,
      rows: directoryAsset.rows,
      aliasDeepLinks: directoryAsset.aliasDeepLinks,
    });
    for (const forbidden of [
      'publicationDecision',
      'rightsStatus',
      'holdReason',
      'excluded',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('projects the overlapping Classic facet and seven family facets exactly', () => {
    expect(PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1).toHaveLength(8);
    expect(filterPublishedFormulaDirectoryV1('classic')).toHaveLength(
      CLASSIC_FORMULA_COUNT_V1,
    );
    for (const category of PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1) {
      expect(filterPublishedFormulaDirectoryV1(category)).toHaveLength(
        PUBLISHED_FORMULA_DIRECTORY_V1.categoryCounts[category],
      );
    }
    expect(
      Object.values(PUBLISHED_FORMULA_DIRECTORY_V1.categoryCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(628);
  });

  it('uses the sole versioned Classic exact-set authority', () => {
    expect(classicAsset.rows).toHaveLength(CLASSIC_FORMULA_COUNT_V1);
    expect(classicAsset.counts).toEqual({
      legacyCanonical: 89,
      curatedAdditions: 5,
      total: 94,
    });
    expect(
      classicAsset.rows
        .filter((row) => row.membershipBasis === 'maintainer-curated-addition')
        .map((row) => row.displayName)
        .sort(),
    ).toEqual(['bali', 'birdofprey', 'dragon', 'oldmanowar', 'quadrants']);
    expect(
      sorted(classicAsset.rows.map((row) => row.formulaId)),
    ).toEqual(
      sorted(filterPublishedFormulaDirectoryV1('classic').map((row) => row.formulaId)),
    );
  });

  it('binds Guide badges to the exact 21 public Guide routes', () => {
    const guideIds = PUBLISHED_TEACHING_GUIDES_V1.map(
      getPublishedFormulaGuideFormulaId,
    );
    const projected = PUBLISHED_FORMULA_DIRECTORY_V1.rows
      .filter((row) => row.guideSlug !== null)
      .map((row) => row.formulaId);
    expect(projected).toHaveLength(PUBLISHED_FORMULA_GUIDE_COUNT_V1);
    expect(sorted(projected)).toEqual(sorted(guideIds));
  });

  it('resolves five merged aliases to canonical IDs with their legacy profiles', () => {
    const legacyIds = [
      'biomorph',
      'celticMandelbrot',
      'expJulia',
      'perpendicularCelticBurningShip',
      'quadJulia',
    ];
    expect(PUBLISHED_FORMULA_DIRECTORY_V1.aliasDeepLinks).toHaveLength(5);
    for (const legacyRuntimeId of legacyIds) {
      const alias = resolveClassicAliasDeepLinkV1(legacyRuntimeId);
      const legacyDocument = buildFormulaDefaultDocument(legacyRuntimeId);
      expect(alias).toBeDefined();
      expect(alias?.canonicalPath).toBe(`/formulas/${alias?.canonicalFormulaId}`);
      expect(alias?.alternateProfile.bounds).toEqual(legacyDocument.scene.bounds);
      expect(alias?.alternateProfile.iterations).toBe(
        legacyDocument.render.maxIterations,
      );
      expect(alias?.alternateProfile.formula).toEqual({
        isJulia: legacyDocument.formula.isJulia,
        juliaC: legacyDocument.formula.juliaC,
        power: legacyDocument.formula.power,
        params: legacyDocument.formula.params,
      });
    }
  });
});

describe('Formula Record SEO projection', () => {
  it('indexes all 534 published Records in all seven locales', () => {
    const sets = loadFormulaRecordSeoSetsV1();
    const expected = PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 * SUPPORTED_LOCALES.length;
    expect(sets.indexSet).toHaveLength(expected);
    expect(new Set(sets.indexSet)).toHaveProperty('size', expected);
    expect(sets.sitemapSet).toEqual(sets.indexSet);
    expect(sets.hreflangSet).toEqual(sets.indexSet);
    for (const row of PUBLISHED_FORMULA_DIRECTORY_V1.rows) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(isPublishedFormulaRecordIndexableV1(row.formulaId, locale)).toBe(true);
      }
    }
  });

  it('keeps the exact 143 held Records noindex and out of public projections', () => {
    const heldIds = PUBLICATION_DECISION_LEDGER_V1.rows
      .filter((row) => row.publicationDecision === 'hold')
      .map((row) => row.formulaId);
    expect(HELD_FORMULA_RECORD_SEO_ROWS_V1).toHaveLength(
      HELD_FORMULA_RECORD_COUNT_V1,
    );
    expect(sorted(HELD_FORMULA_RECORD_SEO_ROWS_V1.map((row) => row.formulaId))).toEqual(
      sorted(heldIds),
    );
    for (const row of HELD_FORMULA_RECORD_SEO_ROWS_V1) {
      expect(row).toMatchObject({
        httpStatus: 200,
        robots: 'noindex, follow',
        canonical: 'self',
        sitemap: false,
        hreflang: false,
        publicSource: false,
        publicActions: false,
      });
      expect(isPublishedFormulaRecordIndexableV1(row.formulaId, 'en')).toBe(false);
    }
  });
});
