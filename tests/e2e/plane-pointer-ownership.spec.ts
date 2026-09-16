import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort();
    else if (url.pathname === '/api/creation/auth/session') await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } });
    else if (url.pathname.startsWith('/api/creation/')) await route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
    else if (url.pathname.startsWith('/_vercel/')) await route.fulfill({ status: 204 });
    else await route.continue();
  });
});

async function openPlane(page: Page, kind: string) {
  await page.goto(kind === 'parameter' ? '/en/explore?fm=9e7250d0-f815-521a-9cf6-6c4d68598b2c' : '/en/explore');
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
  let plane: Locator;
  if (kind === 'julia') {
    await page.locator('#julia-mode').click();
    plane = page.locator('[data-plane-picker="complex"]').first();
  } else if (kind === 'parameter') {
    plane = page.getByRole('group', { name: 'offset Parameter plane' }).locator('svg');
  } else {
    await page.getByRole('tab', { name: 'Transform', exact: true }).click();
    await page.getByRole('button', { name: kind, exact: true }).click();
    plane = page.locator('[data-plane-picker="transform"]');
  }
  await plane.scrollIntoViewIfNeeded();
  await plane.evaluate(element => {
    element.addEventListener('pointerdown', event => {
      element.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId));
    });
  });
  return plane;
}

async function marker(plane: Locator) {
  return plane.locator('circle.fill-primary').evaluate(element => [element.getAttribute('cx'), element.getAttribute('cy')]);
}

async function expectMarker(plane: Locator, x: number, y: number) {
  const size = await plane.evaluate(element => (element as SVGSVGElement).viewBox.baseVal.width);
  await expect.poll(async () => {
    const point = await marker(plane);
    return Math.max(Math.abs(Number(point[0]) / size - x), Math.abs(Number(point[1]) / size - y));
  }).toBeLessThan(0.02);
}

for (const kind of ['julia', 'parameter', 'Inversion', 'Kaleidoscope']) {
  test(`${kind} retains its value after native capture loss and supports subsequent dragging`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const plane = await openPlane(page, kind);
    const box = (await plane.boundingBox())!;
    const at = (x: number, y: number) => page.mouse.move(box.x + box.width * x, box.y + box.height * y);
    await at(0.25, 0.25);
    // Allow the hover indicator to mount before pressing it.
    await expect(plane.locator('circle.fill-muted-foreground')).toBeVisible();
    await page.mouse.down();
    await expect.poll(() => plane.evaluate(element => element.hasPointerCapture(Number(element.getAttribute('data-test-pointer'))))).toBe(true);
    // Process pending capture before explicitly releasing it; otherwise the
    // browser need not dispatch lostpointercapture for a pending override.
    await at(0.3, 0.25);
    await expectMarker(plane, 0.3, 0.25);
    const retained = await marker(plane);
    await plane.evaluate(element => element.releasePointerCapture(Number(element.getAttribute('data-test-pointer'))));
    await page.mouse.move(5, 100);
    await page.mouse.up();
    await at(0.75, 0.75);
    expect(await marker(plane)).toEqual(retained);
    await page.mouse.down();
    await at(0.5, 0.5);
    await at(-0.1, 0.5);
    await at(0.75, 0.75);
    await page.mouse.up();
    await expectMarker(plane, 0.75, 0.75);
    const final = await marker(plane);
    expect(final).not.toEqual(retained);
    await at(0.25, 0.25);
    expect(await marker(plane)).toEqual(final);
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
    expect(errors).toEqual([]);
  });
}

for (const kind of ['julia', 'Inversion']) {
  test(`${kind} ignores a second native touch and clears cancelled gestures`, async ({ page }) => {
    test.setTimeout(90_000);
    const plane = await openPlane(page, kind);
    const box = (await plane.boundingBox())!;
    const first = { id: 1, x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };
    const second = { id: 2, x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await expectMarker(plane, 0.25, 0.25);
    const initial = await marker(plane);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
    expect(await marker(plane)).toEqual(initial);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 }] });
    await expectMarker(plane, 0.5, 0.5);
    const moved = await marker(plane);
    expect(moved).not.toEqual(initial);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.mouse.move(second.x, second.y);
    expect(await marker(plane)).toEqual(moved);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [second] });
    await expectMarker(plane, 0.75, 0.75);
    expect(await marker(plane)).not.toEqual(moved);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
  });
}
