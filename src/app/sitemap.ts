import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales;
  const pages = ['', '/explore', '/gallery', '/about'];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of pages) {
      const url = `${SITE.url}/${locale}${page}`;
      const alternates: Record<string, string> = {};

      // Add hreflang alternates for all other locales
      for (const altLocale of locales) {
        alternates[altLocale] = `${SITE.url}/${altLocale}${page}`;
      }
      alternates['x-default'] = `${SITE.url}/en${page}`;

      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: page === '' ? 'weekly' : 'monthly',
        priority: page === '' ? 1.0 : 0.8,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  return entries;
}
