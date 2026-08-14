import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const ARTWORK_STORAGE_KEY = 'fractalpark-artworks-v1';
const CUSTOM_FORMULAS_STORAGE_KEY = 'myfrac-custom-formulas';

async function waitForFractalCanvasReady(page: Page) {
  await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({
    timeout: 15000,
  });
}

async function seedLegacyStorage(page: Page) {
  await page.addInitScript(
    ({ artworkKey, formulaKey }) => {
      localStorage.setItem(
        artworkKey,
        JSON.stringify([
          {
            recordVersion: 1,
            id: 'legacy-entry',
            name: 'Legacy Entry',
            envelope: {},
            createdAt: 1,
            updatedAt: 1,
            thumbnail: '',
            starred: false,
          },
        ])
      );
      localStorage.setItem(formulaKey, '[]');
    },
    {
      artworkKey: ARTWORK_STORAGE_KEY,
      formulaKey: CUSTOM_FORMULAS_STORAGE_KEY,
    }
  );
}

async function readLegacyStorage(page: Page) {
  return page.evaluate(
    ({ artworkKey, formulaKey }) => ({
      artworks: localStorage.getItem(artworkKey),
      formulas: localStorage.getItem(formulaKey),
    }),
    {
      artworkKey: ARTWORK_STORAGE_KEY,
      formulaKey: CUSTOM_FORMULAS_STORAGE_KEY,
    }
  );
}

test.describe('Artwork portability', () => {
  test('downloads Document v2 and imports it in a new browser context', async ({
    browser,
    page,
  }) => {
    // This journey serially renders the exported project in two isolated
    // SwiftShader contexts. Keep the contexts non-overlapping, but budget for
    // both cold WebGL startups on constrained CI/VPS runners.
    test.setTimeout(120_000);

    await page.goto('/en/explore?oc=st');
    await waitForFractalCanvasReady(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download project/i }).click();
    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/\.fractal\.json$/);

    let importedContext: BrowserContext | null = null;
    let importedPage: Page | null = null;
    try {
      const projectBuffer = await download.createReadStream().then(async (stream) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
      });
      const contents = JSON.parse(projectBuffer.toString('utf8'));
      expect(contents).toMatchObject({
        envelopeVersion: 1,
        document: {
          schemaVersion: 2,
          coloring: { outsideColoringId: 'stripe' },
        },
      });

      // Source and destination remain separate browser contexts, but their
      // WebGL pages do not overlap. This mirrors a real cross-device handoff
      // and keeps SwiftShader teardown deterministic.
      await download.delete();
      await page.close();

      importedContext = await browser.newContext({
        baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
      });
      importedPage = await importedContext.newPage();
      await importedPage.goto('/en/explore');
      await waitForFractalCanvasReady(importedPage);

      const chooserPromise = importedPage.waitForEvent('filechooser');
      await importedPage.getByRole('button', { name: /import project/i }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: suggestedFilename,
        mimeType: 'application/json',
        buffer: projectBuffer,
      });

      await expect(importedPage.getByText('Project imported.')).toBeVisible();
      await expect(importedPage).toHaveURL(/[?&]oc=st/, { timeout: 5000 });
    } finally {
      if (importedPage && !importedPage.isClosed()) {
        await importedPage.close();
      }
      await importedContext?.close();
      if (!page.isClosed()) {
        await page.close();
      }
    }
  });

  test('rejects malformed imports without changing the current artwork', async ({ page }) => {
    await page.goto('/en/explore?oc=st');
    await waitForFractalCanvasReady(page);
    await expect(page).toHaveURL(/[?&]cx=.*[?&]oc=st(?:[&#]|$)/, {
      timeout: 5000,
    });
    const before = page.url();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /import project/i }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'invalid.fractal.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ invalid'),
    });

    await expect(page.getByText('The selected file is not valid JSON.')).toBeVisible();
    expect(page.url()).toBe(before);
  });

  test('ignores legacy localStorage keys (spec §17 storage probe)', async ({ page }) => {
    // Legacy artwork storage is dead bytes in v0.4.16: never read, never
    // migrated, never clobbered. Seeding it must change nothing.
    await seedLegacyStorage(page);
    await page.goto('/en/explore?oc=st');
    await waitForFractalCanvasReady(page);

    await page.getByRole('button', { name: /reset artwork/i }).click();
    const cancel = page.getByRole('button', { name: /^cancel$/i });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(page).toHaveURL(/[?&]oc=st/);

    await page.getByRole('button', { name: /reset artwork/i }).click();
    await page.getByRole('button', { name: /^reset$/i }).click();
    await expect(page).not.toHaveURL(/[?&]oc=st/, { timeout: 5000 });

    const persisted = await readLegacyStorage(page);
    expect(persisted.artworks).toContain('legacy-entry');
    expect(persisted.formulas).toBe('[]');
  });

  test('keeps Gallery independent of legacy localStorage entries', async ({ page }) => {
    await seedLegacyStorage(page);
    await page.goto('/en/gallery?view=mine');

    await expect(page.getByText('Legacy Entry')).toHaveCount(0);
    const persisted = await readLegacyStorage(page);
    expect(persisted.artworks).toContain('legacy-entry');
    expect(persisted.formulas).toBe('[]');
  });
});
