import { PUBLISHED_ARTWORK_PAGES, artworkPagePath } from '@/content/artwork-pages';
import {
  loadFormulaSeoSetsV1,
  loadIndexableTeachingFormulaIdsV1,
  parseFormulaLocaleKeyV1,
} from '@/content/teaching/formula-seo-policy';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/**
 * Canonical non-formula indexable page paths. Formula pages are projected from
 * the reviewed teaching index set below so fallback locales never leak into
 * sitemap or IndexNow inputs.
 */
export const BASE_INDEXABLE_PAGE_PATHS: readonly string[] = Object.freeze([
  '/explore',
  '/gallery',
  '/formulas',
  '/formulas/frm',
  '/formulas/editor',
  '/about',
  '/privacy',
  '/terms',
  '/community-rules',
  ...PUBLISHED_ARTWORK_PAGES.map(artworkPagePath),
]);

export const INDEXABLE_FORMULA_PATHS_V1: readonly string[] = Object.freeze(
  loadIndexableTeachingFormulaIdsV1().map(
    (formulaId) => `/formulas/${formulaId}`,
  ),
);

/** Maximum candidate set; runtime URL builders still filter formula locales. */
export const INDEXABLE_PAGE_PATHS: readonly string[] = Object.freeze([
  ...BASE_INDEXABLE_PAGE_PATHS,
  ...INDEXABLE_FORMULA_PATHS_V1,
]);

/** All canonical indexable absolute URLs using the exact formula locale set. */
export function buildIndexableUrls(baseUrl: string = SITE.url): string[] {
  const origin = baseUrl.replace(/\/$/, '');
  const baseUrls = routing.locales.flatMap((locale) =>
    BASE_INDEXABLE_PAGE_PATHS.map((page) => `${origin}/${locale}${page}`),
  );
  const formulaUrls = loadFormulaSeoSetsV1().indexSet.flatMap((key) => {
    const parsed = parseFormulaLocaleKeyV1(key);
    return parsed
      ? [`${origin}/${parsed.locale}/formulas/${parsed.formulaId}`]
      : [];
  });
  return [...baseUrls, ...formulaUrls];
}

/** Locale alternates (hreflang) for a given page path. */
export function buildIndexableAlternates(
  page: string,
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `${SITE.url}/${locale}${page}`;
  }
  languages['x-default'] = `${SITE.url}/en${page}`;
  return languages;
}
