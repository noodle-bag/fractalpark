import { expect, test } from '@playwright/test';
import recordPreviewManifest from '../../public/formula-library/v1/record-previews/manifest.json';
import aliasManifest from '../../resources/formula-library/v1/legacy-formula-aliases.json';

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

function guideFormulaId(slug: (typeof publishedSlugs)[number]): string {
  const alias = aliasManifest.aliases.find(
    (entry) => entry.kind === 'guide-slug' && entry.value === slug
  );
  if (!alias) throw new Error(`Missing Guide alias: ${slug}`);
  return alias.formulaId;
}

function guidePath(locale: string, slug: (typeof publishedSlugs)[number]): string {
  return `/${locale}/formulas/${guideFormulaId(slug)}`;
}

function recordPreviewPath(formulaId: string): string {
  const row = recordPreviewManifest.rows.find((entry) => entry.formulaId === formulaId);
  if (!row) throw new Error(`Missing Record preview: ${formulaId}`);
  return `/formula-library/v1/record-previews/${row.file}`;
}

test.describe('Formula guides', () => {
  test('renders the English Mandelbrot guide without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto(guidePath('en', 'mandelbrot'));

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
      `https://www.fractalpark.com${guidePath('en', 'mandelbrot')}`
    );
    await expect(page.locator('link[hreflang="zh"]')).toHaveAttribute(
      'href',
      `https://www.fractalpark.com${guidePath('zh', 'mandelbrot')}`
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
      const response = await page.goto(guidePath('en', slug));
      expect(response?.status(), slug).toBe(200);
    }

    await page.goto(guidePath('zh', 'burning-ship'));
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
    await page.goto(guidePath('en', 'mandelbrot'));

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
      .first()
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

  test('permanently redirects all 21 legacy Guide slugs to canonical IDs', async ({
    request,
  }) => {
    for (const slug of publishedSlugs) {
      const response = await request.get(`/en/formulas/${slug}`, {
        maxRedirects: 0,
      });
      expect(response.status(), slug).toBe(308);
      expect(
        new Set(
          response
            .headers()
            .location.split(',')
            .map((value) => value.trim())
        ),
        slug
      ).toEqual(new Set([guidePath('en', slug)]));
    }

    const localized = await request.get('/zh/formulas/mandelbrot', {
      maxRedirects: 0,
    });
    expect(localized.status()).toBe(308);
    expect(
      new Set(
        localized
          .headers()
          .location.split(',')
          .map((value) => value.trim())
      )
    ).toEqual(new Set([guidePath('zh', 'mandelbrot')]));
  });

  test('serves the canonical long tail as noindex and rejects unknown IDs', async ({
    request,
  }) => {
    const response = await request.get(
      '/en/formulas/1cd7a16f-0474-5b8f-a974-e122ea893769'
    );

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(
      'name="robots" content="noindex, follow"'
    );

    const unknown = await request.get(
      '/en/formulas/00000000-0000-5000-8000-000000000000'
    );
    expect(unknown.status()).toBe(404);

    const uppercase = await request.get(
      `/en/formulas/${guideFormulaId('mandelbrot').toUpperCase()}`
    );
    expect(uppercase.status()).toBe(404);

    const unsupportedLocale = await request.get(
      `/de/formulas/${guideFormulaId('mandelbrot')}`
    );
    expect(unsupportedLocale.status()).toBe(404);
  });

  test('renders a published Record master and server action without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const formulaId = '1cd7a16f-0474-5b8f-a974-e122ea893769';
    await page.goto(`/en/formulas/${formulaId}`);

    await expect(page.getByTestId('formula-record')).toHaveAttribute(
      'data-formula-record-availability',
      'published'
    );
    const fallbackPreview = page.getByTestId('formula-record-no-js-fallback');
    await expect(fallbackPreview).toBeVisible();
    await expect(fallbackPreview).toHaveAttribute(
      'src',
      `/formula-library/v1/previews/${formulaId}.png`
    );
    const previewBox = await fallbackPreview.boundingBox();
    expect(previewBox).not.toBeNull();
    expect((previewBox?.width ?? 0) / (previewBox?.height ?? 1)).toBeCloseTo(
      8 / 5,
      1
    );
    await expect(page.getByRole('link', { name: 'Open in Explorer' })).toHaveAttribute(
      'href',
      `/en/explore?open=standard-formula&formula=${formulaId}`
    );
    await context.close();
  });

  test('renders held rights and reason facts with zero runnable actions', async ({
    page,
  }) => {
    const formulaId = '0e0fa64e-9005-52e3-b9aa-83e73b933dfe';
    await page.goto(`/en/formulas/${formulaId}`);

    await expect(page.getByTestId('formula-record')).toHaveAttribute(
      'data-formula-record-availability',
      'hold'
    );
    await expect(page.getByText('held-license-gpl-3.0-only')).toBeVisible();
    await expect(page.getByText('GPL-3.0-only', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in Explorer' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Remix anonymously' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View source' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download source' })).toHaveCount(0);
  });

  test('uses a strict Record master in place of the legacy diagnostic preview', async ({
    page,
  }) => {
    const formulaId = '06504747-8ee8-5c39-869b-8b3a992e8c24';
    await page.goto(`/en/formulas/${formulaId}`);

    await expect(page.getByTestId('formula-record')).toHaveAttribute(
      'data-formula-record-availability',
      'published'
    );
    const preview = page.getByTestId('formula-record').locator('img').first();
    const previewSrc = await preview.getAttribute('src');
    expect(previewSrc).not.toBeNull();
    const previewUrl = new URL(previewSrc!, 'http://localhost');
    expect(previewUrl.searchParams.get('url')).toBe(recordPreviewPath(formulaId));
    await expect(page.getByTestId('formula-record-diagnostic-preview')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open in Explorer' })).toHaveCount(1);
  });

  test('keeps the guide layout within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(guidePath('en', 'mcmullen-2-3'));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('rejects an ambiguous duplicate UUID handoff without selecting either target', async ({
    page,
  }) => {
    const formulaId = '1cd7a16f-0474-5b8f-a974-e122ea893769';
    const otherFormulaId = '00e14aa8-b766-54ea-a359-3f5d20d329b7';
    await page.goto(
      `/en/explore?open=standard-formula&formula=${formulaId}&formula=${otherFormulaId}`
    );

    await expect(page).toHaveURL('/en/explore', { timeout: 30_000 });
    await expect(page.getByTestId('explore-root')).not.toHaveAttribute(
      'data-formula-id',
      formulaId
    );
    await expect(page.getByTestId('explore-root')).not.toHaveAttribute(
      'data-formula-id',
      otherFormulaId
    );
  });

  test('opens a published Record in Explorer through a one-shot UUID handoff', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const formulaId = '1cd7a16f-0474-5b8f-a974-e122ea893769';
    await page.goto(
      `/en/explore?open=standard-formula&formula=${formulaId}`
    );

    await expect(page.getByTestId('explore-root')).toHaveAttribute(
      'data-formula-id',
      formulaId,
      { timeout: 30_000 }
    );
    await expect(page).toHaveURL('/en/explore', { timeout: 30_000 });
  });
});
