import { beforeAll, describe, expect, it } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import type { FractalParams, Keyframe } from '@/engine/types';
import {
  documentToRuntimeParams,
  runtimeParamsToDocument,
  urlStateToDocument,
} from '@/engine/document-adapter';
import { DEFAULT_MODERN_SMOOTH_STYLE } from '@/engine/document';

describe('document adapter', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  it('round-trips runtime params through FractalDocument', () => {
    const runtime: FractalParams = {
      maxIterations: 420,
      paletteIndex: 2,
      bounds: {
        centerX: -0.743643887,
        centerY: 0.131825904,
        zoom: 1250,
        rotation: 0.5,
      },
      isJulia: true,
      juliaC: [-0.62, 0.41],
      power: 2,
      customGradient: [
        { position: 0, color: '#000000' },
        { position: 1, color: '#ffffff' },
      ],
      formula: 'phoenix',
      outsideColoring: 'stripe',
      insideColoring: 'finalOrbit',
      transformId: 'kaleidoscope',
      pluginParams: {
        u_phoenixP: -0.33,
        u_p1: [0.125, -0.25],
        u_kaleidoFold: 8,
      },
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
    };

    const keyframes: Keyframe[] = [
      {
        id: 'kf-1',
        bounds: { centerX: -0.7, centerY: 0.1, zoom: 200, rotation: 0 },
      },
      {
        id: 'kf-2',
        bounds: { centerX: -0.72, centerY: 0.12, zoom: 800, rotation: 0.2 },
      },
    ];

    const doc = runtimeParamsToDocument(runtime, {
      animation: { keyframes },
      metadata: { source: 'saved' },
    });

    expect(doc.formula.params?.formula).toEqual({ u_phoenixP: -0.33, u_p1: [0.125, -0.25] });
    expect(doc.transform.params?.transform).toEqual({ u_kaleidoFold: 8 });
    expect(doc.animation?.keyframes).toHaveLength(2);
    expect(doc.metadata?.source).toBe('saved');

    const roundTripped = documentToRuntimeParams(doc);

    expect(roundTripped).toEqual(runtime);
  });

  it('maps decoded URL state to a document with defaults', () => {
    const doc = urlStateToDocument({
      centerX: -0.3,
      centerY: 0.2,
      zoom: 50,
      formula: 'buffalo',
      outsideColoring: 'tia',
      transformId: 'none',
      pluginParams: {
        u_unknownCustomParam: 3.5,
      },
      keyframes: [
        {
          id: 'k1',
          bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
        },
        {
          id: 'k2',
          bounds: { centerX: 1, centerY: 1, zoom: 2, rotation: 0.1 },
        },
      ],
    });

    expect(doc.scene.bounds.centerX).toBe(-0.3);
    expect(doc.formula.formulaId).toBe('buffalo');
    expect(doc.coloring.outsideColoringId).toBe('tia');
    expect(doc.formula.params?.formula).toEqual({ u_unknownCustomParam: 3.5 });
    expect(doc.animation?.keyframes).toHaveLength(2);
    expect(doc.render.maxIterations).toBe(200);
  });

  it('round-trips explicit modern coloring without changing legacy runtime fields', () => {
    const runtime: FractalParams = {
      maxIterations: 200,
      paletteIndex: 0,
      bounds: { centerX: -0.5, centerY: 0, zoom: 0.4 },
      isJulia: false,
      juliaC: [-0.7, 0.27],
      power: 2,
      customGradient: null,
      formula: 'mandelbrot',
      outsideColoring: 'smooth',
      insideColoring: 'black',
      orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
      useSSAA: false,
      adaptiveIterations: false,
      lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
      coloringPipelineVersion: 2,
      modernColoring: {
        ...DEFAULT_MODERN_SMOOTH_STYLE,
        post: { ...DEFAULT_MODERN_SMOOTH_STYLE.post, exposure: 1.25, toneMapping: 'filmic' },
      },
    };

    const document = runtimeParamsToDocument(runtime);
    expect(document.coloring.pipelineVersion).toBe(2);
    expect(document.coloring.style?.post.exposure).toBe(1.25);
    expect(documentToRuntimeParams(document)).toMatchObject({
      ...runtime,
      bounds: { ...runtime.bounds, rotation: 0 },
      transformId: 'none',
    });
  });
});
