import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedFractal } from '@/engine/types';
import { useGalleryItems } from '@/hooks/useGalleryItems';

vi.mock('@/hooks/useBuiltinPresets', () => ({
  useBuiltinPresets: () => ({
    presets: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('useGalleryItems', () => {
  let storage = new Map<string, string>();

  beforeEach(() => {
    storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it('should remove user fractals from items immediately', async () => {
    const saved: SavedFractal[] = [
      {
        id: 'saved-1',
        name: 'Saved One',
        params: {
          maxIterations: 200,
          paletteIndex: 0,
          bounds: { centerX: -0.5, centerY: 0, zoom: 0.4 },
          isJulia: false,
          juliaC: [0, 0],
          power: 2,
          customGradient: null,
          formula: 'mandelbrot',
          outsideColoring: 'smooth',
          insideColoring: 'black',
          transformId: 'none',
          pluginParams: {},
          orbitTrap: {
            shape: 'point',
            point: [0, 0],
            radius: 0.35,
            width: 0.02,
          },
          useSSAA: false,
          adaptiveIterations: false,
          lighting: {
            enabled: false,
            mode: 'normalMap',
            azimuth: 45,
            elevation: 35,
            intensity: 0.65,
          },
        },
        createdAt: 1,
        thumbnail: 'data:image/jpeg;base64,test',
        starred: false,
      },
    ];

    localStorage.setItem('myfrac-saved-fractals', JSON.stringify(saved));

    const { result } = renderHook(() => useGalleryItems({ locale: 'en' }));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.remove('saved-1');
    });

    expect(result.current.items).toHaveLength(0);
    expect(localStorage.getItem('myfrac-saved-fractals')).toBe('[]');
  });

  it('should rename user fractals in items immediately', async () => {
    const saved: SavedFractal[] = [
      {
        id: 'saved-2',
        name: 'Before Rename',
        params: {
          maxIterations: 200,
          paletteIndex: 0,
          bounds: { centerX: -0.5, centerY: 0, zoom: 0.4 },
          isJulia: false,
          juliaC: [0, 0],
          power: 2,
          customGradient: null,
          formula: 'mandelbrot',
          outsideColoring: 'smooth',
          insideColoring: 'black',
          transformId: 'none',
          pluginParams: {},
          orbitTrap: {
            shape: 'point',
            point: [0, 0],
            radius: 0.35,
            width: 0.02,
          },
          useSSAA: false,
          adaptiveIterations: false,
          lighting: {
            enabled: false,
            mode: 'normalMap',
            azimuth: 45,
            elevation: 35,
            intensity: 0.65,
          },
        },
        createdAt: 1,
        thumbnail: 'data:image/jpeg;base64,test',
        starred: false,
      },
    ];

    localStorage.setItem('myfrac-saved-fractals', JSON.stringify(saved));

    const { result } = renderHook(() => useGalleryItems({ locale: 'en' }));

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('Before Rename');
    });

    act(() => {
      result.current.rename('saved-2', 'After Rename');
    });

    expect(result.current.items[0]?.name).toBe('After Rename');
  });
});
