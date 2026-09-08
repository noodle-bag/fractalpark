import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShaderCache } from '@/engine/shaders/cache';

function mockGl(parallel = true) {
  let complete = false;
  let linked = true;
  let lost = false;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, ACTIVE_UNIFORMS: 4, COMPILE_STATUS: 5,
    getExtension: vi.fn(() => parallel ? { COMPLETION_STATUS_KHR: 6 } : null),
    isContextLost: vi.fn(() => lost),
    createShader: vi.fn(() => ({})), shaderSource: vi.fn(), compileShader: vi.fn(),
    createProgram: vi.fn(() => ({})), attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program, parameter) => {
      if (parameter === 6) return complete;
      if (parallel && !complete) throw new Error('Blocking query before completion');
      return parameter === 3 ? linked : 0;
    }),
    getShaderParameter: vi.fn(() => false), getShaderInfoLog: vi.fn(() => 'invalid shader'),
    getProgramInfoLog: vi.fn(() => 'invalid program'),
    deleteShader: vi.fn(), deleteProgram: vi.fn(),
  };
  return {
    gl, cache: new ShaderCache(gl as unknown as WebGLRenderingContext, 8, {
      slowCompileThreshold: 10000, maxCompileTime: 100,
    }),
    complete: () => { complete = true; },
    fail: () => { linked = false; complete = true; },
    lose: () => { lost = true; },
  };
}

describe('asynchronous shader compilation', () => {
  afterEach(() => vi.useRealTimers());

  it('yields, polls completion, and shares pending compiles without blocking status queries', async () => {
    vi.useFakeTimers();
    const { gl, cache, complete } = mockGl();
    const first = cache.compileWithMetrics('f|smooth', 'source', 'f');
    const second = cache.compileWithMetrics('f|smooth', 'source', 'f');
    let heartbeat = false;
    setTimeout(() => { heartbeat = true; }, 1);
    await vi.advanceTimersByTimeAsync(32);
    expect(heartbeat).toBe(true);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.getProgramParameter.mock.calls.every(([, parameter]) => parameter === 6)).toBe(true);
    expect(gl.getShaderParameter).not.toHaveBeenCalled();
    expect(cache.get('f|smooth')).toBeUndefined();
    complete();
    await vi.advanceTimersByTimeAsync(16);
    expect(await first).toBe(await second);
    expect(cache.get('f|smooth')?.program).toBe((await first).program);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    cache.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const reason of ['timeout', 'invalidate', 'dispose', 'context', 'link'] as const) {
    it(`cleans pending resources after ${reason} without caching a failed program`, async () => {
      vi.useFakeTimers();
      const { gl, cache, fail, lose } = mockGl();
      const pending = cache.compileWithMetrics('f|smooth', 'source', 'f');
      const rejected = expect(pending).rejects.toThrow(
        reason === 'timeout' ? 'timeout' : reason === 'context' ? 'context lost' : reason === 'link' ? 'invalid shader' : 'cancelled',
      );
      if (reason === 'invalidate') cache.invalidateFormula('f');
      if (reason === 'dispose') cache.dispose();
      if (reason === 'context') lose();
      if (reason === 'link') fail();
      await vi.advanceTimersByTimeAsync(112);
      await rejected;
      expect(gl.deleteShader).toHaveBeenCalledTimes(2);
      expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
      expect(cache.get('f|smooth')).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('does not let an invalidated pending compile replace a newer one', async () => {
    vi.useFakeTimers();
    const { cache, complete } = mockGl();
    const old = cache.compileWithMetrics('f|smooth', 'old', 'f');
    const rejected = expect(old).rejects.toThrow('cancelled');
    cache.invalidateFormula('f');
    const next = cache.compileWithMetrics('f|smooth', 'new', 'f');
    complete();
    await vi.advanceTimersByTimeAsync(16);
    await rejected;
    expect(cache.get('f|smooth')?.program).toBe((await next).program);
    cache.dispose();
  });

  it('yields once and retains the legacy fallback when the extension is absent', async () => {
    vi.useFakeTimers();
    const { gl, cache } = mockGl(false);
    const pending = cache.compileWithMetrics('f|smooth', 'source', 'f');
    expect(gl.getProgramParameter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(gl.getShaderParameter).not.toHaveBeenCalled();
    expect(cache.get('f|smooth')).toBeDefined();
    cache.dispose();
  });
});
