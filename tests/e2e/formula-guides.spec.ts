import { expect, test } from '@playwright/test';

const validationSlugs = [
  'mandelbrot',
  'burning-ship',
  'newton-3',
  'mandelbox',
] as const;

test.describe('Formula guides', () => {
  test('renders the English Mandelbrot guide without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/en/formulas/mandelbrot');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mandelbrot Set' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Overview' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'The Mathematics' })
    ).toBeVisible();
    await expect(page.locator('[role="math"]')).toHaveCount(1);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Frequently Asked Questions',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Remix in Explorer' })
    ).toHaveAttribute('href', /^\/en\/explore\?/);
    await expect(
      page.getByRole('link', { name: 'View artwork' }).first()
    ).toHaveAttribute(
      'href',
      '/en/gallery/preset-mandelbrot-deep-escape'
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/en/formulas/mandelbrot'
    );
    await expect(page.locator('link[hreflang="zh"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/zh/formulas/mandelbrot'
    );

    await context.close();
  });

  test('publishes all four validation routes and keeps Chinese content localized', async ({
    page,
  }) => {
    for (const slug of validationSlugs) {
      const response = await page.goto(`/en/formulas/${slug}`);
      expect(response?.status(), slug).toBe(200);
    }

    await page.goto('/zh/formulas/burning-ship');
    await expect(
      page.getByRole('heading', { level: 1, name: '燃烧船' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: '数学原理' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '在探索器中再创作' })
    ).toHaveAttribute('href', /^\/zh\/explore\?/);
  });

  test('does not publish the remaining guide identities yet', async ({
    request,
  }) => {
    const response = await request.get('/en/formulas/lambda');

    expect(response.status()).toBe(404);
  });

  test('keeps the guide layout within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/formulas/mandelbox');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
