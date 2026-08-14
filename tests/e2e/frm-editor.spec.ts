import { expect, test, type Page } from '@playwright/test';
import ruMessages from '../../messages/ru.json';

const ABSOLUTE_EDITOR_URL = 'http://127.0.0.1:3000/en/formulas/editor';

async function replaceEditorSource(page: Page, source: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(source);
}

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

  test('fails closed without cloud prerequisites and never restores local persistence', async ({
    page,
  }) => {
    await page.goto('/en/formulas/editor?example=starter-brot');
    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await expect(page.getByText('Compile Successful').first()).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('The cloud formula library is unavailable. Your formula was not saved.')
    ).toBeVisible();
    await expect(page).toHaveURL(/\/en\/formulas\/editor\?example=starter-brot$/);

    await page.getByTestId('frm-save-open').click();
    await expect(
      page.getByText('The cloud formula library is unavailable. Your formula was not saved.')
    ).toBeVisible();
    await expect(page).toHaveURL(/\/en\/formulas\/editor\?example=starter-brot$/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('myfrac-custom-formulas')))
      .toBeNull();
  });

  test('keeps Classic M1 compatibility, live lint, and Compile aligned', async ({ page }) => {
    await page.goto('/en/formulas/editor?example=not-allowlisted');
    await replaceEditorSource(
      page,
      `M1 {
\tz=pixel:
\tz=z*z+pixel
\t|z|<=4
}`,
    );

    await expect(page.getByTestId('frm-compat-card')).toContainText(/Supported/i);
    await expect(page.getByText(/Expected COLON/)).toHaveCount(0);
    await expect(page.getByText(/Unknown section: pixel/)).toHaveCount(0);
    await expect(page.getByText(/Missing bailout expression/)).toHaveCount(0);

    const compile = page.getByRole('button', { name: 'Compile', exact: true });
    await expect(compile).toBeEnabled({ timeout: 15_000 });
    await compile.click();
    await expect(page.getByText('Compile Successful').first()).toBeVisible();
  });

  test('shows full classic source coordinates in status and live diagnostics', async ({ page }) => {
    await page.goto('/en/formulas/editor?example=not-allowlisted');
    await replaceEditorSource(
      page,
      `; preface

RO {
\tz=pixel:
\tm=z
\tz=z*z+pixel
\tm<=4
}`,
    );

    await expect(
      page.locator('[data-testid="frm-compat-diagnostics"]:visible'),
    ).toContainText(
      /Line 7, column 2:/,
      { timeout: 15_000 },
    );
    await expect(page.getByRole('button', { name: /Line 7/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compile', exact: true })).toBeDisabled();
  });

  test('keeps localized footer actions and metadata inside a compact card', async ({
    page,
  }) => {
    const editorMessages = ruMessages.explore.editor;
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/ru/formulas/editor?example=starter-brot');

    const compile = page.getByRole('button', {
      name: editorMessages.compile,
      exact: true,
    });
    await compile.click();
    await expect(page.getByTestId('frm-preview-mode')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByTestId('frm-editor-mode').click();
    await expect(page.getByText(editorMessages.compileSuccess).first()).toBeVisible();

    await replaceEditorSource(
      page,
      `R01 {
\tz=pixel:
\tm=z
\tz=z*z+pixel
\tm<=4
}`,
    );

    await expect(compile).toBeDisabled({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: editorMessages.restoreLastSuccessful }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: editorMessages.setCurrentViewAsDefault }),
    ).toBeVisible();

    const footer = page.getByTestId('formula-editor-footer');
    const actions = page.getByTestId('formula-editor-actions');
    const metadata = page.getByTestId('formula-editor-metadata');
    await expect(metadata).toBeVisible();

    const horizontalOverflow = await footer.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);

    const footerBox = await footer.boundingBox();
    const metadataBox = await metadata.boundingBox();
    const actionBoxes = await actions.locator('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right };
      }),
    );
    expect(footerBox).not.toBeNull();
    expect(metadataBox).not.toBeNull();
    for (const actionBox of actionBoxes) {
      expect(actionBox.left).toBeGreaterThanOrEqual(footerBox!.x - 1);
      expect(actionBox.right).toBeLessThanOrEqual(footerBox!.x + footerBox!.width + 1);
    }
    expect(metadataBox!.x + metadataBox!.width).toBeLessThanOrEqual(
      footerBox!.x + footerBox!.width + 1,
    );
  });

  test('consumes invalid and cross-device handoffs without a built-in fallback', async ({
    page,
  }) => {
    for (const formulaId of [
      'mandelbrot',
      'custom-88888888-8888-4888-8888-888888888888',
    ]) {
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
            : /custom formula .* could not be loaded/i
        )
      ).toBeVisible();
      await expect(page.getByTestId('fractal-canvas')).toHaveCount(0);

      await page.getByRole('button', { name: /^Mandelbrot/ }).click();
      await expect(page.getByTestId('fractal-canvas')).toBeVisible();
      await expect(
        page.getByText(
          formulaId === 'mandelbrot'
            ? /custom formula library could not be read safely/i
            : /custom formula .* could not be loaded/i
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
