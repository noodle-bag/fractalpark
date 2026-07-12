import { expect, test, type Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';

async function openColoring(page: Page, url = '/en/explore') {
  await page.goto(url);
  await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Coloring' }).click();
  await expect(page.getByText('Color Adjustments', { exact: true })).toBeVisible();
}

test.describe('Color adjustments', () => {
  test('updates compact URL params, restores them, and resets to identity', async ({ page }) => {
    await openColoring(page);

    const exposure = page.getByRole('slider', { name: 'Exposure' });
    const hue = page.getByRole('slider', { name: 'Hue' });
    await exposure.focus();
    await exposure.press('ArrowRight');
    await exposure.press('ArrowRight');
    await hue.focus();
    await hue.press('ArrowRight');
    await page.getByRole('switch', { name: 'Invert' }).click();

    await expect(page).toHaveURL(/ex=0\.10/);
    await expect(page).toHaveURL(/hue=1\.0/);
    await expect(page).toHaveURL(/inv=1/);

    await page.getByText('RGB Curves', { exact: true }).click();
    const redMidpoint = page.getByRole('slider', { name: 'R point 3' });
    await redMidpoint.focus();
    await redMidpoint.press('ArrowUp');
    await expect(page).toHaveURL(/cr=/);

    await page.reload();
    await page.getByRole('tab', { name: 'Coloring' }).click();
    await expect(page.getByRole('slider', { name: 'Exposure' })).toHaveAttribute('aria-valuenow', /0\.1/);
    await expect(page.getByRole('switch', { name: 'Invert' })).toBeChecked();

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page).not.toHaveURL(/(?:ex|hue|inv|cr)=/);
    await expect(page.getByRole('slider', { name: 'Exposure' })).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByRole('switch', { name: 'Invert' })).not.toBeChecked();
  });

  test('keeps the Coloring panel within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openColoring(page, '/en/explore?ex=0.5&sat=20&vib=15');

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
    await expect(page.getByRole('slider', { name: 'Exposure' })).toBeVisible();
    await expect(page.getByText('RGB Curves', { exact: true })).toBeVisible();
  });

  test('exports an adjusted high-quality tiled PNG', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await openColoring(page, '/en/explore?ex=0.6&sat=25&hue=-20&cr=0,0.2,0.5,0.85,1');
    const canvasSize = await page.locator('[data-testid="fractal-canvas"]').evaluate((canvas) => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    }));

    await page.getByRole('tab', { name: 'Render' }).click();
    await page.getByRole('button', { name: '4x' }).click();
    await page.getByRole('button', { name: 'High', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const info = await stat(path!);
    const png = await readFile(path!);
    expect(info.size).toBeGreaterThan(10_000);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(Math.round(canvasSize.width * 4));
    expect(png.readUInt32BE(20)).toBe(Math.round(canvasSize.height * 4));
  });

  test('persists adjustments through Saved Gallery and restores legacy saves', async ({ page }) => {
    const legacyEntry = {
      id: 'legacy-color-save',
      name: 'Legacy Color Save',
      params: {
        maxIterations: 200,
        paletteIndex: 0,
        bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        customGradient: null,
        formula: 'mandelbrot',
        outsideColoring: 'smooth',
        insideColoring: 'black',
        transformId: 'none',
        pluginParams: {},
        orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
        useSSAA: false,
        adaptiveIterations: false,
        lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
      },
      createdAt: 1,
      thumbnail: '',
      starred: false,
    };
    await page.addInitScript((entry) => localStorage.setItem('myfrac-saved-fractals', JSON.stringify([entry])), legacyEntry);
    await openColoring(page, '/en/explore?ex=0.8&hue=25&inv=1&cr=0,0.2,0.5,0.8,1');
    await page.getByRole('tab', { name: 'Render' }).click();
    await page.getByRole('button', { name: 'Save to Collection' }).click();
    await page.getByLabel('Name').fill('Adjusted Save');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('myfrac-saved-fractals') ?? '[]'));
    expect(saved.find((entry: { name: string }) => entry.name === 'Adjusted Save').params.colorAdjustments.exposure).toBe(0.8);

    await page.goto('/en/gallery');
    const adjustedLink = page.locator('a', { hasText: 'Adjusted Save' }).first();
    const legacyLink = page.locator('a', { hasText: 'Legacy Color Save' }).first();
    await expect(adjustedLink).toBeVisible({ timeout: 15000 });
    await expect(legacyLink).toBeVisible();
    await expect(adjustedLink).toHaveAttribute('href', /ex=0\.80/);
    await expect(adjustedLink).toHaveAttribute('href', /inv=1/);
    await expect(legacyLink).not.toHaveAttribute('href', /(?:ex|hue|inv|cr)=/);

    await adjustedLink.click();
    await expect(page).toHaveURL(/ex=0\.80/);
    await page.getByRole('tab', { name: 'Coloring' }).click();
    await expect(page.getByRole('slider', { name: 'Exposure' })).toHaveAttribute('aria-valuenow', /0\.8/);
    await expect(page.getByRole('switch', { name: 'Invert' })).toBeChecked();
  });
});
