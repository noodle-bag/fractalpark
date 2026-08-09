import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import { describe, expect, it } from 'vitest';
import {
  INDEXABLE_PAGE_PATHS,
  buildIndexableAlternates,
  buildIndexableUrls,
} from '@/lib/indexable-pages';
import sitemap from '@/app/sitemap';
import { SITE } from '@/lib/site';

/**
 * Canonical indexable URL set tests — sitemap and IndexNow must share one
 * source that excludes redirect sources and noindex routes.
 */

describe('indexable pages', () => {
  it('excludes redirect sources and the noindex Drift route', () => {
    expect(INDEXABLE_PAGE_PATHS).not.toContain('');
    expect(INDEXABLE_PAGE_PATHS).not.toContain('/');
    expect(INDEXABLE_PAGE_PATHS).not.toContain('/drift');
    expect(INDEXABLE_PAGE_PATHS.every((page) => page.startsWith('/'))).toBe(true);
  });

  it('makes Explore the first product entry and covers content surfaces', () => {
    expect(INDEXABLE_PAGE_PATHS[0]).toBe('/explore');
    for (const required of [
      '/gallery',
      '/formulas',
      '/formulas/frm',
      '/formulas/editor',
      '/about',
    ]) {
      expect(INDEXABLE_PAGE_PATHS).toContain(required);
    }
    // 21 published formula guides ride the same set.
    expect(
      INDEXABLE_PAGE_PATHS.filter((page) => page.startsWith('/formulas/')).length
    ).toBeGreaterThanOrEqual(23);
  });

  it('builds one canonical URL per locale per page on the www host', () => {
    const urls = buildIndexableUrls();
    expect(urls.length).toBe(INDEXABLE_PAGE_PATHS.length * SUPPORTED_LOCALES.length);
    for (const url of urls) {
      expect(url.startsWith(`${SITE.url}/`)).toBe(true);
      expect(SITE.url).toBe('https://www.fractalpark.com');
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('aligns hreflang alternates with the canonical host', () => {
    const alternates = buildIndexableAlternates('/explore');
    expect(alternates.en).toBe('https://www.fractalpark.com/en/explore');
    expect(alternates.zh).toBe('https://www.fractalpark.com/zh/explore');
    expect(alternates['x-default']).toBe(alternates.en);
  });
});

describe('sitemap', () => {
  it('contains exactly the shared indexable URL set', () => {
    const entries = sitemap();
    const sitemapUrls = entries.map((entry) => entry.url).sort();
    expect(sitemapUrls).toEqual(buildIndexableUrls().sort());
  });

  it('carries no redirect sources, Drift URLs, or fabricated freshness signals', () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.url).not.toMatch(/\/(en|zh)$/);
      expect(entry.url).not.toContain('/drift');
      expect(entry.lastModified).toBeUndefined();
      expect(entry.changeFrequency).toBeUndefined();
      expect(entry.priority).toBeUndefined();
      expect(entry.alternates?.languages).toBeDefined();
    }
  });
});
