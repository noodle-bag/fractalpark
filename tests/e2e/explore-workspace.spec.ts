import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SUPPORTED_LOCALES } from '../../src/i18n/supported-locales';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort();
    else if (url.pathname === '/api/creation/auth/session') {
      await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } });
    } else if (url.pathname.startsWith('/api/creation/')) {
      await route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
    } else if (url.pathname.startsWith('/_vercel/')) await route.fulfill({ status: 204 });
    else await route.continue();
  });
});

async function ready(page: Page) {
  await readyCanvas(page);
}

async function readyCanvas(page: Page) {
  const canvas = page.getByRole('main').getByTestId('fractal-canvas');
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
  const formulaId = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', formulaId!);
  await expect.poll(() => new URL(page.url()).searchParams.get('fm') ?? 'mandelbrot').toBe(formulaId);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
}

async function canvasSnapshot(page: Page) {
  return page.getByRole('main').getByTestId('fractal-canvas').evaluate(async element => {
    const canvas = element as HTMLCanvasElement;
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canvas.toDataURL())));
    return { rect: canvas.getBoundingClientRect().toJSON(), width: canvas.width, height: canvas.height, dpr: devicePixelRatio, imageHash: [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') };
  });
}

async function expectCanvasSizeSettled(page: Page) {
  await expect.poll(() => page.getByRole('main').getByTestId('fractal-canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return canvas.width === Math.round(rect.width * devicePixelRatio)
      && canvas.height === Math.round(rect.height * devicePixelRatio);
  }), { timeout: 30_000 }).toBe(true);
  await readyCanvas(page);
}

test('media export keeps a latest-only real preview and accessible composition controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/en/explore');
  await readyCanvas(page);
  const exportButton = page.getByRole('button', { name: 'Export Media', exact: true });
  await exportButton.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Render quality' }).selectOption('off');
  await expect(dialog.locator('[data-slot="scroll-area-scrollbar"]')).toBeVisible();
  const scrollViewport = dialog.locator('[data-slot="scroll-area-viewport"]');
  await expect.poll(() => scrollViewport.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await scrollViewport.evaluate(element => { element.scrollTop = 120; });
  await expect.poll(() => scrollViewport.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await scrollViewport.evaluate(element => { element.scrollTop = 0; });
  await expect(dialog.locator('input[type="color"]')).toHaveCount(0);
  const preview = dialog.getByTestId('media-export-preview');
  const image = preview.getByRole('img', { name: 'Rendered export preview' });
  await expect(image).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => image.evaluate(element => ({
    width: (element as HTMLImageElement).naturalWidth,
    height: (element as HTMLImageElement).naturalHeight,
  }))).toEqual({ width: 720, height: 405 });
  const previewBox = (await preview.boundingBox())!;
  const preDragUrl = await image.getAttribute('src');
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2 + 24);
  await expect.poll(() => image.getAttribute('src'), { timeout: 45_000 }).not.toBe(preDragUrl);
  await page.mouse.up();
  await expect.poll(async () => Number(await dialog.getByRole('spinbutton', { name: 'Vertical pan' }).inputValue())).toBeGreaterThan(0);
  const firstUrl = await image.getAttribute('src');
  const fill = dialog.getByRole('button', { name: 'Fill', exact: true });
  await fill.click();
  await expect(fill).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText(/Rendering latest preview…/)).toBeVisible();
  await expect(image).toHaveAttribute('src', firstUrl!);
  await expect.poll(() => image.getAttribute('src'), { timeout: 45_000 }).not.toBe(firstUrl);
  await dialog.getByRole('spinbutton', { name: 'Zoom' }).fill('2');
  await expect(dialog.getByRole('button', { name: 'Custom', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('media-export-summary')).toContainText('1920 × 1080');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(exportButton).toBeFocused();
  expect(errors).toEqual([]);
});

