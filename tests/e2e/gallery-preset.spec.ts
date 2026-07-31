import { test, expect, type Page } from '@playwright/test';

async function waitForGalleryPresetLinks(page: Page) {
  const presetLinks = page.locator('a[href^="/en/gallery/preset-"]');
  await expect(presetLinks.first()).toBeVisible({ timeout: 15000 });
  return presetLinks;
}

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Gallery Preset Navigation', () => {
  test('builtin preset should navigate from gallery to explore with projected URL params', async ({ page }) => {
    await page.goto('/en/gallery');

    const presetLinks = await waitForGalleryPresetLinks(page);
    const firstPresetLink = presetLinks.first();
    const href = await firstPresetLink.getAttribute('href');

    expect(href).toBeTruthy();
    expect(href).toContain('/en/gallery/preset-');
    const redirect = await page.request.get(href!, { maxRedirects: 0 });
    const expectedLocation = redirect.headers().location;
    expect(redirect.status()).toBe(308);
    expect(expectedLocation).toMatch(/^\/en\/explore\?/);

    await firstPresetLink.click();

    await waitForFractalCanvasReady(page);

    expect(page.url()).toBe(new URL(expectedLocation!, page.url()).toString());
  });

  test('collection should render all published works as static cards without legacy controls', async ({ page }) => {
    await page.goto('/en/gallery');

    const presetLinks = await waitForGalleryPresetLinks(page);
    await expect(presetLinks).toHaveCount(26);

    const thumbnail = presetLinks.first().locator('img').first();
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute('src', /\/images\/gallery\/presets\/|^data:image\//);
    await expect(page.getByText('Featured')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /star|fullscreen/i })).toHaveCount(0);
    await expect(page.locator('[data-testid="fractal-canvas"]')).toHaveCount(0);
  });
});
