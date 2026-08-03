import { test, expect, type Page } from '@playwright/test';

/**
 * Cloud drafts journey (v0.4.16 cloud-first): anonymous save triggers the
 * OTP dialog and the frozen write resumes after verification; the draft
 * identity pins to `?draft=`; reopening loads from the cloud; a second
 * save moves the revision; delete clears the row. Runs only with the real
 * local Supabase stack up and .env.local present (Mailpit on :54324).
 */

async function waitForFractalCanvasReady(page: Page) {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
}

async function readOtpCode(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await page.request.get('http://127.0.0.1:54324/api/v1/messages?limit=1');
    const body = (await res.json()) as { messages: Array<{ ID: string; Text?: string }> };
    if (body.messages.length > 0) {
      const match = (body.messages[0].Text ?? '').match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await page.waitForTimeout(500);
  }
  throw new Error('no OTP email');
}

async function completeOtp(page: Page, email: string) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /send code/i }).click();
  const code = await readOtpCode(page);
  await page.getByLabel(/six-digit code/i).fill(code);
  // Scoped to the dialog: the navbar's anonymous-state "Sign in" button
  // matches the same regex while the OTP dialog is open (review blocking).
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^sign in$/i })
    .click();
}

test.describe('Cloud drafts journey', () => {
  test('anonymous save resumes after OTP, revision moves, delete', async ({ page }) => {
    test.setTimeout(240000);
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

    // 7. Delete the cloud draft: the row is gone, no local copy remains.
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByText(/no cloud drafts yet/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: new RegExp(artworkName) })).toHaveCount(0);
  });
});
