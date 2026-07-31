import { expect, test } from '@playwright/test';
import { ARTWORK_CONTENT_MANIFEST } from '../../src/content/artwork-manifest';

const publishedPresetId = 'preset-newton-deep-spiral';

test.describe('Gallery preset redirects', () => {
  test('localized published preset redirects to the same-locale canonical artwork', async ({
    request,
  }) => {
    const response = await request.get(`/zh/gallery/${publishedPresetId}`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe('/zh/gallery/newton-3-deep-spiral');
  });

  test('default-locale published preset redirects directly to English canonical artwork', async ({
    request,
  }) => {
    const response = await request.get(`/gallery/${publishedPresetId}`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe('/en/gallery/newton-3-deep-spiral');
  });

  test('all published presets use their canonical artwork redirects', async ({
    request,
  }) => {
    for (const entry of ARTWORK_CONTENT_MANIFEST) {
      const [localized, defaultLocale] = await Promise.all([
        request.get(`/zh/gallery/${entry.presetId}`, { maxRedirects: 0 }),
        request.get(`/gallery/${entry.presetId}`, { maxRedirects: 0 }),
      ]);

      expect(localized.status(), entry.presetId).toBe(308);
      expect(localized.headers().location, entry.presetId).toBe(
        `/zh/gallery/${entry.slug}`
      );
      expect(defaultLocale.status(), entry.presetId).toBe(308);
      expect(defaultLocale.headers().location, entry.presetId).toBe(
        `/en/gallery/${entry.slug}`
      );
    }
  });

  test('unknown preset IDs and artwork slugs return not found', async ({ request }) => {
    expect((await request.get('/gallery/preset-unknown')).status()).toBe(404);
    expect((await request.get('/en/gallery/unknown-artwork')).status()).toBe(404);
    expect((await request.get('/en/gallery/mandelbrot-unknown')).status()).toBe(404);
  });
});
