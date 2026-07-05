import { describe, it, expect, afterEach, vi } from 'vitest';
import { ShaderCache } from '@/engine/shaders/cache';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { FormulaPlugin } from '@/engine/plugins/types';

function createMockGl(): WebGLRenderingContext {
  return {
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    createBuffer: vi.fn(() => ({}) as WebGLBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
  } as unknown as WebGLRenderingContext;
}

describe('custom formula shader cache invalidation', () => {
  afterEach(() => {
    pluginRegistry.unregister('formula', 'invalidate-test-formula');
  });

  it('should invalidate only matching formula shader cache entries', () => {
    const gl = createMockGl();
    const cache = new ShaderCache(gl);
    const deleteProgram = vi.mocked(gl.deleteProgram);

    cache.put('invalidate-test-formula|smooth|black|none', {} as WebGLProgram, {}, {
      compileTime: 1,
      formulaId: 'invalidate-test-formula',
      timestamp: 1,
    });
    cache.put('other-formula|smooth|black|none', {} as WebGLProgram, {}, {
      compileTime: 1,
      formulaId: 'other-formula',
      timestamp: 1,
    });

    cache.invalidateFormula('invalidate-test-formula');

    expect(cache.get('invalidate-test-formula|smooth|black|none')).toBeUndefined();
    expect(cache.get('other-formula|smooth|black|none')).toBeDefined();
    expect(deleteProgram).toHaveBeenCalledTimes(1);
  });

  it('should clear renderer shader cache when a formula plugin is re-registered', () => {
    const gl = createMockGl();
    const renderer = new FractalRenderer(gl);
    const cache = (renderer as unknown as { cache: ShaderCache }).cache;

    cache.put('invalidate-test-formula|smooth|black|none', {} as WebGLProgram, {}, {
      compileTime: 1,
      formulaId: 'invalidate-test-formula',
      timestamp: 1,
    });

    const plugin: FormulaPlugin = {
      id: 'invalidate-test-formula',
      category: 'formula',
      name: 'InvalidateTest',
      source: 'frm',
      glsl: 'vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) { return z; }',
      uniforms: [],
      bailout: 4,
      supportsPower: false,
      supportsJulia: true,
    };

    pluginRegistry.register(plugin);

    expect(cache.get('invalidate-test-formula|smooth|black|none')).toBeUndefined();

    renderer.dispose();
  });
});
