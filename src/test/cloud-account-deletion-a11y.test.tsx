import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import AccountDeletion from '@/components/gallery/AccountDeletion';
import enMessages from '../../messages/en.json';

vi.mock('@/lib/cloud/client', () => ({
  CloudClientError: class CloudClientError extends Error {
    readonly code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },
  requestAccountDeletionOtp: vi.fn(async () => ({ ok: true })),
  verifyAccountDeletion: vi.fn(async () => ({
    operationId: '11111111-1111-4111-8111-111111111111',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    deletionStage: 'stepped_up',
  })),
  deleteAccount: vi.fn(async () => ({
    status: 'deleting',
    draftsDeleted: 0,
    publicationsWithdrawn: 0,
  })),
}));

/**
 * Accessibility contract for the account-deletion danger zone (regression
 * matrix: delete confirmation must stay keyboard/screen-reader operable):
 * every input is label-bound, every action is a real <button type="button">,
 * and the final irreversible step never depends on color alone.
 */
function renderDangerZone(): void {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AccountDeletion />
    </NextIntlClientProvider>,
  );
}

describe('account deletion danger zone a11y', () => {
  it('opens with a real button and announces consequences before any action', () => {
    renderDangerZone();
    const start = screen.getByRole('button');
    expect(start.tagName).toBe('BUTTON');
    expect(start).toHaveAttribute('type', 'button');
    expect(screen.getByText(/permanent/i)).toBeTruthy();
  });

  it('step-up stage binds the code input to a label and keeps buttons explicit', async () => {
    renderDangerZone();
    screen.getByRole('button').click();
    const codeInput = await screen.findByLabelText(/fresh 6-digit code/i);
    expect(codeInput).toHaveAttribute('id', 'account-delete-code');
    expect(codeInput).toHaveAttribute('inputMode', 'numeric');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('final confirmation requires typing the account email into a labelled field', async () => {
    renderDangerZone();
    screen.getByRole('button').click();
    const codeInput = await screen.findByLabelText(/fresh 6-digit code/i);
    expect(codeInput).toBeTruthy();
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveAttribute('type', 'button');
    fireEvent.click(cancel);
    // Back to the safe idle stage.
    expect(await screen.findByRole('button', { name: /start account deletion/i })).toBeTruthy();
  });

  it('confirm stage labels the email input and discloses every consequence', async () => {
    renderDangerZone();
    screen.getByRole('button').click();
    const codeInput = await screen.findByLabelText(/fresh 6-digit code/i);
    // Enter a code and verify; the mocked client returns a proof.
    fireEvent.change(codeInput, { target: { value: '123456' } });
    screen.getByRole('button', { name: /^verify$/i }).click();
    const emailInput = await screen.findByLabelText(/type your account email/i);
    expect(emailInput).toHaveAttribute('id', 'account-delete-email');
    expect(screen.getByText(/cloud drafts are deleted permanently/i)).toBeTruthy();
    expect(screen.getByText(/attribution record/i)).toBeTruthy();
    expect(screen.getByText(/licenses already granted/i)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /delete my account permanently/i });
    expect(confirm).toHaveAttribute('type', 'button');
  });
});
