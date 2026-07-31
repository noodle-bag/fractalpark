import { test, expect, type Page } from '@playwright/test';
import { ARTWORK_CONTENT_MANIFEST } from '../../src/content/artwork-manifest';

async function waitForGalleryPresetLinks(page: Page) {
  const presetLinks = page.locator('main a[href^="/en/gallery/"]');
  await expect(presetLinks.first()).toBeVisible({ timeout: 15000 });
  return presetLinks;
}

test.describe('Gallery Preset Navigation', () => {
  test('published artwork should navigate directly to its canonical page', async ({ page }) => {
    await page.goto('/en/gallery');

    const presetLinks = await waitForGalleryPresetLinks(page);
    const firstPresetLink = presetLinks.first();
    const href = await firstPresetLink.getAttribute('href');

    expect(href).toBeTruthy();
    expect(href).toBe('/en/gallery/newton-3-deep-spiral');

    await firstPresetLink.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Newton Deep Spiral' })).toBeVisible();
    expect(page.url()).toBe(new URL(href!, page.url()).toString());
  });

  test('collection should render all published works as static cards without legacy controls', async ({ page }) => {
    await page.goto('/en/gallery');

    const presetLinks = await waitForGalleryPresetLinks(page);
    await expect(presetLinks).toHaveCount(26);
    expect(await presetLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href'))
    )).toEqual(
      ARTWORK_CONTENT_MANIFEST.map(({ slug }) => `/en/gallery/${slug}`)
    );

    const thumbnail = presetLinks.first().locator('img').first();
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute('src', /\/images\/gallery\/presets\/|^data:image\//);
    await expect(page.getByText('Featured')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /star|fullscreen/i })).toHaveCount(0);
    await expect(page.locator('[data-testid="fractal-canvas"]')).toHaveCount(0);
  });
});
