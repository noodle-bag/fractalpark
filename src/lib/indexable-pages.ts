import {
  PUBLISHED_FORMULA_GUIDES,
  formulaGuidePath,
} from '@/content/formula-guides';
import {
  PUBLISHED_ARTWORK_PAGES,
  artworkPagePath,
} from '@/content/artwork-pages';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/**
 * Canonical indexable URL set — the single source shared by `src/app/sitemap.ts`
 * and `scripts/submit-indexnow.ts`.
 *
 * Rules (Slice 2.1 contract):
 *  - Only pages we actually want indexed appear here.
 *  - The legacy locale roots `/en` and `/zh` are 301 redirect sources and are
 *    excluded; `/[locale]/explore` is the primary product entry.
 *  - `/[locale]/drift` is `noindex, follow` and is excluded.
 *  - No fabricated `lastModified`, `priority`, or `changeFrequency` signals.
 */

export const INDEXABLE_PAGE_PATHS: readonly string[] = [
  '/explore',
  '/gallery',
  '/formulas',
  '/formulas/frm',
  '/formulas/editor',
  '/about',
  ...PUBLISHED_FORMULA_GUIDES.map(formulaGuidePath),
  ...PUBLISHED_ARTWORK_PAGES.map(artworkPagePath),
];

/** All canonical indexable absolute URLs, every locale × page. */
export function buildIndexableUrls(baseUrl: string = SITE.url): string[] {
  const origin = baseUrl.replace(/\/$/, '');
  return routing.locales.flatMap((locale) =>
    INDEXABLE_PAGE_PATHS.map((page) => `${origin}/${locale}${page}`)
  );
}

/** Locale alternates (hreflang) for a given page path. */
export function buildIndexableAlternates(
  page: string
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `${SITE.url}/${locale}${page}`;
  }
  languages['x-default'] = `${SITE.url}/en${page}`;
  return languages;
}
