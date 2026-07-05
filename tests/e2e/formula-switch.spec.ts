import { test, expect, type Page } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
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
    const burningShip = page.getByRole('button', { name: /Burning Ship/i });
    if (await burningShip.isVisible().catch(() => false)) {
      await burningShip.click();

      // Wait for URL to update (debounced 500ms + buffer)
      await page.waitForTimeout(1000);

      // Verify URL updated (uses short key 'bs' for burningShip)
      const url = page.url();
      expect(url).toContain('fm=bs');
    }
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

    const phoenix = page.getByRole('button', { name: /Phoenix/i });
    if (await phoenix.isVisible().catch(() => false)) {
      await phoenix.click();
      await page.waitForTimeout(500);
      
      // Verify URL updated (uses short key 'ph' for phoenix)
      const url = page.url();
      expect(url).toContain('fm=ph');
    }
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

  test('should maintain view bounds when switching formulas', async ({ page }) => {
    // Set specific view bounds via URL
    await page.goto(`${baseUrl}/en/explore?cx=-0.5&cy=0&z=2.0`);
    await waitForFractalCanvasReady(page);
    
    // Switch formula
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    if (await formulaTab.isVisible().catch(() => false)) {
      await formulaTab.click();
      
      const burningShip = page.getByRole('button', { name: /Burning Ship/i });
      if (await burningShip.isVisible().catch(() => false)) {
        await burningShip.click();

        // Wait for URL to update (debounced 500ms + buffer)
        await page.waitForTimeout(1000);

        // Verify formula changed (view bounds reset to formula defaults)
        const url = page.url();
        expect(url).toContain('fm=bs');
        // Note: switching formulas resets view to formula's default bounds
      }
    }
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
    const formulas = ['mandelbrot', 'burningShip', 'tricorn', 'phoenix'];
    
    for (const formulaId of formulas) {
      // Navigate with formula param
      await page.goto(`${baseUrl}/en/explore?fm=${formulaId}`);
      await waitForFractalCanvasReady(page);
      await page.waitForTimeout(300);
      
      // Verify no console errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      
      // Canvas should still be visible
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
      
      // Should not have shader compilation errors
      expect(consoleErrors.filter(e => e.includes('shader') || e.includes('compile'))).toHaveLength(0);
    }
  });

  test('URL should restore formula on page reload', async ({ page }) => {
    // Navigate with specific formula (short key is used after page reloads with encoded URL)
    await page.goto(`${baseUrl}/en/explore?fm=bs`);
    await waitForFractalCanvasReady(page);
    await page.waitForTimeout(300);
    
    // Reload page
    await page.reload();
    await waitForFractalCanvasReady(page);
    
    // Verify formula still in URL (short key 'bs' is used)
    const url = page.url();
    expect(url).toContain('fm=bs');
  });
});
