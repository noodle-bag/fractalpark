import { act, renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { useExploreDocumentState } from '@/hooks/useExploreDocumentState';
import { ARTWORK_STORAGE_KEY } from '@/lib/artwork-repository';
import envelopeFixture from './fixtures/documents/envelope-v1.json';

describe('useExploreDocumentState', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  it('initializes canonical document state from URL params', () => {
    const searchParams = new URLSearchParams(
      'cx=-0.7436438870&cy=0.1318259040&z=1250.00&iter=640&julia=1&jre=-0.620000&jim=0.410000&fm=phoenix&oc=st&ic=fo&tr=kaleidoscope&ssaa=1&ait=1'
    );

    const { result } = renderHook(() => useExploreDocumentState(searchParams));

    expect(result.current.document.scene.bounds.centerX).toBe(-0.743643887);
    expect(result.current.document.formula.formulaId).toBe('phoenix');
    expect(result.current.document.formula.isJulia).toBe(true);
    expect(result.current.document.transform.transformId).toBe('kaleidoscope');
    expect(result.current.runtimeParams.maxIterations).toBe(640);
    expect(result.current.runtimeParams.useSSAA).toBe(true);
  });

  it('updates document domains and keeps runtime params in sync', () => {
    const { result } = renderHook(() => useExploreDocumentState(new URLSearchParams()));

    act(() => {
      result.current.updateBounds({ centerX: 1.25, centerY: -0.5, zoom: 8, rotation: 0.4 });
      result.current.updateFormula({
        formulaId: 'phoenix',
        isJulia: true,
        juliaC: [-0.4, 0.6],
        params: {
          formula: {
            u_phoenixP: -0.33,
            u_p1: [0.2, -0.15],
          },
        },
      });
      result.current.updateColoring({
        outsideColoringId: 'orbitTrap',
        params: {
          outside: {
            u_orbitTrapHueShift: 0.4,
          },
        },
      });
      result.current.updateTransform({
        transformId: 'kaleidoscope',
        params: {
          transform: {
            u_kaleidoFold: 7,
          },
        },
      });
      result.current.updateRender({ maxIterations: 420, useSSAA: true, adaptiveIterations: true });
      result.current.updateAnimation({
        viewKeyframes: [
          { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'k2', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.2 } },
        ],
      });
    });

    expect(result.current.document.scene.bounds.zoom).toBe(8);
    expect(result.current.document.formula.params?.formula).toEqual({ u_phoenixP: -0.33, u_p1: [0.2, -0.15] });
    expect(result.current.document.coloring.params?.outside).toEqual({ u_orbitTrapHueShift: 0.4 });
    expect(result.current.document.transform.params?.transform).toEqual({ u_kaleidoFold: 7 });
    expect(result.current.document.animation?.viewKeyframes).toHaveLength(2);

    expect(result.current.runtimeParams.formula).toBe('phoenix');
    expect(result.current.runtimeParams.transformId).toBe('kaleidoscope');
    expect(result.current.runtimeParams.pluginParams).toEqual({
      u_phoenixP: -0.33,
      u_p1: [0.2, -0.15],
      u_orbitTrapHueShift: 0.4,
      u_kaleidoFold: 7,
    });
    expect(result.current.runtimeParams.maxIterations).toBe(420);
    expect(result.current.runtimeParams.useSSAA).toBe(true);
  });

  it('opens a Document artwork from the current storage key', () => {
    const storage = new Map<string, string>([
      [
        ARTWORK_STORAGE_KEY,
        JSON.stringify([
          {
            recordVersion: 1,
            id: 'document-open',
            name: 'Document Open',
            envelope: envelopeFixture,
            createdAt: 1,
            updatedAt: 2,
            thumbnail: '',
            starred: false,
          },
        ]),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });

    const { result } = renderHook(() =>
      useExploreDocumentState(new URLSearchParams('artwork=document-open'))
    );

    expect(result.current.document.formula.formulaId).toBe('custom-fixture');
    expect(result.current.document.assets?.formula?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.current.runtimeParams.maxIterations).toBe(200);
  });
});
