import { test, expect, type Browser, type Page } from '@playwright/test';
import { ARTWORK_CONTENT_MANIFEST } from '../../src/content/artwork-manifest';

async function waitForGalleryPresetLinks(page: Page) {
  const presetLinks = page.locator('main a[href^="/en/gallery/"]');
  await expect(presetLinks.first()).toBeVisible({ timeout: 15000 });
  return presetLinks;
}

async function expectColumnCount(page: Page, expectedColumns: number) {
  const presetLinks = await waitForGalleryPresetLinks(page);
  const boxes = await Promise.all(
    Array.from({ length: expectedColumns + 1 }, (_, index) =>
      presetLinks.nth(index).boundingBox()
    )
  );

  expect(boxes.every(Boolean)).toBe(true);
  for (let index = 1; index < expectedColumns; index += 1) {
    expect(Math.abs(boxes[0]!.y - boxes[index]!.y)).toBeLessThan(2);
  }
  expect(boxes[expectedColumns]!.y).toBeGreaterThan(
    boxes[0]!.y + boxes[0]!.height
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

async function openGalleryWithoutJavaScript(browser: Browser, locale: 'en' | 'zh') {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`/${locale}/gallery`);
  return { context, page };
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
    await presetLinks.nth(1).hover();
    await expect(presetLinks.first().locator('canvas')).toHaveCount(0);
    await expect(presetLinks.nth(1).locator('canvas')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('main canvas')).toHaveCount(1);
    await page.getByRole('heading', { level: 1, name: 'Gallery' }).hover();
    await expect(page.locator('main canvas')).toHaveCount(0);
  });

  test('collection keeps the 1, 2, and 3 column contract at every gate viewport', async ({ page }) => {
    test.setTimeout(60000);

    for (const { width, height, columns } of [
      { width: 390, height: 844, columns: 1 },
      { width: 768, height: 1024, columns: 2 },
      { width: 1440, height: 900, columns: 3 },
      { width: 1920, height: 1200, columns: 3 },
      { width: 2560, height: 1440, columns: 3 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('/en/gallery');
      await expectColumnCount(page, columns);
    }
  });

  test('collection remains readable in light and dark themes with keyboard focus', async ({ page }) => {
    await page.goto('/en/gallery');
    const presetLinks = await waitForGalleryPresetLinks(page);

    const lightBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background')
    );
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const darkBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background')
    );
    expect(darkBackground).not.toBe(lightBackground);
    await expect(presetLinks.first().locator('img')).toBeVisible();

    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press('Tab');
      if (await presetLinks.first().evaluate((link) => link === document.activeElement)) {
        break;
      }
    }
    await expect(presetLinks.first()).toBeFocused();
    expect(
      await presetLinks.first().evaluate((link) => getComputedStyle(link).boxShadow)
    ).not.toBe('none');
  });

  test('collection exposes all localized artwork links without JavaScript', async ({ browser }) => {
    for (const locale of ['en', 'zh'] as const) {
      const { context, page } = await openGalleryWithoutJavaScript(browser, locale);
      try {
        const presetLinks = page.locator(`main a[href^="/${locale}/gallery/"]`);
        await expect(presetLinks).toHaveCount(26);
        await expect(presetLinks.first().locator('img')).toBeVisible();
        await expect(page.locator('main canvas')).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  });
});
