import bindings from '../../../../resources/formula-library/v1/native-rendering-bindings.v1.json';
import type { FormulaPlugin } from '../../plugins/types';
import {
  resolveJuliaRuntimeCapabilityV1,
  type JuliaRuntimeCapabilityResolutionV1,
} from './julia-runtime-activation-v1';
import { renderingImplementationFingerprintV1 } from './rendering-implementation-fingerprint-v1';
import { publishedRenderingSourceRevisionV1 } from './published-rendering-source-v1';
import { hasCoordinateParametersV1 } from './published-coordinate-parameters-v1';

const nativeById = new Map(bindings.rows.map(row => [row.runtimeId, row]));
const refinedById = new Map(
  bindings.rows.filter(row => row.refinedFingerprint).map(row => [row.formulaId, row]),
);

/**
 * Resolve identity at the application boundary without migrating a saved
 * formula or changing its renderer. Native variants require an exact reviewed
 * execution fingerprint as well as current canonical Julia activation.
 */
export function resolveFormulaRuntimeCapabilityV1(
  formulaId: string,
  plugin: FormulaPlugin | undefined,
): JuliaRuntimeCapabilityResolutionV1 {
  if (!plugin || plugin.id !== formulaId) {
    return resolveJuliaRuntimeCapabilityV1(formulaId, undefined);
  }
  // These inputs are exposed as ordinary coordinate parameters. Historical
  // activation does not make their previously inert Julia switch meaningful.
  if (hasCoordinateParametersV1(formulaId, publishedRenderingSourceRevisionV1(plugin))) {
    return { status: 'unsupported', reason: 'unsupported', supportsEditing: false, supportsRuntime: false };
  }
  const native = plugin.source === 'builtin' ? nativeById.get(formulaId) : undefined;
  if (native) {
    const revision = renderingImplementationFingerprintV1(plugin) === native.nativeFingerprint
      ? native.sourceRevision
      : undefined;
    return resolveJuliaRuntimeCapabilityV1(native.formulaId, revision);
  }
  const refined = plugin.source === 'frm' ? refinedById.get(formulaId) : undefined;
  if (refined && !plugin.orbitLifecycle) {
    const revision = renderingImplementationFingerprintV1(plugin) === refined.refinedFingerprint
      && publishedRenderingSourceRevisionV1(plugin) === refined.sourceRevision
      ? refined.sourceRevision
      : undefined;
    return resolveJuliaRuntimeCapabilityV1(formulaId, revision);
  }
  // A cache fingerprint is not a source revision. Never infer one by stripping
  // a suffix, and never let a custom plugin impersonate a published formula.
  return resolveJuliaRuntimeCapabilityV1(
    formulaId,
    plugin.source === 'frm' && plugin.orbitLifecycle?.kind === 'frm-like-v1'
      ? publishedRenderingSourceRevisionV1(plugin)
      : undefined,
  );
}
