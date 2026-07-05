/**
 * Custom Formula Persistence Hook
 * M4.2 Phase 2.2
 * 
 * Manages user-defined .frm formulas in localStorage
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { compileFrm } from '@/engine/frm/compile';
import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
  type FormulaExperienceHint,
} from '@/engine/frm/authoring';
import { pluginRegistry } from '@/engine/plugins/registry';

const STORAGE_KEY = 'myfrac-custom-formulas';
const MAX_FORMULAS = 50;

export interface CustomFormula {
  id: string;
  name: string;
  source: string;
  experienceHint?: FormulaExperienceHint;
  createdAt: number;
  updatedAt: number;
}

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

  // Load formulas from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: CustomFormula[] = JSON.parse(stored);
        // Compile each formula
        const withPlugins = parsed.map((f) => {
          const result = compileFrm(f.source, f.id);
          const effectiveHint = mergeFormulaExperienceHints(
            f.experienceHint,
            formulaMetadataToExperienceHint(result.canonicalFormula?.metadata),
          );
          if (result.success && result.plugin) {
            // Register with plugin registry
            try {
              pluginRegistry.register(result.plugin);
            } catch {
              // May already be registered
            }
            return { ...f, experienceHint: effectiveHint, plugin: result.plugin };
          }
          return { ...f, experienceHint: effectiveHint, error: result.errors.join('; ') };
        });
        setFormulas(withPlugins);
      }
    } catch (error) {
      console.error('Failed to load custom formulas:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save formulas to localStorage
  const persistFormulas = useCallback((formulasToSave: CustomFormula[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formulasToSave));
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
      if (!existingId && formulas.length >= MAX_FORMULAS) {
        return { success: false, error: `Maximum count reached (${MAX_FORMULAS})` };
      }

      const existingFormula = existingId ? formulas.find(formula => formula.id === existingId) : undefined;
      if (existingId && !existingFormula) {
        return { success: false, error: 'Formula does not exist' };
      }

      const id = existingId ?? `custom-${Date.now()}`;

      // Compile with the persistent id so plugin.id matches CustomFormula.id
      const result = compileFrm(source, id);
      if (!result.success) {
        return { success: false, error: result.errors.join('; ') };
      }

      const effectiveHint = mergeFormulaExperienceHints(
        experienceHint,
        formulaMetadataToExperienceHint(result.canonicalFormula?.metadata),
      );

      const newFormula: CustomFormula = {
        id,
        name,
        source,
        experienceHint: effectiveHint,
        createdAt: existingFormula?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      // Register plugin
      if (result.plugin) {
        try {
          pluginRegistry.register(result.plugin);
        } catch (error) {
          console.warn('Failed to register plugin:', error);
        }
      }

      const updated = existingFormula
        ? formulas.map((formula) =>
            formula.id === id
              ? { ...newFormula, plugin: result.plugin }
              : formula
          )
        : [...formulas, { ...newFormula, plugin: result.plugin }];
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
          // Recompile with new name
          const result = compileFrm(f.source, f.id);
          if (result.success && result.plugin) {
            return { ...updatedFormula, plugin: result.plugin, error: undefined };
          }
          return { ...updatedFormula, error: result.errors.join('; ') };
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
    const updated = formulas.map((f) => {
      const result = compileFrm(f.source, f.id);
      const effectiveHint = mergeFormulaExperienceHints(
        f.experienceHint,
        formulaMetadataToExperienceHint(result.canonicalFormula?.metadata),
      );
      if (result.success && result.plugin) {
        // Re-register
        try {
          pluginRegistry.register(result.plugin);
        } catch {
          // May already exist
        }
        return { ...f, experienceHint: effectiveHint, plugin: result.plugin, error: undefined };
      }
      return { ...f, experienceHint: effectiveHint, error: result.errors.join('; ') };
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
    canAddMore: formulas.length < MAX_FORMULAS,
    remainingSlots: MAX_FORMULAS - formulas.length,
  };
}

export default useCustomFormulas;
