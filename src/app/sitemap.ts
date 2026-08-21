import type { MetadataRoute } from 'next';
import {
  formulaGuidePath,
  getPublishedFormulaGuideFormulaId,
} from '@/content/formula-guides';
import {
  filterTeachingAlternatesAtCommit20dV1,
  PUBLISHED_TEACHING_GUIDES_V1,
} from '@/content/teaching/guide-route-policy';
import { loadDeliveredTeachingLocalesV1 } from '@/content/teaching/content-loader';
import {
  INDEXABLE_PAGE_PATHS,
  buildIndexableAlternates,
} from '@/lib/indexable-pages';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/**
 * Sitemap of canonical indexable URLs only.
 *
 * - Excludes the `/en` and `/zh` 301 redirect sources and the `noindex`
 *   `/[locale]/drift` route (see src/lib/indexable-pages.ts).
 * - No `lastModified` unless a real significant content update time is known,
 *   and no `priority`/`changeFrequency` hints that search engines ignore.
 */
type DeliveredTeachingLocalesLoaderV1 = (
  formulaId: string,
) => readonly string[];

export function buildSitemapV1(
  loadDeliveredLocales: DeliveredTeachingLocalesLoaderV1 =
    loadDeliveredTeachingLocalesV1,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const teachingGuides = new Map<string, string>(
    PUBLISHED_TEACHING_GUIDES_V1.map((guide) => [
      formulaGuidePath(guide),
      getPublishedFormulaGuideFormulaId(guide),
    ]),
  );
  const deliveredByPage = new Map(
    [...teachingGuides].map(([page, formulaId]) => [
      page,
      loadDeliveredLocales(formulaId),
    ]),
  );

  for (const locale of routing.locales) {
    for (const page of INDEXABLE_PAGE_PATHS) {
      const deliveredLocales = deliveredByPage.get(page);
      if (deliveredLocales && !deliveredLocales.includes(locale)) continue;
      const languages = deliveredLocales
        ? filterTeachingAlternatesAtCommit20dV1(
            buildIndexableAlternates(page),
            deliveredLocales,
          )
        : buildIndexableAlternates(page);
      entries.push({
        url: `${SITE.url}/${locale}${page}`,
        alternates: {
          languages,
        },
      });
    }
  }

  return entries;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapV1();
}
