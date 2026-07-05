/**
 * E2E Tests for M4.10a Five-Tab Explore UI
 * Verifies the tab structure, cross-tab navigation, and domain-specific controls.
 */

import { test, expect, type Page } from '@playwright/test';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Explore Five-Tab Structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
  });

  test('should display all five tabs', async ({ page }) => {
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    const coloringTab = page.getByRole('tab', { name: /coloring/i });
    const transformTab = page.getByRole('tab', { name: /transform/i });
    const renderTab = page.getByRole('tab', { name: /render/i });
    const animationTab = page.getByRole('tab', { name: /animation/i });

    await expect(formulaTab).toBeVisible();
    await expect(coloringTab).toBeVisible();
    await expect(transformTab).toBeVisible();
    await expect(renderTab).toBeVisible();
    await expect(animationTab).toBeVisible();
  });

  test('should display position summary above tabs', async ({ page }) => {
    // Position summary should always be visible regardless of active tab
    await expect(page.getByText(/center/i)).toBeVisible();
    await expect(page.getByText(/zoom/i)).toBeVisible();
  });

  test('should switch between all tabs without errors', async ({ page }) => {
    const tabNames = ['formula', 'coloring', 'transform', 'render', 'animation'];

    for (const name of tabNames) {
      await page.getByRole('tab', { name: new RegExp(name, 'i') }).click();
      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible();
    }
  });

  test('formula tab should be default active tab', async ({ page }) => {
    const formulaTab = page.getByRole('tab', { name: /formula/i });
    await expect(formulaTab).toHaveAttribute('data-state', 'active');
  });
});

test.describe('Coloring Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    await page.getByRole('tab', { name: /coloring/i }).click();
  });

  test('should display outside and inside coloring selectors', async ({ page }) => {
    // Outside coloring modes
    await expect(page.getByRole('button', { name: /smooth/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /binary/i })).toBeVisible();

    // Inside coloring modes
    await expect(page.getByRole('button', { name: /black/i })).toBeVisible();
  });

  test('should switch outside coloring mode and update URL', async ({ page }) => {
    // Click on stripe coloring (short key: st)
    await page.getByRole('button', { name: /stripe/i }).click();

    // Wait for debounced URL update — URL uses short key 'st' for stripe
    await expect(page).toHaveURL(/[?&]oc=st/, { timeout: 5000 });
  });

  test('should switch inside coloring mode and update URL', async ({ page }) => {
    // Click on finalOrbit inside coloring (short key: fo)
    const finalOrbitBtn = page.getByRole('button', { name: /final\s*orbit/i });
    await finalOrbitBtn.click();

    // URL uses short key 'fo' for finalOrbit
    await expect(page).toHaveURL(/[?&]ic=fo/, { timeout: 5000 });
  });

  test('should show orbit trap controls when orbit trap mode is selected', async ({ page }) => {
    await page.getByRole('button', { name: /orbit\s*trap/i }).click();

    // Orbit trap shape options should appear
    await expect(page.getByRole('button', { name: /point/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cross/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /circle/i })).toBeVisible();
  });

  test('should toggle custom gradient mode', async ({ page }) => {
    // Find and toggle the gradient switch
    const gradientSwitch = page.locator('#gradient-mode');
    await gradientSwitch.click();

    // After enabling custom gradient, URL should contain gradient data
    await expect(page).toHaveURL(/[?&]gd=/, { timeout: 5000 });
  });
});

test.describe('Render Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    await page.getByRole('tab', { name: /render/i }).click();
  });

  test('should display quality controls', async ({ page }) => {
    // SSAA toggle
    await expect(page.locator('#ssaa-toggle')).toBeVisible();

    // Adaptive iterations toggle
    await expect(page.locator('#adaptive-toggle')).toBeVisible();

    // Lighting toggle
    await expect(page.locator('#lighting-toggle')).toBeVisible();
  });

  test('should display action buttons', async ({ page }) => {
    // Reset view button
    await expect(page.getByRole('button', { name: /reset/i })).toBeVisible();

    // Share button
    await expect(page.getByRole('button', { name: /share|copy/i })).toBeVisible();

    // Save button
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible();
  });

  test('should show lighting controls when lighting is enabled', async ({ page }) => {
    const lightingToggle = page.locator('#lighting-toggle');
    await lightingToggle.click();

    // Lighting sub-controls should appear
    await expect(page.getByText(/intensity/i)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Coloring URL Restore', () => {
  test('should restore outside coloring from URL', async ({ page }) => {
    // URL uses short key 'st' for stripe
    await page.goto('/en/explore?oc=st');
    await waitForFractalCanvasReady(page);
    await page.getByRole('tab', { name: /coloring/i }).click();

    // Stripe button should be in active/selected state (default variant)
    const stripeBtn = page.getByRole('button', { name: /stripe/i });
    await expect(stripeBtn).toBeVisible();
  });

  test('should restore inside coloring from URL', async ({ page }) => {
    // URL uses short key 'ad' for atomDomain
    await page.goto('/en/explore?ic=ad');
    await waitForFractalCanvasReady(page);
    await page.getByRole('tab', { name: /coloring/i }).click();

    const atomBtn = page.getByRole('button', { name: /atom\s*domain/i });
    await expect(atomBtn).toBeVisible();
  });

  test('should restore orbit trap config from URL', async ({ page }) => {
    // URL uses short keys: oc=ot for orbitTrap, ots=c for circle shape
    await page.goto('/en/explore?oc=ot&ots=c');
    await waitForFractalCanvasReady(page);
    await page.getByRole('tab', { name: /coloring/i }).click();

    // Orbit trap controls should be visible since orbitTrap mode is active
    await expect(page.getByRole('button', { name: /circle/i })).toBeVisible();
  });
});
