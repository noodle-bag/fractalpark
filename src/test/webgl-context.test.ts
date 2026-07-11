import { describe, expect, it, vi } from 'vitest';
import { getWebGLCapabilities } from '@/engine/webgl/context';

function createMockGl(options?: { highp?: boolean; extensions?: string[] }): WebGLRenderingContext {
  const extensions = new Set(options?.extensions ?? []);

  return {
    FRAGMENT_SHADER: 0x8b30,
    HIGH_FLOAT: 0x8df2,
    MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
    getShaderPrecisionFormat: vi.fn(() => (options?.highp === false ? { precision: 0 } : { precision: 23 })),
    getParameter: vi.fn(() => 224),
    getExtension: vi.fn((name: string) => (extensions.has(name) ? {} : null)),
  } as unknown as WebGLRenderingContext;
}

describe('WebGL capability report', () => {
  it('records fragment precision, uniform budget, and supported extensions', () => {
    const gl = createMockGl({
      extensions: ['OES_standard_derivatives', 'KHR_parallel_shader_compile', 'EXT_sRGB'],
    });

    expect(getWebGLCapabilities(gl)).toEqual({
      fragmentHighp: true,
      maxFragmentUniformVectors: 224,
      extensions: {
        standardDerivatives: true,
        parallelShaderCompile: true,
        disjointTimerQuery: false,
        srgb: true,
        colorBufferFloat: false,
        colorBufferHalfFloat: false,
      },
    });
  });

  it('reports mediump-only fragment hardware without failing capability discovery', () => {
    const gl = createMockGl({ highp: false });

    expect(getWebGLCapabilities(gl).fragmentHighp).toBe(false);
  });
});
