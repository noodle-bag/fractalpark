import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeParamsToDocument } from '@/engine/document-adapter';
import { useSavedFractals } from '@/hooks/useSavedFractals';

describe('useSavedFractals', () => {
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

  it('normalizes malformed saved fractal params on read while preserving gallery metadata', () => {
    localStorage.setItem(
      'myfrac-saved-fractals',
      JSON.stringify([
        {
          id: 'legacy-1',
          name: 'Legacy Broken Save',
          params: {
            maxIterations: 320,
            paletteIndex: 2,
            formula: 'phoenix',
            bounds: {
              centerX: -0.25,
            },
            orbitTrap: {
              shape: 'circle',
              radius: -5,
            },
          },
          createdAt: 1234567890,
          thumbnail: 'data:image/jpeg;base64,legacy',
          starred: true,
        },
      ])
    );

    const { result } = renderHook(() => useSavedFractals());
    const fractal = result.current.fractals[0];

    expect(fractal).toBeDefined();
    expect(fractal?.id).toBe('legacy-1');
    expect(fractal?.name).toBe('Legacy Broken Save');
    expect(fractal?.createdAt).toBe(1234567890);
    expect(fractal?.thumbnail).toBe('data:image/jpeg;base64,legacy');
    expect(fractal?.starred).toBe(true);

    expect(fractal?.params.maxIterations).toBe(320);
    expect(fractal?.params.paletteIndex).toBe(2);
    expect(fractal?.params.formula).toBe('phoenix');
    expect(fractal?.params.bounds.centerX).toBe(-0.25);
    expect(fractal?.params.bounds.centerY).toBe(0);
    expect(fractal?.params.bounds.zoom).toBe(0.4);
    expect(fractal?.params.orbitTrap.shape).toBe('circle');
    expect(fractal?.params.orbitTrap.radius).toBe(0);
    expect(fractal?.params.outsideColoring).toBe('smooth');
    expect(fractal?.params.insideColoring).toBe('black');
  });

  it('saves FractalDocument through legacy saved projection', () => {
    const { result } = renderHook(() => useSavedFractals());
    const document = runtimeParamsToDocument(
      {
        maxIterations: 420,
        paletteIndex: 2,
        bounds: { centerX: -0.5, centerY: 0.2, zoom: 12, rotation: 0.3 },
        isJulia: true,
        juliaC: [-0.62, 0.41],
        power: 2,
        customGradient: null,
        formula: 'phoenix',
        outsideColoring: 'stripe',
        insideColoring: 'finalOrbit',
        transformId: 'kaleidoscope',
        pluginParams: { u_phoenixP: -0.33, u_kaleidoFold: 8 },
        orbitTrap: {
          shape: 'circle',
          point: [0.1, -0.2],
          radius: 0.45,
          width: 0.05,
        },
        useSSAA: true,
        adaptiveIterations: true,
        lighting: {
          enabled: true,
          mode: 'normalMap',
          azimuth: 120,
          elevation: 38,
          intensity: 0.72,
        },
      },
      {
        animation: {
          keyframes: [
            { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
            { id: 'k2', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.2 } },
          ],
        },
      }
    );

    act(() => {
      result.current.saveDocument('Doc Save', document, 'data:image/jpeg;base64,doc');
    });

    const fractal = result.current.fractals[0];
    expect(fractal?.name).toBe('Doc Save');
    expect(fractal?.params.formula).toBe('phoenix');
    expect(fractal?.params.transformId).toBe('kaleidoscope');
    expect(fractal?.animation?.keyframes).toHaveLength(2);
  });
});
