import type { FractalDocument } from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import type { PublishedFormulaProfileV1 } from '@/engine/formulas/v1';
import type { PluginParamRecord } from '@/engine/types';

/** Shared document mutation for selection, initial entry, and fresh artwork. */
export function applyPublishedFormulaProfile(
  current: FractalDocument,
  selection: { formulaId: string; formulaParams: PluginParamRecord; profile: PublishedFormulaProfileV1 },
): FractalDocument {
  const { profile } = selection;
  return normalizeFractalDocument({
    ...current,
    scene: { ...current.scene, bounds: {
      centerX: profile.center[0], centerY: profile.center[1],
      zoom: profile.zoom, rotation: profile.rotation,
    } },
    formula: { ...current.formula,
      formulaId: selection.formulaId,
      isJulia: profile.mode === 'julia',
      juliaC: profile.juliaC ? [profile.juliaC[0], profile.juliaC[1]] : current.formula.juliaC,
      params: Object.keys(selection.formulaParams).length ? { formula: selection.formulaParams } : undefined,
    },
    render: { ...current.render, maxIterations: profile.iterations },
  });
}
