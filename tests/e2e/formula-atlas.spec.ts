import { expect, test } from '@playwright/test';

test.describe('Formula Atlas', () => {
  test('renders the complete English SSR directory and discovery links', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/en/formulas');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Formula Atlas' })
    ).toBeVisible();
    await expect(page.locator('[data-formula-id]')).toHaveCount(94);
    await expect(page.locator('[data-guide-formula-id]')).toHaveCount(21);
    await expect(
      page.locator(
        '[data-guide-formula-id="mandelbrot"] a[href="/en/formulas/mandelbrot"]'
      )
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-guide-formula-id="lambda"] a[href="/en/formulas/lambda"]'
      )
    ).toHaveCount(1);
    await expect(
      page.locator('[data-formula-id="tricorn"] a[href^="/en/explore?"]')
    ).toHaveCount(1);
    await expect(page.locator('section[id^="family-"]')).toHaveCount(7);
    await expect(
      page.getByRole('link', { name: 'Learn FRM' })
    ).toHaveAttribute('href', '/en/formulas/frm');
    await expect(
      page.getByRole('link', { name: 'Open Formula Editor' }).first()
    ).toHaveAttribute('href', '/en/formulas/editor');
    await expect(
      page.locator('footer a[href="/en/formulas"]')
    ).toContainText('Formula Atlas');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/en/formulas'
    );

    await context.close();
  });

  test('keeps Chinese routes localized and Formulas active on nested pages', async ({
    page,
  }) => {
    await page.goto('/zh/formulas/frm');

    const formulasLink = page.locator('header a[href="/zh/formulas"]').first();
    await expect(formulasLink).toContainText('公式');
    await expect(formulasLink).toHaveAttribute('aria-current', 'page');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Toggle menu' }).click();
    const mobileFormulasLink = page
      .locator('[role="dialog"] a[href="/zh/formulas"]')
      .first();
    await expect(mobileFormulasLink).toContainText('公式');
    await expect(mobileFormulasLink).toHaveAttribute('aria-current', 'page');
  });

  test('exposes Formula Atlas from the Explore landing', async ({ page }) => {
    await page.goto('/en/explore');

    // Navbar keeps a stable Formulas entry on the default landing.
    await expect(
      page.locator('header a[href="/en/formulas"]').first()
    ).toBeVisible();

    // The visible SSR product content links to the Formula Atlas.
    await expect(
      page.getByRole('link', {
        name: 'Formula Atlas — every formula with math, history, and live examples',
      })
    ).toHaveAttribute('href', '/en/formulas');

    // Footer keeps the Formula Atlas discovery entry.
    await expect(page.locator('footer a[href="/en/formulas"]')).toContainText(
      'Formula Atlas'
    );
  });
});
