import { test, expect, type Page } from '@playwright/test';

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

test.describe('Animation URL Restore', () => {
  test('should restore keyframes from URL and keep them after reload', async ({ page }) => {
    const keyframeUrl =
      '/en/explore?cx=-0.5&cy=0&z=0.40&kf=-0.7000000000,0.1000000000,10.00,0.0000|-0.7100000000,0.1100000000,20.00,0.1000';

    await page.goto(keyframeUrl);
    await waitForFractalCanvasReady(page);

    await page.getByRole('tab', { name: /animation/i }).click();
    await page.getByRole('button', { name: /animation/i }).click();

    await expect(page.getByRole('button', { name: /preview/i })).toBeEnabled();
    await expect(page.getByText(/Keyframe 1|Keyframe 1/)).toBeVisible();
    await expect(page.getByText(/Keyframe 2|Keyframe 2/)).toBeVisible();
    await expect(page).toHaveURL(/kf=/);

    await page.getByRole('button', { name: /preview/i }).click();
    await expect(page.getByRole('button', { name: /stop|Stop/i })).toBeVisible();

    await page.reload();
    await waitForFractalCanvasReady(page);

    await page.getByRole('tab', { name: /animation/i }).click();
    await page.getByRole('button', { name: /animation/i }).click();
    await expect(page.getByRole('button', { name: /preview/i })).toBeEnabled();
    await expect(page.getByText(/Keyframe 1|Keyframe 1/)).toBeVisible();
    await expect(page.getByText(/Keyframe 2|Keyframe 2/)).toBeVisible();
    await expect(page).toHaveURL(/kf=/);
  });
});
