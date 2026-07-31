import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import presetsFile from '../../public/gallery-presets.json';
import sitemap from '@/app/sitemap';
import {
  PUBLISHED_ARTWORK_PAGES,
  PUBLISHED_ARTWORK_PAGE_PRESET_IDS,
  artworkPagePath,
  getPublishedArtworkPageBySlug,
  isPublishedArtworkPagePresetId,
} from '@/content/artwork-pages';
import {
  buildPublishedArtworkBySlug,
  buildPublishedArtworkPlayback,
} from '@/lib/published-artworks';

vi.mock('@/i18n/routing', () => ({
  routing: { locales: ['en', 'zh'] },
}));

function readJpegDimensions(image: Buffer): { width: number; height: number } {
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
    if (marker !== 0xd8 && marker !== 0xd9) {
      offset += image.readUInt16BE(offset);
    }
  }
  throw new Error('JPEG dimensions not found');
}

describe('published artwork validation pages', () => {
  it('publishes the frozen two-artwork validation set', () => {
    expect(PUBLISHED_ARTWORK_PAGE_PRESET_IDS).toEqual([
      'preset-newton-deep-spiral',
      'preset-newton-cosh-ember-meridian',
    ]);
    expect(PUBLISHED_ARTWORK_PAGES.map(({ slug }) => slug)).toEqual([
      'newton-3-deep-spiral',
      'newton-cosh-ember-meridian',
    ]);
    for (const entry of PUBLISHED_ARTWORK_PAGES) {
      expect(getPublishedArtworkPageBySlug(entry.slug)).toBe(entry);
      expect(isPublishedArtworkPagePresetId(entry.presetId)).toBe(true);
      expect(artworkPagePath(entry)).toBe(`/gallery/${entry.slug}`);
    }
    expect(getPublishedArtworkPageBySlug('lambda-vortex')).toBeUndefined();
  });

  it('projects page and playback data from the same canonical artwork', () => {
    for (const entry of PUBLISHED_ARTWORK_PAGES) {
      const artwork = buildPublishedArtworkBySlug(presetsFile, entry.slug, 'en');
      expect(artwork).toBeDefined();
      const playback = buildPublishedArtworkPlayback(artwork!);

      expect(playback.id).toBe(artwork!.presetId);
      expect(playback.params.formula).toBe(artwork!.formulaId);
      expect(playback.params.bounds).toEqual(artwork!.document.scene.bounds);
      expect(playback.animation.keyframes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps validation content complete in both locales', () => {
    for (const entry of PUBLISHED_ARTWORK_PAGES) {
      for (const messages of [enMessages, zhMessages]) {
        const content = messages.artworks.entries[entry.presetId];
        expect(content.summary).toBeTruthy();
        expect(content.visualNote).toBeTruthy();
      }
    }
  });

  it('adds only the validation artwork pages to the localized sitemap', () => {
    const urls = sitemap().map(({ url }) => url);
    const artworkUrls = urls.filter((url) => /\/(?:en|zh)\/gallery\/.+$/.test(url));
    const expected = ['en', 'zh'].flatMap((locale) =>
      PUBLISHED_ARTWORK_PAGES.map(
        (entry) => `https://www.fractalpark.com/${locale}${artworkPagePath(entry)}`
      )
    );

    expect(artworkUrls).toEqual(expected);
    expect(artworkUrls).toHaveLength(4);
    expect(urls).not.toContain('https://www.fractalpark.com/en/gallery/lambda-vortex');
  });

  it('ships true 1920 by 1200 validation JPEGs', () => {
    for (const entry of PUBLISHED_ARTWORK_PAGES) {
      const image = readFileSync(path.join(
        process.cwd(),
        'public/images/gallery/presets',
        `${entry.presetId}.jpg`
      ));
      expect([...image.subarray(0, 2)], entry.slug).toEqual([0xff, 0xd8]);
      expect([...image.subarray(-2)], entry.slug).toEqual([0xff, 0xd9]);
      expect(readJpegDimensions(image), entry.slug).toEqual({
        width: 1920,
        height: 1200,
      });
    }
  });
});
