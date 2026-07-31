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

  test('featured preset should show a static thumbnail and navigate with a matching href', async ({ page }) => {
    await page.goto('/en/gallery');

    const featuredCard = page.locator('a[href^="/en/gallery/preset-"]').filter({ hasText: 'Featured' }).first();
    await expect(featuredCard).toBeVisible({ timeout: 15000 });

    const thumbnail = featuredCard.locator('img').first();
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute('src', /\/images\/gallery\/presets\/|^data:image\//);

    const href = await featuredCard.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('/en/gallery/preset-');
    const redirect = await page.request.get(href!, { maxRedirects: 0 });
    const expectedLocation = redirect.headers().location;
    expect(redirect.status()).toBe(308);
    expect(expectedLocation).toMatch(/^\/en\/explore\?/);

    await featuredCard.click();
    await waitForFractalCanvasReady(page);

    expect(page.url()).toBe(new URL(expectedLocation!, page.url()).toString());
  });
});
