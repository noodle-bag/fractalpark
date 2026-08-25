import { expect, test } from '@playwright/test';

test.describe('Formula Atlas', () => {
  test('renders the published English Atlas overview and discovery links', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/en/formulas');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Formula Atlas' })
    ).toBeVisible();
    await expect(
      page.getByText(/534 published Standard Definitions/)
    ).toBeVisible();
    await expect(page.locator('header dl dd')).toHaveText(['534', '7', '21']);
    await expect(page.locator('[data-formula-id]')).toHaveCount(0);
    await expect(page.locator('[data-formula-category]')).toHaveCount(8);
    await expect(page.locator('[data-guide-formula-id]')).toHaveCount(21);
    await expect(
      page.locator(
        '[data-guide-formula-id="mandelbrot"] a[href="/en/formulas/00e14aa8-b766-54ea-a359-3f5d20d329b7"]'
      )
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-guide-formula-id="lambda"] a[href="/en/formulas/c1c898f3-c9a3-583d-9a0a-d09968ba0db3"]'
      )
    ).toHaveCount(1);
    await expect(
      page.locator('[data-formula-category="classic"]')
    ).toContainText('94');
    await expect(
      page.locator('[data-formula-category="root-finding"]')
    ).toContainText('14');
    await expect(
      page.locator('[data-formula-category="root-finding"]')
    ).toHaveAttribute('href', '/en/formulas/directory?category=root-finding');
    await expect(
      page.getByRole('link', { name: 'Understand FRM', exact: true })
    ).toHaveAttribute('href', '/en/formulas/frm');
    await expect(
      page.getByRole('link', { name: 'Open Formula Editor' }).first()
    ).toHaveAttribute('href', '/en/formulas/editor');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/en/formulas'
    );

    await context.close();
  });

  test('links every Standard directory identity to its canonical ID route', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/en/formulas/directory');

    const rows = page.locator('[data-formula-id]');
    await expect(rows).toHaveCount(534);
    await expect(
      rows
        .filter({ has: page.getByText('3damand01', { exact: true }) })
        .getByRole('link', { name: '3damand01' })
    ).toHaveAttribute(
      'href',
      '/en/formulas/1cd7a16f-0474-5b8f-a974-e122ea893769'
    );

    await page.goto('/en/formulas/directory?category=root-finding');
    await expect(page.locator('[data-formula-id]')).toHaveCount(14);

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
    await page.getByRole('button', { name: '菜单' }).click();
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

  });
});
