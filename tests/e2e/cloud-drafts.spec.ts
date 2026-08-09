import { test, expect, type Locator, type Page } from '@playwright/test';

import { DEFAULT_FRACTAL_DOCUMENT } from '../../src/engine/document';
import { createFractalDocumentEnvelope } from '../../src/lib/fractal-file';

const FORMULA_SOURCE_ATTESTATION_VERSION = '2026-08-08.v1';
const RIGHTS_ATTESTATION_VERSION = '2026-08-02.v1';
const FORMULA_SOURCE = `E2ECloudFormula {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

/**
 * Cloud drafts journey (v0.4.16 cloud-first): anonymous save triggers the
 * OTP dialog and the frozen write resumes after verification; the draft
 * identity pins to `?draft=`; reopening loads from the cloud; a second
 * save moves the revision; publish survives a lost response through the
 * idempotency replay, Community exposes the frozen result, and withdraw
 * revokes it. Runs only with the real local Supabase stack up and .env.local
 * present (Mailpit on :54324).
 */

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
}

async function expectArtworkPreviewReady(preview: Locator) {
  await expect(preview).toHaveAttribute('data-preview-state', 'ready', { timeout: 30000 });
  await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const box = await preview.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(1.6, 1);
}

async function readOtpCode(page: Page, email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await page.request.get('http://127.0.0.1:54324/api/v1/messages?limit=10');
    const body = (await res.json()) as {
      messages: Array<{ ID: string; To?: Array<{ Address?: string }> }>;
    };
    const summary = body.messages.find((message) =>
      message.To?.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const messageRes = await page.request.get(
        `http://127.0.0.1:54324/api/v1/message/${summary.ID}`,
      );
      const message = (await messageRes.json()) as { Subject?: string; Text?: string; HTML?: string };
      const match = `${message.Subject ?? ''} ${message.Text ?? ''} ${message.HTML ?? ''}`.match(
        /\b(\d{6})\b/,
      );
      if (match) return match[1];
    }
    await page.waitForTimeout(500);
  }
  throw new Error('no OTP email');
}

async function completeOtp(page: Page, email: string) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /send code/i }).click();
  const code = await readOtpCode(page, email);
  await page.getByLabel(/six-digit code/i).fill(code);
  // Scoped to the dialog: the navbar's anonymous-state "Sign in" button
  // matches the same regex while the OTP dialog is open (review blocking).
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^sign in$/i })
    .click();
}

