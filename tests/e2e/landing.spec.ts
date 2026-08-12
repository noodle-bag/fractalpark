import { expect, test } from '@playwright/test';

/**
 * Explore landing contract (Slice 2.1):
 * - `/`, `/en`, `/zh` migrate to the canonical Explore landing via a single
 *   explicit HTTP 301 with the query string preserved;
 * - the landing owns product metadata, the shared SoftwareApplication
 *   JSON-LD, a localized `<html lang>`, a static poster, and visible SSR
 *   product content that stays readable without JavaScript;
 * - sitemap/robots/llms expose only canonical indexable URLs on the www host.
 */

test.describe('Legacy entry redirects', () => {
  const resolveLocation = (headers: Record<string, string>, base: string) =>
    // Location may be relative ("/en/explore") or absolute — both are valid.
    new URL(headers['location'], base);

  test('/ 301s to the default-locale Explore landing', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    const location = resolveLocation(response.headers(), baseURL!);
    expect(location.pathname).toBe('/en/explore');
  });

  test('/en and /zh 301 to their own locale Explore landing', async ({
    request,
    baseURL,
  }) => {
    const en = await request.get('/en', { maxRedirects: 0 });
    expect(en.status()).toBe(301);
    expect(resolveLocation(en.headers(), baseURL!).pathname).toBe('/en/explore');

    const zh = await request.get('/zh', { maxRedirects: 0 });
    expect(zh.status()).toBe(301);
    expect(resolveLocation(zh.headers(), baseURL!).pathname).toBe('/zh/explore');
  });

  test('the 301 preserves the query string item-for-item', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get('/?fm=newton3&z=12.5&julia=1', {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    const location = resolveLocation(response.headers(), baseURL!);
    expect(location.pathname).toBe('/en/explore');
    expect(location.searchParams.get('fm')).toBe('newton3');
    expect(location.searchParams.get('z')).toBe('12.5');
    expect(location.searchParams.get('julia')).toBe('1');

    const zhResponse = await request.get('/zh?fm=lambda&pal=2', {
      maxRedirects: 0,
    });
    const zhLocation = resolveLocation(zhResponse.headers(), baseURL!);
    expect(zhLocation.pathname).toBe('/zh/explore');
    expect(zhLocation.searchParams.get('fm')).toBe('lambda');
  });

  test('the migration is a single hop with no redirect loop', async ({
    request,
  }) => {
    const response = await request.get('/', { maxRedirects: 5 });
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe('/en/explore');
  });
});

test.describe('Explore landing document', () => {
  test('serves localized html lang and product metadata', async ({ page }) => {
    // Head metadata lives in the initial document; no need to wait for the
    // WebGL workspace to finish loading under software rendering.
    test.setTimeout(90000);
    await page.goto('/en/explore', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/en/explore'
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="zh"]')
    ).toHaveAttribute('href', 'https://www.fractalpark.com/zh/explore');
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]')
    ).toHaveAttribute('href', 'https://www.fractalpark.com/en/explore');

    await page.goto('/zh/explore', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.fractalpark.com/zh/explore'
    );
  });

  test('emits the shared SoftwareApplication JSON-LD with a stable @id', async ({
    page,
  }) => {
    await page.goto('/en/explore');
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const schemas = scripts.map((text) => JSON.parse(text));
    const software = schemas.find(
      (schema) => schema['@type'] === 'SoftwareApplication'
    );
    expect(software).toBeDefined();
    expect(software['@id']).toBe('https://www.fractalpark.com/#software');
    expect(software.featureList.join(' ')).toContain('94 GLSL fractal formulas');
    expect(software.featureList.join(' ')).toContain('9 coloring modes');
    expect(software.license).toBe('https://opensource.org/license/mit');
  });

  test('keeps the landing readable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/en/explore');

    // Exactly one visible H1 with the product statement.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText(
      'FractalPark: open-source fractal generator in your browser'
    );

    // Direct answer, capability summary, and descriptive links.
    await expect(
      page.getByRole('heading', { name: 'What is FractalPark?' })
    ).toBeVisible();
    await expect(page.getByText(/94 built-in formulas/)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Formula Atlas — every formula/ })
    ).toHaveAttribute('href', '/en/formulas');
    await expect(
      page.getByRole('link', { name: /FRM Guide — write Fractint/ })
    ).toHaveAttribute('href', '/en/formulas/frm');
    await expect(
      page.getByRole('link', { name: /Drift — sit back/ })
    ).toHaveAttribute('href', '/en/drift');
    await expect(
      page.getByRole('link', { name: /About — project facts/ })
    ).toHaveAttribute('href', '/en/about');

    // Static poster with fixed dimensions and descriptive alt.
    const poster = page.getByRole('img', {
      name: 'Static preview of a Mandelbrot fractal rendered by FractalPark',
    });
    await expect(poster).toBeVisible();
    await expect(poster).toHaveAttribute('width', '1200');
    await expect(poster).toHaveAttribute('height', '750');
    await expect(poster).toHaveAttribute(
      'src',
      '/images/formulas/guides/mandelbrot.jpg'
    );

    await context.close();
  });

  test('keeps the Chinese landing localized without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/zh/explore');

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('分形公园');
    await expect(page.getByText(/内置 94 个公式/)).toBeVisible();
    await expect(page.getByText(/94 个公式、7 个家族/)).toBeVisible();

    await context.close();
  });
});

test.describe('Indexable surface files', () => {
  test('sitemap lists only canonical indexable URLs', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();

    expect(body).toContain('<loc>https://www.fractalpark.com/en/explore</loc>');
    expect(body).toContain('<loc>https://www.fractalpark.com/zh/explore</loc>');
    expect(body).toContain(
      '<loc>https://www.fractalpark.com/en/formulas/frm</loc>'
    );

    // No 301 redirect sources, no noindex Drift, no fabricated lastmod.
    expect(body).not.toContain('<loc>https://www.fractalpark.com/en</loc>');
    expect(body).not.toContain('<loc>https://www.fractalpark.com/zh</loc>');
    expect(body).not.toContain('/drift');
    expect(body).not.toContain('<lastmod>');
  });

  test('robots.txt allows crawlers and points at the sitemap', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://www.fractalpark.com/sitemap.xml');
  });

  test('llms.txt uses the canonical www host and current page map', async ({
    request,
  }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('https://www.fractalpark.com/en/explore');
    expect(body).toContain('noindex, follow');
    expect(body).not.toContain('https://fractalpark.com');
  });

  test('does not advertise HTTP Link alternates that resolve to 404', async ({
    request,
  }) => {
    // next-intl's middleware Link headers would point x-default at the
    // unprefixed path (/explore, /drift), which intentionally 404s.
    for (const path of ['/en/explore', '/en/drift', '/zh/explore']) {
      const response = await request.get(path);
      expect(response.headers()['link'] ?? '', path).not.toContain(
        'rel="alternate"'
      );
    }
  });
});
