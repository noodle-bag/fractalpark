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

  it('applies a built-in default profile without changing excluded domains', () => {
    const { result } = renderHook(() => useExploreDocumentState(new URLSearchParams()));

    act(() => {
      result.current.updateBounds({ centerX: 2, centerY: -3, zoom: 9, rotation: 0.5 });
      result.current.updateFormula({
        formulaId: 'phoenix',
        isJulia: true,
        juliaC: [0.4, -0.6],
        power: 4,
        params: { formula: { u_phoenixP: -0.25 } },
      });
      result.current.updateColoring({
        pipelineVersion: 2,
        paletteIndex: 9,
        outsideColoringId: 'orbitTrap',
        insideColoringId: 'finalOrbit',
        style: {
          styleId: 'bands',
          detail: { scale: 2 },
        },
        params: {
          outside: { u_outsideStale: 1 },
          inside: { u_insideStale: 2 },
          coloringScript: { u_scriptStale: 3 },
        },
      });
      result.current.updateTransform({
        transformId: 'kaleidoscope',
        params: { transform: { u_kaleidoFold: 7 } },
      });
      result.current.updateRender({
        maxIterations: 640,
        useSSAA: true,
        adaptiveIterations: true,
      });
      result.current.updateAnimation({
        viewKeyframes: [
          { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'b', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.2 } },
        ],
      });
    });

    act(() => {
      result.current.selectBuiltInFormula('tricorn');
    });

    expect(result.current.document.scene.bounds).toEqual({
      centerX: -0.2481627018,
      centerY: 0.1162892546,
      zoom: 0.22,
      rotation: 0.5,
    });
    expect(result.current.document.formula).toEqual({
      formulaId: 'tricorn',
      isJulia: false,
      juliaC: [-0.7, 0.27],
      power: 2,
      params: { formula: undefined },
    });
    expect(result.current.document.coloring).toMatchObject({
      pipelineVersion: 1,
      paletteIndex: 0,
      customGradient: null,
      outsideColoringId: 'smooth',
      insideColoringId: 'black',
      orbitTrap: {
        shape: 'point',
        point: [0, 0],
        radius: 0.35,
        width: 0.02,
      },
      lighting: {
        enabled: false,
        mode: 'normalMap',
        azimuth: 45,
        elevation: 35,
        intensity: 0.65,
      },
      params: {
        outside: undefined,
        inside: undefined,
        coloringScript: undefined,
      },
    });
    expect(result.current.document.coloring.style).toBeUndefined();
    expect(result.current.runtimeParams.pluginParams).toEqual({
      u_kaleidoFold: 7,
    });

    expect(result.current.document.transform).toEqual({
      transformId: 'kaleidoscope',
      params: { transform: { u_kaleidoFold: 7 } },
    });
    expect(result.current.document.render).toEqual({
      maxIterations: 640,
      useSSAA: true,
      adaptiveIterations: true,
    });
    expect(result.current.document.animation?.viewKeyframes).toHaveLength(2);
  });

  it('applies the Quad Julia URL profile while preserving transform, render, and animation', () => {
    const searchParams = new URLSearchParams(
      'fm=phoenix&tr=kaleidoscope&iter=640&ssaa=1&ait=1'
    );
    const { result } = renderHook(() => useExploreDocumentState(searchParams));

    act(() => {
      result.current.updateFormula({
        isJulia: true,
        juliaC: [0.4, -0.6],
        power: 4,
        params: { formula: { u_staleFormulaParam: 1 } },
      });
      result.current.updateColoring({
        pipelineVersion: 2,
        paletteIndex: 9,
        outsideColoringId: 'orbitTrap',
        insideColoringId: 'finalOrbit',
        params: {
          outside: { u_staleOutsideParam: 1 },
          inside: { u_staleInsideParam: 2 },
        },
      });
      result.current.updateAnimation({
        viewKeyframes: [
          { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'b', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.2 } },
        ],
      });
    });

    act(() => {
      result.current.selectBuiltInFormula('quadJulia');
    });

    expect(result.current.document.scene.bounds).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 0.27,
      rotation: 0,
    });
    expect(result.current.document.formula).toEqual({
      formulaId: 'quadJulia',
      isJulia: false,
      juliaC: [-0.7, 0.27],
      power: 2,
      params: { formula: undefined },
    });
    expect(result.current.document.coloring).toMatchObject({
      pipelineVersion: 1,
      paletteIndex: 0,
      customGradient: null,
      outsideColoringId: 'smooth',
      insideColoringId: 'black',
      params: {
        outside: undefined,
        inside: undefined,
      },
    });
    expect(result.current.document.transform.transformId).toBe('kaleidoscope');
    expect(result.current.document.render).toEqual({
      maxIterations: 640,
      useSSAA: true,
      adaptiveIterations: true,
    });
    expect(result.current.document.animation?.viewKeyframes).toHaveLength(2);
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
