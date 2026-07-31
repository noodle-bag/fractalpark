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

  test('collection should render three desktop columns and animate only the hovered work', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await expect(page.locator('main canvas')).toHaveCount(0);

    const boxes = await Promise.all(
      [0, 1, 2, 3].map((index) => presetLinks.nth(index).boundingBox())
    );
    expect(boxes.every(Boolean)).toBe(true);
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
    expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(2);
    expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);

    await presetLinks.first().hover();
    await expect(presetLinks.first().locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.getByRole('heading', { level: 1, name: 'Gallery' }).hover();
    await expect(page.locator('main canvas')).toHaveCount(0);
  });
});
