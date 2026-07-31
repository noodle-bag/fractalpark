import { expect, test } from '@playwright/test';

const englishPath = '/en/gallery/newton-3-deep-spiral';
const chinesePath = '/zh/gallery/newton-cosh-ember-meridian';

test.describe('Artwork validation pages', () => {
  test('renders canonical metadata, visible credit, license, state, and structured data', async ({
    page,
  }) => {
    await page.goto(englishPath);

    await expect(page.getByRole('heading', { level: 1, name: 'Newton Deep Spiral' })).toBeVisible();
    await expect(page.getByText('Created by FractalPark')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Image licensed under CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/'
    );
    await expect(page.getByRole('link', { name: 'Remix in Explorer' })).toHaveAttribute(
      'href',
      /^\/en\/explore\?/
    );
    await expect(page.getByRole('heading', { name: 'Artwork state' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Newton (3rd)' })).toHaveAttribute(
      'href',
      '/en/formulas/newton-3'
    );

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/en/gallery/newton-3-deep-spiral'
    );

    const artworkJsonLd = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((scripts) =>
        scripts
          .map((script) => JSON.parse(script.textContent || '{}'))
          .find((value) => value['@type'] === 'WebPage' && value.primaryImageOfPage)
      );
    expect(artworkJsonLd.primaryImageOfPage.creator.name).toBe('FractalPark');
    expect(artworkJsonLd.primaryImageOfPage.creditText).toBe('FractalPark');
    expect(artworkJsonLd.primaryImageOfPage.license).toBe(
      'https://creativecommons.org/licenses/by/4.0/'
    );
    expect(artworkJsonLd.primaryImageOfPage.width).toBe(1920);
    expect(artworkJsonLd.primaryImageOfPage.height).toBe(1200);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy page link' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });

  test('keeps Chinese editorial content and normal links readable without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(chinesePath);

    await expect(page.getByRole('heading', { level: 1, name: '余烬经线' })).toBeVisible();
    await expect(page.getByText('由 FractalPark 创作')).toBeVisible();
    await expect(page.getByRole('heading', { name: '视觉特征' })).toBeVisible();
    await expect(page.getByRole('link', { name: '在探索器中 Remix' })).toHaveAttribute(
      'href',
      /^\/zh\/explore\?/
    );
    await expect(page.getByRole('link', { name: '牛顿双曲余弦' })).toHaveAttribute(
      'href',
      '/zh/formulas/newton-cosh'
    );

    await context.close();
  });

  test('opens a static viewer first and loads only the current artwork when Play is requested', async ({
    page,
  }) => {
    await page.goto(englishPath);
    await page.getByRole('button', { name: 'View fullscreen' }).click();

    const dialog = page.getByRole('dialog', { name: 'Newton Deep Spiral' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Play animation' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Previous|Next/ })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Play animation' }).click();
    await expect(dialog.locator('canvas')).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole('button', { name: 'Pause animation' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Pause animation' }).click();
    await expect(dialog.locator('canvas')).toBeVisible();
    await dialog.getByRole('button', { name: 'Play animation' }).click();
    await expect(dialog.locator('canvas')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Pause animation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('keeps the artwork layout within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(englishPath);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
