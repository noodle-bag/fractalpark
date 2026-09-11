import { expect, test } from '@playwright/test';
import { SUPPORTED_LOCALES } from '../../src/i18n/supported-locales';

const FATSO = 'fd4db987-1bd3-5ab0-983f-9a9bb01d0304';

test.describe('Explore formula identity and detail links', () => {
  test.describe.configure({ timeout: 120_000 });
  for (const locale of SUPPORTED_LOCALES) {
    test(`links fatso to its ${locale} record without conflating function parameters`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}/explore?fm=${FATSO}&iter=24`);
      const name = page.getByTestId('published-formula-current');
      await expect(name).toHaveText('fractint-fatso', { timeout: 45_000 });
      await expect(page.locator('#julia-mode')).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'function1', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'function2', exact: true })).toBeVisible();
      const link = name.locator('..').getByRole('link');
      await expect(link).toHaveAttribute('href', `/${locale}/formulas/${FATSO}`);
      await expect(link).toHaveAccessibleName(/fatso/);
      await link.focus();
      await expect(link).toBeFocused();
      await link.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/${locale}/formulas/${FATSO}$`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText('fatso');
    });
  }

  for (const [formula, label, canonical] of [
    ['mandelbrot', 'classic-mandelbrot', '00e14aa8-b766-54ea-a359-3f5d20d329b7'],
    ['perpendicularCeltic', 'classic-perpendicularCeltic', '627c38a8-8f4d-548f-a5a6-dd9f215adf60'],
    ['77ca142c-a2c6-568d-acbd-2b4dde8c7e89', 'fractint-leemandel2', '77ca142c-a2c6-568d-acbd-2b4dde8c7e89'],
  ]) {
    test(`resolves ${formula} at 320px without changing its runtime`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(`/en/explore?fm=${formula}&iter=24`);
      const name = page.getByTestId('published-formula-current');
      await expect(name).toHaveText(label, { timeout: 45_000 });
      await expect(name.locator('..').getByRole('link')).toHaveAttribute('href', `/en/formulas/${canonical}`);
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', formula);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (formula === canonical) {
        await expect(page.getByRole('slider')).toHaveCount(0);
        await expect(page.locator('#julia-mode')).toHaveCount(0);
      }
    });
  }

  for (const width of [320, 390]) {
    test(`wraps the longest published label with an accessible link at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/en/explore?fm=quarticPerpendicularMandelbrot&iter=24');
      const name = page.getByTestId('published-formula-current');
      await expect(name).toHaveText('classic-quarticPerpendicularMandelbrot', { timeout: 45_000 });
      const link = name.locator('..').getByRole('link');
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/en/formulas/d747aff8-e49f-5875-a85f-89d4a1d25846');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await name.locator('..').screenshot({ path: testInfo.outputPath('formula-identity.png') });
    });
  }
});
