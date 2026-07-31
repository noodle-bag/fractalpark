import {
  DEFAULT_FRACTAL_DOCUMENT,
  type ColoringState,
  type FormulaState,
  type FractalDocument,
} from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import { registerBuiltins } from '@/engine/plugins/builtins';
import {
  getFormulaMetadata,
  getFormulaSelectionDefaults,
} from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import type {
  PluginParamRecord,
  PluginParamValue,
} from '@/engine/types';

function clonePluginParamValue(value: PluginParamValue): PluginParamValue {
  return Array.isArray(value)
    ? [...value] as PluginParamValue
    : value;
}

function getBuiltinFormulaUniformDefaults(formulaId: string): PluginParamRecord {
  registerBuiltins({ quiet: true });
  const plugin = pluginRegistry.getFormula(formulaId);

  if (!plugin || plugin.source !== 'builtin') {
    throw new Error(`Built-in formula plugin is unavailable: ${formulaId}`);
  }

  return Object.fromEntries(
    plugin.uniforms.map((uniform) => [
      uniform.name,
      clonePluginParamValue(uniform.default as PluginParamValue),
    ])
  );
}

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
  const metadata = getFormulaMetadata(formulaId);
  if (!metadata) {
    throw new Error(`Unknown built-in formula: ${formulaId}`);
  }

  const selection = getFormulaSelectionDefaults(formulaId);
  const uniformDefaults = getBuiltinFormulaUniformDefaults(formulaId);
  const formulaPatch = metadata.defaultProfile
    ? selection.formula
    : {
        ...selection.formula,
        params: {
          formula: uniformDefaults,
        },
      };
  const formula = mergeFormulaSelection(document.formula, formulaPatch);
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
