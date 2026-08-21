import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import { describe, expect, it } from 'vitest';
import heldGuideAsset from '../../resources/formula-library/v1/teaching-held-guide-appendix.v1.json';
import {
  formulaGuidePath,
  getPublishedFormulaGuideFormulaId,
} from '@/content/formula-guides';
import { PUBLISHED_TEACHING_GUIDES_V1 } from '@/content/teaching/guide-route-policy';
import {
  formulaLocaleKeyV1,
  loadFormulaSeoSetsV1,
} from '@/content/teaching/formula-seo-policy';
import {
  INDEXABLE_PAGE_PATHS,
  buildIndexableAlternates,
  buildIndexableUrls,
} from '@/lib/indexable-pages';
import sitemap, { buildSitemapV1 } from '@/app/sitemap';
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
    // Two formula tools and exactly 50 reviewed teaching formulas ride the set.
    expect(
      INDEXABLE_PAGE_PATHS.filter((page) => page.startsWith('/formulas/')).length
    ).toBe(52);
    for (const held of heldGuideAsset.rows) {
      expect(INDEXABLE_PAGE_PATHS).not.toContain(`/formulas/${held.formulaId}`);
    }
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

  it('removes fallback Guide locales from both URLs and alternates', () => {
    const guide = PUBLISHED_TEACHING_GUIDES_V1[0];
    const formulaId = getPublishedFormulaGuideFormulaId(guide);
    const page = formulaGuidePath(guide);
    const production = loadFormulaSeoSetsV1();
    const fallbackKey = formulaLocaleKeyV1('zh', formulaId);
    const withoutZh = production.indexSet.filter((key) => key !== fallbackKey);
    const entries = buildSitemapV1({
      ...production,
      indexSet: withoutZh,
      sitemapSet: withoutZh,
      hreflangSet: withoutZh,
    });
    expect(entries.some((entry) => entry.url === `${SITE.url}/zh${page}`)).toBe(false);
    const english = entries.find((entry) => entry.url === `${SITE.url}/en${page}`);
    const languages = english?.alternates?.languages;
    expect(languages).toBeDefined();
    expect(languages).not.toHaveProperty('zh');
    expect(languages?.en).toBe(`${SITE.url}/en${page}`);
    expect(languages?.['x-default']).toBe(`${SITE.url}/en${page}`);
    expect(Object.keys(languages ?? {})).toHaveLength(7);
  });
});
