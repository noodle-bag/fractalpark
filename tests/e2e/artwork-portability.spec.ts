import { expect, test, type Page } from '@playwright/test';

const ARTWORK_STORAGE_KEY = 'fractalpark-artworks-v1';
const CUSTOM_FORMULAS_STORAGE_KEY = 'myfrac-custom-formulas';

async function waitForFractalCanvasReady(page: Page) {
  await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({
    timeout: 15000,
  });
}

test.describe('Artwork portability', () => {
  test('downloads Document v2 and imports it in a new browser context', async ({
    browser,
    page,
  }) => {
    await page.goto('/en/explore?oc=st');
    await waitForFractalCanvasReady(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download project/i }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(download.suggestedFilename()).toMatch(/\.fractal\.json$/);
    expect(downloadPath).not.toBeNull();

    const contents = JSON.parse(
      await download.createReadStream().then(async (stream) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks).toString('utf8');
      })
    );
    expect(contents).toMatchObject({
      envelopeVersion: 1,
      document: {
        schemaVersion: 2,
        coloring: { outsideColoringId: 'stripe' },
      },
    });

    const importedContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const importedPage = await importedContext.newPage();
    await importedPage.goto('/en/explore');
    await waitForFractalCanvasReady(importedPage);

    const chooserPromise = importedPage.waitForEvent('filechooser');
    await importedPage.getByRole('button', { name: /import project/i }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(downloadPath as string);

    await expect(importedPage.getByText('Project imported.')).toBeVisible();
    await expect(importedPage).toHaveURL(/[?&]oc=st/, { timeout: 5000 });
    await importedContext.close();
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

    // Gallery never renders the legacy entry.
    await page.goto('/en/gallery?view=mine');
    await expect(page.getByText('Legacy Entry')).toHaveCount(0);

    // The seeded bytes are untouched — no migration, no clobber.
    const persisted = await page.evaluate(
      ({ artworkKey, formulaKey }) => ({
        artworks: localStorage.getItem(artworkKey),
        formulas: localStorage.getItem(formulaKey),
      }),
      {
        artworkKey: ARTWORK_STORAGE_KEY,
        formulaKey: CUSTOM_FORMULAS_STORAGE_KEY,
      }
    );
    expect(persisted.artworks).toContain('legacy-entry');
    expect(persisted.formulas).toBe('[]');
  });
});
