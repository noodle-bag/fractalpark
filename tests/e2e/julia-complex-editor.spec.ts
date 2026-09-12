import { expect, test } from '@playwright/test';

test.describe('shared Julia complex editor', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ hasTouch: true });

  for (const width of [320, 390]) {
    test(`supports touch, drafts, soft windows and restoration at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/en/explore?fm=mandelbrot&julia=1&jre=3.456789&jim=-4.56789&iter=24');
      const real = page.locator('#julia-re');
      const imaginary = page.locator('#julia-im');
      const plane = page.getByRole('group', { name: 'Julia Parameter (c) Parameter plane' });
      await expect(real).toHaveValue('3.456789', { timeout: 45_000 });
      for (const name of ['Narrow', 'Widen', 'Show current value']) {
        await plane.locator('..').getByRole('button', { name, exact: true }).click();
      }
      await expect(real).toHaveValue('3.456789');
      await expect(imaginary).toHaveValue('-4.56789');
      await real.fill('1e-');
      await real.press('Enter');
      await expect(real).toHaveValue('3.456789');
      await expect(real).toHaveAttribute('aria-invalid', 'true');
      await page.getByRole('button', { name: 'Julia Parameter (c) Reset to zero' }).click();
      await expect(real).toHaveValue('0');
      await expect(imaginary).toHaveValue('0');
      await plane.locator('..').getByRole('button', { name: 'Show current value', exact: true }).click();
      await plane.locator('svg').scrollIntoViewIfNeeded();
      const box = await plane.locator('svg').boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('complex-plane-not-visible');
      // Pointer mapping uses the SVG border box, while locator-relative tap
      // positions use its padding box. Match the renderer's coordinate frame.
      await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height / 2);
      await expect(real).toHaveValue('1');
      await expect(imaginary).toHaveValue('0');
      await plane.focus();
      await plane.press('ArrowRight');
      await expect(real).toHaveValue('1.01');
      await real.fill('3.4567890123');
      await real.press('Enter');
      await expect(real).toHaveValue('3.4567890123');
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Project', exact: true }).click();
      const download = await downloadEvent;
      const chunks: Buffer[] = [];
      for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
      expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).document.formula.juliaC).toEqual([3.4567890123, 0]);
      // The existing Julia URL codec uses six decimal places; the editor and
      // portable Document preserve the full value without changing that codec.
      await expect.poll(() => new URL(page.url()).searchParams.get('jre')).toBe('3.456789');
      await page.reload();
      await expect(real).toHaveValue('3.456789', { timeout: 45_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
