import { expect, test } from '@playwright/test';

test('Modern Smooth keeps the fractal canvas rendering', async ({ page }) => {
  await page.goto('/en/explore');
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: /coloring/i }).click();
  await page.getByRole('button', { name: 'Modern Smooth' }).click();
  await expect(page.getByText('Finish', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filmic' })).toBeVisible();
  await page.getByRole('button', { name: 'Layered Orbit' }).click();

  await expect.poll(async () => canvas.evaluate((element) => {
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
  })).toBeGreaterThan(0);
});
