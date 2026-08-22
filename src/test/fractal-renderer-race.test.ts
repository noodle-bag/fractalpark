import { beforeAll, describe, expect, it, vi } from 'vitest';

import { FractalRenderer } from '@/engine/fractals/renderer';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { ShaderCache } from '@/engine/shaders/cache';
import type { FractalParams } from '@/engine/types';

function createMockGl(): WebGLRenderingContext {
  return {
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    canvas: { width: 64, height: 64 },
    createBuffer: vi.fn(() => ({}) as WebGLBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => -1),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
  } as unknown as WebGLRenderingContext;
}

function params(formula: FractalParams['formula']): FractalParams {
  return {
    maxIterations: 100,
    paletteIndex: 0,
    bounds: { centerX: -0.5, centerY: 0, zoom: 1 },
    isJulia: false,
    juliaC: [-0.7, 0.27],
    power: 2,
    customGradient: null,
    formula,
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
}

describe('FractalRenderer render supersession', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  it('never draws an older shader after a newer render request', async () => {
    const gl = createMockGl();
    const renderer = new FractalRenderer(gl);
    const cache = (renderer as unknown as { cache: ShaderCache }).cache;
    type Compiled = Awaited<ReturnType<ShaderCache['compileWithMetrics']>>;
    const finish = new Map<string, (compiled: Compiled) => void>();
    vi.spyOn(cache, 'compileWithMetrics').mockImplementation(
      async (_key, _source, formulaId) =>
        new Promise<Compiled>((resolve) => {
          finish.set(formulaId, resolve);
        }),
    );
    const oldProgram = { id: 'old' } as unknown as WebGLProgram;
    const newProgram = { id: 'new' } as unknown as WebGLProgram;

    const oldRender = renderer.render(params('mandelbrot'));
    const newRender = renderer.render(params('burningShip'));
    finish.get('burningShip')?.({ program: newProgram, uniforms: {} });

    await expect(newRender).resolves.toBe(true);
    finish.get('mandelbrot')?.({ program: oldProgram, uniforms: {} });
    await expect(oldRender).resolves.toBe(false);

    expect(gl.useProgram).toHaveBeenCalledTimes(1);
    expect(gl.useProgram).toHaveBeenCalledWith(newProgram);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(
      (renderer as unknown as { currentProgram: WebGLProgram | null }).currentProgram,
    ).toBe(newProgram);

    renderer.dispose();
  });
});
