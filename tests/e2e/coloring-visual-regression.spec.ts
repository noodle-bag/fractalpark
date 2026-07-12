import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.RUN_VISUAL_REGRESSION, 'Set RUN_VISUAL_REGRESSION=1 to run GPU visual baselines.');

async function captureCanvas(page: Page, name: string, query = '') {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto(`/en/explore?cx=-0.5&cy=0&z=0.40&iter=200${query}`);
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(750);
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const screenshot = await page.screenshot({ animations: 'disabled', clip: box! });
  expect(screenshot).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.01 });
}

test.describe('Coloring visual regression', () => {
  test('identity output', async ({ page }) => captureCanvas(page, 'color-adjustments-identity'));
  test('basic tonal adjustments', async ({ page }) => captureCanvas(page, 'color-adjustments-basic', '&ex=0.65&ct=24.0&br=-8.0&gm=1.15&sat=18.0'));
  test('hue and vibrance', async ({ page }) => captureCanvas(page, 'color-adjustments-hue-vibrance', '&vib=42.0&hue=-38.0'));
  test('RGB curves', async ({ page }) => captureCanvas(page, 'color-adjustments-curves', '&cr=0,0.16,0.48,0.84,1&cg=0,0.3,0.56,0.78,1&cb=0,0.22,0.62,0.9,1'));
  test('invert', async ({ page }) => captureCanvas(page, 'color-adjustments-invert', '&inv=1'));
  test('SSAA resolve before adjustments', async ({ page }) => captureCanvas(page, 'color-adjustments-ssaa', '&ssaa=1&ex=0.35&sat=15.0&hue=12.0'));
});
