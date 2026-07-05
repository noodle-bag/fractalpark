import { describe, expect, it } from 'vitest';
import { decodeParams, encodeParams } from '@/lib/url-params';
import { buildFractalParamsFromPresetQuery } from '@/lib/gallery-presets';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { migrateFractalDocument, normalizeFractalDocument, normalizeRuntimeFractalParams } from '@/engine/document-migrate';
import type { SavedFractal } from '@/engine/types';

describe('document migrate / normalize', () => {
  it('normalizes partial documents to schema v1 defaults', () => {
    const doc = normalizeFractalDocument({
      scene: {
        bounds: {
          centerX: -0.1,
        },
      },
      formula: {
        formulaId: 'mandelbrot',
      },
      render: {
        maxIterations: 320,
      },
    });

    expect(doc.schemaVersion).toBe(1);
    expect(doc.scene.bounds.centerX).toBe(-0.1);
    expect(doc.scene.bounds.centerY).toBe(0);
    expect(doc.scene.bounds.zoom).toBe(0.4);
    expect(doc.render.maxIterations).toBe(320);
    expect(doc.transform.transformId).toBe('none');
  });

  it('normalizes any document-like input to the current schema version', () => {
    const doc = normalizeFractalDocument({
      schemaVersion: 999,
      scene: {
        bounds: {
          centerX: -0.2,
        },
      },
    });

    expect(doc.schemaVersion).toBe(1);
    expect(doc.scene.bounds.centerX).toBe(-0.2);
  });

  it('clamps out-of-range values during normalization', () => {
    const doc = normalizeFractalDocument({
      scene: { bounds: { centerX: 0, centerY: 0, zoom: -999, rotation: 0 } },
      render: { maxIterations: 0, useSSAA: false, adaptiveIterations: false },
      coloring: {
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: -5,
          width: -0.1,
        },
      },
    });

    expect(doc.scene.bounds.zoom).toBe(0.000001);
    expect(doc.render.maxIterations).toBe(1);
    expect(doc.coloring.orbitTrap.radius).toBe(0);
    expect(doc.coloring.orbitTrap.width).toBe(0);
  });

  it('normalizes partial runtime params for defensive read paths', () => {
    const runtime = normalizeRuntimeFractalParams({
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
    });

    expect(runtime.maxIterations).toBe(320);
    expect(runtime.paletteIndex).toBe(2);
    expect(runtime.formula).toBe('phoenix');
    expect(runtime.bounds.centerX).toBe(-0.25);
    expect(runtime.bounds.centerY).toBe(0);
    expect(runtime.bounds.zoom).toBe(0.4);
    expect(runtime.orbitTrap.shape).toBe('circle');
    expect(runtime.orbitTrap.radius).toBe(0);
  });

  it('preserves vector plugin params during runtime normalization', () => {
    const runtime = normalizeRuntimeFractalParams({
      formula: 'custom-vector-test',
      pluginParams: {
        u_p1: [0.25, -0.4],
      },
    });

    expect(runtime.pluginParams).toEqual({
      u_p1: [0.25, -0.4],
    });
  });

  it('treats decoded URL state as v0 input and migrates to a normalized document', () => {
    const decoded = decodeParams(
      encodeParams({
        centerX: -0.743643,
        centerY: 0.131826,
        zoom: 1250,
        iterations: 640,
        formula: 'burningShip',
        outsideColoring: 'orbitTrap',
        insideColoring: 'atomDomain',
        keyframes: [
          {
            id: 'a',
            bounds: { centerX: -0.7, centerY: 0.1, zoom: 10, rotation: 0 },
          },
          {
            id: 'b',
            bounds: { centerX: -0.71, centerY: 0.11, zoom: 20, rotation: 0.1 },
          },
        ],
      })
    );

    const doc = migrateFractalDocument(decoded, 0);
    const runtime = documentToRuntimeParams(doc);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.metadata?.source).toBe('shared');
    expect(doc.animation?.keyframes).toHaveLength(2);
    expect(runtime.formula).toBe('burningShip');
    expect(runtime.outsideColoring).toBe('orbitTrap');
    expect(runtime.insideColoring).toBe('atomDomain');
    expect(runtime.maxIterations).toBe(640);
  });

  it('migrates builtin preset query through document and back to runtime', () => {
    const parsed = buildFractalParamsFromPresetQuery(
      'cx=-0.5&cy=0&z=2.00&iter=300&fm=buffalo&tr=kaleidoscope'
    );

    const doc = migrateFractalDocument(parsed.params, 0);
    const runtime = documentToRuntimeParams(doc);

    expect(doc.schemaVersion).toBe(1);
    expect(runtime.formula).toBe('buffalo');
    expect(runtime.transformId).toBe('kaleidoscope');
    expect(runtime.maxIterations).toBe(300);
  });

  it('migrates v0 FractalDocument inputs to the current schema version', () => {
    const doc = migrateFractalDocument({
      schemaVersion: 0,
      scene: {
        bounds: {
          centerX: -0.123,
          centerY: 0.456,
          zoom: 8,
        },
      },
      formula: {
        formulaId: 'phoenix',
      },
      coloring: {},
      transform: {},
      render: {},
    });

    expect(doc.schemaVersion).toBe(1);
    expect(doc.scene.bounds.centerX).toBe(-0.123);
    expect(doc.scene.bounds.centerY).toBe(0.456);
    expect(doc.scene.bounds.zoom).toBe(8);
    expect(doc.formula.formulaId).toBe('phoenix');
  });

  it('migrates legacy saved fractals through document and preserves metadata', () => {
    const legacy: SavedFractal = {
      id: 'saved-1',
      name: 'Legacy Saved',
      params: {
        maxIterations: 280,
        paletteIndex: 1,
        bounds: { centerX: 0.25, centerY: -0.1, zoom: 3, rotation: 0.2 },
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
      createdAt: 1234567890,
      thumbnail: 'data:image/jpeg;base64,abc',
      starred: true,
      animation: {
        keyframes: [
          { id: 'k1', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'k2', bounds: { centerX: 0.1, centerY: -0.1, zoom: 2, rotation: 0 } },
        ],
      },
    };

    const doc = migrateFractalDocument(legacy, 0);
    const runtime = documentToRuntimeParams(doc);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.metadata?.name).toBe('Legacy Saved');
    expect(doc.metadata?.createdAt).toBe(1234567890);
    expect(doc.metadata?.source).toBe('saved');
    expect(doc.animation?.keyframes).toHaveLength(2);
    expect(runtime.bounds.centerX).toBe(0.25);
    expect(runtime.maxIterations).toBe(280);
  });

  it('throws for unsupported future FractalDocument schema versions', () => {
    expect(() =>
      migrateFractalDocument({
        schemaVersion: 2,
        scene: { bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
        formula: { formulaId: 'mandelbrot', isJulia: false, juliaC: [-0.7, 0.27], power: 2 },
        coloring: {
          paletteIndex: 0,
          customGradient: null,
          outsideColoringId: 'smooth',
          insideColoringId: 'black',
          orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
          lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
        },
        transform: { transformId: 'none' },
        render: { maxIterations: 200, useSSAA: false, adaptiveIterations: false },
      })
    ).toThrow(/Unsupported FractalDocument schemaVersion: 2/);
  });
});
