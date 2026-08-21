import type { MetadataRoute } from 'next';
import {
  loadFormulaSeoSetsV1,
  parseFormulaLocaleKeyV1,
  type FormulaSeoSetsV1,
} from '@/content/teaching/formula-seo-policy';
import { filterTeachingAlternatesV1 } from '@/content/teaching/guide-route-policy';
import {
  BASE_INDEXABLE_PAGE_PATHS,
  buildIndexableAlternates,
} from '@/lib/indexable-pages';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/** Canonical sitemap: static product pages plus exact formula indexSet. */
export function buildSitemapV1(
  formulaSets: FormulaSeoSetsV1 = loadFormulaSeoSetsV1(),
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of routing.locales) {
    for (const page of BASE_INDEXABLE_PAGE_PATHS) {
      entries.push({
        url: `${SITE.url}/${locale}${page}`,
        alternates: { languages: buildIndexableAlternates(page) },
      });
    }
  }

  const localesByFormula = new Map<string, string[]>();
  for (const key of formulaSets.hreflangSet) {
    const parsed = parseFormulaLocaleKeyV1(key);
    if (!parsed) continue;
    const locales = localesByFormula.get(parsed.formulaId) ?? [];
    locales.push(parsed.locale);
    localesByFormula.set(parsed.formulaId, locales);
  }

  for (const key of formulaSets.sitemapSet) {
    const parsed = parseFormulaLocaleKeyV1(key);
    if (!parsed) continue;
    const page = `/formulas/${parsed.formulaId}`;
    entries.push({
      url: `${SITE.url}/${parsed.locale}${page}`,
      alternates: {
        languages: filterTeachingAlternatesV1(
          buildIndexableAlternates(page),
          localesByFormula.get(parsed.formulaId) ?? [],
        ),
      },
    });
  }
  return entries;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapV1();
}
