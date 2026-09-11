import { createHash } from 'node:crypto';
import { expect, test, type Locator } from '@playwright/test';
import { ARTWORK_CONTENT_MANIFEST } from '../../src/content/artwork-manifest';

const artworks = [
  ['Cobalt Bastion', 'mandelbox-cobalt-bastion', 'mandelbox'],
  ['Gilded Plumes', 'cosh-mandelbrot-gilded-plumes', 'coshMandelb'],
  ['Penitent Mandala', ARTWORK_CONTENT_MANIFEST.find(row => row.presetId === 'preset-zaslavsky-penitent-mandala')!.slug, 'zaslavskyMap'],
];
const pixels = async (canvas: Locator) => createHash('sha256').update(
  await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()),
).digest('hex');

for (const width of [390, 1000]) {
  for (const [name, slug, formula] of artworks) {
    test(`${name} renders and animates across Gallery, detail and Explore at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 760 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/en/gallery');
      const card = page.locator(`a[href="/en/gallery/${slug}"]`).first();
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      const preview = card.locator('canvas');
      await expect(preview).toBeVisible({ timeout: 30_000 });
      const firstPreview = await pixels(preview);
      await expect.poll(() => pixels(preview), { timeout: 20_000 }).not.toBe(firstPreview);
      const renderedPreview = await pixels(preview);
      await expect.poll(() => pixels(preview), { timeout: 20_000 }).not.toBe(renderedPreview);
      await card.click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      const detail = page.locator('figure canvas');
      await expect(detail).toBeVisible({ timeout: 30_000 });
      await detail.scrollIntoViewIfNeeded();
      const firstDetail = await pixels(detail);
      await expect.poll(() => pixels(detail), { timeout: 20_000 }).not.toBe(firstDetail);
      const renderedDetail = await pixels(detail);
      await expect.poll(() => pixels(detail), { timeout: 20_000 }).not.toBe(renderedDetail);
      await detail.screenshot({ path: testInfo.outputPath('detail.png') });
      await page.getByRole('link', { name: 'Remix in Explorer' }).click();
      const explore = page.getByTestId('fractal-canvas');
      await expect(explore).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', formula);
      await expect(page.locator('#julia-mode')).toBeChecked();
      const initial = await pixels(explore);
      await page.reload();
      await expect(explore).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
      await expect.poll(() => pixels(explore)).toBe(initial);
      await explore.screenshot({ path: testInfo.outputPath('explore.png') });
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