test('all locales keep the export preview, summary and actions reachable at 320px', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const locale of SUPPORTED_LOCALES) {
    await page.goto(`/${locale}/explore`);
    await ready(page);
    const exportButton = page.getByTestId('explore-artwork-bar').getByRole('button').nth(3);
    await exportButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('select').nth(2).selectOption('off');
    await expect(dialog.getByTestId('media-export-preview')).toBeVisible();
    const summary = dialog.getByTestId('media-export-summary');
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toBeVisible();
    expect((await summary.textContent())?.trim().length).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(exportButton).toBeFocused();
  }
});

test('animation speed snaps across pointer and keyboard input and restores from the URL', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/en/explore?spd=3');
  await ready(page);
  await page.getByRole('tab', { name: 'Animation', exact: true }).last().click();
  const slider = page.getByRole('slider', { name: 'Playback speed', exact: true });
  await expect(slider).toHaveValue('5');
  await expect(slider).toHaveAttribute('aria-valuetext', '3×');

  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.25×');
  await expect.poll(() => new URL(page.url()).searchParams.get('spd')).toBe('0.25');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.5×');

  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await expect(slider).toHaveValue('12');
  await expect(slider).toHaveAttribute('aria-valuetext', '10×');
  await expect.poll(() => new URL(page.url()).searchParams.get('spd')).toBe('10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await ready(page);
  await page.getByRole('tab', { name: 'Animation', exact: true }).last().click();
  await expect(page.getByRole('slider', { name: 'Playback speed', exact: true })).toHaveAttribute('aria-valuetext', '10×');
  expect(errors).toEqual([]);
});

test('Project download and import round-trip the animation speed without changing the media export entry', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/en/explore?spd=10');
  await ready(page);
  await page.getByRole('tab', { name: 'Animation', exact: true }).last().click();
  const slider = page.getByRole('slider', { name: 'Playback speed', exact: true });
  await expect(slider).toHaveAttribute('aria-valuetext', '10×');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Project', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.fractal\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const envelope = JSON.parse(await readFile(path!, 'utf8'));
  expect(envelope.document.animation.speed).toBe(10);

  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.25×');
  await page.locator('input[type="file"][accept*=".fractal.json"]').setInputFiles(path!);
  await expect(slider).toHaveAttribute('aria-valuetext', '10×');
  await expect(page.getByRole('button', { name: 'Export Media', exact: true })).toBeEnabled();
});

test('animation export workspace exposes approved profiles, summary and a real current-frame preview', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/explore');
  await ready(page);
  await page.getByRole('tab', { name: 'Animation', exact: true }).last().click();
  const addKeyframe = page.getByRole('button', { name: 'Add Keyframe', exact: true });
  await addKeyframe.click();
  await addKeyframe.click();

  await page.getByRole('button', { name: 'Export Media', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Animation', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Format' })).toHaveValue('mp4');
  await expect(dialog.getByRole('combobox', { name: 'Size' })).toHaveValue('landscape-hd');
  await expect(dialog.getByRole('combobox', { name: 'Frame rate' })).toHaveValue('60');
  await expect(dialog.getByRole('combobox', { name: 'Video quality' })).toHaveValue('high');
  await expect(dialog.getByTestId('media-export-animation-summary')).toContainText('1080 frames');
  const animationPreview = dialog.getByTestId('media-export-animation-preview');
  const animationImage = animationPreview.getByRole('img');
  await expect(animationImage).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole('combobox', { name: 'Size' }).selectOption('portrait-uhd');
  await expect(dialog.getByTestId('media-export-animation-summary')).toContainText('2160 × 3840');
  await expect.poll(async () => {
    const box = await animationPreview.boundingBox();
    return box ? box.width / box.height : 0;
  }).toBeCloseTo(2160 / 3840, 2);
  await expect(animationImage).toHaveCSS('object-fit', 'contain');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Export Media', exact: true })).toBeFocused();
});

