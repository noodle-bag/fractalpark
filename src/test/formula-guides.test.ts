import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import {
  FORMULA_GUIDE_VALIDATION_IDS,
  PUBLISHED_FORMULA_GUIDES,
  formulaGuideImagePath,
  formulaGuidePath,
  getPublishedFormulaGuideBySlug,
} from '@/content/formula-guides';
import sitemap from '@/app/sitemap';

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'zh'],
  },
}));

describe('formula guide validation projection', () => {
  it('publishes exactly the four representative formulas in frozen order', () => {
    expect(PUBLISHED_FORMULA_GUIDES.map(({ formulaId }) => formulaId)).toEqual(
      FORMULA_GUIDE_VALIDATION_IDS
    );
    expect(PUBLISHED_FORMULA_GUIDES.map(({ slug }) => slug)).toEqual([
      'mandelbrot',
      'burning-ship',
      'newton-3',
      'mandelbox',
    ]);
  });

  it('resolves only published routes and stable canonical image paths', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      expect(getPublishedFormulaGuideBySlug(entry.slug)).toBe(entry);
      expect(formulaGuidePath(entry)).toBe(`/formulas/${entry.slug}`);
      expect(formulaGuideImagePath(entry)).toBe(
        `/images/formulas/${entry.slug}.jpg`
      );
    }

    expect(getPublishedFormulaGuideBySlug('lambda')).toBeUndefined();
    expect(getPublishedFormulaGuideBySlug('frm')).toBeUndefined();
  });

  it('keeps validation-page editorial fields complete in both locales', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      for (const messages of [enMessages, zhMessages]) {
        const content = messages.formulas.entries[entry.slug];

        expect(content.overview).toBeTruthy();
        expect(content.imageAlt).toBeTruthy();
        expect(content.imageCaption).toBeTruthy();
      }
    }
  });

  it('adds only the published validation guides to the localized sitemap', () => {
    const urls = sitemap().map(({ url }) => url);
    const formulaGuideUrls = urls.filter((url) =>
      /\/(?:en|zh)\/formulas\/(?!frm$|editor$)[a-z0-9-]+$/.test(url)
    );

    expect(formulaGuideUrls).toEqual([
      'https://www.fractalpark.com/en/formulas/mandelbrot',
      'https://www.fractalpark.com/en/formulas/burning-ship',
      'https://www.fractalpark.com/en/formulas/newton-3',
      'https://www.fractalpark.com/en/formulas/mandelbox',
      'https://www.fractalpark.com/zh/formulas/mandelbrot',
      'https://www.fractalpark.com/zh/formulas/burning-ship',
      'https://www.fractalpark.com/zh/formulas/newton-3',
      'https://www.fractalpark.com/zh/formulas/mandelbox',
    ]);
    expect(urls).not.toContain(
      'https://www.fractalpark.com/en/formulas/lambda'
    );
  });

  it('ships a non-empty JPEG for every published validation guide', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      const image = readFileSync(
        path.join(
          process.cwd(),
          'public',
          formulaGuideImagePath(entry)
        )
      );

      expect(image.length, entry.slug).toBeGreaterThan(50_000);
      expect([...image.subarray(0, 2)], entry.slug).toEqual([0xff, 0xd8]);
      expect([...image.subarray(-2)], entry.slug).toEqual([0xff, 0xd9]);
    }
  });
});
