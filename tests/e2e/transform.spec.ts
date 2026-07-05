import { test, expect, type Page } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

async function expectTransformInUrl(page: Page, transformId: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]tr=${transformId}(?:[&#]|$)`), {
    timeout: 5000,
  });
}

test.describe('Transform System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/en/explore`);
    await waitForFractalCanvasReady(page);
  });

  test('should default to no transform', async ({ page }) => {
    const url = page.url();
    // Default transform (none) should not appear in URL
    expect(url).not.toContain('tr=');
  });

  test('should apply kaleidoscope transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    // Look for transform selector
    const kaleidoscope = page.getByRole('button', { name: /kaleidoscope/i });
    if (await kaleidoscope.isVisible().catch(() => false)) {
      await kaleidoscope.click();
      await expectTransformInUrl(page, 'kaleidoscope');
    }
  });

  test('should apply inversion transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    const inversion = page.getByRole('button', { name: /inversion/i });
    if (await inversion.isVisible().catch(() => false)) {
      await inversion.click();
      await expectTransformInUrl(page, 'inversion');
    }
  });

  test('should apply polar transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    const polar = page.getByRole('button', { name: /polar/i });
    if (await polar.isVisible().catch(() => false)) {
      await polar.click();
      await expectTransformInUrl(page, 'polar');
    }
  });

  test('should apply spherical transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    const spherical = page.getByRole('button', { name: /spherical/i });
    if (await spherical.isVisible().catch(() => false)) {
      await spherical.click();
      await expectTransformInUrl(page, 'spherical');
    }
  });

  test('should apply Mobius transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    const mobius = page.getByRole('button', { name: /mobius/i });
    if (await mobius.isVisible().catch(() => false)) {
      await mobius.click();
      await expectTransformInUrl(page, 'mobius');
    }
  });

  test('should apply sinusoidal transform', async ({ page }) => {
    const transformTab = page.getByRole('tab', { name: /transform/i });
    if (await transformTab.isVisible().catch(() => false)) {
      await transformTab.click();
    }

    const sinusoidal = page.getByRole('button', { name: /sinusoidal/i });
    if (await sinusoidal.isVisible().catch(() => false)) {
      await sinusoidal.click();
      await expectTransformInUrl(page, 'sinusoidal');
    }
  });

  test('should combine formula and transform in URL', async ({ page }) => {
    await page.goto(`${baseUrl}/en/explore?fm=bs&tr=kaleidoscope`);
    await waitForFractalCanvasReady(page);
    await page.waitForTimeout(300);

    const url = page.url();
    expect(url).toContain('fm=bs');
    expect(url).toContain('tr=kaleidoscope');
  });

  test('should maintain transform when switching formulas', async ({ page }) => {
    // Start with transform
    await page.goto(`${baseUrl}/en/explore?tr=inversion`);
    await waitForFractalCanvasReady(page);
    
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
      
      // Switch to another formula
      const burningShip = page.getByRole('button', { name: /Burning Ship/i });
      if (await burningShip.isVisible().catch(() => false)) {
        await burningShip.click();

        // Wait for URL to update (debounced 500ms + buffer)
        await page.waitForTimeout(1000);

        // Transform should still be in URL (formula uses short key 'bs')
        const url = page.url();
        expect(url).toContain('tr=inversion');
        expect(url).toContain('fm=bs');
      }
    }
  });

  test('should handle all 7 transforms without shader errors', async ({ page }) => {
    const transforms = [
      'none',
      'kaleidoscope',
      'mobius',
      'inversion',
      'polar',
      'sinusoidal',
      'spherical',
    ];

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    for (const transformId of transforms) {
      await page.goto(`${baseUrl}/en/explore?tr=${transformId}`);
      await waitForFractalCanvasReady(page);
      await page.waitForTimeout(300);
      
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    }

    // Should not have shader compilation errors
    expect(consoleErrors.filter(e => 
      e.includes('shader') || 
      e.includes('compile') ||
      e.includes('WebGL')
    )).toHaveLength(0);
  });

  test('should handle transform with Julia mode', async ({ page }) => {
    await page.goto(`${baseUrl}/en/explore?fm=mandelbrot&tr=polar&julia=1`);
    await waitForFractalCanvasReady(page);
    await page.waitForTimeout(300);
    
    const url = page.url();
    expect(url).toContain('tr=polar');
    expect(url).toContain('julia=1');
  });

  test('transform should be preserved on page reload', async ({ page }) => {
    await page.goto(`${baseUrl}/en/explore?tr=spherical&z=1.5`);
    await waitForFractalCanvasReady(page);
    await page.waitForTimeout(300);

    await page.reload();
    await waitForFractalCanvasReady(page);
    
    const url = page.url();
    expect(url).toContain('tr=spherical');
    expect(url).toContain('z=1.5');
  });
});
