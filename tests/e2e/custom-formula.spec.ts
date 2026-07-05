/**
 * E2E Tests for Custom Formula Workflow
 * M4.2 Phase 2.3
 */

import { test, expect, type Page } from '@playwright/test';

const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+a' : 'Control+a';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Custom Formula Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to explore page
    await page.goto('/en/explore');

    // Wait for canvas to be visible and initial render to settle
    await waitForFractalCanvasReady(page);
  });

  test('should open formula tab and create custom formula', async ({ page }) => {
    // Click on Formula tab
    await page.getByRole('tab', { name: /formula/i }).click();

    // Click on Custom tab
    await page.getByRole('tab', { name: /custom/i }).click();

    // Click "New Formula" button (Chinese: "New" or "Create first formula")
    const newFormulaBtn = page.locator('button').filter({ hasText: /New|Create first formula/ }).first();
    await newFormulaBtn.click();

    // Wait for editor to appear (CodeMirror lazy loads)
    await page.waitForSelector('.cm-editor', { timeout: 15000 });
    await page.waitForTimeout(2000); // Wait for editor + lint to initialize with default formula

    // The default formula (MyFormula with z=z^2+c) is valid - compile it directly
    const compileBtn1 = page.getByRole('button', { name: /^Compile$/ });
    await expect(compileBtn1).toBeEnabled({ timeout: 30000 });
    await compileBtn1.click();

    // Wait for success message (English locale)
    await page.waitForSelector('text=Compile Successful', { timeout: 10000 });

    // Save the formula
    await page.getByRole('button', { name: /^Save$/ }).click();

    // Verify formula appears in list (default name is "MyFormula")
    await page.waitForSelector('text=MyFormula', { timeout: 5000 });
  });

  test('should handle compilation errors gracefully', async ({ page }) => {
    // Navigate to custom formula editor
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('tab', { name: /custom/i }).click();

    // Click "New Formula" button (Chinese: "New" or "Create first formula")
    const newFormulaBtn2 = page.locator('button').filter({ hasText: /New|Create first formula/ }).first();
    await newFormulaBtn2.click();

    await page.waitForSelector('.cm-editor', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Type a formula with an undeclared variable (lint error)
    const cmContent2 = page.locator('.cm-content');
    await cmContent2.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await cmContent2.type('Invalid {\nloop:\n  z = undefined_var + c\nbailout:\n  |z| < 4\n}');
    await page.waitForTimeout(2000); // Wait for linter to run

    // With an undeclared variable, the linter reports an error inline.
    // The Compile button will be disabled due to errorCount > 0.
    // Verify error details are shown in the diagnostics panel.
    await expect(page.locator('.cm-lintRange-error').first()).toBeVisible({ timeout: 10000 });
  });

  test('should use custom formula in URL', async ({ page }) => {
    // First create a custom formula
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('tab', { name: /custom/i }).click();

    // Click "New Formula" button (Chinese: "New" or "Create first formula")
    const newFormulaBtn3 = page.locator('button').filter({ hasText: /New|Create first formula/ }).first();
    await newFormulaBtn3.click();

    await page.waitForSelector('.cm-editor', { timeout: 15000 });
    await page.waitForTimeout(500);

    // Type and compile formula
    await page.click('.cm-editor');
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(`MyTest {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`);

    const compileBtn3 = page.getByRole('button', { name: /^Compile$/ });
    await expect(compileBtn3).toBeEnabled({ timeout: 15000 });
    await compileBtn3.click();
    await page.waitForSelector('text=Compile Successful', { timeout: 10000 });

    // Click on the formula to use it
    await page.click('text=MyTest');

    // Wait for debounced URL update (500ms) and verify URL contains the custom formula ID
    await expect(page).toHaveURL(/[?&]fm=/, { timeout: 5000 });
  });

  test('should fallback to mandelbrot for unknown formula in URL', async ({ page }) => {
    // Navigate with a non-existent custom formula ID
    await page.goto('/en/explore?fm=frm-nonexistent');

    // Wait for page to load
    await waitForFractalCanvasReady(page);
    
    // Verify fallback warning in console (we can't easily test console output,
    // but the page should load without errors)
    await expect(page.locator('text=Error')).not.toBeVisible();
  });

  test('should persist custom formulas across reloads', async ({ page }) => {
    // Create a formula
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('tab', { name: /custom/i }).click();

    // Click "New Formula" button (Chinese: "New" or "Create first formula")
    const newFormulaBtn4 = page.locator('button').filter({ hasText: /New|Create first formula/ }).first();
    await newFormulaBtn4.click();

    await page.waitForSelector('.cm-editor', { timeout: 15000 });
    await page.waitForTimeout(2000); // Wait for editor + lint to initialize with default formula

    // Use default formula (MyFormula) directly - it's already valid
    const compileBtn4 = page.getByRole('button', { name: /^Compile$/ });
    await expect(compileBtn4).toBeEnabled({ timeout: 30000 });
    await compileBtn4.click();
    await page.waitForSelector('text=Compile Successful', { timeout: 10000 });
    await page.getByRole('button', { name: /^Save$/ }).click();
    
    // Reload page
    await page.reload();
    await waitForFractalCanvasReady(page);
    
    // Navigate to custom formulas
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('tab', { name: /custom/i }).click();

    // Verify formula still exists (saved as default name "MyFormula")
    await expect(page.locator('text=MyFormula')).toBeVisible();
  });

  test('should delete custom formula', async ({ page }) => {
    // Create a formula first
    await page.getByRole('tab', { name: /formula/i }).click();
    await page.getByRole('tab', { name: /custom/i }).click();

    // Click "New Formula" button (Chinese: "New" or "Create first formula")
    const newFormulaBtn5 = page.locator('button').filter({ hasText: /New|Create first formula/ }).first();
    await newFormulaBtn5.click();

    await page.waitForSelector('.cm-editor', { timeout: 15000 });
    await page.waitForTimeout(500);

    await page.click('.cm-editor');
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(`ToDelete {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`);

    const compileBtn5 = page.getByRole('button', { name: /^Compile$/ });
    await expect(compileBtn5).toBeEnabled({ timeout: 15000 });
    await compileBtn5.click();
    await page.waitForSelector('text=Compile Successful', { timeout: 10000 });
    await page.getByRole('button', { name: /^Save$/ }).click();
    
    // Delete the formula
    page.on('dialog', dialog => dialog.accept());
    await page.click('[data-testid="delete-formula"]');
    
    // Verify formula is removed
    await expect(page.locator('text=ToDelete')).not.toBeVisible();
  });
});
