import { expect, test } from '@playwright/test';
import { DEFAULT_FRACTAL_DOCUMENT } from '../../src/engine/document';
import { SUPPORTED_LOCALES } from '../../src/i18n/supported-locales';

const publicationId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const publication = {
  id: publicationId, title: 'Published Mosaic', description: null,
  authorDisplayName: 'Creator', license: 'CC-BY-4.0', licenseScope: 'artwork_image',
  thumbnailStatus: 'pending', remixSource: null, status: 'published',
  publishedAt: '2026-09-14T00:00:00Z', withdrawnAt: null,
};
const draft = {
  id: draftId, title: 'Draft Mosaic', revision: 3, configBytes: 100,
  thumbnailBytes: 0, hasThumbnail: false, remixSource: null,
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
};
const envelope = { envelopeVersion: 1, document: DEFAULT_FRACTAL_DOCUMENT };

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort();
    else if (route.request().method() !== 'GET' && url.pathname.startsWith('/api/creation/')) await route.fulfill({ status: 503 });
    else if (url.pathname === '/api/creation/auth/session') await route.fulfill({ json: { user: { id: 'fixture-user' } } });
    else if (url.pathname === '/api/creation/profile') await route.fulfill({ json: { displayName: 'Creator', backupEmailMode: 'off' } });
    else if (url.pathname === '/api/creation/community') await route.fulfill({ json: { items: [publication], nextCursor: 'next-page' } });
    else if (url.pathname === '/api/creation/publications') await route.fulfill({ json: { publications: [publication] } });
    else if (url.pathname === `/api/creation/publications/${publicationId}`) await route.fulfill({ json: { ...publication, envelope } });
    else if (url.pathname === '/api/creation/drafts') await route.fulfill({ json: { drafts: [draft] } });
    else if (url.pathname === `/api/creation/drafts/${draftId}`) await route.fulfill({ json: { draft: { ...draft, envelope } } });
    else if (url.pathname.startsWith('/api/creation/')) await route.fulfill({ status: 503 });
    else if (url.pathname.startsWith('/_vercel/')) await route.fulfill({ status: 204 });
    else await route.continue();
  });
});

test('seven locales keep Gallery captions, routes and mobile actions consistent', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 320, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const locale of SUPPORTED_LOCALES) {
    for (const view of ['collection', 'community', 'mine']) {
      await page.goto(`/${locale}/gallery${view === 'collection' ? '' : `?view=${view}`}`);
      await page.evaluate(() => document.fonts.ready);
      const title = view === 'collection'
        ? page.locator('article h2').first()
        : page.getByText(view === 'community' ? 'Published Mosaic' : 'Draft Mosaic', { exact: true }).first();
      await expect(title).toBeVisible();
      expect(await title.evaluate(element => getComputedStyle(element).fontSize)).toBe('14px');
      const views = page.locator('main header nav a');
      await expect(views).toHaveCount(3);
      for (const link of await views.all()) {
        const box = (await link.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
      }
      if (view === 'community') {
        await expect(page.getByRole('link', { name: /Published Mosaic/ })).toHaveAttribute('href', `/${locale}/gallery/community/${publicationId}`);
      }
      if (view !== 'collection') {
        const preview = page.getByTestId('artwork-envelope-preview').first();
        await expect(preview).toHaveAttribute('data-preview-state', 'ready', { timeout: 30_000 });
        const frame = (await preview.locator('..').boundingBox())!;
        expect(frame.width / frame.height).toBeCloseTo(8 / 5, 1);
        for (const button of await page.locator('main button').all()) {
          if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
  }
  expect(errors).toEqual([]);
});

test('seven locales keep full Transform labels and mobile navigation targets', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const locale of SUPPORTED_LOCALES) {
    await page.goto(`/${locale}/explore`);
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 30_000 });
    await page.getByRole('tab').nth(2).click();
    const choices = page.getByRole('tabpanel').getByRole('button', { pressed: false }).or(page.getByRole('tabpanel').getByRole('button', { pressed: true }));
    await expect(choices).toHaveCount(7);
    for (const button of await choices.all()) {
      await button.scrollIntoViewIfNeeded();
      const metrics = await button.evaluate(element => {
        const label = element.lastElementChild as HTMLElement;
        return { height: element.getBoundingClientRect().height, font: getComputedStyle(label).fontSize, width: label.scrollWidth, visibleWidth: label.clientWidth, clamp: getComputedStyle(label).webkitLineClamp };
      });
      expect(metrics.height).toBeGreaterThanOrEqual(44);
      expect(metrics.font).toBe('13px');
      expect(metrics.width).toBeLessThanOrEqual(metrics.visibleWidth);
      expect(metrics.clamp).toBe('none');
    }
    await page.locator('[data-testid="navbar-mobile-actions"] button').last().click();
    const links = page.getByRole('dialog').getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