for (const width of [1440, 1180]) {
  test(`Inspector toggling preserves the canvas, view and editing state at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/en/explore');
    await ready(page);
    const canvas = page.getByTestId('fractal-canvas');
    const inspector = page.getByTestId('explore-inspector');
    const original = await canvas.elementHandle();
    const before = await canvasSnapshot(page);
    const inspectorBefore = (await inspector.boundingBox())!;
    expect(before.rect.width).toBe(width - 532);
    expect(before.rect.x + before.rect.width / 2).toBe((width - 532) / 2);
    expect(inspectorBefore.x).toBe(width - 532);
    expect(inspectorBefore.width).toBe(532);
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-inspector-collapsed', 'false');
    const summary = await page.getByTestId('position-summary').textContent();
    const url = page.url();
    await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
    await expect(page.getByTestId('explore-artwork-bar')).not.toBeVisible();
    await expect(page.getByTestId('navbar-layout')).toHaveCount(0);
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-inspector-collapsed', 'true');
    await expectCanvasSizeSettled(page);
    const collapsed = await canvasSnapshot(page);
    expect(collapsed.rect.width).toBe(width);
    expect(collapsed.rect.x + collapsed.rect.width / 2).toBe(width / 2);
    expect(collapsed.dpr).toBe(before.dpr);
    expect(await page.getByTestId('position-summary').textContent()).toBe(summary);
    expect(page.url()).toBe(url);
    const restoreControls = page.getByTestId('explore-controls-restore');
    await expect(restoreControls).toBeVisible();
    if (width === 1440) await page.keyboard.press('Escape');
    else await restoreControls.click();
    await expect(page.getByTestId('navbar-layout')).toBeVisible();
    await expectCanvasSizeSettled(page);
    const after = await canvasSnapshot(page);
    const inspectorAfter = (await inspector.boundingBox())!;
    expect(after).toEqual(before);
    expect(inspectorAfter.x).toBe(width - 532);
    expect(inspectorAfter.width).toBe(532);
    expect(await original!.evaluate(element => element === document.querySelector('[data-testid="fractal-canvas"]'))).toBe(true);
    expect(await page.getByTestId('position-summary').textContent()).toBe(summary);
    expect(page.url()).toBe(url);
    const power = page.getByRole('spinbutton', { name: 'power', exact: true });
    const tabBounds = await page.getByRole('tab', { name: 'Formula', exact: true }).boundingBox();
    await power.fill('3');
    await power.press('Enter');
    await ready(page);
    expect(await page.getByRole('tab', { name: 'Formula', exact: true }).boundingBox()).toEqual(tabBounds);
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('explore-artwork-bar')).toBeVisible();
    await page.getByRole('button', { name: 'Reset Artwork', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Render', exact: true }).click();
    await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
    await page.getByRole('button', { name: 'Show controls', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Render', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Formula', exact: true }).click();
    await expect(power).toHaveValue('3');
    await page.screenshot({ path: testInfo.outputPath('desktop-inspector.png') });
    expect(errors).toEqual([]);
  });
}

test('all locales show five desktop Tabs together without horizontal scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  for (const locale of SUPPORTED_LOCALES) {
    await page.goto(`/${locale}/explore`);
    await ready(page);
    const list = page.getByRole('tablist').first();
    const tabs = list.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    for (const width of [1024, 1180, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const listRect = (await list.boundingBox())!;
      for (let index = 0; index < 5; index++) {
        const tab = tabs.nth(index);
        const rect = (await tab.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(listRect.x);
        expect(rect.x + rect.width).toBeLessThanOrEqual(listRect.x + listRect.width);
        expect(rect.y).toBe((await tabs.first().boundingBox())!.y);
        expect(await tab.evaluate(element => getComputedStyle(element).fontSize)).toBe('13px');
      }
    }
    for (let i = 0; i < 5; i++) {
      const tab = tabs.nth(i);
      await tab.click();
      const text = await tab.evaluate(element => ({ whitespace: getComputedStyle(element).whiteSpace, width: element.scrollWidth, visible: element.clientWidth }));
      expect(text.whitespace).toBe('nowrap');
      expect(text.width).toBeLessThanOrEqual(text.visible);
      await expect(tab).toBeInViewport();
      await expect(page.getByRole('tabpanel').first()).toBeVisible();
      await expect(page.getByTestId('explore-artwork-bar')).toBeInViewport();
    }
    await tabs.first().focus();
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    expect(await list.evaluate(element => element.scrollLeft)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const width of [390, 320]) {
  test(`mobile split, square picker and child-first Back preserve the artwork at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/en/explore');
    await ready(page);
    const panel = page.getByTestId('explore-inspector');
    const canvas = page.getByTestId('fractal-canvas');
    const original = await canvas.elementHandle();
    await expect(panel).toHaveAttribute('data-layout', 'mobile');
    await expect(panel).not.toHaveAttribute('data-position');
    await expect(page.getByRole('tab', { name: 'Formula', exact: true })).toBeVisible();
    await expect(page.getByTestId('explore-artwork-bar')).toBeVisible();
    const compactActions = page.getByTestId('explore-artwork-bar').getByRole('button');
    for (const action of await compactActions.all()) {
      await expect(action).toHaveAttribute('data-variant', 'ghost');
    }
    await expect(page.locator('footer')).toHaveCount(0);
    expect(await canvas.evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px');
    const expandedCanvas = (await canvas.boundingBox())!;
    expect(expandedCanvas.height).toBeGreaterThanOrEqual(390);
    const url = page.url();
    await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
    await expect(panel).not.toBeVisible();
    await expect(page.getByTestId('navbar-layout')).toHaveCount(0);
    await expectCanvasSizeSettled(page);
    expect((await canvas.boundingBox())!.height).toBe(844);
    await page.getByRole('button', { name: 'Show controls', exact: true }).click();
    await expect(page.getByTestId('navbar-layout')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Formula', exact: true })).toBeVisible();
    expect(page.url()).toBe(url);
    await page.locator('#julia-mode').click();
    const plane = page.locator('[data-plane-picker="complex"]').first();
    await plane.scrollIntoViewIfNeeded();
    const rect = (await plane.boundingBox())!;
    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBe(160);
    const real = page.locator('#julia-re');
    const imaginary = page.locator('#julia-im');
    await real.fill('0.123456789');
    await real.press('Enter');
    await imaginary.fill('-0.3456789');
    await imaginary.press('Enter');
    await expect(real).toHaveValue('0.123456789');
    await expect(imaginary).toHaveValue('-0.3456789');
    const inputMetrics = await real.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      fontSize: parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(inputMetrics.height).toBeGreaterThanOrEqual(32);
    expect(inputMetrics.height).toBeLessThan(44);
    expect(inputMetrics.fontSize).toBe(16);
    await ready(page);
    // Parameter commits legitimately update the existing artwork URL contract.
    await expect.poll(() => new URL(page.url()).searchParams.get('julia')).toBe('1');
    await expect.poll(() => new URL(page.url()).searchParams.get('jre')).toBe('0.123457');
    await expect.poll(() => new URL(page.url()).searchParams.get('jim')).toBe('-0.345679');
    const editedUrl = page.url();
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => page.evaluate(() => history.state.fractalParkPanel?.modal)).toBe(true);
    await page.goBack();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeFocused();
    await expect(real).toHaveValue('0.123456789');
    await expect(imaginary).toHaveValue('-0.3456789');
    expect(page.url()).toBe(editedUrl);
    await real.fill('0.223456789');
    await real.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('jre')).toBe('0.223457');
    await expect(real).toHaveValue('0.223456789');
    expect(await original!.evaluate(element => element === document.querySelector('[data-testid="fractal-canvas"]'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('portrait-inspector.png') });
    expect(errors).toEqual([]);
  });
}

