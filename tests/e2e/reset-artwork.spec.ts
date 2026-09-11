import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const id = '00e14aa8-b766-54ea-a359-3f5d20d329b7';

test('failed Reset keeps the artwork and can be retried', async ({ page }) => {
  await page.goto('/en/explore?fm=phoenix&julia=1&jre=-0.62&jim=0.41');
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
  const definition = '**/definitions/e4d2259a5dd3fe7b3af646514a4313e83efcc80e887e04c07b7469bb27a66b90.frm';
  await page.route(definition, route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: 'Reset Artwork' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('This formula could not be loaded. Your current formula was kept.')).toBeVisible();
  await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', 'phoenix');
  await expect(page.locator('#julia-mode')).toBeChecked();
  await page.unroute(definition);
  await page.getByRole('button', { name: 'Reset Artwork' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', id);
});

for (const width of [390, 1000]) {
  test(`Reset loads adjustable Mandelbrot and preserves edited power on reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/en/explore?fm=phoenix&julia=1&jre=-0.62&jim=0.41&oc=st');
    const canvas = page.getByTestId('fractal-canvas');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45000 });
    await page.getByRole('button', { name: 'Reset Artwork' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', id);
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
    await page.getByRole('button', { name: 'Reset Artwork' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(power).toHaveValue('2');
    await expect.poll(pixels).toBe(before);
  });
}
