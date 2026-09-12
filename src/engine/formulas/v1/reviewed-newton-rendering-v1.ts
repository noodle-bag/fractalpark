import type { FormulaPlugin } from '../../plugins/types';
import { newtonCoshPlugin } from '../../plugins/builtins/formulas/newtonCosh';
import { renderingImplementationFingerprintV1 } from './rendering-implementation-fingerprint-v1';
import { publishedRenderingSourceRevisionV1 } from './published-rendering-source-v1';

const binding = {
  formulaId: 'a89891b1-8ccb-5d58-9fbb-05944b85ce3c',
  sourceRevision: 'ede967e2b65d1f547af3504bab1d91071ad5f9cda0969189c5b50f3102d18dbb',
  nativeFingerprint: 'feffbfa598fe12c1b4eae6c1533106a1655034336510e94a6a858866bd76454f',
  renderingFingerprint: '8012042cbdf489c86997f421932b331b46ca7f55e2eb645671366cf7993ca96c',
};

const renderingPlugin: FormulaPlugin = Object.freeze({
  ...newtonCoshPlugin,
  glsl: newtonCoshPlugin.glsl
    .replaceAll('recoveredAmplifiedSinhVec(clampedZ)', 'complexSinhVec(clampedZ)')
    .replaceAll('recoveredAmplifiedCoshVec(clampedZ)', 'complexCoshVec(clampedZ)'),
  cacheFingerprint: 'newtonCosh:render-builtin-hyperbolic-v1',
});

/** Keep convergence, pole protection and clamping; replace only approximations. */
export function getReviewedNewtonRenderingV1(runtimeId: string): FormulaPlugin | undefined {
  if (runtimeId !== newtonCoshPlugin.id
    || renderingImplementationFingerprintV1(newtonCoshPlugin) !== binding.nativeFingerprint
    || renderingImplementationFingerprintV1(renderingPlugin) !== binding.renderingFingerprint) return undefined;
  return renderingPlugin;
}

export function resolveReviewedNewtonNativeRenderingV1(plugin: FormulaPlugin): FormulaPlugin {
  if (plugin.id !== newtonCoshPlugin.id || plugin.source !== 'builtin'
    || renderingImplementationFingerprintV1(plugin) !== binding.nativeFingerprint) return plugin;
  return getReviewedNewtonRenderingV1(plugin.id) ?? plugin;
}

export function resolveReviewedNewtonPublishedRenderingV1(plugin: FormulaPlugin, native?: FormulaPlugin): FormulaPlugin {
  if (plugin.id !== binding.formulaId || !native) return plugin;
  const fingerprint = renderingImplementationFingerprintV1(native);
  const reviewed = getReviewedNewtonRenderingV1(native.id);
  if (!reviewed || native.source !== 'builtin' || plugin.source !== 'frm'
    || publishedRenderingSourceRevisionV1(plugin) !== binding.sourceRevision
    || plugin.uniforms.length !== 0
    || (fingerprint !== binding.nativeFingerprint && fingerprint !== binding.renderingFingerprint)) {
    throw new Error('recovered-newton-rendering-contract-mismatch');
  }
  return Object.freeze({ ...reviewed, id: plugin.id, name: plugin.name, source: plugin.source,
    sourceRevision: binding.sourceRevision,
    cacheFingerprint: `${plugin.cacheFingerprint}:render-builtin-hyperbolic-v1`,
  });
}