test.describe('mobile canvas control touch target', () => {
  test.use({ hasTouch: true });

  test('restores controls outside the canvas layer on touch pointerdown and click', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/explore');
    await ready(page);
    const canvas = page.getByTestId('fractal-canvas');
    const original = await canvas.elementHandle();
    await page.getByRole('button', { name: 'Hide controls', exact: true }).tap();
    await expect(page.getByTestId('explore-inspector')).not.toBeVisible();
    const showControls = page.getByRole('button', { name: 'Show controls', exact: true });
    const box = (await showControls.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await showControls.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const edgeTarget = document.elementFromPoint(rect.left + 2, rect.top + 2);
      return edgeTarget === element || element.contains(edgeTarget);
    })).toBe(true);
    expect(await showControls.evaluate(element => element.closest('.explore-canvas-stage'))).toBeNull();
    await showControls.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    });
    await expect(page.getByRole('tab', { name: 'Formula', exact: true })).toBeVisible();
    await expect(page.getByTestId('explore-artwork-bar')).toBeInViewport();
    const rootBox = (await page.getByTestId('explore-root').boundingBox())!;
    const restoredCanvasBox = (await canvas.boundingBox())!;
    const restoredInspectorBox = (await page.getByTestId('explore-inspector').boundingBox())!;
    expect(restoredCanvasBox.height).toBeLessThan(rootBox.height);
    expect(restoredInspectorBox.height).toBeGreaterThan(0);
    expect(await original!.evaluate(element => element === document.querySelector('[data-testid="fractal-canvas"]'))).toBe(true);

    await page.getByRole('button', { name: 'Hide controls', exact: true }).tap();
    await expect(page.getByTestId('navbar-layout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show controls', exact: true }).click();
    await expect(page.getByTestId('navbar-layout')).toBeVisible();
    await expect(page.getByTestId('explore-artwork-bar')).toBeVisible();
  });
});

