import {
  DEFAULT_FRACTAL_DOCUMENT,
  type ColoringState,
  type FormulaState,
  type FractalDocument,
} from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import {
  getFormulaMetadata,
  getFormulaSelectionDefaults,
} from '@/engine/plugins/formula-catalog';

function mergeFormulaSelection(
  current: FormulaState,
  patch: Partial<FormulaState>
): FormulaState {
  const hasParamsPatch = patch.params !== undefined;

  return {
    ...current,
    ...patch,
    params: hasParamsPatch
      ? {
          ...current.params,
          ...patch.params,
          formula:
            patch.params && 'formula' in patch.params
              ? patch.params.formula
              : current.params?.formula,
        }
      : current.params,
  };
}

function mergeColoringSelection(
  current: ColoringState,
  patch: Partial<ColoringState>
): ColoringState {
  const hasParamsPatch = patch.params !== undefined;

  return {
    ...current,
    ...patch,
    orbitTrap: patch.orbitTrap
      ? { ...current.orbitTrap, ...patch.orbitTrap }
      : current.orbitTrap,
    lighting: patch.lighting
      ? { ...current.lighting, ...patch.lighting }
      : current.lighting,
    params: hasParamsPatch
      ? {
          ...current.params,
          ...patch.params,
          outside:
            patch.params && 'outside' in patch.params
              ? patch.params.outside
              : current.params?.outside,
          inside:
            patch.params && 'inside' in patch.params
              ? patch.params.inside
              : current.params?.inside,
          coloringScript:
            patch.params && 'coloringScript' in patch.params
              ? patch.params.coloringScript
              : current.params?.coloringScript,
        }
      : current.params,
  };
}

export function applyFormulaSelectionDefaults(
  document: FractalDocument,
  formulaId: string
): FractalDocument {
  const selection = getFormulaSelectionDefaults(formulaId);
  const formula = mergeFormulaSelection(document.formula, selection.formula);
  const coloring = selection.coloring
    ? mergeColoringSelection(document.coloring, selection.coloring)
    : document.coloring;

  return normalizeFractalDocument({
    ...document,
    scene: {
      ...document.scene,
      bounds: {
        ...document.scene.bounds,
        ...selection.bounds,
      },
    },
    formula,
    coloring,
  });
}

export function buildFormulaDefaultDocument(formulaId: string): FractalDocument {
  if (!getFormulaMetadata(formulaId)) {
    throw new Error(`Unknown built-in formula: ${formulaId}`);
  }

  return applyFormulaSelectionDefaults(
    normalizeFractalDocument(DEFAULT_FRACTAL_DOCUMENT),
    formulaId
  );
}
