import { test, expect, type Page } from '@playwright/test';

/**
 * Cloud drafts journey (v0.4.15 PR 2 / commit 6) against the real local
 * Supabase stack: anonymous local save, contextual OTP sign-in (code read
 * from Mailpit), import to cloud, open draft, save again (revision moves),
 * delete. Runs only with the stack up and .env.local present.
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

test.describe('Cloud drafts journey', () => {
  test('anonymous save, sign in, sync, edit, delete', async ({ page }) => {
    test.setTimeout(240000);
    const email = `cloud-e2e-${Date.now()}@example.com`;
    const artworkName = `E2E Cloud ${Date.now() % 100000}`;

    // 1. Anonymous: save works locally, no cloud affordance in the toast.
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    await page.getByRole('button', { name: /save to gallery/i }).click();
    await page.getByLabel(/name/i).fill(artworkName);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/saved to gallery/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/synced to cloud/i)).toHaveCount(0);

    // 2. My Works anonymous: sign-in card visible, no drafts section.
    await page.goto('/en/gallery?view=mine');
    await expect(page.getByRole('button', { name: /sign in to sync/i })).toBeVisible();
    await expect(page.getByText('Cloud drafts')).toHaveCount(0);

    // 3. Contextual OTP: email -> Mailpit code -> signed in.
    await page.getByRole('button', { name: /sign in to sync/i }).click();
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /send code/i }).click();
    const code = await readOtpCode(page);
    await page.getByLabel(/six-digit code/i).fill(code);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByText('Cloud drafts')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/no cloud drafts yet/i)).toBeVisible();

    // 4. The local artwork from step 1 is offered for sync; import it.
    await expect(page.getByText(/not yet synced/i)).toBeVisible();
    await page.getByRole('button', { name: /sync to cloud/i }).first().click();
    // The draft row is a button ("{title} rev N · date"); the local card is
    // a link — scoping by role avoids strict-mode ambiguity.
    const draftRow = page.getByRole('button', { name: new RegExp(artworkName) });
    await expect(draftRow).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/rev 1/)).toBeVisible();

    // 5. Open the draft: lands in the editor through the local recovery copy.
    await draftRow.click();
    await page.waitForURL(/\/en\/explore\?artwork=/, { timeout: 20000 });
    await waitForFractalCanvasReady(page);

    // 6. Save again: in-place update, cloud revision moves to 2.
    await page.getByRole('button', { name: /save to gallery/i }).click();
    await page.getByLabel(/name/i).fill(`${artworkName} v2`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/synced to cloud/i)).toBeVisible({ timeout: 20000 });

    // 7. My Works shows the moved revision.
    await page.goto('/en/gallery?view=mine');
    await expect(page.getByRole('button', { name: new RegExp(`${artworkName} v2`) })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/rev 2/)).toBeVisible();

    // 8. Delete the cloud draft; the local copy stays and can re-sync.
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByText(/no cloud drafts yet/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not yet synced/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: `${artworkName} v2` })).toBeVisible();
  });
});
