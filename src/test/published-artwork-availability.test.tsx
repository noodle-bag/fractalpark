import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublishedArtworkAvailability } from '@/hooks/usePublishedArtworkAvailability';
import type { PublishedArtworkRuntimeAvailability, PublishedArtworkRuntimeInput } from '@/lib/published-artwork-runtime';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { projectDocumentToRuntimeParams } from '@/engine/document-adapter';

const resolveAvailability = vi.hoisted(() => vi.fn());
vi.mock('@/lib/published-artwork-runtime', () => ({ resolvePublishedArtworkRuntimeAvailability: resolveAvailability }));
const artwork = (id: string): PublishedArtworkRuntimeInput => ({
  params: projectDocumentToRuntimeParams(DEFAULT_FRACTAL_DOCUMENT), runtimeFormula: { runtimeId: id },
});

describe('published artwork availability UI', () => {
  beforeEach(() => resolveAvailability.mockReset());

  it('uses shared qualification and keeps a runtime load failure over late availability', async () => {
    let finish!: (value: PublishedArtworkRuntimeAvailability) => void;
    resolveAvailability.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const input = artwork('lambda');
    const { result } = renderHook(() => usePublishedArtworkAvailability(input));
    await waitFor(() => expect(resolveAvailability).toHaveBeenCalledWith(input));
    act(() => result.current.onUnavailable('formula-load-failed'));
    await act(async () => finish({ available: true }));
    expect(result.current.availability).toEqual({ available: false, reason: 'formula-load-failed' });
  });

  it('ignores old qualification and old canvas failures after switching artwork', async () => {
    let finish!: (value: PublishedArtworkRuntimeAvailability) => void;
    resolveAvailability.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ available: true });
    const first = artwork('magnet1'), next = artwork('lambda');
    const { result, rerender } = renderHook(({ input }) => usePublishedArtworkAvailability(input), { initialProps: { input: first } });
    await waitFor(() => expect(resolveAvailability).toHaveBeenCalledWith(first));
    const oldFailure = result.current.onUnavailable;
    rerender({ input: next });
    await waitFor(() => expect(result.current.availability).toEqual({ available: true }));
    await act(async () => finish({ available: false, reason: 'julia-unsupported' }));
    act(() => oldFailure('formula-load-failed'));
    expect(result.current.availability).toEqual({ available: true });
  });

  it('distinguishes unsupported Julia from a failed library request', async () => {
    resolveAvailability.mockResolvedValueOnce({ available: false, reason: 'julia-unsupported' }).mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(({ input }) => usePublishedArtworkAvailability(input), { initialProps: { input: artwork('magnet1') } });
    await waitFor(() => expect(result.current.availability).toEqual({ available: false, reason: 'julia-unsupported' }));
    rerender({ input: artwork('lambda') });
    await waitFor(() => expect(result.current.availability).toEqual({ available: false, reason: 'library-unavailable' }));
  });
});
