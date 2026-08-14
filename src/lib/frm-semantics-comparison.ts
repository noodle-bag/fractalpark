import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import {
  compileImportedFrm,
  type CompileResult,
} from '@/engine/frm/compile';
import {
  DEFAULT_FRACTAL_DOCUMENT,
  type FractalDocument,
} from '@/engine/document';
import type { FrmSemanticsVersion } from '@/engine/frm/semantics-version';
import type { FractalParams } from '@/engine/types';
import { getFormulaUniformDefaults } from '@/lib/formula-documents';

export interface FrmSemanticsComparisonSide {
  version: FrmSemanticsVersion;
  result: CompileResult;
  previewParams?: FractalParams;
}

export interface FrmSemanticsComparison {
  experienceHint?: FormulaExperienceHint;
  v1: FrmSemanticsComparisonSide;
  v2: FrmSemanticsComparisonSide;
}

export interface CompareFrmSemanticsInput {
  formulaId: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
}

function buildPreviewParams(
  result: CompileResult,
  version: FrmSemanticsVersion,
  experienceHint?: FormulaExperienceHint,
): FractalParams | undefined {
  const plugin = result.plugin;
  if (!result.success || !plugin) return undefined;

  const base: FractalDocument = DEFAULT_FRACTAL_DOCUMENT;
  return {
    maxIterations: base.render.maxIterations,
    paletteIndex:
      experienceHint?.coloring?.paletteIndex ?? base.coloring.paletteIndex,
    bounds: {
      ...(experienceHint?.bounds ?? base.scene.bounds),
    },
    isJulia: base.formula.isJulia,
    juliaC: [...base.formula.juliaC],
    power: base.formula.power,
    customGradient: base.coloring.customGradient,
    formula: plugin.id,
    outsideColoring:
      experienceHint?.coloring?.outsideColoringId ??
      base.coloring.outsideColoringId,
    insideColoring:
      experienceHint?.coloring?.insideColoringId ??
      base.coloring.insideColoringId,
    transformId: base.transform.transformId,
    pluginParams: getFormulaUniformDefaults(plugin),
    orbitTrap: {
      ...base.coloring.orbitTrap,
      point: [...base.coloring.orbitTrap.point],
    },
    useSSAA: false,
    adaptiveIterations: false,
    // The renderer pipeline is the execution half of the FRM contract:
    // v2 consumes descriptors, after-step timing, and smooth capability;
    // v1 intentionally preserves the frozen legacy path.
    pipelineVersion: version,
    lighting: { ...base.coloring.lighting },
  };
}

/**
 * Compile one stored formula through both frozen semantics contracts without
 * registering either transient plugin. The returned plugins are intended for
 * instance-local preview renderers only; comparison must remain read-only
 * until the caller explicitly persists an upgrade.
 */
export function compareFrmSemantics({
  formulaId,
  source,
  experienceHint,
}: CompareFrmSemanticsInput): FrmSemanticsComparison {
  const v1Result = compileImportedFrm(source, formulaId, 1);
  const v2Result = compileImportedFrm(source, formulaId, 2);
  const metadataHint =
    formulaMetadataToExperienceHint(v2Result.canonicalFormula?.metadata) ??
    formulaMetadataToExperienceHint(v1Result.canonicalFormula?.metadata);
  const effectiveHint = mergeFormulaExperienceHints(
    experienceHint,
    metadataHint,
  );

  return {
    experienceHint: effectiveHint,
    v1: {
      version: 1,
      result: v1Result,
      previewParams: buildPreviewParams(v1Result, 1, effectiveHint),
    },
    v2: {
      version: 2,
      result: v2Result,
      previewParams: buildPreviewParams(v2Result, 2, effectiveHint),
    },
  };
}
