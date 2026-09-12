import type { FormulaPlugin } from '../../plugins/types';
import { publishedRenderingSourceRevisionV1 } from './published-rendering-source-v1';
import bindings from '../../../../resources/formula-library/v1/native-rendering-bindings.v1.json';
import { renderingImplementationFingerprintV1 } from './rendering-implementation-fingerprint-v1';
import { reviewedNativeOriginalV1, unquantizedNativeGlslV1 } from './reviewed-native-rendering-v1';
import { resolveReviewedNewtonPublishedRenderingV1 } from './reviewed-newton-rendering-v1';

const MANDELBOX_ID = '280cd3e2-865b-5c78-90b7-39b2a36d7be0';
const mandelboxBinding = bindings.rows.find(row => row.runtimeId === 'mandelbox')!;

const RECOVERED_QUANTIZATION_FORMULA_IDS_V1 = new Set([
  '17d88272-6dbf-5622-996a-b116ea3a3fab',
  '190fa538-89c9-590f-8170-34b3c570fc5d',
  '201c54f3-a77a-5be0-a0a5-6f4f1998ee6d',
  '22d9a008-eb14-53de-9960-11eb5d37bb8e',
  '280cd3e2-865b-5c78-90b7-39b2a36d7be0',
  '3edbea29-956a-5900-9aa7-02ccc2183016',
  '62098934-def3-527a-ac43-2c80449c9848',
  '78e550c6-d58d-57b7-92ff-82e9ed0728f0',
  '8eb342fe-8a05-524e-8b98-35cdc8af5be3',
  '9f301c01-13fa-57b4-a3b2-99add821bfb0',
  'af500910-46ce-5a43-b430-c0154cc05959',
  'beeb4aec-91cd-5d01-83bb-0b98ca851e79',
  'd89f722f-35fe-587a-bee9-efdf05885728',
]);

export const RECOVERED_QUANTIZATION_RENDERING_REVISION_V1 = 'q1024' as const;

/**
 * The recovered native formulas were published with a deliberately coarse
 * 1/16 orbit grid for early cross-GPU stabilization. Keep the hash-pinned
 * Definition intact, but refine that rendering guard to 1/1024 so its cells
 * remain below the visible scale of the verified default compositions.
 */
export function refineRecoveredQuantizationGlslV1(
  formulaId: string,
  glsl: string,
): string {
  if (!RECOVERED_QUANTIZATION_FORMULA_IDS_V1.has(formulaId)) return glsl;
  return glsl.replace(
    /(recovered(?:Amplified)?Quantize\([^;]*,\s*)16(?:\.0)?(\s*\))/g,
    (_, prefix: string, suffix: string) => `${prefix}1024.0${suffix}`,
  );
}

export function resolveRecoveredPublishedRenderingPluginV1(
  plugin: FormulaPlugin,
  nativePlugin?: FormulaPlugin,
): FormulaPlugin {
  if (!RECOVERED_QUANTIZATION_FORMULA_IDS_V1.has(plugin.id)) return resolveReviewedNewtonPublishedRenderingV1(plugin, nativePlugin);
  const binding = bindings.rows.find(row => row.formulaId === plugin.id);
  const original = binding && reviewedNativeOriginalV1(binding.runtimeId);
  if (original && binding && nativePlugin) {
    const nativeFingerprint = renderingImplementationFingerprintV1(nativePlugin);
    const projectedFingerprint = renderingImplementationFingerprintV1({ ...original, glsl: unquantizedNativeGlslV1(original) });
    if (plugin.source !== 'frm' || nativePlugin.source !== 'builtin' || nativePlugin.id !== original.id
      || (nativeFingerprint !== binding.nativeFingerprint && nativeFingerprint !== projectedFingerprint)) {
      throw new Error('recovered-rendering-parameter-contract-mismatch');
    }
    nativePlugin = original;
  }
  const renderingBase = nativePlugin ?? plugin;
  let glsl = refineRecoveredQuantizationGlslV1(plugin.id, renderingBase.glsl);
  let uniforms = renderingBase.uniforms;
  let parameterRevision = '';
  let renderingRevision: string = RECOVERED_QUANTIZATION_RENDERING_REVISION_V1;
  if (original && binding && nativePlugin && plugin.id !== MANDELBOX_ID) {
    if (publishedRenderingSourceRevisionV1(plugin) !== binding.sourceRevision || plugin.uniforms.length !== 0) {
      throw new Error('recovered-rendering-parameter-contract-mismatch');
    }
    glsl = unquantizedNativeGlslV1(original);
    renderingRevision = 'unquantized-v1';
  }
  if (plugin.id === MANDELBOX_ID && nativePlugin) {
    const uniform = plugin.uniforms[0];
    if (
      publishedRenderingSourceRevisionV1(plugin) !== mandelboxBinding.sourceRevision
      || nativePlugin.id !== 'mandelbox'
      || renderingImplementationFingerprintV1(nativePlugin) !== mandelboxBinding.nativeFingerprint
      || plugin.uniforms.length !== 1
      || uniform?.name !== 'frmV1_mandelboxScale'
      || uniform.type !== 'vec2'
      || !Array.isArray(uniform.default)
      || uniform.default.length !== 2
      || uniform.default[0] !== 2 || uniform.default[1] !== 0
      || uniform.min !== -3 || uniform.max !== 3
    ) throw new Error('recovered-rendering-parameter-contract-mismatch');
    // Only this exact reviewed native implementation removes orbit rounding.
    // Preserve its fold arithmetic, lifecycle and coloring, and read the
    // published real parameter encoded as vec2(value, 0).
    glsl = nativePlugin.glsl.replace(
      'recoveredAmplifiedQuantize(u_mandelboxScale * z + c, 16.0)',
      'u_mandelboxScale * z + c',
    ).replace(/\bu_mandelboxScale\b/g, '(frmV1_mandelboxScale.x)');
    renderingRevision = 'mandelbox-unquantized-v1';
    uniforms = plugin.uniforms;
    parameterRevision = ':parameters-v1';
  }
  if (glsl === renderingBase.glsl) return plugin;
  return Object.freeze({
    ...renderingBase,
    id: plugin.id,
    name: plugin.name,
    source: plugin.source,
    supportsJulia: false,
    sourceRevision: publishedRenderingSourceRevisionV1(plugin),
    uniforms,
    glsl,
    cacheFingerprint: `${plugin.cacheFingerprint ?? plugin.id}:render-${renderingRevision}${parameterRevision}`,
  });
}
