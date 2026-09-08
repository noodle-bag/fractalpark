import { compileFractalProgramAsync } from '../webgl/program';
import vertSource from './fullscreen.vert.glsl';

export interface CompileMetrics {
  compileTime: number;
  formulaId: string;
  timestamp: number;
}

interface CacheEntry {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
  lastUsed: number;
  metrics: CompileMetrics;
}

export class ShaderCache {
  private entries = new Map<string, CacheEntry>();
  private pending = new Map<string, {
    formulaId: string;
    controller: AbortController;
    promise: Promise<{ program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> }>;
  }>();

  constructor(
    private gl: WebGLRenderingContext,
    private maxSize = 8,
    private performanceConfig = {
      slowCompileThreshold: 100,
      maxCompileTime: 5000,
    }
  ) {}

  async compileWithMetrics(
    key: string,
    source: string,
    formulaId: string
  ): Promise<{ program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> }> {
    const cached = this.get(key);
    if (cached) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending.promise;
    const controller = new AbortController();
    const startTime = performance.now();
    const promise = compileFractalProgramAsync(
      this.gl, vertSource, source, this.performanceConfig.maxCompileTime, controller.signal,
    ).then((compiled) => {
      if (controller.signal.aborted) {
        this.gl.deleteProgram(compiled.program);
        throw new Error('Shader compile cancelled');
      }
      const compileTime = performance.now() - startTime;
      const metrics: CompileMetrics = { compileTime, formulaId, timestamp: Date.now() };

      if (compileTime > this.performanceConfig.slowCompileThreshold) {
        console.warn(`[ShaderCache] Slow compile: ${formulaId} took ${compileTime.toFixed(1)}ms`);
      }

      this.put(key, compiled.program, compiled.uniforms, metrics);

      return compiled;
    }).finally(() => {
      if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
    });
    this.pending.set(key, { formulaId, controller, promise });
    return promise;
  }

  get(key: string): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.lastUsed = Date.now();
    return { program: entry.program, uniforms: entry.uniforms };
  }

  put(
    key: string,
    program: WebGLProgram,
    uniforms: Record<string, WebGLUniformLocation>,
    metrics: CompileMetrics
  ): void {
    this.entries.set(key, { program, uniforms, lastUsed: Date.now(), metrics });
    if (this.entries.size > this.maxSize) {
      this.evictLRU();
    }
  }

  invalidateFormula(formulaId: string): void {
    for (const [key, pending] of this.pending) {
      if (pending.formulaId !== formulaId) continue;
      pending.controller.abort();
      this.pending.delete(key);
    }
    const prefix = `${formulaId}|`;
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      this.gl.deleteProgram(entry.program);
      this.entries.delete(key);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldest = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastUsed < oldest) {
        oldest = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (!oldestKey) return;
    const victim = this.entries.get(oldestKey);
    if (victim) {
      this.gl.deleteProgram(victim.program);
      this.entries.delete(oldestKey);
    }
  }

  dispose(): void {
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
    for (const entry of this.entries.values()) {
      this.gl.deleteProgram(entry.program);
    }
    this.entries.clear();
  }

  getPerformanceReport(): CompileMetrics[] {
    return Array.from(this.entries.values()).map((e) => e.metrics);
  }
}
