import { expect, test } from '@playwright/test';

test.describe('formula runtime identity', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const formula of ['perpendicularCeltic', '627c38a8-8f4d-548f-a5a6-dd9f215adf60']) {
    test(`edits and restores Julia without changing ${formula}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`/en/explore?fm=${formula}&julia=1&jre=-0.7&jim=0.27&iter=60`);
      const canvas = page.getByTestId('fractal-canvas');
      await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
      await expect(page.locator('#julia-mode')).toBeChecked();
      const before = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
      await page.locator('#julia-re').fill('0.2');
      await page.locator('#julia-re').press('Tab');
      await expect.poll(() => new URL(page.url()).searchParams.get('jre')).toBe('0.200000');
      await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()), { timeout: 60_000 }).not.toBe(before);
      await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
      await page.reload();
      await expect.poll(async () => Number(await page.locator('#julia-re').inputValue())).toBeCloseTo(0.2, 6);
      await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', formula);
      await expect(page.locator('#julia-mode')).toBeChecked();
      expect(errors).toEqual([]);
    });
  }

  test('restores the reviewed q1024 Julia control and keeps unsupported formulas closed', async ({ page }) => {
    await page.goto('/en/explore?fm=280cd3e2-865b-5c78-90b7-39b2a36d7be0&julia=1&jre=2&jim=-2');
    await expect(page.locator('#julia-mode')).toBeChecked({ timeout: 45_000 });
    await expect(page.locator('#julia-re')).toHaveValue('2');
    await page.goto('/en/explore?fm=magnet1&julia=1&jre=0.2&jim=0.3');
    await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', 'magnet1');
    await expect(page.locator('#julia-mode')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('julia')).toBe('1');
  });

  test('keeps native Phoenix parameters effective alongside Julia and across reload', async ({ page }) => {
    await page.goto('/en/explore?fm=phoenix&julia=1&jre=-0.62&jim=0.41&pp=u_phoenixP%3A-0.35&iter=60');
    const canvas = page.getByTestId('fractal-canvas');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await expect(page.locator('#julia-mode')).toBeChecked();
    const slider = page.getByRole('slider');
    await expect(slider).toHaveAttribute('aria-valuenow', '-0.35');
    const before = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '-0.34');
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('u_phoenixP:-0.34');
    await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()), { timeout: 60_000 }).not.toBe(before);
    await page.reload();
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '-0.34');
    await expect(page.locator('#julia-mode')).toBeChecked();
  });
});
