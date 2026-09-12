import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSessionProvider, useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { PublishDialog } from '@/components/gallery/PublishDialog';
import type { CloudDraftSummary } from '@/lib/cloud/client';
import enMessages from '../../messages/en.json';

const cloudMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getProfile: vi.fn(),
  getDraft: vi.fn(),
  publishDraft: vi.fn(),
  setDisplayName: vi.fn(),
}));

vi.mock('@/lib/cloud/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloud/client')>();
  return { ...actual, ...cloudMocks };
});

function SessionTrigger() {
  const { state, openSignIn } = useCloudSession();
  return (
    <button type="button" onClick={() => openSignIn()}>
      {state.status === 'anonymous' ? 'Open sign in' : state.status}
    </button>
  );
}

function renderMessages(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.__fractalparkAnalyticsConsent = true;
  window.gtag = vi.fn();
  cloudMocks.getSession.mockResolvedValue(null);
  cloudMocks.requestOtp.mockResolvedValue(undefined);
  cloudMocks.verifyOtp.mockResolvedValue({ userId: 'user-1' });
  cloudMocks.getProfile.mockResolvedValue({
    displayName: 'Creator',
    backupEmailMode: 'publish_only',
  });
  cloudMocks.getDraft.mockRejectedValue(new Error('probe unavailable'));
  cloudMocks.publishDraft.mockResolvedValue({
    publicationId: 'publication-1',
    status: 'published',
    title: 'Draft',
    thumbnailStatus: 'pending',
    publishedAt: '2026-09-10T00:00:00.000Z',
    backupEmailStatus: 'sent',
  });
});

describe('cloud funnel analytics', () => {
  it('records only successful OTP request and verification boundaries', async () => {
    renderMessages(
      <CloudSessionProvider>
        <SessionTrigger />
      </CloudSessionProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open sign in' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'auth_otp_requested',
      expect.objectContaining({ locale: 'en' }),
    ));
    fireEvent.change(await screen.findByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'auth_otp_verified',
      expect.objectContaining({ locale: 'en' }),
    ));
    expect(JSON.stringify(vi.mocked(window.gtag).mock.calls)).not.toContain(
      'person@example.com',
    );
  });

  it('records publish and its final backup result after success', async () => {
    const draft: CloudDraftSummary = {
      id: 'draft-1',
      title: 'Draft',
      revision: 2,
      configBytes: 100,
      thumbnailBytes: 0,
      hasThumbnail: false,
      remixSource: null,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    const onPublished = vi.fn();
    renderMessages(
      <PublishDialog
        draft={draft}
        onClose={vi.fn()}
        onPublished={onPublished}
      />,
    );

    await screen.findByDisplayValue('Draft');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'artwork_published',
      expect.objectContaining({}),
    );
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'backup_email_result',
      expect.objectContaining({ status: 'sent' }),
    );
  });
});
