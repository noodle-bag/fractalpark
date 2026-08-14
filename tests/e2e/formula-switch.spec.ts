import { test, expect, type Page } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

async function formulaCard(page: Page, name: string) {
  await page.getByRole('button', {
    name: new RegExp(`^${name}$`, 'i'),
  }).click();
  await page.getByPlaceholder('Search formulas...').fill(name);
  return page.getByRole('button', {
    name: new RegExp(`^${name} Julia(?: Active)? `, 'i'),
  });
}

test.describe('Formula Switching', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to explore page
    await page.goto(`${baseUrl}/en/explore`);
    // Wait for canvas to be visible and initial render to settle
    await waitForFractalCanvasReady(page);
  });

  test('should display default mandelbrot formula', async ({ page }) => {
    // Check canvas is present
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // Verify URL doesn't have formula param for default
    const url = page.url();
    expect(url).not.toContain('fm=');
  });

  test('should switch to burning ship formula', async ({ page }) => {
    // Click on Formula tab if present
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
    }

    // Find and click burning ship formula
    const burningShip = await formulaCard(page, 'Burning Ship');
    await expect(burningShip).toBeVisible();
    await burningShip.click();

    await expect(page).toHaveURL(/[?&]fm=bs(?:[&#]|$)/, { timeout: 5000 });
  });

  test('should switch to tricorn formula', async ({ page }) => {
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
    }

    const tricorn = page.getByRole('button', { name: /Tricorn/i });
    if (await tricorn.isVisible().catch(() => false)) {
      await tricorn.click();

      // Wait for URL to update (debounced 500ms + buffer)
      await page.waitForTimeout(1000);

      // Verify URL updated (uses short key 'tr' for tricorn)
      const url = page.url();
      expect(url).toContain('fm=tr');
    }
  });

  test('should switch to phoenix formula', async ({ page }) => {
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
    }

    const phoenix = await formulaCard(page, 'Phoenix');
    await expect(phoenix).toBeVisible();
    await phoenix.click();

    await expect(page).toHaveURL(/[?&]fm=ph(?:[&#]|$)/, { timeout: 5000 });
  });

  test('should switch to Newton formula', async ({ page }) => {
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
    }

    // Newton formulas are in a specific category
    const newton3 = page.getByRole('button', { name: /Newton.*3rd/i });
    if (await newton3.isVisible().catch(() => false)) {
      await newton3.click();

      // Wait for URL to update (debounced 500ms + buffer)
      await page.waitForTimeout(1000);

      const url = page.url();
      expect(url).toContain('fm=newton3');
    }
  });

  test('resets view bounds to the selected formula defaults', async ({ page }) => {
    // One cold Explore render plus a real formula switch takes ~37s on the
    // release-gate SwiftShader host; keep a bounded margin without relaxing
    // any state assertions.
    test.setTimeout(60_000);
    await page.goto(`${baseUrl}/en/explore?cx=-0.5&cy=0&z=2.0`);
    await waitForFractalCanvasReady(page);

    const formulaTab = page.getByRole('tab', { name: /formula/i });
    await expect(formulaTab).toBeVisible();
    await formulaTab.click();

    const burningShip = await formulaCard(page, 'Burning Ship');
    await expect(burningShip).toBeVisible();
    await burningShip.click();

    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return {
          fm: params.get('fm'),
          cx: params.get('cx'),
          cy: params.get('cy'),
          z: params.get('z'),
          rot: params.get('rot'),
        };
      },
      { timeout: 10000 },
    ).toEqual({
      fm: 'bs',
      cx: '-1.7076963837',
      cy: '-0.0375484240',
      z: '6.34',
      rot: '3.1416',
    });
  });

  test('should handle Julia mode toggle with different formulas', async ({ page }) => {
    // Enable Julia mode
    const juliaToggle = page.getByRole('switch', { name: /julia/i });
    if (await juliaToggle.isVisible().catch(() => false)) {
      await juliaToggle.click();
      await page.waitForTimeout(300);
      
      const url = page.url();
      expect(url).toContain('julia=1');
    }
  });

  test('should render all 4 original formulas without errors', async ({ page }) => {
    const formulas = [
      { name: 'Burning Ship', urlKey: 'bs' },
      { name: 'Tricorn', urlKey: 'tr' },
      { name: 'Phoenix', urlKey: 'ph' },
      { name: 'Mandelbrot', urlKey: null },
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

    await page.getByRole('tab', { name: /formula/i }).click();
    const search = page.getByPlaceholder('Search formulas...');

    for (const { name, urlKey } of formulas) {
      await page.getByRole('button', { name: /^All$/i }).click();
      await search.fill(name);
      const card = page.getByRole('button', {
        name: new RegExp(`^${name} Julia(?: Active)? `, 'i'),
      });
      await expect(card).toBeVisible();
      await card.click();
      await expect.poll(
        () => new URL(page.url()).searchParams.get('fm'),
        { timeout: 10000 },
      ).toBe(urlKey);
      await waitForFractalCanvasReady(page);
    }

    expect(shaderErrors).toEqual([]);
  });

  test('restores the selected formula after a real page reload', async ({ page }) => {
    // The contract includes two cold SwiftShader renders (initial + reload),
    // measured at ~55s on the release-gate host.
    test.setTimeout(90_000);
    await page.goto(`${baseUrl}/en/explore?fm=bs`);
    await waitForFractalCanvasReady(page);
    await expect.poll(
      () => new URL(page.url()).searchParams.get('fm'),
    ).toBe('bs');

    await page.reload();
    await waitForFractalCanvasReady(page);
    await expect.poll(
      () => new URL(page.url()).searchParams.get('fm'),
    ).toBe('bs');

    const formulaTab = page.getByRole('tab', { name: /formula/i });
    await expect(formulaTab).toBeVisible();
    await formulaTab.click();
    const burningShip = await formulaCard(page, 'Burning Ship');
    await expect(burningShip).toHaveAccessibleName(/^Burning Ship Julia Active /i);
  });
});
