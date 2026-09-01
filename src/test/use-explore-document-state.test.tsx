import { act, renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { useExploreDocumentState } from '@/hooks/useExploreDocumentState';

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

  it('consumes a valid Remix source without changing decoded render state', () => {
    const baseline = renderHook(() =>
      useExploreDocumentState(new URLSearchParams('fm=tricorn&z=4'))
    );
    const remixed = renderHook(() =>
      useExploreDocumentState(
        new URLSearchParams(
          'fm=tricorn&z=4&remix=formula%3Atricorn'
        )
      )
    );

    expect(remixed.result.current.runtimeParams).toEqual(
      baseline.result.current.runtimeParams
    );
    expect(remixed.result.current.document.metadata).toMatchObject({
      source: 'remix',
      sourceId: 'formula:tricorn',
    });
  });

  it('ignores an invalid Remix source for legacy URL compatibility', () => {
    const { result } = renderHook(() =>
      useExploreDocumentState(
        new URLSearchParams('fm=tricorn&remix=formula%3Aunknown')
      )
    );

    expect(result.current.document.formula.formulaId).toBe('tricorn');
    expect(result.current.document.metadata?.source).toBe('shared');
    expect(result.current.document.metadata?.sourceId).toBeUndefined();
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

  it('replaces plugin parameter domains atomically while preserving coloring-script state', () => {
    const { result } = renderHook(() =>
      useExploreDocumentState(
        new URLSearchParams(
          'fm=phoenix&oc=st&tr=polar&pp=u_phoenixP:-0.2,u_stripeDensity:6,u_polarAngleScale:1.5,unknown:1',
        ),
      ),
    );

    act(() => {
      result.current.updateColoring({
        params: { coloringScript: { u_scriptOwned: 2 } },
      });
      result.current.replacePluginParamDomains({
        formula: { u_phoenixP: -0.2 },
        outside: { u_stripeDensity: 6 },
        transform: { u_polarAngleScale: 1.5 },
      });
    });

    expect(result.current.document.formula.params?.formula).toEqual({
      u_phoenixP: -0.2,
    });
    expect(result.current.document.coloring.params).toEqual({
      outside: { u_stripeDensity: 6 },
      inside: undefined,
      coloringScript: { u_scriptOwned: 2 },
    });
    expect(result.current.document.transform.params?.transform).toEqual({
      u_polarAngleScale: 1.5,
    });
    expect(result.current.runtimeParams.pluginParams).toEqual({
      u_phoenixP: -0.2,
      u_stripeDensity: 6,
      u_scriptOwned: 2,
      u_polarAngleScale: 1.5,
    });
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

  it('applies a published formula profile atomically and supports one-step undo', () => {
    const { result } = renderHook(() =>
      useExploreDocumentState(
        new URLSearchParams(
          'fm=phoenix&cx=1&cy=-2&z=8&iter=640&julia=0&oc=st&tr=polar&ssaa=1&ait=1&pp=u_phoenixP:-0.2,u_stripeDensity:6,u_polarAngleScale:1.5',
        ),
      ),
    );

    act(() => {
      result.current.updateTransform({
        params: { transform: { u_polarAngleScale: 1.5 } },
      });
      result.current.updateAnimation({
        viewKeyframes: [
          { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'b', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.2 } },
        ],
      });
    });
    const previous = structuredClone(result.current.document);

    act(() => {
      result.current.applyPublishedFormulaSelection({
        formulaId: '0d5e8e2e-45bd-5a45-beab-2f989d765db4',
        formulaParams: { frmV1_scale: [0.25, 0] },
        profile: {
          schema: 'fractalpark-published-formula-profile/v1',
          quality: 'mechanical',
          mode: 'julia',
          center: [0.1, -0.2],
          zoom: 0.4,
          rotation: 0.3,
          iterations: 96,
          juliaC: [-0.8, 0.156],
        },
      });
    });

    expect(result.current.document.scene.bounds).toEqual({
      centerX: 0.1,
      centerY: -0.2,
      zoom: 0.4,
      rotation: 0.3,
    });
    expect(result.current.document.formula).toMatchObject({
      formulaId: '0d5e8e2e-45bd-5a45-beab-2f989d765db4',
      isJulia: true,
      juliaC: [-0.8, 0.156],
      params: { formula: { frmV1_scale: [0.25, 0] } },
    });
    expect(result.current.document.render).toEqual({
      maxIterations: 96,
      useSSAA: true,
      adaptiveIterations: true,
    });
    expect(result.current.document.coloring).toEqual(previous.coloring);
    expect(result.current.document.transform).toEqual(previous.transform);
    expect(result.current.document.animation).toEqual(previous.animation);
    expect(result.current.canUndoPublishedFormulaSelection).toBe(true);

    act(() => {
      result.current.replacePluginParamDomains({
        formula: { frmV1_scale: [0.5, 0] },
        transform: { u_polarAngleScale: 1.75 },
      });
    });
    expect(result.current.canUndoPublishedFormulaSelection).toBe(true);

    act(() => {
      result.current.undoPublishedFormulaSelection();
    });

    expect(result.current.document).toEqual(previous);
    expect(result.current.canUndoPublishedFormulaSelection).toBe(false);
  });

  it('invalidates the one-step formula undo after a later document edit', () => {
    const { result } = renderHook(() => useExploreDocumentState(new URLSearchParams()));

    act(() => {
      result.current.applyPublishedFormulaSelection({
        formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
        formulaParams: {},
        profile: {
          schema: 'fractalpark-published-formula-profile/v1',
          quality: 'mechanical',
          mode: 'parameter-plane',
          center: [-0.5, 0],
          zoom: 0.4,
          rotation: 0,
          iterations: 96,
        },
      });
    });
    expect(result.current.canUndoPublishedFormulaSelection).toBe(true);

    act(() => {
      result.current.updateBounds({
        ...result.current.document.scene.bounds,
        zoom: 0.8,
      });
    });
    expect(result.current.canUndoPublishedFormulaSelection).toBe(false);
  });

  it('notifies synchronously for manual mutations but not published atomic maintenance', () => {
    const onBeforeDocumentMutation = vi.fn();
    const { result } = renderHook(() =>
      useExploreDocumentState(new URLSearchParams(), onBeforeDocumentMutation),
    );

    act(() => {
      result.current.applyPublishedFormulaSelection({
        formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
        formulaParams: {},
        profile: {
          schema: 'fractalpark-published-formula-profile/v1',
          quality: 'mechanical',
          mode: 'parameter-plane',
          center: [-0.5, 0],
          zoom: 0.4,
          rotation: 0,
          iterations: 96,
        },
      });
      result.current.replacePluginParamDomains({ formula: {} });
    });
    expect(onBeforeDocumentMutation).not.toHaveBeenCalled();

    act(() => {
      result.current.updateBounds({
        ...result.current.document.scene.bounds,
        zoom: 0.8,
      });
    });
    expect(onBeforeDocumentMutation).toHaveBeenCalledTimes(1);
  });

  it('keeps the dormant Julia constant when a parameter-plane profile omits it', () => {
    const { result } = renderHook(() => useExploreDocumentState(new URLSearchParams()));

    act(() => {
      result.current.updateFormula({ isJulia: true, juliaC: [0.4, -0.6] });
      result.current.applyPublishedFormulaSelection({
        formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
        formulaParams: {},
        profile: {
          schema: 'fractalpark-published-formula-profile/v1',
          quality: 'mechanical',
          mode: 'parameter-plane',
          center: [-0.5, 0],
          zoom: 0.4,
          rotation: 0,
          iterations: 96,
        },
      });
    });

    expect(result.current.document.formula.isJulia).toBe(false);
    expect(result.current.document.formula.juliaC).toEqual([0.4, -0.6]);
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

});
