import { beforeAll, describe, expect, it } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { compileFrm } from '@/engine/frm/compile';
import { pluginRegistry } from '@/engine/plugins/registry';
import { runtimeParamsToDocument } from '@/engine/document-adapter';
import { DEFAULT_MODERN_SMOOTH_STYLE } from '@/engine/document';
import { decodeParams, documentToExploreHref, documentToUrlState, encodeParams, savedFractalToHref } from '@/lib/url-params';

describe('url params m3 protocol', () => {
  it('round-trips the modern smooth style through compact URL state', () => {
    const query = encodeParams({
      coloringPipelineVersion: 2,
      modernColoring: {
        ...DEFAULT_MODERN_SMOOTH_STYLE,
        styleId: 'layeredOrbit',
        detail: { scale: 2.5, amount: 1.4, softness: 0.2 },
        post: { ...DEFAULT_MODERN_SMOOTH_STYLE.post, exposure: 0.8, toneMapping: 'filmic', dither: false },
      },
    });
    const decoded = decodeParams(query);
    expect(decoded.coloringPipelineVersion).toBe(2);
    expect(decoded.modernColoring?.styleId).toBe('layeredOrbit');
    expect(decoded.modernColoring?.detail).toEqual({ scale: 2.5, amount: 1.4, softness: 0.2 });
    expect(decoded.modernColoring?.post).toMatchObject({ exposure: 0.8, toneMapping: 'filmic', dither: false });
  });
  beforeAll(() => {
    registerBuiltins();
    const compiled = compileFrm(`FnSlotWeave {
init:
  z = pixel
loop:
  z = fn1(z) + p1
bailout:
  |z| < 24
}`, 'custom-fn-slot-weave');
    if (compiled.success && compiled.plugin) {
      pluginRegistry.register(compiled.plugin);
    }
  });

  it('round-trips formula, coloring, quality, and lighting fields', () => {
    const params = encodeParams({
      centerX: -0.743643,
      centerY: 0.131826,
      zoom: 1250,
      iterations: 640,
      julia: false,
      power: 2,
      formula: 'burningShip',
      outsideColoring: 'orbitTrap',
      insideColoring: 'atomDomain',
      orbitTrap: {
        shape: 'circle',
        point: [0.24, -0.18],
        radius: 0.42,
        width: 0.035,
      },
      useSSAA: true,
      adaptiveIterations: true,
      lighting: {
        enabled: true,
        mode: 'normalMap',
        azimuth: 125,
        elevation: 44,
        intensity: 0.77,
      },
    });

    const decoded = decodeParams(params);

    expect(decoded.formula).toBe('burningShip');
    expect(decoded.outsideColoring).toBe('orbitTrap');
    expect(decoded.insideColoring).toBe('atomDomain');
    expect(decoded.orbitTrap?.shape).toBe('circle');
    expect(decoded.useSSAA).toBe(true);
    expect(decoded.adaptiveIterations).toBe(true);
    expect(decoded.lighting?.enabled).toBe(true);
    expect(decoded.lighting?.azimuth).toBeCloseTo(125, 1);
    expect(decoded.lighting?.elevation).toBeCloseTo(44, 1);
    expect(decoded.lighting?.intensity).toBeCloseTo(0.77, 2);
  });

  it('omits default protocol fields from encoded params', () => {
    const params = encodeParams({
      formula: 'mandelbrot',
      outsideColoring: 'smooth',
      insideColoring: 'black',
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
    });

    expect(params.has('fm')).toBe(false);
    expect(params.has('oc')).toBe(false);
    expect(params.has('ic')).toBe(false);
    expect(params.has('ots')).toBe(false);
    expect(params.has('ssaa')).toBe(false);
    expect(params.has('ait')).toBe(false);
    expect(params.has('lg')).toBe(false);
    expect(params.has('lga')).toBe(false);
    expect(params.has('lge')).toBe(false);
    expect(params.has('lgi')).toBe(false);
  });

  it('decodes plugin formula IDs without registry validation', () => {
    // This test verifies the fix for the bug where plugin formulas
    // (like buffalo) were not decoded correctly when decodeParams
    // was called before plugins were registered.
    // See: https://github.com/noodle-bag/fractalpark/issues/31
    const params = new URLSearchParams();
    params.set('fm', 'buffalo');
    params.set('tr', 'kaleidoscope');
    params.set('oc', 'customPluginMode');
    params.set('ic', 'anotherCustomMode');

    const decoded = decodeParams(params);

    // Should accept plugin IDs even if registry hasn't been populated yet
    expect(decoded.formula).toBe('buffalo');
    expect(decoded.transformId).toBe('kaleidoscope');
    expect(decoded.outsideColoring).toBe('customPluginMode');
    expect(decoded.insideColoring).toBe('anotherCustomMode');
  });

  it('round-trips plugin formula and transform through URL', () => {
    // Test that plugin formulas can be encoded and decoded properly
    const original = {
      formula: 'buffalo',
      transformId: 'kaleidoscope',
      outsideColoring: 'stripe',
      insideColoring: 'finalOrbit',
    };

    const encoded = encodeParams(original);
    const decoded = decodeParams(encoded);

    expect(decoded.formula).toBe('buffalo');
    expect(decoded.transformId).toBe('kaleidoscope');
    expect(decoded.outsideColoring).toBe('stripe');
    expect(decoded.insideColoring).toBe('finalOrbit');
  });

  it('encodes active transform plugin params into URL state', () => {
    const encoded = encodeParams({
      formula: 'mandelbrot',
      outsideColoring: 'smooth',
      insideColoring: 'black',
      transformId: 'inversion',
      pluginParams: {
        u_invRadius: 1.35,
        u_invCenterX: 0.24,
        u_invCenterY: -0.18,
      },
    });

    expect(encoded.get('pp')).toContain('u_invRadius:1.35');
    expect(encoded.get('pp')).toContain('u_invCenterX:0.24');
    expect(encoded.get('pp')).toContain('u_invCenterY:-0.18');

    const decoded = decodeParams(encoded);
    expect(decoded.transformId).toBe('inversion');
    expect(decoded.pluginParams).toEqual({
      u_invRadius: 1.35,
      u_invCenterX: 0.24,
      u_invCenterY: -0.18,
    });
  });

  it('round-trips vector formula params through pp encoding', () => {
    const encoded = encodeParams({
      formula: 'custom-fn-slot-weave',
      pluginParams: {
        u_fn1: 3,
        u_p1: [0.25, -0.1],
      },
    });

    expect(encoded.get('pp')).toContain('u_fn1:3');
    expect(encoded.get('pp')).toContain('u_p1:0.25|-0.1');

    const decoded = decodeParams(encoded);
    expect(decoded.pluginParams).toEqual({
      u_fn1: 3,
      u_p1: [0.25, -0.1],
    });
  });

  it('projects FractalDocument to URL state and href', () => {
    const document = runtimeParamsToDocument({
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
    }, {
      animation: {
        keyframes: [
          { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'k2', bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.1 } },
        ],
      },
    });

    const urlState = documentToUrlState(document);
    const href = documentToExploreHref(document, 'zh');

    expect(urlState.formula).toBe('phoenix');
    expect(urlState.transformId).toBe('kaleidoscope');
    expect(urlState.keyframes).toHaveLength(2);
    expect(href.startsWith('/zh/explore?')).toBe(true);
  });

  it('builds saved fractal href through document projection', () => {
    const href = savedFractalToHref({
      id: 'saved-1',
      name: 'Saved',
      params: {
        maxIterations: 300,
        paletteIndex: 1,
        bounds: { centerX: -0.25, centerY: 0.1, zoom: 3, rotation: 0.2 },
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        customGradient: null,
        formula: 'mandelbrot',
        outsideColoring: 'smooth',
        insideColoring: 'black',
        transformId: 'none',
        pluginParams: {},
        orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
        useSSAA: false,
        adaptiveIterations: false,
        lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
      },
      createdAt: 1,
      thumbnail: '',
      starred: false,
      animation: {
        keyframes: [
          { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'b', bounds: { centerX: 0.5, centerY: -0.5, zoom: 4, rotation: 0.3 } },
        ],
      },
    }, 'en');

    expect(href.startsWith('/en/explore?')).toBe(true);
    expect(href.includes('kf=')).toBe(true);
  });
});
