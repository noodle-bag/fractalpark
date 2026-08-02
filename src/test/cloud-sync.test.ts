import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
const getDraftMock = vi.fn();

vi.mock('@/lib/cloud/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/cloud/client')>();
  return {
    ...original,
    createDraft: (...args: unknown[]) => createDraftMock(...args),
    updateDraft: (...args: unknown[]) => updateDraftMock(...args),
    getDraft: (...args: unknown[]) => getDraftMock(...args),
  };
});

import { CloudClientError } from '@/lib/cloud/client';
import { importArtworkToCloud, openCloudDraft, syncArtworkToCloud, thumbnailToBase64 } from '@/lib/cloud/sync';

const ENVELOPE = { envelopeVersion: 1, document: { schemaVersion: 2 } };

beforeEach(() => {
  createDraftMock.mockReset();
  updateDraftMock.mockReset();
  getDraftMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('thumbnailToBase64', () => {
  it('strips the data URL prefix and passes raw base64 through', () => {
    expect(thumbnailToBase64('data:image/png;base64,QUJD')).toBe('QUJD');
    expect(thumbnailToBase64('QUJD')).toBe('QUJD');
    expect(thumbnailToBase64('')).toBeUndefined();
  });
});

describe('syncArtworkToCloud', () => {
  it('creates when unbound and returns a fresh binding', async () => {
    createDraftMock.mockResolvedValue({ draftId: 'd-1', revision: 1 });
    const outcome = await syncArtworkToCloud({ envelope: ENVELOPE, thumbnail: 'data:image/png;base64,QUJD', binding: null });
    expect(outcome).toMatchObject({ kind: 'synced', binding: { draftId: 'd-1', revision: 1 } });
    expect(createDraftMock).toHaveBeenCalledWith({ envelope: ENVELOPE, thumbnailBase64: 'QUJD' });
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it('updates with the recorded revision when bound', async () => {
    updateDraftMock.mockResolvedValue({ draftId: 'd-1', revision: 4 });
    const outcome = await syncArtworkToCloud({
      envelope: ENVELOPE,
      thumbnail: '',
      binding: { draftId: 'd-1', revision: 3, syncedAt: 1 },
    });
    expect(outcome).toMatchObject({ kind: 'synced', binding: { draftId: 'd-1', revision: 4 } });
    expect(updateDraftMock).toHaveBeenCalledWith('d-1', {
      envelope: ENVELOPE,
      expectedRevision: 3,
      thumbnailBase64: undefined,
    });
  });

  it('maps revision_conflict to the conflict outcome without retry', async () => {
    updateDraftMock.mockRejectedValue(new CloudClientError('revision_conflict'));
    const outcome = await syncArtworkToCloud({
      envelope: ENVELOPE,
      thumbnail: '',
      binding: { draftId: 'd-1', revision: 3, syncedAt: 1 },
    });
    expect(outcome.kind).toBe('conflict');
  });

  it('maps quota_exceeded, cloud_disabled, and offline distinctly', async () => {
    createDraftMock.mockRejectedValueOnce(new CloudClientError('quota_exceeded'));
    expect((await syncArtworkToCloud({ envelope: ENVELOPE, thumbnail: '', binding: null })).kind).toBe('quota');

    createDraftMock.mockRejectedValueOnce(new CloudClientError('cloud_disabled'));
    expect((await syncArtworkToCloud({ envelope: ENVELOPE, thumbnail: '', binding: null })).kind).toBe('disabled');

    createDraftMock.mockRejectedValueOnce(new CloudClientError('offline'));
    expect(await syncArtworkToCloud({ envelope: ENVELOPE, thumbnail: '', binding: null })).toMatchObject({
      kind: 'failed',
      reason: 'offline',
    });
  });

  it('maps a vanished bound draft to failed/not_found (never silently recreates)', async () => {
    updateDraftMock.mockRejectedValue(new CloudClientError('not_found'));
    const outcome = await syncArtworkToCloud({
      envelope: ENVELOPE,
      thumbnail: '',
      binding: { draftId: 'd-1', revision: 3, syncedAt: 1 },
    });
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'not_found' });
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it('non-client errors degrade to unavailable', async () => {
    createDraftMock.mockRejectedValue(new Error('boom'));
    expect(await syncArtworkToCloud({ envelope: ENVELOPE, thumbnail: '', binding: null })).toMatchObject({
      kind: 'failed',
      reason: 'unavailable',
    });
  });
});

describe('importArtworkToCloud', () => {
  it('creates a new draft (never updates, even if a binding existed before)', async () => {
    createDraftMock.mockResolvedValue({ draftId: 'd-9', revision: 1 });
    const outcome = await importArtworkToCloud({ envelope: ENVELOPE, thumbnail: '' });
    expect(outcome).toMatchObject({ kind: 'synced', binding: { draftId: 'd-9' } });
    expect(updateDraftMock).not.toHaveBeenCalled();
  });
});

describe('openCloudDraft', () => {
  it('returns envelope, revision, and title for hydration', async () => {
    getDraftMock.mockResolvedValue({
      id: 'd-1',
      title: '深空螺旋',
      revision: 2,
      configBytes: 100,
      thumbnailBytes: 0,
      hasThumbnail: false,
      remixSource: null,
      createdAt: 'x',
      updatedAt: 'y',
      envelope: ENVELOPE,
      thumbnailPath: null,
    });
    await expect(openCloudDraft('d-1')).resolves.toEqual({
      envelope: ENVELOPE,
      revision: 2,
      title: '深空螺旋',
    });
  });

  it('propagates uniform not_found', async () => {
    getDraftMock.mockRejectedValue(new CloudClientError('not_found'));
    await expect(openCloudDraft('missing')).rejects.toMatchObject({ code: 'not_found' });
  });
});
