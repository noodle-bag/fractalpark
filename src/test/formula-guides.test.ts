import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import {
  PUBLISHED_FORMULA_GUIDES,
  PUBLISHED_FORMULA_GUIDE_IDS,
  formulaGuideImagePath,
  formulaGuideLegacyPath,
  formulaGuideOpenGraphImagePath,
  formulaGuidePath,
  getPublishedFormulaGuideFormulaId,
  getPublishedFormulaGuideBySlug,
} from '@/content/formula-guides';
import sitemap from '@/app/sitemap';

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'zh'],
  },
}));

function readJpegDimensions(image: Buffer): {
  width: number;
  height: number;
} {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < image.length) {
    if (image[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = image[offset + 1];
    offset += 2;

    if (startOfFrameMarkers.has(marker)) {
      return {
        height: image.readUInt16BE(offset + 3),
        width: image.readUInt16BE(offset + 5),
      };
    }

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    offset += image.readUInt16BE(offset);
  }

  throw new Error('JPEG dimensions not found');
}

describe('published formula guides', () => {
  it('publishes all 21 frozen formulas in manifest order', () => {
    expect(PUBLISHED_FORMULA_GUIDE_IDS).toEqual([
      'mandelbrot',
      'lambda',
      'mandelbox',
      'perpendicularCeltic',
      'quadJulia',
      'burningShip',
      'airship',
      'newton3',
      'newtonCosh',
      'magnet1',
      'magnet2',
      'phoenixMulti',
      'coshMandelb',
      'buffalo',
      'circleInversion',
      'invertedLambda',
      'mcMullen23',
      'rationalMap1',
      'spider',
      'zaslavskyMap',
      'zubieta',
    ]);
    expect(PUBLISHED_FORMULA_GUIDES.map(({ slug }) => slug)).toEqual([
      'mandelbrot',
      'lambda',
      'mandelbox',
      'perpendicular-celtic',
      'quartic-julia',
      'burning-ship',
      'airship',
      'newton-3',
      'newton-cosh',
      'magnet-type-1',
      'magnet-type-2',
      'multi-phoenix',
      'cosh-mandelbrot',
      'buffalo',
      'circle-inversion',
      'inverted-lambda',
      'mcmullen-2-3',
      'rational-map-1',
      'spider',
      'zaslavsky-map',
      'zubieta',
    ]);
  });

  it('resolves every guide route and stable canonical image path', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      const formulaId = getPublishedFormulaGuideFormulaId(entry);

      expect(getPublishedFormulaGuideBySlug(entry.slug)).toBe(entry);
      expect(formulaId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(formulaGuidePath(entry)).toBe(`/formulas/${formulaId}`);
      expect(formulaGuideLegacyPath(entry)).toBe(`/formulas/${entry.slug}`);
      expect(formulaGuideImagePath(entry)).toBe(
        `/images/formulas/guides/${entry.slug}.jpg`
      );
      expect(formulaGuideOpenGraphImagePath(entry)).toBe(
        `/images/formulas/og/${entry.slug}.jpg`
      );
    }

    expect(getPublishedFormulaGuideBySlug('tricorn')).toBeUndefined();
    expect(getPublishedFormulaGuideBySlug('frm')).toBeUndefined();
  });

  it('keeps published editorial fields complete in both locales', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      for (const messages of [enMessages, zhMessages]) {
        const content = messages.formulas.entries[entry.slug];

        expect(content.overview).toBeTruthy();
        expect(content.imageAlt).toBeTruthy();
        expect(content.imageCaption).toBeTruthy();
      }
    }
  });

  it('publishes only History sections backed by manifest sources', () => {
    const entriesWithHistory = PUBLISHED_FORMULA_GUIDES.filter(
      ({ history }) => history
    );

    expect(entriesWithHistory).toHaveLength(17);
    expect(entriesWithHistory.map(({ formulaId }) => formulaId)).not.toContain(
      'airship'
    );
    expect(entriesWithHistory.map(({ formulaId }) => formulaId)).not.toContain(
      'newtonCosh'
    );
    expect(entriesWithHistory.map(({ formulaId }) => formulaId)).not.toContain(
      'rationalMap1'
    );
    expect(entriesWithHistory.map(({ formulaId }) => formulaId)).not.toContain(
      'spider'
    );
  });

  it('adds every published guide to the localized sitemap', () => {
    const urls = sitemap().map(({ url }) => url);
    const formulaGuideUrls = urls.filter((url) =>
      /\/(?:en|zh)\/formulas\/(?!frm$|editor$)[a-z0-9-]+$/.test(url)
    );
    const expectedUrls = ['en', 'zh'].flatMap((locale) =>
      PUBLISHED_FORMULA_GUIDES.map(
        (entry) =>
          `https://www.fractalpark.com/${locale}${formulaGuidePath(entry)}`
      )
    );

    expect(formulaGuideUrls).toEqual(expectedUrls);
    expect(formulaGuideUrls).toHaveLength(42);
    expect(urls).not.toContain(
      'https://www.fractalpark.com/en/formulas/mandelbrot'
    );
  });

  it('ships unstretched guide and Open Graph JPEGs for every published guide', () => {
    for (const entry of PUBLISHED_FORMULA_GUIDES) {
      const guideImage = readFileSync(
        path.join(
          process.cwd(),
          'public',
          formulaGuideImagePath(entry)
        )
      );
      const openGraphImage = readFileSync(
        path.join(
          process.cwd(),
          'public',
          formulaGuideOpenGraphImagePath(entry)
        )
      );

      expect(guideImage.length, entry.slug).toBeGreaterThan(30_000);
      expect([...guideImage.subarray(0, 2)], entry.slug).toEqual([
        0xff, 0xd8,
      ]);
      expect([...guideImage.subarray(-2)], entry.slug).toEqual([0xff, 0xd9]);
      expect(readJpegDimensions(guideImage), entry.slug).toEqual({
        width: 1200,
        height: 750,
      });
      expect(openGraphImage.length, entry.slug).toBeGreaterThan(30_000);
      expect([...openGraphImage.subarray(0, 2)], entry.slug).toEqual([
        0xff, 0xd8,
      ]);
      expect([...openGraphImage.subarray(-2)], entry.slug).toEqual([
        0xff, 0xd9,
      ]);
      expect(readJpegDimensions(openGraphImage), entry.slug).toEqual({
        width: 1200,
        height: 630,
      });
    }
  });
});
