import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { DEFAULT_FRACTAL_DOCUMENT } from '../../src/engine/document';
import type { FractalDocumentEnvelopeV1 } from '../../src/engine/document-envelope';
import { createFractalDocumentEnvelope } from '../../src/lib/fractal-file';

async function isolate(context: BrowserContext) {
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route('**/api/creation/**', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort();
    else if (url.pathname === '/api/creation/auth/session') await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } });
    else await route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
  });
  await context.route('**/_vercel/**', route => route.fulfill({ status: 204 }));
}

test.beforeEach(async ({ context }) => isolate(context));

async function ready(page: Page, formulaId?: string) {
  const canvas = page.getByRole('main').getByTestId('fractal-canvas');
  if (formulaId) await expect(page.getByTestId('explore-root')).toHaveAttribute('data-formula-id', formulaId, { timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
  const id = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', id!);
}

async function showArtworkActions(page: Page, actionName: string) {
  const action = page.getByRole('button', { name: actionName, exact: true });
  if (!await action.isVisible()) await page.locator('.explore-artwork-disclosure > summary').click();
  await expect(action).toBeVisible();
}

async function downloadEnvelope(page: Page) {
  await showArtworkActions(page, 'Download Project');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Project', exact: true }).click();
  const download = await downloading;
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  const envelope = JSON.parse(buffer.toString('utf8')) as FractalDocumentEnvelopeV1;
  await download.delete();
  return { buffer, envelope };
}

async function verifyPublishedArtworkRoundTrip(page: Page, navigation: 'menu' | 'address') {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const draftId = '00000000-0000-4000-8000-000000000010';
  let saved: FractalDocumentEnvelopeV1 | null = null;
  await page.route('**/api/creation/auth/session', route => route.fulfill({ json: { user: { id: 'fixture-user' } } }));
  await page.route('**/api/creation/profile', route => route.fulfill({ json: { displayName: 'Creator', backupEmailMode: 'off' } }));
  await page.route('**/api/creation/publications', route => route.fulfill({ json: { publications: [] } }));
  const detail = () => ({
    id: draftId, title: 'Precise artwork', revision: 1, configBytes: 100,
    thumbnailBytes: 0, hasThumbnail: false, remixSource: null,
    createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', envelope: saved,
  });
  await page.route('**/api/creation/drafts', async route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON().envelope;
      await route.fulfill({ json: { draftId, revision: 1 } });
    } else await route.fulfill({ json: { drafts: saved ? [detail()] : [] } });
  });
  await page.route(`**/api/creation/drafts/${draftId}`, route => route.fulfill({ json: { draft: detail() } }));
  await page.goto('/en/explore');
  await ready(page);
  const id = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  const power = page.getByRole('spinbutton', { name: 'power', exact: true });
  await power.fill('3');
  await power.press('Enter');
  await ready(page);
  await page.locator('#julia-mode').click();
  await ready(page);
  await page.locator('#julia-re').fill('0.123456789');
  await page.locator('#julia-re').press('Enter');
  await ready(page);
  await page.locator('#julia-im').fill('-0.345678901');
  await page.locator('#julia-im').press('Enter');
  await ready(page);
  await showArtworkActions(page, 'Save to Gallery');
  await page.getByRole('button', { name: 'Save to Gallery', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Precise artwork');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('draft')).toBe(draftId);
  expect(saved!.document.formula).toMatchObject({ formulaId: id, isJulia: true, juliaC: [0.123456789, -0.345678901], params: { formula: { frmV1_power: [3, 0] } } });
  await expect.poll(() => page.evaluate(() => !history.state?.fractalParkPanel?.modal), { timeout: 30_000 }).toBe(true);
  if (navigation === 'menu') {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Gallery', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/gallery$/);
    await page.getByRole('link', { name: 'My Works', exact: true }).click();
  } else await page.goto('/en/gallery?view=mine');
  await page.getByRole('button', { name: /Precise artwork/ }).click();
  await ready(page, id!);
  const reopened = await downloadEnvelope(page);
  expect(reopened.envelope.document.formula).toEqual(saved!.document.formula);
  await page.reload();
  await ready(page, id!);
  const refreshed = await downloadEnvelope(page);
  expect(refreshed.envelope.document.formula).toEqual(saved!.document.formula);
  await expect(page.locator('#julia-re')).toHaveValue('0.123456789');
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await expect(page.locator('#julia-im')).toHaveValue('-0.345678901');
}

for (const navigation of ['menu', 'address'] as const) {
  test(`mobile save, My Works reopen, refresh and collapse preserve precise published artwork values via ${navigation}`, async ({ page }) => {
    await verifyPublishedArtworkRoundTrip(page, navigation);
  });
}

test('a frozen custom project preserves view, transform and keyframes across isolated contexts', async ({ browser, page }) => {
  test.setTimeout(120_000);
  const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  document.formula.formulaId = 'e2e-interface-portable';
  document.formula.power = 3;
  document.scene.bounds = { centerX: 0.1, centerY: -0.2, zoom: 0.75, rotation: 0.2 };
  document.render.maxIterations = 50;
  document.transform = { transformId: 'inversion', params: { transform: { u_invCenterX: 0.2, u_invCenterY: -0.3 } } };
  document.animation = { viewKeyframes: [
    { id: 'start', bounds: { ...document.scene.bounds } },
    { id: 'end', bounds: { centerX: -0.7, centerY: 0.2, zoom: 1.4, rotation: 0.1 } },
  ] };
  const result = await createFractalDocumentEnvelope(document, [{
    id: document.formula.formulaId, frmSemanticsVersion: 1,
    source: 'InterfacePortable {\ninit:\n z = 0\nloop:\n z = z^3 + c\nbailout:\n |z| < 4\n}',
  }]);
  if (!result.success) throw new Error('invalid self-authored project fixture');
  await page.goto('/en/explore');
  await ready(page);
  await showArtworkActions(page, 'Import Project');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Project', exact: true }).click();
  await (await choosing).setFiles({ name: 'portable.fractal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.value)) });
  await ready(page, document.formula.formulaId);
  const exported = await downloadEnvelope(page);
  for (const key of ['formula', 'scene', 'coloring', 'transform', 'animation', 'render'] as const) expect(exported.envelope.document[key]).toEqual(document[key]);
  expect(exported.envelope.assets?.formulas).toEqual(result.value.assets?.formulas);
  await page.close();
  const destination = await browser.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000', viewport: { width: 320, height: 844 } });
  try {
    await isolate(destination);
    const imported = await destination.newPage();
    await imported.goto('/en/explore');
    await ready(imported);
    await showArtworkActions(imported, 'Import Project');
    const chooser = imported.waitForEvent('filechooser');
    await imported.getByRole('button', { name: 'Import Project', exact: true }).click();
    await (await chooser).setFiles({ name: 'portable.fractal.json', mimeType: 'application/json', buffer: exported.buffer });
    await ready(imported, document.formula.formulaId);
    const recovered = await downloadEnvelope(imported);
    for (const key of ['formula', 'scene', 'coloring', 'transform', 'animation', 'render'] as const) expect(recovered.envelope.document[key]).toEqual(document[key]);
    expect(recovered.envelope.assets?.formulas).toEqual(result.value.assets?.formulas);
  } finally { await destination.close(); }
});

test('a malformed project leaves the qualified artwork and its saved values unchanged', async ({ page }) => {
  await page.goto('/en/explore');
  await ready(page);
  const before = await downloadEnvelope(page);
  await showArtworkActions(page, 'Import Project');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Project', exact: true }).click();
  await (await choosing).setFiles({ name: 'invalid.fractal.json', mimeType: 'application/json', buffer: Buffer.from('{ invalid') });
  await expect(page.getByText('The selected file is not valid JSON.')).toBeVisible();
  await ready(page, before.envelope.document.formula.formulaId);
  const after = await downloadEnvelope(page);
  expect(after.envelope).toEqual(before.envelope);
});

test('a project missing its custom formula source leaves the current artwork unchanged', async ({ page }) => {
  await page.goto('/en/explore');
  await ready(page);
  const before = await downloadEnvelope(page);
  const missingSource = structuredClone(before.envelope);
  missingSource.document.formula.formulaId = 'custom-missing';
  delete missingSource.document.assets;
  delete missingSource.assets;

  await showArtworkActions(page, 'Import Project');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Project', exact: true }).click();
  await (await choosing).setFiles({
    name: 'missing-source.fractal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(missingSource)),
  });

  await expect(page.getByText('The project is missing its custom formula source.')).toBeVisible();
  await ready(page, before.envelope.document.formula.formulaId);
  const after = await downloadEnvelope(page);
  expect(after.envelope).toEqual(before.envelope);
});
