import { expect, test } from '@playwright/test';

test.describe('FRM Guide', () => {
  test('renders the complete English guide and shared examples', async ({
    page,
  }) => {
    await page.goto('/en/formulas/frm');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Understand FRM in FractalPark',
      })
    ).toBeVisible();
    await expect(
      page.getByText(/canonical FRM-like v1 Definitions power/)
    ).toBeVisible();
    await expect(
      page.getByText(/Classic-compatible Editor and import path/)
    ).toBeVisible();
    await expect(page.locator('main section > div > h2')).toHaveCount(9);
    await expect(page.getByRole('table')).toContainText('Supported');
    await expect(page.locator('.frm-code-block')).toHaveCount(3);
    await expect(page.locator('.frm-code-block').first()).toContainText(
      'z = z^2 + c'
    );
    await expect(page.getByText('starter-brot', { exact: true })).toBeVisible();
    await expect(page.getByText('parameter-drift', { exact: true })).toBeVisible();
    await expect(page.getByText('orbit-echo', { exact: true })).toBeVisible();

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const webPage = jsonLd
      .map((value) => JSON.parse(value))
      .find((value) => value['@type'] === 'WebPage');

    expect(webPage).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Understand FRM in FractalPark',
      url: 'https://www.fractalpark.com/en/formulas/frm',
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://www.fractalpark.com/en/explore',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Formulas',
            item: 'https://www.fractalpark.com/en/formulas',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Understand FRM in FractalPark',
            item: 'https://www.fractalpark.com/en/formulas/frm',
          },
        ],
      },
    });
  });

  test('keeps the Chinese learning content available without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/zh/formulas/frm');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '用 FRM 编写分形公式',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'FRM → AST → GLSL 流水线',
      })
    ).toBeVisible();
    await expect(page.locator('.frm-code-block')).toHaveCount(3);
    await expect(page.getByRole('link', { name: '打开 Explore' })).toHaveAttribute(
      'href',
      '/zh/explore'
    );

    await context.close();
  });
});
