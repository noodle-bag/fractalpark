import { expect, test } from '@playwright/test';

const publishedPresetId = 'preset-newton-deep-spiral';
const compatibilityPresetId = 'preset-lambda-julia-vortex';

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

  test('valid presets outside the validation set retain the Explore compatibility redirect', async ({
    request,
  }) => {
    const response = await request.get(`/en/gallery/${compatibilityPresetId}`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toMatch(/^\/en\/explore\?/);
  });

  test('unknown preset IDs and artwork slugs return not found', async ({ request }) => {
    expect((await request.get('/gallery/preset-unknown')).status()).toBe(404);
    expect((await request.get('/en/gallery/unknown-artwork')).status()).toBe(404);
    expect((await request.get('/en/gallery/lambda-vortex')).status()).toBe(404);
  });
});
