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
  ) => { success: boolean; error?: string };
  deleteFormula: (id: string) => void;
  renameFormula: (id: string, newName: string) => { success: boolean; error?: string };
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
    } catch (error) {
      console.error('Failed to save custom formulas:', error);
    }
  }, []);

  const saveFormula = useCallback(
    (
      name: string,
      source: string,
      experienceHint?: FormulaExperienceHint,
      existingId?: string
    ): { success: boolean; error?: string } => {
      if (!existingId && formulas.length >= MAX_CUSTOM_FORMULAS) {
        return { success: false, error: `Maximum count reached (${MAX_CUSTOM_FORMULAS})` };
      }

      const existingFormula = existingId ? formulas.find(formula => formula.id === existingId) : undefined;
      if (existingId && !existingFormula) {
        return { success: false, error: 'Formula does not exist' };
      }

      const id = existingId ?? `custom-${Date.now()}`;

      const resolution = resolveCustomFormula({ id, source, experienceHint });
      if (!resolution.success) {
        return { success: false, error: resolution.errors.join('; ') };
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
      setFormulas(updated);
      persistFormulas(updated.map(toPersistedFormula));

      return { success: true };
    },
    [formulas, persistFormulas]
  );

  const deleteFormula = useCallback(
    (id: string) => {
      const formula = formulas.find((f) => f.id === id);
      if (formula?.plugin) {
        try {
          pluginRegistry.unregister('formula', formula.plugin.id);
        } catch (error) {
          console.warn('Failed to unregister plugin:', error);
        }
      }

      const updated = formulas.filter((f) => f.id !== id);
      setFormulas(updated);
      persistFormulas(updated.map(toPersistedFormula));
    },
    [formulas, persistFormulas]
  );

  const renameFormula = useCallback(
    (id: string, newName: string): { success: boolean; error?: string } => {
      const formula = formulas.find((f) => f.id === id);
      if (!formula) {
        return { success: false, error: 'Formula does not exist' };
      }

      const updated = formulas.map((f) => {
        if (f.id === id) {
          const updatedFormula = { ...f, name: newName, updatedAt: Date.now() };
          const resolution = resolveCustomFormula(updatedFormula);
          if (resolution.success) {
            return {
              ...updatedFormula,
              experienceHint: resolution.experienceHint,
              plugin: resolution.plugin,
              error: undefined,
            };
          }
          return {
            ...updatedFormula,
            error: resolution.errors.join('; '),
          };
        }
        return f;
      });

      setFormulas(updated);
      persistFormulas(updated.map(toPersistedFormula));

      return { success: true };
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
