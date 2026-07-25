import type { FractalDocument } from '@/engine/document';
import { compileFrm } from '@/engine/frm/compile';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { pluginRegistry } from '@/engine/plugins/registry';
import type {
  LocalFormulaAsset,
  PreparedFractalProjectImport,
} from '@/lib/fractal-file';

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

  const compiled = prepared.formulasToAdd.map((formula) => {
    const result = compileFrm(formula.source, formula.id);
    return result.success && result.plugin ? result.plugin : null;
  });
  if (compiled.some((plugin) => plugin === null)) {
    return { success: false, code: 'formula-commit-failed' };
  }

  const now = Date.now();
  const additions: PersistedCustomFormula[] = prepared.formulasToAdd.map((formula) => ({
    id: formula.id,
    name: formula.name ?? formula.id,
    source: formula.source,
    createdAt: now,
    updatedAt: now,
  }));
  const registeredIds: string[] = [];

  try {
    localStorage.setItem(
      CUSTOM_FORMULAS_STORAGE_KEY,
      JSON.stringify([...existing, ...additions])
    );
    for (const plugin of compiled) {
      if (plugin) {
        pluginRegistry.register(plugin);
        registeredIds.push(plugin.id);
      }
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
