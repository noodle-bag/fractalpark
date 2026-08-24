import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STANDARD_MANIFEST_INDEX_V1 } from '@/engine/formulas/v1/standard-manifest';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import {
  buildFormulaSeoSetsV1,
  formulaLocaleKeyV1,
  indexableFormulaIdsForLocaleV1,
  loadFormulaSeoSetsV1,
} from '@/content/teaching/formula-seo-policy';
import {
  loadPublishedRuntimeFormulaIdsV1,
  loadSelectedTeachingFormulaIdsV1,
} from '@/content/teaching/content-loader';
import {
  loadRestoredGuideFormulaIdsV1,
  loadRestoredGuideLocalesV1,
} from '@/content/teaching/restored-guide-projection';

function dependencies() {
  return {
    catalogFormulaIds: STANDARD_MANIFEST_INDEX_V1.formulaIds,
    implementationFormulaIds: loadPublishedRuntimeFormulaIdsV1(),
    teachingFormulaIds: loadSelectedTeachingFormulaIdsV1(),
    restoredGuideFormulaIds: loadRestoredGuideFormulaIdsV1(),
    loadDeliveredLocales: () => SUPPORTED_LOCALES,
    loadRestoredGuideLocales: loadRestoredGuideLocalesV1,
  };
}

describe('formula SEO exact sets v1', () => {
  it('closes 677 catalog, 534 implementation, and (50+4)×7 index sets', () => {
    const sets = loadFormulaSeoSetsV1();
    expect(sets.valid).toBe(true);
    expect(sets.catalogAccessibleSet).toHaveLength(677);
    expect(sets.implementationAccessibleSet).toHaveLength(534);
    expect(sets.indexSet).toHaveLength(378);
    expect(sets.sitemapSet).toEqual(sets.indexSet);
    expect(sets.hreflangSet).toEqual(sets.indexSet);
    expect(new Set(sets.indexSet)).toHaveLength(378);
  });

  it('removes a fallback locale from index, sitemap, and hreflang together', () => {
    const base = dependencies();
    const target = base.teachingFormulaIds[0];
    const sets = buildFormulaSeoSetsV1({
      ...base,
      loadDeliveredLocales: (formulaId) =>
        formulaId === target
          ? SUPPORTED_LOCALES.filter((locale) => locale !== 'zh')
          : SUPPORTED_LOCALES,
    });
    const key = formulaLocaleKeyV1('zh', target);
    expect(sets.valid).toBe(true);
    expect(sets.indexSet).toHaveLength(377);
    expect(sets.indexSet).not.toContain(key);
    expect(sets.sitemapSet).not.toContain(key);
    expect(sets.hreflangSet).not.toContain(key);
    expect(indexableFormulaIdsForLocaleV1(sets, 'en')).toHaveLength(54);
    expect(indexableFormulaIdsForLocaleV1(sets, 'zh')).toHaveLength(53);
    expect(indexableFormulaIdsForLocaleV1(sets, 'zh')).not.toContain(target);
  });

  it('removes a restored Guide locale from every SEO projection together', () => {
    const base = dependencies();
    const target = base.restoredGuideFormulaIds[0];
    const sets = buildFormulaSeoSetsV1({
      ...base,
      loadRestoredGuideLocales: (formulaId) =>
        formulaId === target
          ? SUPPORTED_LOCALES.filter((locale) => locale !== 'fr')
          : SUPPORTED_LOCALES,
    });
    const key = formulaLocaleKeyV1('fr', target);
    expect(sets.valid).toBe(true);
    expect(sets.indexSet).toHaveLength(377);
    expect(sets.indexSet).not.toContain(key);
    expect(sets.sitemapSet).not.toContain(key);
    expect(sets.hreflangSet).not.toContain(key);
  });

  it('fails formula indexing closed when any authority set drifts', () => {
    const base = dependencies();
    const invalidCases = [
      {
        ...base,
        catalogFormulaIds: base.catalogFormulaIds.slice(1),
      },
      {
        ...base,
        implementationFormulaIds: [
          base.implementationFormulaIds[0],
          ...base.implementationFormulaIds.slice(0, -1),
        ],
      },
      {
        ...base,
        teachingFormulaIds: base.teachingFormulaIds.slice(1),
      },
      {
        ...base,
        restoredGuideFormulaIds: base.restoredGuideFormulaIds.slice(1),
      },
      {
        ...base,
        restoredGuideFormulaIds: [
          base.teachingFormulaIds[0],
          ...base.restoredGuideFormulaIds.slice(1),
        ],
      },
    ];
    for (const candidate of invalidCases) {
      const sets = buildFormulaSeoSetsV1(candidate);
      expect(sets.valid).toBe(false);
      expect(sets.indexSet).toEqual([]);
      expect(sets.sitemapSet).toEqual([]);
      expect(sets.hreflangSet).toEqual([]);
    }
  });

  it('deduplicates supported delivered locales and rejects unknown locales', () => {
    const base = dependencies();
    const target = base.teachingFormulaIds[0];
    const sets = buildFormulaSeoSetsV1({
      ...base,
      loadDeliveredLocales: (formulaId) =>
        formulaId === target ? ['en', 'en', 'de'] : SUPPORTED_LOCALES,
    });
    expect(sets.indexSet).toHaveLength(372);
    expect(sets.indexSet).toContain(formulaLocaleKeyV1('en', target));
    expect(sets.indexSet).not.toContain(formulaLocaleKeyV1('de', target));
  });

  it('keeps teaching static params while Record metadata uses the public projection', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/formulas/[formulaId]/page.tsx'),
      'utf8',
    );
    expect(source).toContain(
      'loadIndexableTeachingFormulaIdsForLocaleV1(params.locale).map',
    );
    expect(
      source.match(/isPublishedFormulaRecordIndexableV1\(formulaId, locale\)/g),
    ).toHaveLength(2);
    expect(source.match(/isFormulaLocaleIndexableV1\(formulaId, locale\)/g)).toHaveLength(2);
    expect(source).toContain('loadIndexableFormulaRecordLocalesV1');
    expect(source).toContain('loadIndexableTeachingLocalesV1');
    expect(source.match(/buildFormulaTeachingJsonLdV1\(/g)).toHaveLength(1);
    expect(source.match(/buildFormulaRecordJsonLdV1\(/g)).toHaveLength(1);
    expect(source).not.toContain('isTeachingPageIndexableAtCommit20dV1');
  });
});
