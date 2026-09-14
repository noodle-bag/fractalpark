import { expect, test } from '@playwright/test';
import { DEFAULT_FRACTAL_DOCUMENT } from '../../src/engine/document';

const PUBLICATION_ID = '00000000-0000-4000-8000-000000000001';
const MC_ID = 'cddc90de-e9bd-51ce-909b-b9b956bf419b';

for (const locale of ['en', 'zh']) {
  test(`Community renders a published mc envelope without portable source (${locale})`, async ({ page }) => {
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = MC_ID;
    document.formula.params = {
      formula: { frmV1_growth: [0.054443414843043124, 0.2138612207742419] },
    };
    document.scene.bounds = {
      centerX: -0.0004201048540320277,
      centerY: -9.625255574956285e-5,
      zoom: 0.8736698609400598,
      rotation: -Math.PI,
    };
    document.render.maxIterations = 150;
    const publication = {
      id: PUBLICATION_ID,
      title: 'MC preview regression',
      description: null,
      authorDisplayName: 'Local test',
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      thumbnailStatus: 'pending',
      remixSource: null,
      publishedAt: '2026-09-14T00:00:00Z',
    };
    await page.route('**/api/creation/auth/session', (route) => route.fulfill({
      status: 401,
      json: { error: { code: 'unauthenticated' } },
    }));
    await page.route('**/api/creation/community*', (route) => route.fulfill({
      json: { items: [publication], nextCursor: null },
    }));
    await page.route(`**/api/creation/publications/${PUBLICATION_ID}`, (route) => route.fulfill({
      json: { ...publication, envelope: { envelopeVersion: 1, document } },
    }));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${locale}/gallery?view=community`);
    const preview = page.getByTestId('artwork-envelope-preview');
    await expect(preview).toHaveAttribute('data-preview-state', 'ready', { timeout: 30_000 });
    const img = preview.locator('img');
    await expect(img).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    const colors = await img.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const canvas = window.document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 40;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0, 64, 40);
      const pixels = context.getImageData(0, 0, 64, 40).data;
      const unique = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) {
        unique.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      }
      return unique.size;
    });
    expect(colors).toBeGreaterThan(32);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(preview).toHaveAttribute('data-preview-state', 'ready', { timeout: 30_000 });
  });
}
