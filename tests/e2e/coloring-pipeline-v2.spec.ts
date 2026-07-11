import { expect, test } from '@playwright/test';

async function brightestCanvasPixel(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="fractal-canvas"]').evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const probe = document.createElement('canvas');
    probe.width = source.width;
    probe.height = source.height;
    const context = probe.getContext('2d');
    if (!context || source.width === 0 || source.height === 0) return 0;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let brightest = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      brightest = Math.max(brightest, pixels[index], pixels[index + 1], pixels[index + 2]);
    }
    return brightest;
  });
}

test('Modern Smooth keeps the fractal canvas rendering', async ({ page }) => {
  await page.goto('/en/explore');
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: /coloring/i }).click();
  await page.getByRole('button', { name: 'Modern Smooth' }).click();
  await expect(page.getByText('Finish', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filmic' })).toBeVisible();
  await page.getByRole('button', { name: 'Layered Orbit' }).click();

  await expect.poll(() => brightestCanvasPixel(page)).toBeGreaterThan(0);
});

test('restores Layered Orbit detail state from the URL', async ({ page }) => {
  await page.goto('/en/explore?sty=layeredOrbit&cs=soft%7C0%7C1%7C1%7C0%7C0%7C0%7C1%7C2.5%7C1.4%7C0.2&otx=0.25&oty=-0.15');
  await page.getByRole('tab', { name: /coloring/i }).click();
  await expect(page.locator('#detail-point-x')).toHaveAttribute('data-slot', 'slider');
  await expect(page.locator('#detail-scale')).toBeVisible();
  await expect(page).toHaveURL(/sty=layeredOrbit/);
  await expect.poll(() => brightestCanvasPixel(page), { timeout: 15000 }).toBeGreaterThan(0);
});

test('shows Contour fallback without mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/explore?fm=bs&sty=contourField&cs=soft%7C0%7C1%7C1%7C0%7C0%7C0%7C1%7C1%7C1%7C0.5');
  await page.getByRole('tab', { name: /coloring/i }).click();
  await expect(page.getByText('Smooth detail fallback')).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBe(false);
});
