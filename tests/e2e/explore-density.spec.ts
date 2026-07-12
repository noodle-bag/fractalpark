import { expect, test, type Page } from '@playwright/test';

const DESKTOP_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function openFormulaPanel(page: Page) {
  await page.goto('/en/explore');
  await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Transcendental', exact: true })).toBeVisible({ timeout: 15000 });
}

test.describe('Explore workspace density', () => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`keeps navigation readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFormulaPanel(page);

      const panel = page.locator('[data-testid="explore-controls-panel"]');
      const panelBox = await panel.boundingBox();
      expect(panelBox).toBeTruthy();
      expect(panelBox!.width).toBeGreaterThanOrEqual(379);
      expect(panelBox!.width).toBeLessThanOrEqual(481);

      const mainTabs = page.locator('[data-testid="explore-main-tabs"] [role="tab"]');
      await expect(mainTabs).toHaveCount(5);
      const boxes = await mainTabs.evaluateAll((tabs) => tabs.map((tab) => {
        const box = tab.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, scrollWidth: tab.scrollWidth };
      }));
      for (let index = 0; index < boxes.length; index++) {
        expect(boxes[index].scrollWidth).toBeLessThanOrEqual(Math.ceil(boxes[index].width));
        if (index > 0) expect(boxes[index - 1].right).toBeLessThanOrEqual(boxes[index].left + 0.5);
      }

      const familyFilters = page.locator('[data-testid="formula-family-filters"]');
      const familyBox = await familyFilters.boundingBox();
      const transcendentalBox = await page.getByRole('button', { name: 'Transcendental', exact: true }).boundingBox();
      expect(familyBox).toBeTruthy();
      expect(transcendentalBox).toBeTruthy();
      expect(transcendentalBox!.x).toBeGreaterThanOrEqual(familyBox!.x);
      expect(transcendentalBox!.x + transcendentalBox!.width).toBeLessThanOrEqual(familyBox!.x + familyBox!.width + 0.5);
    });
  }

  test('keeps the mobile workspace free of horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFormulaPanel(page);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  });
});
