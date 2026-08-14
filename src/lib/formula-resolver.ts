import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import { compileImportedFrm } from '@/engine/frm/compile';
import {
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from '@/engine/frm/semantics-version';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { canonicalizeCloudCustomFormulaRuntimeId } from '@/lib/cloud/custom-formula-identity';

export interface ResolvableCustomFormula {
  id: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
  /** Missing is the frozen legacy v1 contract; new content passes v2 explicitly. */
  frmSemanticsVersion?: FrmSemanticsVersion;
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
  /** Present for custom formulas; built-ins follow the document pipeline. */
  frmSemanticsVersion?: FrmSemanticsVersion;
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

function experienceHintsEqual(
  left?: FormulaExperienceHint,
  right?: FormulaExperienceHint,
): boolean {
  return (
    left?.bounds?.centerX === right?.bounds?.centerX &&
    left?.bounds?.centerY === right?.bounds?.centerY &&
    left?.bounds?.zoom === right?.bounds?.zoom &&
    left?.bounds?.rotation === right?.bounds?.rotation &&
    left?.coloring?.outsideColoringId === right?.coloring?.outsideColoringId &&
    left?.coloring?.insideColoringId === right?.coloring?.insideColoringId &&
    left?.coloring?.paletteIndex === right?.coloring?.paletteIndex
  );
}

/** Session-scoped asset bytes (v0.4.16): every successfully registered
 *  in-memory formula keeps its source here so envelope creation (save,
 *  download, export) includes it even when local formula storage is empty
 *  — the cross-device draft case (review P1). Session-only, never
 *  persisted. */
const sessionAssets = new Map<string, ResolvableCustomFormula>();

function canonicalizeCustomFormula(
  formula: ResolvableCustomFormula,
): ResolvableCustomFormula {
  const id = canonicalizeCloudCustomFormulaRuntimeId(formula.id);
  return id === formula.id ? formula : { ...formula, id };
}

export function readSessionFormulaAssets(): ResolvableCustomFormula[] {
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
): ResolvableCustomFormula[] {
  const all = readSessionFormulaAssets();
  const canonicalReference =
    referencedFormulaId === undefined
      ? undefined
      : canonicalizeCloudCustomFormulaRuntimeId(referencedFormulaId);
  return referencedFormulaId === undefined
    ? all
    : all.filter((asset) => asset.id === canonicalReference);
}

export function resolveCustomFormula(
  formula: ResolvableCustomFormula,
  options: ResolveCustomFormulaOptions = {}
): FormulaResolution {
  const canonicalFormula = canonicalizeCustomFormula(formula);
  if (getFormulaMetadata(canonicalFormula.id)) {
    return failure(canonicalFormula.id, 'builtin-id-conflict', [
      `Custom formula ID conflicts with built-in formula: ${canonicalFormula.id}.`,
    ]);
  }

  const frmSemanticsVersion = resolveFrmSemanticsVersion(
    canonicalFormula.frmSemanticsVersion,
  );
  const result = compileImportedFrm(
    canonicalFormula.source,
    canonicalFormula.id,
    frmSemanticsVersion,
  );
  const experienceHint = mergeFormulaExperienceHints(
    canonicalFormula.experienceHint,
    formulaMetadataToExperienceHint(result.canonicalFormula?.metadata)
  );

  if (!result.success || !result.plugin) {
    return failure(
      canonicalFormula.id,
      'compile-failed',
      result.errors.length > 0
        ? result.errors
        : [`Custom formula could not be compiled: ${canonicalFormula.id}.`]
    );
  }

  if (options.register !== false) {
    try {
      const previous = sessionAssets.get(canonicalFormula.id);
      pluginRegistry.register(result.plugin);
      const nextAsset: ResolvableCustomFormula = {
        ...canonicalFormula,
        frmSemanticsVersion,
      };
      sessionAssets.set(canonicalFormula.id, nextAsset);
      // Re-resolve Explore only when the effective asset changed. An exact
      // re-registration stays silent (B1 event-storm guard), while an
      // explicit v1↔v2 change must replace the active runtime immediately.
      const changed =
        !previous ||
        previous.source !== nextAsset.source ||
        previous.frmSemanticsVersion !== nextAsset.frmSemanticsVersion ||
        !experienceHintsEqual(
          previous.experienceHint,
          nextAsset.experienceHint,
        );
      if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
      }
    } catch (error) {
      return failure(canonicalFormula.id, 'registration-failed', [
        error instanceof Error
          ? error.message
          : `Custom formula could not be registered: ${canonicalFormula.id}.`,
      ]);
    }
  }

  return {
    success: true,
    formulaId: canonicalFormula.id,
    kind: 'custom',
    plugin: result.plugin,
    experienceHint,
    frmSemanticsVersion,
  };
}

export function resolveFormulaReference(
  formulaId: string,
  customFormulas: readonly ResolvableCustomFormula[]
): FormulaResolution {
  const canonicalFormulaId = canonicalizeCloudCustomFormulaRuntimeId(formulaId);
  if (getFormulaMetadata(canonicalFormulaId)) {
    let plugin = pluginRegistry.getFormula(canonicalFormulaId);
    if (!plugin) {
      registerBuiltins({ quiet: true });
      plugin = pluginRegistry.getFormula(canonicalFormulaId);
    }

    if (!plugin) {
      return failure(canonicalFormulaId, 'builtin-unavailable', [
        `Built-in formula plugin is unavailable: ${canonicalFormulaId}.`,
      ]);
    }

    return {
      success: true,
      formulaId: canonicalFormulaId,
      kind: 'builtin',
      plugin,
    };
  }

  const customFormula = customFormulas.find(
    (formula) =>
      canonicalizeCloudCustomFormulaRuntimeId(formula.id) === canonicalFormulaId,
  );
  if (!customFormula) {
    const transientPlugin = pluginRegistry.getFormula(canonicalFormulaId);
    if (transientPlugin) {
      return {
        success: true,
        formulaId: canonicalFormulaId,
        kind: 'custom',
        plugin: transientPlugin,
        frmSemanticsVersion: resolveFrmSemanticsVersion(
          transientPlugin.frmSemanticsVersion,
        ),
      };
    }

    return failure(canonicalFormulaId, 'formula-not-found', [
      `Custom formula source is unavailable on this device: ${canonicalFormulaId}.`,
    ]);
  }

  // register:false — the formula listed in session assets was registered
  // when it entered; re-registering here would re-dispatch the changed
  // event and self-excite the resolution listener (review B1 storm).
  return resolveCustomFormula(canonicalizeCustomFormula(customFormula), {
    register: false,
  });
}
