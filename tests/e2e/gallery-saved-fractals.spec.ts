import { test, expect, type Page } from '@playwright/test';

const SAVED_FRACTALS_KEY = 'myfrac-saved-fractals';

type SeedFractal = {
  id: string;
  name: string;
  params: {
    maxIterations: number;
    paletteIndex: number;
    bounds: { centerX: number; centerY: number; zoom: number; rotation: number };
    isJulia: boolean;
    juliaC: [number, number];
    power: number;
    customGradient: null;
    formula: string;
    outsideColoring: string;
    insideColoring: string;
    transformId: string;
    pluginParams: Record<string, number>;
    orbitTrap: { shape: 'point'; point: [number, number]; radius: number; width: number };
    useSSAA: boolean;
    adaptiveIterations: boolean;
    lighting: { enabled: boolean; azimuth: number; elevation: number; intensity: number };
  };
  createdAt: number;
  thumbnail: string;
  starred: boolean;
};

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

async function seedSavedFractals(
  page: Page,
  entries: SeedFractal[]
) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVED_FRACTALS_KEY, value: entries }
  );
}

function buildSeedFractal(name: string): SeedFractal {
  return {
    id: `seed-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    params: {
      maxIterations: 200,
      paletteIndex: 0,
      bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
      isJulia: false,
      juliaC: [-0.7, 0.27],
      power: 2,
      customGradient: null,
      formula: 'mandelbrot',
      outsideColoring: 'smooth',
      insideColoring: 'black',
      transformId: 'none',
      pluginParams: {},
      orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
      useSSAA: false,
      adaptiveIterations: false,
      lighting: { enabled: false, azimuth: 45, elevation: 35, intensity: 0.65 },
    },
    createdAt: 1700000000000,
    thumbnail: '',
    starred: false,
  };
}

test.describe('Saved Fractal Gallery Workflow', () => {
  test('should save a fractal from explore and show it in gallery', async ({ page }) => {
    const fractalName = 'E2E Save Flow';

    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);

    // Save to Collection is in the Render tab
    await page.getByRole('tab', { name: /render/i }).click();

    await page.getByRole('button', { name: /save to collection/i }).click();
    await page.getByLabel('Name').fill(fractalName);
    await page.getByRole('button', { name: /^Save$/ }).click();

    await expect(page.getByRole('button', { name: /saved!/i })).toBeVisible({ timeout: 5000 });

    await page.goto('/en/gallery');
    await expect(page.locator('a', { hasText: fractalName }).first()).toBeVisible({ timeout: 15000 });
  });

  test('should delete a saved fractal from gallery', async ({ page }) => {
    const fractalName = 'E2E Delete Me';

    await seedSavedFractals(page, [buildSeedFractal(fractalName)]);
    await page.goto('/en/gallery');

    const card = page.locator('a', { hasText: fractalName }).first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Test delete via context menu
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: /^Delete$/ }).click();

    await expect(page.locator('a', { hasText: fractalName })).toHaveCount(0);
  });
});
