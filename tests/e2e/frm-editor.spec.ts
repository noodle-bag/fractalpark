import { expect, test } from '@playwright/test';

const ABSOLUTE_EDITOR_URL = 'http://127.0.0.1:3000/en/formulas/editor';
const STORAGE_KEY = 'myfrac-custom-formulas';

test.describe('standalone FRM editor', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('keeps the SSR shell useful and free of local source without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto(ABSOLUTE_EDITOR_URL);

    await expect(
      page.getByRole('heading', { name: 'FRM Editor', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'FRM Editor requires JavaScript' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read the FRM Guide' }).first()
    ).toHaveAttribute('href', '/en/formulas/frm');
    const html = await page.content();
    expect(html).not.toContain('MyFormula {');
    expect(html).not.toContain('myfrac-custom-formulas');

    await context.close();
  });

  test('opens the shared Guide example by allowlisted ID on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/formulas/frm');
    const editorLink = page.locator(
      'a[href="/en/formulas/editor?example=starter-brot"]'
    );
    await expect(editorLink).toBeVisible();
    await editorLink.click();

    await expect(page.locator('.cm-content')).toContainText('StarterBrot');
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Examples', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Formulas', exact: true })).toBeVisible();
    await expect(page.getByTestId('frm-editor-mode')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByTestId('frm-editor-panel')).toBeVisible();
    await expect(page.getByTestId('frm-editor-preview')).toBeHidden();

    await page.getByRole('button', { name: 'Examples', exact: true }).click();
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: /Parameter Drift/ }).click();
    await expect(page.locator('.cm-content')).toContainText('StarterBrot');

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });
    await page.getByRole('link', { name: 'FRM Guide', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/formulas\/editor\?example=starter-brot$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/en\/formulas\/editor$/
    );

    await page.getByTestId('frm-preview-mode').click();
    await expect(page.getByTestId('frm-preview-mode')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByTestId('frm-editor-panel')).toBeHidden();
    await expect(page.getByTestId('frm-editor-preview')).toBeVisible();
  });

  test('saves locally and consumes the one-time handoff in Explore', async ({ page }) => {
    await page.goto('/en/formulas/editor?example=starter-brot');
    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await expect(page.getByText('Compile Successful').first()).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved locally.')).toBeVisible();
    const storedId = await page.evaluate((storageKey) => {
      const records = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Array<{
        id: string;
      }>;
      return records[0]?.id ?? '';
    }, STORAGE_KEY);
    expect(storedId).toMatch(/^custom-/);

    await page.getByTestId('frm-save-open').click();
    await page.waitForURL((url) => {
      return (
        url.pathname === '/en/explore' &&
        !url.searchParams.has('open') &&
        !url.searchParams.has('formula')
      );
    });
    await expect.poll(() => new URL(page.url()).searchParams.get('fm')).toBe(storedId);
    await expect(page.getByTestId('fractal-canvas')).toBeVisible();
  });

  test('consumes invalid and cross-device handoffs without a built-in fallback', async ({
    page,
  }) => {
    for (const formulaId of ['mandelbrot', 'custom-on-another-device']) {
      await page.goto(
        `/en/explore?open=custom-formula&formula=${formulaId}`
      );
      await page.waitForURL((url) => {
        return (
          url.pathname === '/en/explore' &&
          !url.searchParams.has('open') &&
          !url.searchParams.has('formula')
        );
      });
      await expect(
        page.getByText(
          formulaId === 'mandelbrot'
            ? /custom formula library could not be read safely/i
            : /not available on this device/i
        )
      ).toBeVisible();
      await expect(page.getByTestId('fractal-canvas')).toHaveCount(0);

      await page.getByRole('button', { name: /^Mandelbrot/ }).click();
      await expect(page.getByTestId('fractal-canvas')).toBeVisible();
      await expect(
        page.getByText(
          formulaId === 'mandelbrot'
            ? /custom formula library could not be read safely/i
            : /not available on this device/i
        )
      ).toHaveCount(0);
    }
  });

  test('protects an unsaved draft during browser history traversal', async ({
    page,
  }) => {
    await page.goto('/en/formulas/frm');
    await page
      .locator('a[href="/en/formulas/editor?example=starter-brot"]')
      .first()
      .click();
    await expect(page.locator('.cm-content')).toContainText('StarterBrot');

    const dismissed = new Promise<void>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.dismiss();
        resolve();
      });
    });
    await page.evaluate(() => window.history.back());
    await dismissed;

    await expect(page).toHaveURL(
      /\/en\/formulas\/editor\?example=starter-brot$/
    );
    await expect(page.locator('.cm-content')).toContainText('StarterBrot');

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/en\/formulas\/frm$/);
  });

  test('treats a changed default view as an unsaved draft change', async ({ page }) => {
    await page.goto('/en/formulas/editor?example=starter-brot');
    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved locally.')).toBeVisible();

    const canvas = page.getByTestId('fractal-canvas');
    await canvas.hover();
    await page.mouse.wheel(0, -500);
    await page.getByRole('button', { name: 'Use Current View as Default' }).click();

    let prompted = false;
    page.once('dialog', async (dialog) => {
      prompted = true;
      await dialog.dismiss();
    });
    await page.getByRole('link', { name: 'FRM Guide', exact: true }).click();
    expect(prompted).toBe(true);
    await expect(page).toHaveURL(/\/en\/formulas\/editor\?example=starter-brot$/);
  });

  test('updates preview only after compile and keeps the last success when source changes', async ({
    page,
  }) => {
    await page.goto('/en/formulas/editor?example=starter-brot');
    const saveAndOpen = page.getByTestId('frm-save-open');
    await expect(saveAndOpen).toBeDisabled();

    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await expect(page.getByText('Compile Successful').first()).toBeVisible();
    await expect(page.getByTestId('fractal-canvas')).toBeVisible();
    await expect(saveAndOpen).toBeEnabled();

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nunsupported trailing text');

    await expect(page.getByTestId('fractal-canvas')).toBeVisible();
    await expect(page.getByText(/last successful preview/i)).toBeVisible();
    await expect(saveAndOpen).toBeDisabled();
  });

  test('imports and downloads the current source without rewriting it', async ({ page }) => {
    const source = `ImportedFormula {\ninit:\n  z = pixel\nloop:\n  z = z^2 + pixel\nbailout:\n  |z| < 4\n}\n`;
    await page.goto('/en/formulas/editor?example=not-allowlisted');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'imported.frm',
      mimeType: 'text/plain',
      buffer: Buffer.from(source, 'utf8'),
    });
    await expect(page.locator('.cm-content')).toContainText('ImportedFormula');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .frm', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('fractalpark-formula.frm');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe(source);
  });

  test('handles an unknown example ID as a blank editor without fetching source', async ({
    page,
  }) => {
    await page.goto('/en/formulas/editor?example=not-allowlisted');

    await expect(page.getByText(/example is not available/i)).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveText('');
    await expect(page.getByTestId('frm-save-open')).toBeDisabled();
  });
});
