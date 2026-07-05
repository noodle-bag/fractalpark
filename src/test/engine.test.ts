import { describe, it, expect } from 'vitest';
import { PALETTES } from '@/engine/palettes';
import type { FractalParams, ViewBounds } from '@/engine/types';

describe('Palettes', () => {
  it('should have exactly 5 palettes', () => {
    expect(PALETTES).toHaveLength(5);
  });

  it('should have unique indices 0-4', () => {
    const indices = PALETTES.map((p) => p.index);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('should have non-empty names and keys', () => {
    for (const palette of PALETTES) {
      expect(palette.name.length).toBeGreaterThan(0);
      expect(palette.key.length).toBeGreaterThan(0);
      expect(palette.key).toContain('explore.palettes.');
    }
  });

  it('should include all expected palettes', () => {
    const names = PALETTES.map((p) => p.name);
    expect(names).toContain('Inferno');
    expect(names).toContain('Ocean');
    expect(names).toContain('Spectrum');
    expect(names).toContain('Sakura');
    expect(names).toContain('Moonlight');
  });
});

describe('Types', () => {
  it('should allow valid FractalParams', () => {
    const params: FractalParams = {
      maxIterations: 200,
      paletteIndex: 0,
      bounds: { centerX: -0.5, centerY: 0, zoom: 1.0 },
      isJulia: false,
      juliaC: [-0.7, 0.27],
      power: 2,
      customGradient: null,
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
    };
    expect(params.maxIterations).toBe(200);
    expect(params.paletteIndex).toBe(0);
    expect(params.bounds.centerX).toBe(-0.5);
  });

  it('should handle ViewBounds correctly', () => {
    const bounds: ViewBounds = { centerX: 0, centerY: 0, zoom: 1 };
    expect(bounds.zoom).toBeGreaterThan(0);

    const zoomed: ViewBounds = { ...bounds, zoom: bounds.zoom * 1.1 };
    expect(zoomed.zoom).toBeCloseTo(1.1);
  });

  it('should handle coordinate transforms', () => {
    const bounds: ViewBounds = { centerX: -0.5, centerY: 0, zoom: 0.8 };
    const canvasWidth = 800;
    const canvasHeight = 600;
    const minDim = Math.min(canvasWidth, canvasHeight);

    const pixelX = 400;
    const pixelY = 300;
    const complexX = (pixelX - canvasWidth / 2) / (bounds.zoom * minDim) + bounds.centerX;
    const complexY = (pixelY - canvasHeight / 2) / (bounds.zoom * minDim) + bounds.centerY;

    expect(complexX).toBeCloseTo(-0.5);
    expect(complexY).toBeCloseTo(0);
  });
});