test.describe('Cloud drafts journey', () => {
  test('anonymous save resumes after OTP, then publish replays and withdraws', async ({ page }) => {
    test.setTimeout(420000);
    const email = `cloud-e2e-${Date.now()}@example.com`;
    const artworkName = `E2E Cloud ${Date.now() % 100000}`;

    // 1. Anonymous save: the OTP dialog opens instead of any local write.
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    await page.getByRole('button', { name: /save to gallery/i }).click();
    await page.getByLabel(/name/i).fill(artworkName);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15000 });

    // 2. Complete OTP: the frozen save resumes and lands in the cloud.
    await completeOtp(page, email);
    await expect(page.getByText(/saved to your cloud/i)).toBeVisible({ timeout: 30000 });
    await page.waitForURL(/[?&]draft=/, { timeout: 20000 });

    // 3. My Works lists the new cloud draft at revision 1.
    await page.goto('/en/gallery?view=mine');
    const draftRow = page.getByRole('button', { name: new RegExp(artworkName) });
    await expect(draftRow).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/rev 1/i)).toBeVisible();
    await expectArtworkPreviewReady(draftRow.getByTestId('artwork-envelope-preview'));

    // 4. Open the draft: Explore loads it from the cloud via ?draft=.
    await draftRow.click();
    await page.waitForURL(/\/en\/explore\?.*draft=/, { timeout: 20000 });
    await waitForFractalCanvasReady(page);

    // 5. Save again while signed in: in-place update, revision moves to 2.
    await page.getByRole('button', { name: /save to gallery/i }).click();
    await page.getByLabel(/name/i).fill(`${artworkName} v2`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/saved to your cloud/i)).toBeVisible({ timeout: 20000 });

    // 6. My Works shows the moved revision.
    await page.goto('/en/gallery?view=mine');
    await expect(
      page.getByRole('button', { name: new RegExp(`${artworkName} v2`) }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/rev 2/i)).toBeVisible();

    // 7. Publish through the real UI. The first response is deliberately
    // lost after the server commits; the cloud client must retry with the
    // same idempotency key and converge through the route's replay branch.
    const publishKeys: string[] = [];
    let publicationId = '';
    await page.route('**/api/creation/drafts/*/publish', async (route) => {
      publishKeys.push(route.request().headers()['idempotency-key'] ?? '');
      if (publishKeys.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        const body = (await committed.json()) as { publicationId: string };
        publicationId = body.publicationId;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: /^publish$/i }).click();
    const publishDialog = page.getByRole('dialog');
    await publishDialog.getByLabel(/display name/i).fill('Cloud E2E Author');
    await publishDialog.getByLabel(/^title$/i).fill(`${artworkName} published`);
    await publishDialog.getByLabel(/description/i).fill('Publish replay integration check.');
    await publishDialog.locator('input[type="checkbox"]').check();
    await publishDialog.getByRole('button', { name: /^publish$/i }).click();

    await expect(publishDialog).toHaveCount(0, { timeout: 30000 });
    expect(publicationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(publishKeys).toHaveLength(2);
    expect(publishKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(publishKeys[1]).toBe(publishKeys[0]);
    await expect(page.getByText(/no cloud drafts yet/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`${artworkName} published`, { exact: true })).toBeVisible();
    const ownerPublicationLink = page.getByRole('link', {
      name: new RegExp(`${artworkName} published`),
    });
    await expectArtworkPreviewReady(
      ownerPublicationLink.getByTestId('artwork-envelope-preview'),
    );

    // 8. The immutable publication is publicly readable and its in-app
    // preview is renderer-derived even while the separate server thumbnail
    // pipeline remains pending.
    const publicDetail = await page.request.get(`/api/creation/publications/${publicationId}`);
    expect(publicDetail.status()).toBe(200);
    const publicDetailBody = await publicDetail.json();
    expect(publicDetailBody).toMatchObject({
      id: publicationId,
      title: `${artworkName} published`,
      thumbnailStatus: 'pending',
    });
    expect(publicDetailBody.formulaLicense).toBeNull();
    expect(publicDetailBody.formulaLicenseScope).toBeNull();
    expect(publicDetailBody.formulaSourceAttestationVersion).toBeNull();

    await page.goto('/en/gallery?view=community');
    const communityArtworkLink = page.getByRole('link', {
      name: new RegExp(`${artworkName} published`),
    });
    await expect(communityArtworkLink).toBeVisible({ timeout: 20000 });
    await expectArtworkPreviewReady(
      communityArtworkLink.getByTestId('artwork-envelope-preview'),
    );
    await expect(page.locator('img[src="/images/community-placeholder.svg"]')).toHaveCount(0);

    await Promise.all([
      page.waitForURL(`/en/gallery/community/${publicationId}`, { timeout: 20000 }),
      communityArtworkLink.click(),
    ]);
    await expect(
      page.getByRole('heading', { name: `${artworkName} published` }),
    ).toBeVisible({ timeout: 20000 });
    await expectArtworkPreviewReady(
      page.locator(`[data-preview-key="publication:${publicationId}"]`),
    );
    await expect(page.locator('img[src="/images/community-placeholder.svg"]')).toHaveCount(0);

    // 9. Withdraw is permanent: owner status remains as a tombstone while
    // the public detail stops resolving immediately. Lose the first response
    // after commit and require the client to converge with the same key.
    await page.goto('/en/gallery?view=mine');
    const withdrawKeys: string[] = [];
    let injectWithdrawLoss = true;
    await page.route('**/api/creation/publications/*/withdraw', async (route) => {
      if (!injectWithdrawLoss) {
        await route.continue();
        return;
      }
      withdrawKeys.push(route.request().headers()['idempotency-key'] ?? '');
      if (withdrawKeys.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        await route.abort('failed');
        return;
      }
      injectWithdrawLoss = false;
      await route.continue();
    });
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /^withdraw$/i }).click();
    await expect(page.getByRole('button', { name: /^withdraw$/i })).toHaveCount(0, {
      timeout: 15000,
    });
    expect(withdrawKeys).toHaveLength(2);
    expect(withdrawKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(withdrawKeys[1]).toBe(withdrawKeys[0]);
    await expect(page.getByText(/^Withdrawn /i)).toBeVisible();
    const ownerPublications = await page.request.get('/api/creation/publications');
    expect(ownerPublications.status()).toBe(200);
    const ownerPublicationBody = (await ownerPublications.json()) as {
      publications: Array<{ id: string; status: string }>;
    };
    expect(ownerPublicationBody.publications).toContainEqual(
      expect.objectContaining({ id: publicationId, status: 'withdrawn' }),
    );
    const withdrawnDetail = await page.request.get(
      `/api/creation/publications/${publicationId}`,
    );
    expect(withdrawnDetail.status()).toBe(404);

    // 10. Malformed withdraw ids are a stable client error, not a leaked
    // PostgREST/service failure.
    const malformedWithdraw = await page.evaluate(async () => {
      const response = await fetch('/api/creation/publications/not-a-uuid/withdraw', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      return { status: response.status, body: await response.json() };
    });
    expect(malformedWithdraw).toMatchObject({
      status: 400,
      body: { error: { code: 'validation_failed' } },
    });
    const malformedWithdrawKey = await page.evaluate(async (id) => {
      const response = await fetch(`/api/creation/publications/${id}/withdraw`, {
        method: 'POST',
        headers: { 'idempotency-key': 'not-a-uuid' },
      });
      return { status: response.status, body: await response.json() };
    }, publicationId);
    expect(malformedWithdrawKey).toMatchObject({
      status: 400,
      body: { error: { code: 'validation_failed' } },
    });

    // 11. Seed a canonical custom-formula draft through the authenticated
    // API. A formula publication must fail closed without the distinct MIT
    // source attestation while preserving the source draft.
    const formulaDocument = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    formulaDocument.formula.formulaId = 'e2e-cloud-formula';
    formulaDocument.metadata = { name: `${artworkName} formula` };
    const formulaEnvelopeResult = await createFractalDocumentEnvelope(formulaDocument, [
      {
        id: 'e2e-cloud-formula',
        name: 'E2E Cloud Formula',
        source: FORMULA_SOURCE,
      },
    ]);
    expect(formulaEnvelopeResult.success).toBe(true);
    if (!formulaEnvelopeResult.success) throw new Error('formula fixture failed');

    const formulaDraft = await page.evaluate(async (envelope) => {
      const response = await fetch('/api/creation/drafts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ envelope }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { draftId?: string; revision?: number; error?: string },
      };
    }, formulaEnvelopeResult.value);
    expect(formulaDraft.status).toBe(201);
    expect(formulaDraft.body.draftId).toMatch(/^[0-9a-f-]{36}$/);
    const formulaDraftId = formulaDraft.body.draftId;
    const formulaDraftRevision = formulaDraft.body.revision;
    if (!formulaDraftId || formulaDraftRevision === undefined) {
      throw new Error('formula draft response was incomplete');
    }

    const missingFormulaAttestation = await page.evaluate(
      async ({ draftId, revision, rightsVersion }) => {
        const response = await fetch(`/api/creation/drafts/${draftId}/publish`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedRevision: revision,
            title: 'Missing formula attestation',
            description: '',
            attestationVersion: rightsVersion,
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        draftId: formulaDraftId,
        revision: formulaDraftRevision,
        rightsVersion: RIGHTS_ATTESTATION_VERSION,
      },
    );
    expect(missingFormulaAttestation).toMatchObject({
      status: 400,
      body: { error: { code: 'validation_failed' } },
    });

    // 12. The UI now requires two independent confirmations. Publishing
    // freezes CC BY for the image and MIT/formula_source for the source.
    await page.goto('/en/gallery?view=mine');
    const formulaDraftRow = page.getByRole('button', {
      name: new RegExp(`${artworkName} formula`),
    });
    await expect(formulaDraftRow).toBeVisible({ timeout: 20000 });
    const formulaCard = formulaDraftRow.locator('xpath=..');
    await formulaCard.getByRole('button', { name: /^publish$/i }).click();
    const formulaDialog = page.getByRole('dialog');
    await formulaDialog.getByLabel(/^title$/i).fill(`${artworkName} formula published`);
    await expect(formulaDialog.locator('input[type="checkbox"]')).toHaveCount(2, {
      timeout: 15000,
    });
    await formulaDialog.locator('input[type="checkbox"]').nth(0).check();
    await formulaDialog.locator('input[type="checkbox"]').nth(1).check();
    const formulaPublishResponse = page.waitForResponse(
      (response) => response.url().endsWith('/publish') && response.request().method() === 'POST',
    );
    await formulaDialog.getByRole('button', { name: /^publish$/i }).click();
    const formulaPublished = await formulaPublishResponse;
    expect(formulaPublished.status()).toBe(201);
    const formulaPublishedBody = (await formulaPublished.json()) as { publicationId: string };
    const formulaPublicationId = formulaPublishedBody.publicationId;
    await expect(formulaDialog).toHaveCount(0, { timeout: 30000 });

    const formulaDetail = await page.request.get(
      `/api/creation/publications/${formulaPublicationId}`,
    );
    expect(formulaDetail.status()).toBe(200);
    await expect(formulaDetail.json()).resolves.toMatchObject({
      id: formulaPublicationId,
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      formulaLicense: 'MIT',
      formulaLicenseScope: 'formula_source',
      formulaSourceAttestationVersion: FORMULA_SOURCE_ATTESTATION_VERSION,
    });

    // The public page itself—not only the DTO—must render both legal layers
    // and expose the frozen source download.
    await page.goto(`/en/gallery/community/${formulaPublicationId}`);
    await expect(
      page.getByRole('heading', { name: `${artworkName} formula published` }),
    ).toBeVisible({ timeout: 30000 });
    await expectArtworkPreviewReady(page.getByTestId('artwork-envelope-preview'));
    await expect(page.getByRole('link', { name: 'MIT', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /download \.frm/i })).toHaveAttribute(
      'href',
      `/api/creation/publications/${formulaPublicationId}/formula-source`,
    );
    const formulaSource = await page.request.get(
      `/api/creation/publications/${formulaPublicationId}/formula-source`,
    );
    expect(formulaSource.status()).toBe(200);
    expect(await formulaSource.text()).toBe(FORMULA_SOURCE);

    // 13. Withdrawal also revokes the public formula source immediately.
    await page.goto('/en/gallery?view=mine');
    await expect(page.getByText(`${artworkName} formula published`, { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: /^withdraw$/i }).click();
    await expect(page.getByRole('button', { name: /^withdraw$/i })).toHaveCount(0, {
      timeout: 15000,
    });
    const revokedFormulaSource = await page.request.get(
      `/api/creation/publications/${formulaPublicationId}/formula-source`,
    );
    expect(revokedFormulaSource.status()).toBe(404);
  });
});
