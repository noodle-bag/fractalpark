import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';

const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
const getDraftMock = vi.fn();

vi.mock('@/lib/cloud/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloud/client')>();
  return {
    ...actual,
    createDraft: (...args: unknown[]) => createDraftMock(...args),
    updateDraft: (...args: unknown[]) => updateDraftMock(...args),
    getDraft: (...args: unknown[]) => getDraftMock(...args),
  };
});

import { useCloudDraftSession } from '@/hooks/useCloudDraftSession';
import { CloudClientError } from '@/lib/cloud/client';

function makeInput(name = 'My draft') {
  return {
    name,
    document: DEFAULT_FRACTAL_DOCUMENT,
    thumbnail: '',
    formulaAssets: [],
  };
}

beforeEach(() => {
  createDraftMock.mockReset();
  updateDraftMock.mockReset();
  getDraftMock.mockReset();
});

describe('useCloudDraftSession (spec §17)', () => {
  it('creates a draft and adopts the new identity', async () => {
    createDraftMock.mockResolvedValueOnce({ draftId: 'd-1', revision: 1 });
    const { result } = renderHook(() => useCloudDraftSession());
    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.saveDraft(makeInput());
    });
    expect(outcome?.ok).toBe(true);
    expect(result.current.identity).toEqual({ id: 'd-1', revision: 1 });
    expect(result.current.savePhase).toBe('saved');
    expect(result.current.draftTitle).toBe('My draft');
    const createInput = createDraftMock.mock.calls[0][0] as {
      envelope: { document: { metadata?: { name?: string } } };
    };
    expect(createInput.envelope.document.metadata?.name).toBe('My draft');
  });

  it('patches with expectedRevision and maps revision_conflict', async () => {
    createDraftMock.mockResolvedValueOnce({ draftId: 'd-1', revision: 1 });
    const { result } = renderHook(() => useCloudDraftSession());
    await act(async () => {
      await result.current.saveDraft(makeInput());
    });
    updateDraftMock.mockRejectedValueOnce(new CloudClientError('revision_conflict'));
    await act(async () => {
      const outcome = await result.current.saveDraft(makeInput());
      expect(outcome.ok).toBe(false);
      // B1 regression lock: the classified phase rides the return value —
      // the UI must never read render-time state for this.
      if (!outcome.ok) expect(outcome.phase).toBe('conflict');
    });
    expect(result.current.savePhase).toBe('conflict');
    expect(updateDraftMock.mock.calls[0][0]).toBe('d-1');
    expect((updateDraftMock.mock.calls[0][1] as { expectedRevision: number }).expectedRevision).toBe(1);
  });

  it('maps quota, offline, and expired sessions to distinct phases', async () => {
    const { result } = renderHook(() => useCloudDraftSession());
    createDraftMock.mockRejectedValueOnce(new CloudClientError('quota_exceeded'));
    let outcome!: Awaited<ReturnType<typeof result.current.saveDraft>>;
    await act(async () => {
      outcome = await result.current.saveDraft(makeInput());
    });
    expect(result.current.savePhase).toBe('quota');
    if (!outcome.ok) expect(outcome.phase).toBe('quota');

    createDraftMock.mockRejectedValueOnce(new CloudClientError('offline'));
    await act(async () => {
      outcome = await result.current.saveDraft(makeInput());
    });
    expect(result.current.savePhase).toBe('offline');
    if (!outcome.ok) expect(outcome.phase).toBe('offline');

    createDraftMock.mockRejectedValueOnce(new CloudClientError('unauthenticated'));
    await act(async () => {
      outcome = await result.current.saveDraft(makeInput());
    });
    expect(result.current.savePhase).toBe('session_expired');
    if (!outcome.ok) expect(outcome.phase).toBe('session_expired');
  });

  it('save-as-new creates synchronously even while state still holds the old identity', async () => {
    createDraftMock
      .mockResolvedValueOnce({ draftId: 'd-1', revision: 1 })
      .mockResolvedValueOnce({ draftId: 'd-2', revision: 1 });
    const { result } = renderHook(() => useCloudDraftSession());
    await act(async () => {
      await result.current.saveDraft(makeInput());
    });
    expect(result.current.identity?.id).toBe('d-1');
    await act(async () => {
      const outcome = await result.current.saveAsNewDraft(makeInput('Fork'));
      expect(outcome.ok).toBe(true);
    });
    // Regression guard: save-as-new must CREATE (second createDraft call),
    // never PATCH the conflicted original.
    expect(createDraftMock).toHaveBeenCalledTimes(2);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(result.current.identity?.id).toBe('d-2');
  });

  it('loads a draft and parses the envelope; not_found maps distinctly', async () => {
    const envelope = (await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []));
    if (!envelope.success) throw new Error('fixture envelope failed');
    getDraftMock.mockResolvedValueOnce({
      id: 'd-9',
      title: 'Loaded',
      revision: 3,
      envelope: envelope.value,
      remixSource: null,
      configBytes: 10,
      thumbnailBytes: 0,
      hasThumbnail: false,
      createdAt: '',
      updatedAt: '',
    });
    const { result } = renderHook(() => useCloudDraftSession());
    await act(async () => {
      const loaded = await result.current.loadDraft('d-9');
      expect(loaded?.title).toBe('Loaded');
    });
    expect(result.current.identity).toEqual({ id: 'd-9', revision: 3 });
    expect(result.current.loadState).toBe('ready');

    getDraftMock.mockRejectedValueOnce(new CloudClientError('not_found'));
    await act(async () => {
      const loaded = await result.current.loadDraft('gone');
      expect(loaded).toBeNull();
    });
    expect(result.current.loadState).toBe('not_found');
  });

  it('conflict reload re-reads the remote and adopts its revision', async () => {
    createDraftMock.mockResolvedValueOnce({ draftId: 'd-1', revision: 1 });
    const { result } = renderHook(() => useCloudDraftSession());
    await act(async () => {
      await result.current.saveDraft(makeInput());
    });
    updateDraftMock.mockRejectedValueOnce(new CloudClientError('revision_conflict'));
    await act(async () => {
      await result.current.saveDraft(makeInput());
    });
    expect(result.current.savePhase).toBe('conflict');

    const envelope = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
    if (!envelope.success) throw new Error('fixture envelope failed');
    getDraftMock.mockResolvedValueOnce({
      id: 'd-1',
      title: 'Remote newer',
      revision: 5,
      envelope: envelope.value,
      remixSource: null,
      configBytes: 10,
      thumbnailBytes: 0,
      hasThumbnail: false,
      createdAt: '',
      updatedAt: '',
    });
    await act(async () => {
      const loaded = await result.current.reloadConflictDraft();
      expect(loaded?.title).toBe('Remote newer');
    });
    await waitFor(() => expect(result.current.identity?.revision).toBe(5));
    expect(result.current.savePhase).toBe('idle');
  });
});
