import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import { compileFrm } from '@/engine/frm/compile';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { FormulaPlugin } from '@/engine/plugins/types';

export interface ResolvableCustomFormula {
  id: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
}

export type FormulaResolutionErrorCode =
  | 'formula-not-found'
  | 'builtin-unavailable'
  | 'builtin-id-conflict'
  | 'compile-failed'
  | 'registration-failed';

export interface ResolvedFormula {
  success: true;
  formulaId: string;
  kind: 'builtin' | 'custom';
  plugin: FormulaPlugin;
  experienceHint?: FormulaExperienceHint;
}

export interface FormulaResolutionFailure {
  success: false;
  formulaId: string;
  code: FormulaResolutionErrorCode;
  errors: string[];
}

export type FormulaResolution = ResolvedFormula | FormulaResolutionFailure;

interface ResolveCustomFormulaOptions {
  register?: boolean;
}

function failure(
  formulaId: string,
  code: FormulaResolutionErrorCode,
  errors: string[]
): FormulaResolutionFailure {
  return {
    success: false,
    formulaId,
    code,
    errors,
  };
}

/** Session-scoped asset bytes (v0.4.16): every successfully registered
 *  in-memory formula keeps its source here so envelope creation (save,
 *  download, export) includes it even when local formula storage is empty
 *  — the cross-device draft case (review P1). Session-only, never
 *  persisted. */
const sessionAssets = new Map<string, { id: string; source: string }>();

export function readSessionFormulaAssets(): Array<{ id: string; source: string }> {
  return [...sessionAssets.values()].map((asset) => ({ ...asset }));
}

export function resolveCustomFormula(
  formula: ResolvableCustomFormula,
  options: ResolveCustomFormulaOptions = {}
): FormulaResolution {
  if (getFormulaMetadata(formula.id)) {
    return failure(formula.id, 'builtin-id-conflict', [
      `Custom formula ID conflicts with built-in formula: ${formula.id}.`,
    ]);
  }

  const result = compileFrm(formula.source, formula.id);
  const experienceHint = mergeFormulaExperienceHints(
    formula.experienceHint,
    formulaMetadataToExperienceHint(result.canonicalFormula?.metadata)
  );

  if (!result.success || !result.plugin) {
    return failure(
      formula.id,
      'compile-failed',
      result.errors.length > 0
        ? result.errors
        : [`Custom formula could not be compiled: ${formula.id}.`]
    );
  }

  if (options.register !== false) {
    try {
      pluginRegistry.register(result.plugin);
      sessionAssets.set(formula.id, { id: formula.id, source: formula.source });
    } catch (error) {
      return failure(formula.id, 'registration-failed', [
        error instanceof Error
          ? error.message
          : `Custom formula could not be registered: ${formula.id}.`,
      ]);
    }
  }

  return {
    success: true,
    formulaId: formula.id,
    kind: 'custom',
    plugin: result.plugin,
    experienceHint,
  };
}

export function resolveFormulaReference(
  formulaId: string,
  customFormulas: readonly ResolvableCustomFormula[]
): FormulaResolution {
  if (getFormulaMetadata(formulaId)) {
    let plugin = pluginRegistry.getFormula(formulaId);
    if (!plugin) {
      registerBuiltins({ quiet: true });
      plugin = pluginRegistry.getFormula(formulaId);
    }

    if (!plugin) {
      return failure(formulaId, 'builtin-unavailable', [
        `Built-in formula plugin is unavailable: ${formulaId}.`,
      ]);
    }

    return {
      success: true,
      formulaId,
      kind: 'builtin',
      plugin,
    };
  }

  const customFormula = customFormulas.find((formula) => formula.id === formulaId);
  if (!customFormula) {
    const transientPlugin = pluginRegistry.getFormula(formulaId);
    if (transientPlugin) {
      return {
        success: true,
        formulaId,
        kind: 'custom',
        plugin: transientPlugin,
      };
    }

    return failure(formulaId, 'formula-not-found', [
      `Custom formula source is unavailable on this device: ${formulaId}.`,
    ]);
  }

  return resolveCustomFormula(customFormula);
}
