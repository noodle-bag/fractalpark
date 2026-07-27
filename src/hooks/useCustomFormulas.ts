/**
 * Custom Formula Persistence Hook
 * M4.2 Phase 2.2
 * 
 * Manages user-defined .frm formulas in localStorage
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { pluginRegistry } from '@/engine/plugins/registry';
import {
  CUSTOM_FORMULAS_CHANGED_EVENT,
  CUSTOM_FORMULAS_STORAGE_KEY,
  MAX_CUSTOM_FORMULAS,
  readPersistedCustomFormulas,
  type PersistedCustomFormula,
} from '@/lib/custom-formula-storage';
import { resolveCustomFormula } from '@/lib/formula-resolver';

export { CUSTOM_FORMULAS_STORAGE_KEY } from '@/lib/custom-formula-storage';
export type CustomFormula = PersistedCustomFormula;

export interface CustomFormulaWithPlugin extends CustomFormula {
  plugin?: FormulaPlugin;
  error?: string;
}

export type CustomFormulaMutationErrorCode =
  | 'max-count'
  | 'formula-not-found'
  | 'storage-unavailable'
  | 'compile-failed';

export interface CustomFormulaMutationResult {
  success: boolean;
  id?: string;
  plugin?: FormulaPlugin;
  experienceHint?: FormulaExperienceHint;
  code?: CustomFormulaMutationErrorCode;
  error?: string;
}

function toPersistedFormula(formula: CustomFormulaWithPlugin): CustomFormula {
  return {
    id: formula.id,
    name: formula.name,
    source: formula.source,
    experienceHint: formula.experienceHint,
    createdAt: formula.createdAt,
    updatedAt: formula.updatedAt,
  };
}

function resolvePersistedFormula(
  formula: CustomFormula
): CustomFormulaWithPlugin {
  const resolution = resolveCustomFormula(formula);
  if (!resolution.success) {
    return {
      ...formula,
      error: resolution.errors.join('; '),
    };
  }

  return {
    ...formula,
    experienceHint: resolution.experienceHint,
    plugin: resolution.plugin,
  };
}

interface UseCustomFormulasReturn {
  formulas: CustomFormulaWithPlugin[];
  isLoading: boolean;
  saveFormula: (
    name: string,
    source: string,
    experienceHint?: FormulaExperienceHint,
    existingId?: string
  ) => CustomFormulaMutationResult;
  deleteFormula: (id: string) => CustomFormulaMutationResult;
  renameFormula: (id: string, newName: string) => CustomFormulaMutationResult;
  recompileAll: () => void;
  canAddMore: boolean;
  remainingSlots: number;
}

export function useCustomFormulas(): UseCustomFormulasReturn {
  const [formulas, setFormulas] = useState<CustomFormulaWithPlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFormulas = () => {
      try {
        const parsed = readPersistedCustomFormulas();
        const withPlugins = parsed.map(resolvePersistedFormula);
        setFormulas(withPlugins);
      } catch (error) {
        console.error('Failed to load custom formulas:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFormulas();
    window.addEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, loadFormulas);
    return () => {
      window.removeEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, loadFormulas);
    };
  }, []);

  // Save formulas to localStorage
  const persistFormulas = useCallback((formulasToSave: CustomFormula[]) => {
    try {
      localStorage.setItem(CUSTOM_FORMULAS_STORAGE_KEY, JSON.stringify(formulasToSave));
      return true;
    } catch (error) {
      console.error('Failed to save custom formulas:', error);
      return false;
    }
  }, []);

  const saveFormula = useCallback(
    (
      name: string,
      source: string,
      experienceHint?: FormulaExperienceHint,
      existingId?: string
    ): CustomFormulaMutationResult => {
      if (!existingId && formulas.length >= MAX_CUSTOM_FORMULAS) {
        return { success: false, code: 'max-count' };
      }

      const existingFormula = existingId ? formulas.find(formula => formula.id === existingId) : undefined;
      if (existingId && !existingFormula) {
        return { success: false, code: 'formula-not-found' };
      }

      const id = existingId ?? `custom-${Date.now()}`;

      const resolution = resolveCustomFormula({ id, source, experienceHint });
      if (!resolution.success) {
        return {
          success: false,
          code: 'compile-failed',
          error: resolution.errors.join('; '),
        };
      }

      const newFormula: CustomFormula = {
        id,
        name,
        source,
        experienceHint: resolution.experienceHint,
        createdAt: existingFormula?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      const updated = existingFormula
        ? formulas.map((formula) =>
            formula.id === id
              ? { ...newFormula, plugin: resolution.plugin }
              : formula
          )
        : [...formulas, { ...newFormula, plugin: resolution.plugin }];
      if (!persistFormulas(updated.map(toPersistedFormula))) {
        try {
          if (existingFormula) {
            resolveCustomFormula(existingFormula);
          } else {
            pluginRegistry.unregister('formula', id);
          }
        } catch (error) {
          console.warn('Failed to roll back formula registration:', error);
        }
        return { success: false, code: 'storage-unavailable' };
      }
      setFormulas(updated);

      window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
      return {
        success: true,
        id,
        plugin: resolution.plugin,
        experienceHint: resolution.experienceHint,
      };
    },
    [formulas, persistFormulas]
  );

  const deleteFormula = useCallback(
    (id: string): CustomFormulaMutationResult => {
      const formula = formulas.find((f) => f.id === id);
      if (!formula) {
        return { success: false, code: 'formula-not-found' };
      }

      const updated = formulas.filter((f) => f.id !== id);
      if (!persistFormulas(updated.map(toPersistedFormula))) {
        return { success: false, code: 'storage-unavailable' };
      }

      if (formula.plugin) {
        try {
          pluginRegistry.unregister('formula', formula.plugin.id);
        } catch (error) {
          console.warn('Failed to unregister plugin:', error);
        }
      }

      setFormulas(updated);
      window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
      return { success: true, id };
    },
    [formulas, persistFormulas]
  );

  const renameFormula = useCallback(
    (id: string, newName: string): CustomFormulaMutationResult => {
      const formula = formulas.find((f) => f.id === id);
      if (!formula) {
        return { success: false, code: 'formula-not-found' };
      }

      const updated = formulas.map((f) =>
        f.id === id
          ? { ...f, name: newName, updatedAt: Date.now() }
          : f
      );

      if (!persistFormulas(updated.map(toPersistedFormula))) {
        return { success: false, code: 'storage-unavailable' };
      }

      setFormulas(updated);
      window.dispatchEvent(new Event(CUSTOM_FORMULAS_CHANGED_EVENT));
      return { success: true, id };
    },
    [formulas, persistFormulas]
  );

  const recompileAll = useCallback(() => {
    const updated = formulas.map((formula) => {
      const resolved = resolvePersistedFormula(formula);
      return resolved.plugin
        ? { ...resolved, error: undefined }
        : resolved;
    });

    setFormulas(updated);
  }, [formulas]);

  return {
    formulas,
    isLoading,
    saveFormula,
    deleteFormula,
    renameFormula,
    recompileAll,
    canAddMore: formulas.length < MAX_CUSTOM_FORMULAS,
    remainingSlots: MAX_CUSTOM_FORMULAS - formulas.length,
  };
}

export default useCustomFormulas;
