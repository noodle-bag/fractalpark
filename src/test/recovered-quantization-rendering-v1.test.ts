import { describe, expect, it } from 'vitest';

import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import type { FormulaPlugin } from '@/engine/plugins/types';

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
