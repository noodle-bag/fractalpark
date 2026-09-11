import { describe, expect, it } from 'vitest';

import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import runtime from '../../public/formula-library/v1/runtime/published/index.json';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { pluginRegistry } from '@/engine/plugins/registry';
import { compilePublishedFormulaPluginV1 } from '@/engine/formulas/v1/published-adapter';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { refineRecoveredQuantizationGlslV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';

async function published(name: string) {
  const row = runtime.rows.find(row => row.displayName === name)!;
  const result = await compilePublishedFormulaPluginV1({
    ...row,
    source: readFileSync(join('public/formula-library/v1/runtime/published', row.definitionPath), 'utf8'),
  });
  if (!result.ok) throw new Error(result.code);
  return bindPublishedRenderingSourceV1(result.value);
}

function plugin(id: string): FormulaPlugin {
  return {
    id,
    category: 'formula',
    name: id,
    source: 'frm',
    glsl: 'return frmV1RoundAwayFromZero(z * 16.0) / 16.0;',
    uniforms: [],
    supportsPower: false,
    supportsJulia: true,
    cacheFingerprint: 'source-revision',
  };
}

describe('recovered quantization rendering correction v1', () => {
  it('preserves the real published parameter interface for every refined formula', async () => {
    registerBuiltins({ quiet: true });
    let affected = 0;
    for (const row of runtime.rows) {
      const native = pluginRegistry.getFormula(row.displayName);
      if (!native || refineRecoveredQuantizationGlslV1(row.formulaId, native.glsl) === native.glsl) continue;
      affected++;
      const source = await published(row.displayName);
      const corrected = resolveRecoveredPublishedRenderingPluginV1(source, native);
      expect(corrected.uniforms, row.displayName).toEqual(source.uniforms);
      if (row.displayName !== 'mandelbox') {
        expect(corrected.glsl).toBe(refineRecoveredQuantizationGlslV1(row.formulaId, native.glsl));
        expect(corrected.cacheFingerprint).toBe(`${source.cacheFingerprint}:render-q1024`);
      }
    }
    expect(affected).toBe(13);
  });

  it('removes only Mandelbox orbit rounding while retaining native execution and published inputs', async () => {
    registerBuiltins({ quiet: true });
    const native = pluginRegistry.getFormula('mandelbox')!;
    const source = await published('mandelbox');
    const corrected = resolveRecoveredPublishedRenderingPluginV1(source, native);
    expect(corrected.glsl).toBe(native.glsl
      .replace('recoveredAmplifiedQuantize(u_mandelboxScale * z + c, 16.0)', 'u_mandelboxScale * z + c')
      .replace(/\bu_mandelboxScale\b/g, '(frmV1_mandelboxScale.x)'));
    expect(corrected.uniforms).toEqual(source.uniforms);
    expect(corrected.bailout).toBe(native.bailout);
    expect(corrected.orbitLifecycle).toBe(native.orbitLifecycle);
    expect(corrected.initGlsl).toBe(native.initGlsl);
    expect(corrected.afterStepTiming).toBe(native.afterStepTiming);
    expect(corrected.smoothCapability).toBe(native.smoothCapability);
    expect(corrected.cacheFingerprint).toBe(`${source.cacheFingerprint}:render-mandelbox-unquantized-v1:parameters-v1`);
    expect(corrected.cacheFingerprint).not.toBe(`${source.cacheFingerprint}:render-q1024`);
    expect(native.uniforms[0].name).toBe('u_mandelboxScale');
    expect(native.glsl).toContain('u_mandelboxScale');
  });

  it('rejects an unreviewed Mandelbox interface or native implementation', async () => {
    registerBuiltins({ quiet: true });
    const native = pluginRegistry.getFormula('mandelbox')!;
    const source = await published('mandelbox');
    for (const changed of [
      { ...source, uniforms: [] },
      { ...source, uniforms: [{ ...source.uniforms[0], type: 'float' as const }] },
      { ...source, uniforms: [{ ...source.uniforms[0], default: [3, 0] }] },
      { ...source, sourceRevision: '0'.repeat(64) },
    ]) expect(() => resolveRecoveredPublishedRenderingPluginV1(changed, native)).toThrow();
    expect(() => resolveRecoveredPublishedRenderingPluginV1(source, { ...native, glsl: native.glsl + '\n' })).toThrow();
  });

  it('does not replace canonical Mandelbox execution without the reviewed native adapter', async () => {
    const source = await published('mandelbox');
    expect(resolveRecoveredPublishedRenderingPluginV1(source)).toBe(source);
    expect(source.orbitLifecycle?.kind).toBe('frm-like-v1');
  });

  it('refines an affected published plugin and fingerprints the shader cache', () => {
    const source = plugin('22d9a008-eb14-53de-9960-11eb5d37bb8e');
    const native = {
      ...plugin('zaslavskyMap'),
      glsl: 'for (int index = 0; index < 16; index++) {}\nnative recoveredQuantize(z, 16.0);',
      source: 'builtin' as const,
      bailout: 65536,
    };
    const corrected = resolveRecoveredPublishedRenderingPluginV1(source, native);

    expect(corrected).not.toBe(source);
    expect(corrected.id).toBe(source.id);
    expect(corrected.source).toBe('frm');
    expect(corrected.bailout).toBe(65536);
    expect(corrected.glsl).toBe(
      'for (int index = 0; index < 16; index++) {}\nnative recoveredQuantize(z, 1024.0);',
    );
    expect(corrected.cacheFingerprint).toBe('source-revision:render-q1024');
    expect(Object.isFrozen(corrected)).toBe(true);
  });

  it('preserves unrelated plugins by identity', () => {
    const source = plugin('00e14aa8-b766-54ea-a359-3f5d20d329b7');
    expect(resolveRecoveredPublishedRenderingPluginV1(source)).toBe(source);
  });
});
