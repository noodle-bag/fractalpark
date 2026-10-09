import { expect, test } from '@playwright/test';
import { DEFAULT_FRACTAL_DOCUMENT } from '../../src/engine/document';
import { SUPPORTED_LOCALES } from '../../src/i18n/supported-locales';

const CLASSIC_MANDELBROT = '00e14aa8-b766-54ea-a359-3f5d20d329b7';
const OTHER_MANDELBROT = 'd8ed1025-8ccf-5424-b161-df178a36a0fa';
const INDEX_PATH = '**/formula-library/v1/runtime/published/index.json';
const DEFAULT_PATH = '**/explore-default-formula.json';

test.describe('Explore entry default', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const width of [1280, 390]) {
      test(`${locale}: selects editable Classic Mandelbrot at ${width}px`, async ({ page }) => {
        test.setTimeout(90000);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/explore`);
        await expect(page.getByTestId('explore-root').last()).toHaveAttribute(
          'data-formula-id', CLASSIC_MANDELBROT, { timeout: 30000 }
        );
        await expect(page.getByRole('spinbutton', { name: 'power', exact: true })).toHaveValue('2');
        await expect(page).toHaveURL(new RegExp('fm=' + CLASSIC_MANDELBROT));
        const url = new URL(page.url());
        expect(url.searchParams.get('iter')).toBe('96');
        expect(Number(url.searchParams.get('cx'))).toBe(-0.5);
        expect(Number(url.searchParams.get('cy'))).toBe(0);
        expect(Number(url.searchParams.get('z'))).toBe(0.4);
        expect(Number(url.searchParams.get('rot') ?? '0')).toBe(0);
      });
    }
  }

  for (const [query, formula] of [
    ['fm=m&pow=3&z=2', 'mandelbrot'],
    ['z=2&oc=st', 'mandelbrot'],
    ['fm=' + OTHER_MANDELBROT + '&z=2', OTHER_MANDELBROT],
    ['draft=11111111-2222-3333-4444-555555555555', 'mandelbrot'],
  ]) {
    test('preserves explicit input: ' + query, async ({ page }) => {
      await page.goto('/en/explore?' + query);
      await expect(page.getByTestId('fractal-canvas')).toBeVisible();
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', formula);
      await expect(page.getByRole('spinbutton', { name: 'power', exact: true })).toHaveCount(0);
      if (query.includes('z=2')) {
        await expect.poll(() => Number(new URL(page.url()).searchParams.get('z'))).toBe(2);
      }
    });
  }

  test('power edits change the render and survive a reload', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.goto('/en/explore');
    const power = page.getByRole('spinbutton', { name: 'power', exact: true });
    await expect(power).toHaveValue('2', { timeout: 30000 });
    await expect(page).toHaveURL(new RegExp('fm=' + CLASSIC_MANDELBROT));
    const canvas = page.getByTestId('fractal-canvas');
    const before = await canvas.screenshot();
    await power.fill('3');
    await power.press('Enter');
    await expect(power).toHaveValue('3');
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_power');
    await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('classic-power-3.png'), fullPage: true });
    await page.reload();
    await expect(power).toHaveValue('3', { timeout: 30000 });
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', CLASSIC_MANDELBROT);
  });

  test('a delayed default cannot overwrite an imported document', async ({ page }) => {
    test.setTimeout(90000);
    let releaseDefault!: () => void;
    const defaultGate = new Promise<void>((resolve) => { releaseDefault = resolve; });
    let requested = false;
    await page.route(DEFAULT_PATH, async (route) => {
      requested = true;
      await defaultGate;
      await route.continue();
    });
    try {
      await page.goto('/en/explore', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByTestId('fractal-canvas')).toBeVisible();
      const imported = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
      imported.formula.formulaId = 'tricorn';
      imported.scene.bounds.zoom = 8;
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: /import project/i }).click();
      await (await chooserPromise).setFiles({
        name: 'saved.fractal.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ envelopeVersion: 1, document: imported })),
      });
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', 'tricorn');
      const defaultResponse = page.waitForResponse(/explore-default-formula.json/);
      releaseDefault();
      await defaultResponse;
      await expect(page).toHaveURL(/[?&]fm=tr(?:&|$)/);
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', 'tricorn');
      expect(Number(new URL(page.url()).searchParams.get('z'))).toBe(8);
    } finally {
      releaseDefault();
    }
  });

  test('default entry does not fetch the full formula index', async ({ page }) => {
    let indexRequests = 0;
    await page.route(INDEX_PATH, async (route) => {
      indexRequests += 1;
      await route.continue();
    });
    await page.goto('/en/explore');
    await expect(page.getByTestId('explore-root').last()).toHaveAttribute('data-formula-id', CLASSIC_MANDELBROT, { timeout: 30000 });
    const current = page.getByTestId('published-formula-current').last();
    await expect(current).toHaveText('classic-mandelbrot');
    await expect(current.locator('..').getByRole('link')).toHaveAttribute(
      'href', `/en/formulas/${CLASSIC_MANDELBROT}`,
    );
    expect(indexRequests).toBe(0);
  });

  test('failed default keeps the built-in canvas usable and offers retry', async ({ page }) => {
    let requests = 0;
    await page.route(DEFAULT_PATH, async (route) => {
      requests += 1;
      if (requests === 1) await route.fulfill({ status: 503 });
      else await route.continue();
    });
    await page.goto('/en/explore');
    await expect(page.getByTestId('fractal-canvas')).toBeVisible();
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', 'mandelbrot');
    await page.getByRole('alert').getByRole('button', { name: /retry/i }).click();
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', CLASSIC_MANDELBROT);
  });

  test('failed explicit Standard UUID does not silently become Mandelbrot', async ({ page }) => {
    await page.route(INDEX_PATH, (route) => route.fulfill({ status: 503 }));
    await page.goto(`/en/explore?fm=${OTHER_MANDELBROT}`);
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', OTHER_MANDELBROT);
    await expect(page.getByRole('status').getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(page).toHaveURL(new RegExp('fm=' + OTHER_MANDELBROT));
  });
});
