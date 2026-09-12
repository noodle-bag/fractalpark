import type { FormulaPlugin } from '../../plugins/types';
import { mandelboxPlugin } from '../../plugins/builtins/formulas/mandelbox';
import { coshMandelbPlugin } from '../../plugins/builtins/formulas/coshMandelb';
import { zaslavskyMapPlugin } from '../../plugins/builtins/formulas/zaslavskyMap';
import bindings from '../../../../resources/formula-library/v1/native-rendering-bindings.v1.json';
import { renderingImplementationFingerprintV1 } from './rendering-implementation-fingerprint-v1';

const originals = new Map([mandelboxPlugin, coshMandelbPlugin, zaslavskyMapPlugin].map(plugin => [plugin.id, plugin]));

/** Exact, reviewed orbit-rounding removal; all other arithmetic is retained. */
export function unquantizedNativeGlslV1(plugin: FormulaPlugin): string {
  switch (plugin.id) {
    case 'mandelbox': return plugin.glsl.replace('recoveredAmplifiedQuantize(u_mandelboxScale * z + c, 16.0)', 'u_mandelboxScale * z + c');
    case 'coshMandelb': return plugin.glsl
      .replace('recoveredQuantize(recoveredCoshVec(z), 16.0)', 'recoveredCoshVec(z)')
      .replace('recoveredQuantize(stableCosh + c, 16.0)', 'stableCosh + c');
    case 'zaslavskyMap': return plugin.glsl.replace('recoveredQuantize(complexMul(swirl, rot) + c, 16.0)', 'complexMul(swirl, rot) + c');
    default: return plugin.glsl;
  }
}

export function reviewedNativeOriginalV1(runtimeId: string): FormulaPlugin | undefined {
  const original = originals.get(runtimeId);
  const binding = bindings.rows.find(row => row.runtimeId === runtimeId);
  if (!original || !binding || renderingImplementationFingerprintV1(original) !== binding.nativeFingerprint) return undefined;
  return original;
}

/** Application-only projection. Never mutate built-ins or persisted artwork. */
export function resolveReviewedNativeRenderingV1(plugin: FormulaPlugin): FormulaPlugin {
  const original = reviewedNativeOriginalV1(plugin.id);
  if (!original || plugin.source !== 'builtin') return plugin;
  if (renderingImplementationFingerprintV1(plugin) !== renderingImplementationFingerprintV1(original)) return plugin;
  return Object.freeze({
    ...plugin,
    glsl: unquantizedNativeGlslV1(original),
    cacheFingerprint: `${plugin.id}:render-unquantized-v1`,
  });
}