test('short landscape uses the same vertical split and collapse interaction', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/en/explore');
  await ready(page);
  expect((await page.getByTestId('explore-inspector').boundingBox())!.width).toBe(844);
  expect((await page.getByTestId('fractal-canvas').boundingBox())!.width).toBe(844);
  await expect(page.getByRole('tab', { name: 'Formula', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await expect(page.getByTestId('explore-inspector')).not.toBeVisible();
  await expect(page.getByTestId('navbar-layout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await expect(page.getByTestId('navbar-layout')).toBeVisible();
  await expect(page.getByTestId('explore-artwork-bar')).toBeVisible();
});

test('200 percent root text scaling keeps long Tabs and artwork actions reachable', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto('/pt/explore');
  await ready(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`;
  });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
  const tabs = page.getByRole('tablist').first().getByRole('tab');
  for (let index = 0; index < 5; index++) {
    const tab = tabs.nth(index);
    await tab.click();
    await expect(tab).toBeInViewport();
    expect(await tab.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole('tabpanel').first()).toBeVisible();
    await expect(page.getByTestId('explore-artwork-bar')).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ready(page);
});

test('seven locales retain complete mobile actions and all Tabs in the split panel', async ({ page }) => {
  test.setTimeout(240_000);
  for (const locale of SUPPORTED_LOCALES) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${locale}/explore`);
      await ready(page);
      const panel = page.getByTestId('explore-inspector');
      await expect(panel).toHaveAttribute('data-layout', 'mobile');
      await expect(page.getByTestId('explore-artwork-bar')).toBeVisible();
      const actions = page.getByTestId('explore-artwork-bar').getByRole('button');
      await expect(actions).toHaveCount(5);
      for (const action of await actions.all()) {
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        const metrics = await action.evaluate(button => {
          const rect = button.getBoundingClientRect();
          const label = button.querySelector('span')!;
          const text = label.getBoundingClientRect();
          return { width: rect.width, height: rect.height, fits: text.left >= rect.left && text.right <= rect.right };
        });
        expect(metrics.width).toBeGreaterThanOrEqual(44);
        expect(metrics.height).toBeGreaterThanOrEqual(44);
        expect(metrics.fits).toBe(true);
      }
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      for (const tab of await tabs.all()) {
        await tab.click();
        await expect(tab).toBeInViewport();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        expect(await tab.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      await expect(page.locator('footer')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('returning to Explore does not strand Back on obsolete panel entries', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/about');
  await page.getByTestId('navbar-brand-group').getByRole('link').click();
  await ready(page);
  await page.goto('/en/gallery');
  await page.goBack();
  await ready(page);
  await expect(page.getByTestId('explore-inspector')).not.toHaveAttribute('data-position');
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/about$/);
});
