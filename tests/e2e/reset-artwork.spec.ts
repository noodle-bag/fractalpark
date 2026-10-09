import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const id = '00e14aa8-b766-54ea-a359-3f5d20d329b7';

test('Reset uses the bundled published default without requesting its old endpoint', async ({ page }) => {
  await page.goto('/en/explore?fm=phoenix&julia=1&jre=-0.62&jim=0.41');
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
  let defaultRequests = 0;
  await page.route('**/explore-default-formula.json', route => {
    defaultRequests += 1;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Reset Artwork' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('main').getByTestId('explore-root')).toHaveAttribute('data-formula-id', id);
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
  expect(defaultRequests).toBe(0);
});

for (const width of [390, 1000]) {
  test(`Reset loads adjustable Mandelbrot and preserves edited power on reload at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/en/explore?fm=phoenix&julia=1&jre=-0.62&jim=0.41&oc=st');
    const canvas = page.getByRole('main').getByTestId('fractal-canvas');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
    if (!await page.getByRole('button', { name: 'Reset Artwork' }).isVisible()) {
      await page.locator('.explore-artwork-disclosure > summary').click();
    }
    await page.getByRole('button', { name: 'Reset Artwork' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('main').getByTestId('explore-root')).toHaveAttribute('data-formula-id', id);
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
    await expect(page.locator('#julia-mode')).not.toBeChecked();
    const power = page.locator('#published-frmV1_power');
    await expect(power).toHaveValue('2');
    const pixels = async () => createHash('sha256').update(await canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL())).digest('hex');
    const before = await pixels();
    await power.fill('3');
    await power.press('Tab');
    await expect.poll(pixels).not.toBe(before);
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_power:3|0');
    await page.reload();
    await expect(power).toHaveValue('3');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
    if (!await page.getByRole('button', { name: 'Reset Artwork' }).isVisible()) {
      await page.locator('.explore-artwork-disclosure > summary').click();
    }
    await page.getByRole('button', { name: 'Reset Artwork' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(power).toHaveValue('2');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
    await expect.poll(pixels, { timeout: 15000 }).toBe(before);
  });
}
