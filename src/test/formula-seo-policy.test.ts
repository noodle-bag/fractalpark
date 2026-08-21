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

function dependencies() {
  return {
    catalogFormulaIds: STANDARD_MANIFEST_INDEX_V1.formulaIds,
    implementationFormulaIds: loadPublishedRuntimeFormulaIdsV1(),
    teachingFormulaIds: loadSelectedTeachingFormulaIdsV1(),
    loadDeliveredLocales: () => SUPPORTED_LOCALES,
  };
}

describe('formula SEO exact sets v1', () => {
  it('closes 677 catalog, 513 implementation, and 50×7 index sets', () => {
    const sets = loadFormulaSeoSetsV1();
    expect(sets.valid).toBe(true);
    expect(sets.catalogAccessibleSet).toHaveLength(677);
    expect(sets.implementationAccessibleSet).toHaveLength(513);
    expect(sets.indexSet).toHaveLength(350);
    expect(sets.sitemapSet).toEqual(sets.indexSet);
    expect(sets.hreflangSet).toEqual(sets.indexSet);
    expect(new Set(sets.indexSet)).toHaveLength(350);
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
    expect(sets.indexSet).toHaveLength(349);
    expect(sets.indexSet).not.toContain(key);
    expect(sets.sitemapSet).not.toContain(key);
    expect(sets.hreflangSet).not.toContain(key);
    expect(indexableFormulaIdsForLocaleV1(sets, 'en')).toHaveLength(50);
    expect(indexableFormulaIdsForLocaleV1(sets, 'zh')).toHaveLength(49);
    expect(indexableFormulaIdsForLocaleV1(sets, 'zh')).not.toContain(target);
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
    expect(sets.indexSet).toHaveLength(344);
    expect(sets.indexSet).toContain(formulaLocaleKeyV1('en', target));
    expect(sets.indexSet).not.toContain(formulaLocaleKeyV1('de', target));
  });

  it('wires static params, metadata, hreflang, and JSON-LD to the SEO set', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/formulas/[formulaId]/page.tsx'),
      'utf8',
    );
    expect(source).toContain(
      'loadIndexableTeachingFormulaIdsForLocaleV1(params.locale).map',
    );
    expect(source.match(/isFormulaLocaleIndexableV1\(formulaId, locale\)/g)).toHaveLength(2);
    expect(source).toContain('loadIndexableTeachingLocalesV1');
    expect(source.match(/buildFormulaTeachingJsonLdV1\(/g)).toHaveLength(2);
    expect(source).not.toContain('isTeachingPageIndexableAtCommit20dV1');
  });
});
