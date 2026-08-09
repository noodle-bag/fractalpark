import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityGrid } from '@/components/gallery/CommunityGrid';
import { MyWorksCloud } from '@/components/gallery/MyWorksCloud';
import enMessages from '../../messages/en.json';

const cloudMocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listDrafts: vi.fn(),
  listPublications: vi.fn(),
  listCommunity: vi.fn(),
  getDraft: vi.fn(),
  getCommunityPublication: vi.fn(),
  setBackupEmailMode: vi.fn(),
  deleteDraft: vi.fn(),
  withdrawPublication: vi.fn(),
}));

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => ({
    state: { status: 'authenticated', userId: 'user-1' },
    openSignIn: vi.fn(),
  }),
}));

vi.mock('@/components/gallery/ArtworkEnvelopePreview', () => ({
  ArtworkEnvelopePreview: ({ previewKey }: { previewKey: string }) => (
    <div data-testid="mock-artwork-preview" data-preview-key={previewKey} />
  ),
}));

vi.mock('@/components/gallery/PublishDialog', () => ({
  PublishDialog: () => null,
}));

vi.mock('@/lib/cloud/client', () => ({
  CloudClientError: class CloudClientError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  ...cloudMocks,
}));

function renderWithMessages(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cloudMocks.getProfile.mockResolvedValue({ displayName: 'Creator', backupEmailMode: 'off' });
  cloudMocks.listDrafts.mockResolvedValue([
    {
      id: 'draft-1',
      title: 'Draft Mosaic',
      revision: 3,
      configBytes: 100,
      thumbnailBytes: 0,
      hasThumbnail: false,
      remixSource: null,
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T01:00:00.000Z',
    },
  ]);
  cloudMocks.listPublications.mockResolvedValue([
    {
      id: 'publication-1',
      title: 'Published Mosaic',
      description: null,
      status: 'published',
      authorDisplayName: 'Creator',
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      thumbnailStatus: 'pending',
      remixSource: null,
      publishedAt: '2026-08-09T02:00:00.000Z',
      withdrawnAt: null,
    },
  ]);
  cloudMocks.listCommunity.mockResolvedValue({
    items: [
      {
        id: 'publication-1',
        title: 'Published Mosaic',
        description: null,
        authorDisplayName: 'Creator',
        license: 'CC-BY-4.0',
        licenseScope: 'artwork_image',
        thumbnailStatus: 'pending',
        remixSource: null,
        publishedAt: '2026-08-09T02:00:00.000Z',
      },
    ],
    nextCursor: null,
  });
});

describe('cloud artwork cards', () => {
  it('shows Cloud Drafts and Published as Collection-style 16:10 preview cards', async () => {
    const { container } = renderWithMessages(<MyWorksCloud />);

    expect(await screen.findByText('Draft Mosaic')).toBeVisible();
    expect(await screen.findByText('Published Mosaic')).toBeVisible();

    const previews = screen.getAllByTestId('mock-artwork-preview');
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute('data-preview-key', 'draft:draft-1:3');
    expect(previews[1]).toHaveAttribute('data-preview-key', 'publication:publication-1');
    for (const preview of previews) {
      expect(preview.parentElement).toHaveClass('aspect-[16/10]');
    }
    expect(screen.getByRole('button', { name: /Draft Mosaic/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Published Mosaic/ })).toHaveAttribute(
      'href',
      '/gallery/community/publication-1',
    );
    expect(container.querySelector('[src="/images/community-placeholder.svg"]')).toBeNull();
  });

  it('renders Community cards with the same 16:10 preview frame and no placeholder image', async () => {
    const { container } = renderWithMessages(<CommunityGrid />);

    await waitFor(() => expect(screen.getByText('Published Mosaic')).toBeVisible());
    const preview = screen.getByTestId('mock-artwork-preview');
    expect(preview).toHaveAttribute('data-preview-key', 'publication:publication-1');
    expect(preview.parentElement).toHaveClass('aspect-[16/10]');
    expect(screen.getByRole('link', { name: /Published Mosaic/ })).toHaveAttribute(
      'href',
      '/gallery/community/publication-1',
    );
    expect(container.querySelector('[src="/images/community-placeholder.svg"]')).toBeNull();
  });
});
