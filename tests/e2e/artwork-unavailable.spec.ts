import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTWORK_CONTENT_MANIFEST } from '../../src/content/artwork-manifest';

const slug = ARTWORK_CONTENT_MANIFEST.find(row => row.presetId === 'preset-magnet-julia-ember-reach')!.slug;

for (const locale of ['en', 'zh', 'es', 'fr', 'pt', 'ru', 'ko']) {
  test(`unsupported Julia artwork keeps its image and explains playback in ${locale}`, async ({ page }, testInfo) => {
    const messages = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'));
    const labels = messages.artworks.page.viewer;
    await page.setViewportSize({ width: locale === 'zh' ? 390 : 1000, height: 760 });
    await page.goto(`/${locale}/gallery/${slug}`);
    await expect(page.locator('figure [role="status"]')).toHaveText(labels.juliaUnavailable);
    await expect(page.locator('figure img')).toBeVisible();
    await expect(page.locator('figure canvas')).toHaveCount(0);
    await page.getByRole('button', { name: labels.viewFullscreen, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText(labels.juliaUnavailable);
    await expect(dialog.locator('img')).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: labels.pause, exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: labels.resume, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (locale === 'en' || locale === 'zh') await page.screenshot({ path: testInfo.outputPath('static-fullscreen.png') });
    await dialog.getByRole('button', { name: labels.minimize, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

for (const width of [390, 1000]) {
  test(`Gallery explains the static artwork before hover at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/en/gallery');
    const card = page.locator('article').filter({ has: page.locator(`a[href="/en/gallery/${slug}"]`) });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('status')).toContainText('does not support Julia animation');
    await expect(card.locator('img')).toBeVisible();
    await card.hover();
    await expect(card.locator('canvas')).toHaveCount(0);
  });
}

test('loading failure is distinct from unsupported Julia and preserves the saved image', async ({ page }) => {
  await page.route('**/definitions/b4677349cc60d66a5b7ad87655a89585d2bf83c7284ef949afe081e8eb294aac.frm', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/en/gallery/mandelbox-cobalt-bastion');
  await expect(page.locator('figure [role="status"]')).toHaveText('Animation could not be loaded. Showing the saved image.');
  await expect(page.locator('figure img')).toBeVisible();
  await expect(page.locator('figure canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'View fullscreen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status')).toContainText('could not be loaded');
  await expect(dialog.getByRole('button', { name: /pause|resume/i })).toHaveCount(0);
});
