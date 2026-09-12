import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import bindings from '../../resources/formula-library/v1/native-rendering-bindings.v1.json';
import directory from '../../public/formula-library/v1/directory/index.json';
import runtime from '../../public/formula-library/v1/runtime/published/index.json';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { pluginRegistry } from '@/engine/plugins/registry';
import { resolveFormulaRuntimeCapabilityV1 } from '@/engine/formulas/v1/formula-runtime-capability-v1';
import { renderingImplementationFingerprintV1 } from '@/engine/formulas/v1/rendering-implementation-fingerprint-v1';
import { compilePublishedFormulaPluginV1 } from '@/engine/formulas/v1/published-adapter';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import { JULIA_RUNTIME_ACTIVATION_V1 } from '@/engine/formulas/v1/julia-runtime-activation-v1';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { documentToRuntimeParams, projectDocumentToRuntimeParams } from '@/engine/document-adapter';
import { bindPublishedRenderingSourceV1, publishedRenderingSourceRevisionV1 } from '@/engine/formulas/v1/published-rendering-source-v1';

async function artifact(name: string) {
  const row = runtime.rows.find(row => row.displayName === name)!;
  const compiled = await compilePublishedFormulaPluginV1({
    ...row,
    source: readFileSync(join('public/formula-library/v1/runtime/published', row.definitionPath), 'utf8'),
  });
  if (!compiled.ok) throw new Error(compiled.code);
  return { ...compiled.value, plugin: bindPublishedRenderingSourceV1(compiled.value) };
}

describe('formula runtime identity compatibility', () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it('binds every reviewed native implementation to the existing published identity and activation', () => {
    expect(bindings.rows).toHaveLength(76);
    expect(new Set(bindings.rows.map(row => row.formulaId)).size).toBe(72);
    for (const row of bindings.rows) {
      expect(directory.runtimeAliases).toContainEqual({ runtimeId: row.runtimeId, canonicalFormulaId: row.formulaId });
      expect(JULIA_RUNTIME_ACTIVATION_V1!.rows).toContainEqual({ formulaId: row.formulaId, sourceRevision: row.sourceRevision });
      const plugin = pluginRegistry.getFormula(row.runtimeId)!;
      expect(renderingImplementationFingerprintV1(plugin)).toBe(row.nativeFingerprint);
      expect(resolveFormulaRuntimeCapabilityV1(plugin.id, plugin).supportsRuntime).toBe(true);
      expect(resolveFormulaRuntimeCapabilityV1(plugin.id, { ...plugin, cacheFingerprint: 'different-cache' }).supportsRuntime).toBe(true);
    }
  });

  it('rejects changed GLSL, initialization, uniforms, lifecycle, source, and mismatched IDs', () => {
    const plugin = pluginRegistry.getFormula('mandelbrot')!;
    for (const changed of [
      { ...plugin, glsl: plugin.glsl + '\n// changed' },
      { ...plugin, initGlsl: 'z = vec2(0.0);' },
      { ...plugin, uniforms: [] as typeof plugin.uniforms, bailout: 4 },
      { ...plugin, afterStepTiming: true },
      { ...plugin, source: 'custom' as const },
      { ...plugin, id: 'unknown' },
    ]) expect(resolveFormulaRuntimeCapabilityV1('mandelbrot', changed).supportsRuntime).toBe(false);
    for (const name of ['magnet1', 'expMandelbrot', 'tetration', 'newton6', 'unknown']) {
      expect(resolveFormulaRuntimeCapabilityV1(name, pluginRegistry.getFormula(name)).supportsRuntime).toBe(false);
    }
  });

  it('uses the source revision, never the cache key, for compiled published definitions', async () => {
    const { plugin } = await artifact('perpendicularCeltic');
    expect(resolveFormulaRuntimeCapabilityV1(plugin.id, { ...plugin, cacheFingerprint: 'new-cache' }).supportsRuntime).toBe(true);
    const stale = { ...plugin, sourceRevision: '0'.repeat(64) };
    const missing = { ...plugin, sourceRevision: undefined };
    expect(resolveFormulaRuntimeCapabilityV1(plugin.id, stale).supportsRuntime).toBe(false);
    expect(resolveFormulaRuntimeCapabilityV1(plugin.id, missing).supportsRuntime).toBe(false);
  });

  it('restores all ten reviewed variants without accepting arbitrary renderer changes', async () => {
    const refined = bindings.rows.filter(row => row.refinedFingerprint);
    expect(refined).toHaveLength(10);
    for (const row of refined) {
      const { plugin } = await artifact(row.runtimeId);
      const result = resolveRecoveredPublishedRenderingPluginV1(plugin, pluginRegistry.getFormula(row.runtimeId));
      expect(publishedRenderingSourceRevisionV1(result)).toBe(plugin.sourceRevision);
      expect(result.cacheFingerprint).not.toBe(plugin.sourceRevision);
      expect(renderingImplementationFingerprintV1(result)).toBe(row.refinedFingerprint);
      expect(resolveFormulaRuntimeCapabilityV1(result.id, result).supportsRuntime).toBe(true);
      expect(resolveFormulaRuntimeCapabilityV1(result.id, { ...result, glsl: result.glsl + '\n' }).supportsRuntime).toBe(false);
      const stale = { ...result, sourceRevision: '0'.repeat(64) };
      expect(resolveFormulaRuntimeCapabilityV1(result.id, stale).supportsRuntime).toBe(false);
    }
  });

  it('preserves all saved fields and native parameter values when restoring Julia', () => {
    const doc = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    doc.formula.formulaId = 'phoenix';
    doc.formula.isJulia = true;
    doc.formula.juliaC = [-0.62, 0.41];
    doc.formula.power = 3.25;
    doc.formula.params = { formula: { u_phoenixP: -0.75 } };
    const before = structuredClone(doc);
    expect(documentToRuntimeParams(doc)).toEqual(projectDocumentToRuntimeParams(doc));
    expect(doc).toEqual(before);
  });
});
