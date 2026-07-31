import type { FractalDocument } from '@/engine/document';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { pluginRegistry } from '@/engine/plugins/registry';
import type {
  LocalFormulaAsset,
  PreparedFractalProjectImport,
} from '@/lib/fractal-file';
import { resolveCustomFormula } from '@/lib/formula-resolver';

export const CUSTOM_FORMULAS_STORAGE_KEY = 'myfrac-custom-formulas';
export const CUSTOM_FORMULAS_CHANGED_EVENT = 'fractalpark:custom-formulas-changed';
export const MAX_CUSTOM_FORMULAS = 50;

export interface PersistedCustomFormula {
  id: string;
  name: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
  createdAt: number;
  updatedAt: number;
}

export type FormulaImportCommitResult =
  | { success: true }
  | {
      success: false;
      code: 'invalid-formula-storage' | 'formula-limit-reached' | 'formula-commit-failed';
    };

function isPersistedCustomFormula(value: unknown): value is PersistedCustomFormula {
  return Boolean(
    typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'name' in value &&
      typeof value.name === 'string' &&
      'source' in value &&
      typeof value.source === 'string' &&
      'createdAt' in value &&
      typeof value.createdAt === 'number' &&
      'updatedAt' in value &&
      typeof value.updatedAt === 'number'
  );
}

export function readPersistedCustomFormulas(): PersistedCustomFormula[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(CUSTOM_FORMULAS_STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isPersistedCustomFormula)) {
    throw new Error('Custom formula storage is invalid.');
  }
  return parsed;
}

export function readLocalFormulaAssets(): LocalFormulaAsset[] {
  try {
    return readPersistedCustomFormulas().map(({ id, name, source }) => ({
      id,
      name,
      source,
    }));
  } catch {
    return [];
  }
}

export function notifyCustomFormulasChanged(): void {
  window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
}

export function commitPreparedFractalProjectImport(
  prepared: PreparedFractalProjectImport,
  loadDocument: (document: FractalDocument) => void
): FormulaImportCommitResult {
  const originalRaw = localStorage.getItem(CUSTOM_FORMULAS_STORAGE_KEY);
  let existing: PersistedCustomFormula[];

  try {
    existing = readPersistedCustomFormulas();
  } catch {
    return { success: false, code: 'invalid-formula-storage' };
  }

  if (existing.length + prepared.formulasToAdd.length > MAX_CUSTOM_FORMULAS) {
    return { success: false, code: 'formula-limit-reached' };
  }

  const resolved = prepared.formulasToAdd.map((formula) =>
    resolveCustomFormula(formula, { register: false })
  );
  if (resolved.some((resolution) => !resolution.success)) {
    return { success: false, code: 'formula-commit-failed' };
  }

  const now = Date.now();
  const additions: PersistedCustomFormula[] = prepared.formulasToAdd.map(
    (formula, index) => {
      const resolution = resolved[index];
      return {
        id: formula.id,
        name: formula.name ?? formula.id,
        source: formula.source,
        experienceHint: resolution.success
          ? resolution.experienceHint
          : undefined,
        createdAt: now,
        updatedAt: now,
      };
    }
  );
  const registeredIds: string[] = [];

  try {
    localStorage.setItem(
      CUSTOM_FORMULAS_STORAGE_KEY,
      JSON.stringify([...existing, ...additions])
    );
    for (const formula of additions) {
      const resolution = resolveCustomFormula(formula);
      if (!resolution.success) {
        throw new Error(resolution.errors.join('; '));
      }
      registeredIds.push(resolution.formulaId);
    }
    loadDocument(prepared.document);
    notifyCustomFormulasChanged();
    return { success: true };
  } catch {
    for (const id of registeredIds) {
      pluginRegistry.unregister('formula', id);
    }
    if (originalRaw === null) {
      localStorage.removeItem(CUSTOM_FORMULAS_STORAGE_KEY);
    } else {
      localStorage.setItem(CUSTOM_FORMULAS_STORAGE_KEY, originalRaw);
    }
    notifyCustomFormulasChanged();
    return { success: false, code: 'formula-commit-failed' };
  }
}
