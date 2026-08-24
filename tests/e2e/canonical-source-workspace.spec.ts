import { expect, test } from '@playwright/test';

const PUBLISHED_FORMULA_ID = '00e14aa8-b766-54ea-a359-3f5d20d329b7';
const HELD_FORMULA_ID = '00cb5763-13e1-5c93-a283-d99905acccee';
const DEFINITION_PATH = '/formula-library/v1/runtime/published/definitions/';

test.describe('shared canonical source workspace', () => {
  test.describe.configure({ timeout: 120_000 });

  test('shows a seven-line Explore preview and a read-only responsive drawer', async ({
    page,
  }) => {
    const definitionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(DEFINITION_PATH)) {
        definitionRequests.push(request.url());
      }
    });

    await page.goto('/en/explore');
    await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({
      timeout: 30_000,
    });
    const preview = page.getByTestId('canonical-source-preview');
    await expect(preview).toBeVisible({ timeout: 45_000 });
    expect((await preview.textContent())?.split('\n')).toHaveLength(7);
    expect(definitionRequests).toHaveLength(1);

    await page.getByRole('button', { name: 'Open full source' }).click();
    const drawer = page.getByTestId('canonical-source-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveClass(/w-screen/);
    const editor = drawer.getByTestId('canonical-source-editor');
    await expect(editor).toHaveAttribute('data-editor-ready', 'true', {
      timeout: 30_000,
    });
    await expect(editor.locator('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expect(drawer.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'href',
      new RegExp(
        `/en/explore\\?open=standard-formula&formula=${PUBLISHED_FORMULA_ID}&intent=remix$`,
      ),
    );
    const download = drawer.getByRole('link', { name: 'Download .frm' });
    await expect(download).toHaveAttribute('download', `${PUBLISHED_FORMULA_ID}.frm`);
    await expect(download).toHaveAttribute('href', /^data:text\/plain;charset=utf-8,/);
    await expect(download).not.toHaveAttribute('href', new RegExp(DEFINITION_PATH));
    expect(definitionRequests).toHaveLength(1);
  });

  test('renders the same full editor inline on published Records and requests no held source', async ({
    page,
  }) => {
    const definitionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(DEFINITION_PATH)) {
        definitionRequests.push(request.url());
      }
    });

    await page.goto(`/en/formulas/${PUBLISHED_FORMULA_ID}`);
    const workspace = page.getByTestId('canonical-source-workspace');
    await expect(workspace).toHaveAttribute('data-source-variant', 'record');
    const editor = workspace.getByTestId('canonical-source-editor');
    await expect(editor).toHaveAttribute('data-editor-ready', 'true', {
      timeout: 30_000,
    });
    await expect(editor.locator('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(definitionRequests).toHaveLength(1);
    await expect(page.locator(`a[href*="${DEFINITION_PATH}"]`)).toHaveCount(0);

    definitionRequests.length = 0;
    await page.goto(`/en/formulas/${HELD_FORMULA_ID}`);
    await expect(page.getByTestId('canonical-source-workspace')).toHaveCount(0);
    await expect(page.locator(`a[href*="${DEFINITION_PATH}"]`)).toHaveCount(0);
    await expect(page.locator('a[href*="intent=remix"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(definitionRequests).toEqual([]);
  });
});
