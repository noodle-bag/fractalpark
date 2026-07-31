import type { MetadataRoute } from 'next';
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
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const page of INDEXABLE_PAGE_PATHS) {
      entries.push({
        url: `${SITE.url}/${locale}${page}`,
        alternates: {
          languages: buildIndexableAlternates(page),
        },
      });
    }
  }

  return entries;
}
