import { expect, test, type Page } from '@playwright/test';
import { HTML_LANG, SUPPORTED_LOCALES } from '../../src/i18n/supported-locales';

const FATSO = 'fd4db987-1bd3-5ab0-983f-9a9bb01d0304';
const surfaces = [
  'explore', 'gallery', 'gallery?view=community', 'gallery?view=mine',
  'formulas/directory?q=fatso', `formulas/${FATSO}`,
  'formulas/frm', 'about', 'privacy', 'drift',
];

async function resizeBeforeNavigation(page: Page, width: number, height: number) {
  const panel = page.getByTestId('explore-inspector');
  if (await panel.count()) {
    await expect.poll(() => page.evaluate(() => !history.state?.fractalParkPanel?.modal)).toBe(true);
  }
  await page.setViewportSize({ width, height });
  if (await panel.count() && (width >= 1024 || (width >= 640 && height <= 480))) {
    // Responsive portrait-to-sidebar migration traverses native UI history.
    // Finish that traversal before requesting a different document navigation.
    await expect(panel).toHaveAttribute('data-position', 'peek');
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // Expected fixture statuses and blocked analytics can log network errors.
    // Unexpected resource statuses are captured separately below.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith('/api/creation/')) {
      errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });
  return errors;
}

test.beforeEach(async ({ context }) => {
  // Keep visual verification anonymous and isolated from analytics/cloud writes.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      await route.abort();
    } else if (url.pathname === '/api/creation/auth/session') {
      await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } });
    } else if (url.pathname === '/api/creation/community') {
      await route.fulfill({ json: { items: [], nextCursor: null } });
    } else if (url.pathname.startsWith('/api/creation/')) {
      await route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
    } else if (url.pathname.startsWith('/_vercel/')) {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
});

async function checkDocument(page: Page, locale: typeof SUPPORTED_LOCALES[number]) {
  await expect(page.locator('html')).toHaveAttribute('lang', HTML_LANG[locale]);
  await expect(page.getByTestId('navbar-layout')).toBeVisible();
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  if (new URL(page.url()).pathname.endsWith('/explore')) {
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 30_000 });
    const formulaId = await page.getByTestId('explore-root').getAttribute('data-formula-id');
    await expect.poll(() => new URL(page.url()).searchParams.get('fm')).toBe(formulaId);
  }
  const metrics = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    loadedGeist: [...document.fonts].some(font => /geist/i.test(font.family) && font.status === 'loaded'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(metrics.family).toMatch(/geist/i);
  expect(metrics.loadedGeist).toBe(true);
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  const brand = page.getByTestId('navbar-brand-group').getByRole('link');
  const actions = page.getByTestId(metrics.viewport < 1024 ? 'navbar-mobile-actions' : 'navbar-desktop-actions');
  const brandBounds = await brand.boundingBox();
  const actionBounds = await actions.boundingBox();
  expect(brandBounds!.width).toBeGreaterThan(0);
  expect(brandBounds!.x + brandBounds!.width).toBeLessThanOrEqual(actionBounds!.x + 0.5);
}

for (const width of [1440, 390]) {
  test(`shared fonts and controls propagate without page overflow at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const errors = collectErrors(page);
    for (const surface of surfaces) {
      await page.goto(`/en/${surface}`);
      await checkDocument(page, 'en');
      if (surface === 'gallery') {
        const card = page.locator('a[href*="/gallery/"]').filter({ has: page.locator('h2') }).first();
        await expect(card).toBeVisible();
        const image = card.locator('img');
        if (await image.count()) {
          await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
          await image.evaluate(element => (element as HTMLImageElement).decode());
        }
        const frame = card.locator('[class*="aspect-"]').first();
        if (await frame.count()) {
          const bounds = await frame.boundingBox();
          expect(bounds!.width / bounds!.height).toBeCloseTo(8 / 5, 1);
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`${surface.split(/[/?]/).join('-')}.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test('seven locales retain complete controls and keyboard selection at narrow widths', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  for (const locale of SUPPORTED_LOCALES) {
    for (const width of [320, 1180]) {
      await resizeBeforeNavigation(page, width, 900);
      await page.goto(`/${locale}/explore`);
      if (width < 1024) await page.locator('.explore-inspector-header button').first().click();
      await checkDocument(page, locale);
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      await expect(tabs).toHaveCount(5);
      for (let index = 0; index < 5; index += 1) {
        await tabs.nth(index).click();
        await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await tabs.first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.nth(1)).toBeFocused();
    }
  }
  expect(errors).toEqual([]);
});

test('mobile sign-in inputs keep readable sizing, precise drafts and modal focus', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/gallery?view=mine');
  await page.getByRole('button', { name: /sign in/i }).last().click();
  const dialog = page.getByRole('dialog');
  const input = dialog.locator('input[type=email]');
  await expect(input).toBeVisible();
  await input.fill('draft@example.test');
  await expect(input).toHaveValue('draft@example.test');
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const metrics = await input.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    fontSize: parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('precise editing, Select choices and reset confirmation retain their behavior', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const width of [390, 1440]) {
    await resizeBeforeNavigation(page, width, 900);
    await page.goto('/en/explore');
    if (width < 1024) await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
    const power = page.getByRole('spinbutton', { name: 'power', exact: true });
    await expect(power).toHaveValue('2', { timeout: 30_000 });
    await power.fill('3');
    await power.press('Enter');
    await expect(power).toHaveValue('3');
    await page.getByRole('tab', { name: 'Render', exact: true }).click();
    await page.locator('#lighting-toggle').click();
    const mode = page.getByRole('combobox');
    await mode.click();
    await page.getByRole('option', { name: 'Distance Estimate', exact: true }).click();
    await expect(mode).toContainText('Distance Estimate');
    await expect(page.locator('#light-azimuth')).toHaveCount(0);
    await mode.click();
    await page.getByRole('option', { name: /Normal Map/i }).click();
    await expect(page.locator('#light-azimuth')).toBeVisible();
    await page.getByRole('tab', { name: 'Formula', exact: true }).click();
    await expect(power).toHaveValue('3');
    await page.getByRole('button', { name: 'Reset Artwork', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(power).toHaveValue('3');
  }
  expect(errors).toEqual([]);
});

test('short landscape and reduced-height dialogs retain reachable controls and drafts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/en/about');
  await checkDocument(page, 'en');
  await page.getByRole('button', { name: /sign in/i }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.locator('input[type=email]');
  await input.fill('draft@example.test');
  // Reduced viewport is a pressure test, not a real-device keyboard certificate.
  await page.setViewportSize({ width: 390, height: 360 });
  await expect(input).toHaveValue('draft@example.test');
  const submit = dialog.getByRole('button', { name: /send code/i });
  await expect(submit).toBeInViewport();
  await expect(input).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});
