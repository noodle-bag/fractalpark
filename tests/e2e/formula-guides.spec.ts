import { expect, test } from '@playwright/test';

const publishedSlugs = [
  'mandelbrot',
  'lambda',
  'mandelbox',
  'perpendicular-celtic',
  'quartic-julia',
  'burning-ship',
  'airship',
  'newton-3',
  'newton-cosh',
  'magnet-type-1',
  'magnet-type-2',
  'multi-phoenix',
  'cosh-mandelbrot',
  'buffalo',
  'circle-inversion',
  'inverted-lambda',
  'mcmullen-2-3',
  'rational-map-1',
  'spider',
  'zaslavsky-map',
  'zubieta',
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
    await expect(page.locator('#overview p')).toHaveCount(3);
    await expect(
      page.getByRole('heading', { level: 2, name: 'History' })
    ).toBeVisible();
    await expect(page.locator('#history p')).toHaveCount(4);
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
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://www.fractalpark.com/images/formulas/og/mandelbrot.jpg'
    );

    await context.close();
  });

  test('publishes all 21 guide routes and keeps Chinese content localized', async ({
    page,
  }) => {
    for (const slug of publishedSlugs) {
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

  test('renders formula images at their native target aspect ratios', async ({
    page,
  }) => {
    await page.goto('/en/formulas/mandelbrot');

    const heroImage = page.getByTestId('formula-guide-hero-image');
    await expect(heroImage).toHaveAttribute('width', '1200');
    await expect(heroImage).toHaveAttribute('height', '750');
    await expect(heroImage).toHaveAttribute(
      'src',
      /images%2Fformulas%2Fguides%2Fmandelbrot\.jpg/
    );
    await expect
      .poll(async () => {
        const ratios = await heroImage.evaluate((image) => {
          if (!(image instanceof HTMLImageElement) || image.naturalHeight === 0) {
            return null;
          }

          return {
            naturalRatio: image.naturalWidth / image.naturalHeight,
            renderedRatio:
              image.getBoundingClientRect().width /
              image.getBoundingClientRect().height,
          };
        });

        return (
          ratios !== null &&
          Math.abs(ratios.naturalRatio - 1.6) < 0.005 &&
          Math.abs(ratios.renderedRatio - 1.6) < 0.005
        );
      })
      .toBe(true);

    const exploreHref = await page
      .getByRole('link', { name: 'Open in Explorer' })
      .getAttribute('href');
    expect(exploreHref).toBeTruthy();

    const thumbnailHref = exploreHref
      ?.replace('/explore?', '/thumbnail?')
      .concat('&renderWidth=1200&renderHeight=750');
    await page.goto(thumbnailHref!);

    const canvas = page.getByTestId('fractal-canvas');
    await expect
      .poll(() =>
        canvas.evaluate((element) => ({
          bitmapHeight: element.height,
          bitmapWidth: element.width,
          renderedHeight: element.clientHeight,
          renderedWidth: element.clientWidth,
        }))
      )
      .toEqual({
        bitmapHeight: 750,
        bitmapWidth: 1200,
        renderedHeight: 750,
        renderedWidth: 1200,
      });
  });

  test('does not create a thin page for a non-guide formula', async ({ request }) => {
    const response = await request.get('/en/formulas/tricorn');

    expect(response.status()).toBe(404);
  });

  test('keeps the guide layout within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/formulas/mcmullen-2-3');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
