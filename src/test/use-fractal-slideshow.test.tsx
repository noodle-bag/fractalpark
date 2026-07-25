import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedFractal } from '@/engine/types';
import { useFractalSlideshow } from '@/hooks/useFractalSlideshow';

const FIRST_PRESET: SavedFractal = {
  id: 'first-real-preset',
  name: 'First Real Preset',
  params: {
    maxIterations: 200,
    paletteIndex: 2,
    bounds: { centerX: 0.2, centerY: -0.1, zoom: 2, rotation: 0 },
    isJulia: false,
    juliaC: [-0.7, 0.27],
    power: 2,
    customGradient: null,
    formula: 'newton3',
    outsideColoring: 'smooth',
    insideColoring: 'black',
    orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
    useSSAA: false,
    adaptiveIterations: false,
    lighting: {
      enabled: false,
      mode: 'normalMap',
      azimuth: 45,
      elevation: 35,
      intensity: 0.65,
    },
    transformId: 'none',
    pluginParams: {},
  },
  createdAt: 1,
  thumbnail: '',
  starred: false,
};

describe('useFractalSlideshow', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the placeholder hidden until the first real preset is installed', () => {
    const { result, rerender } = renderHook(
      ({ fractals }: { fractals: SavedFractal[] }) =>
        useFractalSlideshow({ fractals }),
      {
        initialProps: { fractals: [] },
      }
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.fractalA.id).toBe('placeholder');

    act(() => {
      rerender({ fractals: [FIRST_PRESET] });
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.fractalA).toBe(FIRST_PRESET);
    expect(result.current.boundsA).toEqual(FIRST_PRESET.params.bounds);
  });
});
