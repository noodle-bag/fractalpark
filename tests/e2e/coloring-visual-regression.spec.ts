import { expect, test, type Page } from '@playwright/test';

const runVisualRegression = process.env.RUN_VISUAL_REGRESSION === '1';

async function waitForNonblankCanvas(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');

  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
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
      })
    )
    .toBeGreaterThan(0);

  return canvas;
}

test.describe('Coloring visual regression', () => {
  test.skip(!runVisualRegression, 'Visual baselines are opt-in until snapshots are reviewed.');

  test('renders the legacy smooth preset within the approved visual tolerance', async ({ page }) => {
    await page.goto('/en/explore?iter=200');
    const canvas = await waitForNonblankCanvas(page);

    await expect(canvas).toHaveScreenshot('legacy-smooth.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
