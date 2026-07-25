import { expect, test } from '@playwright/test';

const presetId = 'preset-newton-deep-spiral';

function expectDirectPermanentExploreRedirect(status: number, location: string | undefined) {
  expect(status).toBe(308);
  expect(location).toBeTruthy();
  expect(location).toMatch(/^\/en\/explore\?/);
}

test.describe('Gallery preset redirects', () => {
  test('localized preset shortlink redirects permanently to Explore', async ({ request }) => {
    const response = await request.get(`/en/gallery/${presetId}`, {
      maxRedirects: 0,
    });

    expectDirectPermanentExploreRedirect(response.status(), response.headers().location);
  });

  test('default-locale shortlink redirects permanently and skips the locale hop', async ({
    request,
  }) => {
    const response = await request.get(`/gallery/${presetId}`, {
      maxRedirects: 0,
    });

    expectDirectPermanentExploreRedirect(response.status(), response.headers().location);
  });
});
