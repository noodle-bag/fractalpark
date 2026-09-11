import type { FormulaPlugin } from '../../plugins/types';
import { canonicalJsonV1, sha256HexSyncV1 } from './revisions';

/** Bind execution and parameter contracts, not names or mutable cache keys. */
export function renderingImplementationFingerprintV1(plugin: FormulaPlugin): string {
  return sha256HexSyncV1(canonicalJsonV1({
    glsl: plugin.glsl,
    initGlsl: plugin.initGlsl ?? null,
    uniforms: plugin.uniforms,
    bailout: plugin.bailout ?? null,
    escapeType: plugin.escapeType ?? null,
    orbitLifecycle: plugin.orbitLifecycle ?? null,
    afterStepTiming: plugin.afterStepTiming ?? false,
    frmSemanticsVersion: plugin.frmSemanticsVersion ?? null,
    bailoutDescriptor: plugin.bailoutDescriptor ?? null,
    c2ThresholdGlsl: plugin.c2ThresholdGlsl ?? null,
    smoothCapability: plugin.smoothCapability ?? null,
    smoothPower: plugin.smoothPower ?? null,
  }));
}
