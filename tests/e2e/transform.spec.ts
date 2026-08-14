import { test, expect, type Page } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

async function expectTransformInUrl(page: Page, transformId: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]tr=${transformId}(?:[&#]|$)`), {
    timeout: 10000,
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

    const sinusoidal = page.getByRole('button', { name: /^sine$/i });
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
    
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('button', { name: /^Burning Ship$/i }).click();

    const burningShip = page.getByRole('button', {
      name: /^Burning Ship Julia(?: Active)? /i,
    });
    await expect(burningShip).toBeVisible();
    await burningShip.click();

    await expect(page).toHaveURL(/[?&]fm=bs(?:[&#]|$)/, { timeout: 10000 });
    await expectTransformInUrl(page, 'inversion');
  });

  test('should handle all 7 transforms without shader errors', async ({ page }) => {
    const transforms = [
      { name: 'Kaleidoscope', id: 'kaleidoscope' },
      { name: 'Mobius', id: 'mobius' },
      { name: 'Inversion', id: 'inversion' },
      { name: 'Polar', id: 'polar' },
      { name: 'Sine', id: 'sinusoidal' },
      { name: 'Spherical', id: 'spherical' },
      { name: 'None', id: null },
    ];
    const shaderErrors: string[] = [];
    const recordShaderError = (message: string) => {
      if (/shader|compile|webgl/i.test(message)) {
        shaderErrors.push(message);
      }
    };
    page.on('console', msg => {
      if (msg.type() === 'error') recordShaderError(msg.text());
    });
    page.on('pageerror', error => recordShaderError(error.message));

    const transformTab = page.getByRole('tab', { name: /transform/i });
    await expect(transformTab).toBeVisible();
    await transformTab.click();

    for (const { name, id } of transforms) {
      const button = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
      await expect(button).toBeVisible();
      await button.click();
      await expect.poll(
        () => new URL(page.url()).searchParams.get('tr'),
        { timeout: 10000 },
      ).toBe(id);
      await waitForFractalCanvasReady(page);
    }

    expect(shaderErrors).toEqual([]);
  });

  test('should handle transform with Julia mode', async ({ page }) => {
    await page.goto(`${baseUrl}/en/explore?fm=mandelbrot&tr=polar&julia=1`);
    await waitForFractalCanvasReady(page);
    await page.waitForTimeout(300);
    
    const url = page.url();
    expect(url).toContain('tr=polar');
    expect(url).toContain('julia=1');
  });

  test('restores the transform after a real page reload', async ({ page }) => {
    // The contract includes two cold SwiftShader renders (initial + reload),
    // measured at ~60s on the release-gate host.
    test.setTimeout(90_000);
    await page.goto(`${baseUrl}/en/explore?tr=spherical&z=1.5`);
    await waitForFractalCanvasReady(page);
    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return { tr: params.get('tr'), z: params.get('z') };
      },
    ).toEqual({ tr: 'spherical', z: '1.50' });

    await page.reload();
    await waitForFractalCanvasReady(page);
    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return { tr: params.get('tr'), z: params.get('z') };
      },
    ).toEqual({ tr: 'spherical', z: '1.50' });

    const transformTab = page.getByRole('tab', { name: /transform/i });
    await expect(transformTab).toBeVisible();
    await transformTab.click();
    await expect(page.getByText('Spherical Amount', { exact: true })).toBeVisible();
  });
});
