import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKeyframeAnimation } from '@/hooks/useKeyframeAnimation';
import { interpolateAtTime } from '@/engine/animation/interpolate';
import type { AnimationPlaybackSpeed } from '@/engine/animation/playback';

vi.mock('@/engine/animation/interpolate', () => ({
  buildTimeline: vi.fn(() => []),
  totalDuration: vi.fn(() => 12),
  interpolateAtTime: vi.fn(() => ({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 })),
}));

afterEach(() => vi.unstubAllGlobals());

describe('useKeyframeAnimation shared playback clock', () => {
  it('maps real output time to canonical time and preserves position across speed changes', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const keyframes = [
      { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
      { id: 'b', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0 } },
    ];
    const onFrame = vi.fn();
    const initialProps: { speed: AnimationPlaybackSpeed } = { speed: 4 };
    const { rerender } = renderHook(
      ({ speed }) => useKeyframeAnimation({ keyframes, onFrame, active: true, speed }),
      { initialProps },
    );

    act(() => callbacks.shift()?.(0));
    act(() => callbacks.shift()?.(1000));
    expect(interpolateAtTime).toHaveBeenLastCalledWith([], 12, 4);

    rerender({ speed: 2 });
    act(() => callbacks.shift()?.(2000));
    expect(interpolateAtTime).toHaveBeenLastCalledWith([], 12, 4);
  });
});
