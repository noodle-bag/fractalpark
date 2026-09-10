import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityArtworkActions } from '@/components/gallery/CommunityArtworkActions';
import { createDraft, getCommunityPublication } from '@/lib/cloud/client';

const push = vi.fn();
const openSignIn = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => ({
    state: { status: 'authenticated' },
    openSignIn,
  }),
}));

vi.mock('@/lib/cloud/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/cloud/client')>();
  return {
    ...original,
    createDraft: vi.fn(),
    getCommunityPublication: vi.fn(),
  };
});

describe('CommunityArtworkActions analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__fractalparkAnalyticsConsent = true;
    window.gtag = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.mocked(getCommunityPublication).mockResolvedValue({
      envelope: {},
    } as Awaited<ReturnType<typeof getCommunityPublication>>);
    vi.mocked(createDraft).mockResolvedValue({
      draftId: '11111111-2222-3333-4444-555555555555',
      revision: 1,
    });
  });

  it('records copy-link only after the clipboard write succeeds', async () => {
    render(
      <CommunityArtworkActions
        publicationId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        title="Example"
        pageUrl="https://www.fractalpark.com/en/community/example"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));

    await waitFor(() => expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'copy_page_link',
      expect.objectContaining({ publication_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    ));
  });

  it('separates community Remix start from successful draft completion', async () => {
    render(
      <CommunityArtworkActions
        publicationId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        title="Example"
        pageUrl="https://www.fractalpark.com/en/community/example"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'remix' }));

    await waitFor(() => expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'community_remix_started',
      expect.objectContaining({ publication_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    ));
    await waitFor(() => expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'remix_complete',
      expect.objectContaining({
        source_type: 'publication',
        source_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        completion_surface: 'cloud_draft',
      }),
    ));
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'cloud_draft_saved',
      expect.objectContaining({ is_first_save: true }),
    );
    expect(push).toHaveBeenCalledWith(
      '/en/explore?draft=11111111-2222-3333-4444-555555555555',
    );
  });

  it('does not record Remix completion when draft creation fails', async () => {
    vi.mocked(createDraft).mockRejectedValue(new Error('unavailable'));
    render(
      <CommunityArtworkActions
        publicationId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        title="Example"
        pageUrl="https://www.fractalpark.com/en/community/example"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'remix' }));
    await waitFor(() => expect(createDraft).toHaveBeenCalled());

    expect(window.gtag).not.toHaveBeenCalledWith(
      'event',
      'remix_complete',
      expect.anything(),
    );
  });
});
