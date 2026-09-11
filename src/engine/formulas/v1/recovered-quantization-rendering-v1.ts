import type { FormulaPlugin } from '../../plugins/types';
import { publishedRenderingSourceRevisionV1 } from './published-rendering-source-v1';

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
  if (!RECOVERED_QUANTIZATION_FORMULA_IDS_V1.has(plugin.id)) return plugin;
  const renderingBase = nativePlugin ?? plugin;
  const glsl = refineRecoveredQuantizationGlslV1(plugin.id, renderingBase.glsl);
  if (glsl === renderingBase.glsl) return plugin;
  return Object.freeze({
    ...renderingBase,
    id: plugin.id,
    name: plugin.name,
    source: plugin.source,
    supportsJulia: false,
    sourceRevision: publishedRenderingSourceRevisionV1(plugin),
    glsl,
    cacheFingerprint: `${plugin.cacheFingerprint ?? plugin.id}:render-${RECOVERED_QUANTIZATION_RENDERING_REVISION_V1}`,
  });
}
