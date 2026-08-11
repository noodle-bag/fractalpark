import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import { compileImportedFrm } from '@/engine/frm/compile';
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

/** Cloud quota mirror for list badges (spec §17.1). */
export const MAX_CUSTOM_FORMULAS = 50;

/** Cross-component signal that the session formula registry changed; the
 *  Explore canvas re-resolves on it (replaces the localStorage event). */
export const CUSTOM_FORMULAS_CHANGED_EVENT = 'fractalpark:custom-formulas-changed';

/** Assets for envelope creation: session-registered bytes only, filtered
 *  to the formula the document references (single-asset publish gate). */
export function readEffectiveFormulaAssets(
  referencedFormulaId?: string,
): Array<{ id: string; source: string }> {
  const all = readSessionFormulaAssets();
  return referencedFormulaId === undefined
    ? all
    : all.filter((asset) => asset.id === referencedFormulaId);
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

  const result = compileImportedFrm(formula.source, formula.id);
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
      // Dispatch only for genuinely new ids: re-registering the same id
      // must not re-signal (pairs with the register:false fix — B1).
      const isNew = !sessionAssets.has(formula.id);
      sessionAssets.set(formula.id, { id: formula.id, source: formula.source });
      if (isNew && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
      }
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

  // register:false — the formula listed in session assets was registered
  // when it entered; re-registering here would re-dispatch the changed
  // event and self-excite the resolution listener (review B1 storm).
  return resolveCustomFormula(customFormula, { register: false });
}
