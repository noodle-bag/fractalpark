import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import runtime from '../../public/formula-library/v1/runtime/published/index.json';
import { newtonCoshPlugin } from '@/engine/plugins/builtins/formulas/newtonCosh';
import { getReviewedNewtonRenderingV1, resolveReviewedNewtonNativeRenderingV1 } from '@/engine/formulas/v1/reviewed-newton-rendering-v1';
import { compilePublishedFormulaPluginV1 } from '@/engine/formulas/v1/published-adapter';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import { resolveFormulaRuntimeCapabilityV1 } from '@/engine/formulas/v1/formula-runtime-capability-v1';

describe('reviewed Newton rendering', () => {
  it('replaces only hyperbolic approximations and retains convergence and guards', () => {
    const actual = getReviewedNewtonRenderingV1('newtonCosh')!;
    expect(actual.glsl).toBe(newtonCoshPlugin.glsl
      .replaceAll('recoveredAmplifiedSinhVec(clampedZ)', 'complexSinhVec(clampedZ)')
      .replaceAll('recoveredAmplifiedCoshVec(clampedZ)', 'complexCoshVec(clampedZ)'));
    for (const key of ['initGlsl', 'uniforms', 'escapeType', 'bailout', 'orbitLifecycle'] as const) {
      expect(actual[key]).toEqual(newtonCoshPlugin[key]);
    }
    expect(resolveReviewedNewtonNativeRenderingV1(newtonCoshPlugin)).toBe(actual);
    expect(resolveReviewedNewtonNativeRenderingV1(actual)).toBe(actual);
    expect(resolveFormulaRuntimeCapabilityV1(actual.id, actual).supportsRuntime).toBe(false);
  });

  it('leaves unknown, custom and modified native implementations unchanged', () => {
    for (const plugin of [
      { ...newtonCoshPlugin, id: 'other' },
      { ...newtonCoshPlugin, source: 'custom' as const },
      { ...newtonCoshPlugin, glsl: newtonCoshPlugin.glsl + '\n' },
    ]) expect(resolveReviewedNewtonNativeRenderingV1(plugin)).toBe(plugin);
    expect(getReviewedNewtonRenderingV1('newton3')).toBeUndefined();
  });

  it('shares the published correction without widening Julia or accepting stale source', async () => {
    const row = runtime.rows.find(row => row.displayName === 'newtonCosh')!;
    const result = await compilePublishedFormulaPluginV1({ ...row,
      source: readFileSync(`public/formula-library/v1/runtime/published/${row.definitionPath}`, 'utf8'),
    });
    if (!result.ok) throw new Error(result.code);
    const plugin = bindPublishedRenderingSourceV1(result.value);
    const corrected = resolveRecoveredPublishedRenderingPluginV1(plugin, newtonCoshPlugin);
    expect(corrected.glsl).toBe(getReviewedNewtonRenderingV1('newtonCosh')!.glsl);
    expect(corrected.id).toBe(row.formulaId);
    expect(corrected.uniforms).toEqual(plugin.uniforms);
    expect(resolveFormulaRuntimeCapabilityV1(corrected.id, corrected).supportsRuntime).toBe(false);
    expect(() => resolveRecoveredPublishedRenderingPluginV1({ ...plugin, sourceRevision: 'stale' }, newtonCoshPlugin)).toThrow();
    expect(() => resolveRecoveredPublishedRenderingPluginV1(plugin, { ...newtonCoshPlugin, bailout: 4 })).toThrow();
  });
});
