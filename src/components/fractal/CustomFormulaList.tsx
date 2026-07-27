/**
 * Custom Formula List Component
 * M4.2 Phase 2.2
 * 
 * Displays and manages user-defined custom formulas
 */

'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Edit2, 
  Trash2, 
  Plus, 
  AlertCircle, 
  CheckCircle,
  Code,
  ExternalLink,
} from 'lucide-react';

import {
  useCustomFormulas,
  type CustomFormulaMutationResult,
  type CustomFormulaWithPlugin,
} from '@/hooks/useCustomFormulas';
import { FormulaEditor } from './FormulaEditor';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { CUSTOM_FORMULA_EXAMPLES } from '@/engine/frm/example-library';
import type { ViewBounds } from '@/engine/types';
import { MAX_CUSTOM_FORMULAS } from '@/lib/custom-formula-storage';

interface CustomFormulaListProps {
  currentBounds?: ViewBounds;
  onSelectFormula?: (plugin: FormulaPlugin, experienceHint?: FormulaExperienceHint) => void;
}

export function CustomFormulaList({ currentBounds, onSelectFormula }: CustomFormulaListProps) {
  const t = useTranslations('explore');
  const customT = useTranslations('explore.formula.customLibrary');
  const locale = useLocale();
  const { 
    formulas, 
    isLoading, 
    saveFormula, 
    deleteFormula, 
    renameFormula, 
    canAddMore,
  } = useCustomFormulas();
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | undefined>(undefined);
  const [editorSource, setEditorSource] = useState<string | undefined>(undefined);
  const [editorExperienceHint, setEditorExperienceHint] = useState<FormulaExperienceHint | undefined>(undefined);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState('');

  const localizeMutationResult = (
    result: CustomFormulaMutationResult
  ): CustomFormulaMutationResult => {
    if (result.success) return result;
    const error = (() => {
      switch (result.code) {
        case 'max-count':
          return customT('maxReached', { count: MAX_CUSTOM_FORMULAS });
        case 'formula-not-found':
          return customT('formulaNotFound');
        case 'storage-unavailable':
          return customT('storageUnavailable');
        case 'compile-failed':
          return result.error ?? customT('compileFailed');
        default:
          return result.error ?? customT('storageUnavailable');
      }
    })();
    return { ...result, error };
  };

  const openBlankEditor = () => {
    setActionError('');
    setEditingFormulaId(undefined);
    setEditorSource(undefined);
    setEditorExperienceHint(undefined);
    setShowEditor(true);
  };

  const openFormulaEditor = (formula?: CustomFormulaWithPlugin) => {
    setActionError('');
    setEditingFormulaId(formula?.id);
    setEditorSource(formula?.source);
    setEditorExperienceHint(formula?.experienceHint);
    setShowEditor(true);
  };

  const handleSave = (name: string, source: string, experienceHint?: FormulaExperienceHint) => {
    const result = localizeMutationResult(
      saveFormula(name, source, experienceHint, editingFormulaId)
    );
    if (result.success) {
      setActionError('');
      if (result.plugin) {
        onSelectFormula?.(result.plugin, result.experienceHint);
      }
      setShowEditor(false);
      setEditingFormulaId(undefined);
    } else {
      setActionError(result.error ?? '');
    }
    return result;
  };

  const handleDelete = (id: string) => {
    if (confirm(customT('deleteConfirm'))) {
      const result = localizeMutationResult(deleteFormula(id));
      setActionError(result.success ? '' : result.error ?? '');
    }
  };

  const handleRename = (id: string) => {
    if (newName.trim()) {
      const result = localizeMutationResult(renameFormula(id, newName.trim()));
      if (!result.success) {
        setActionError(result.error ?? '');
        return;
      }
    }
    setActionError('');
    setRenamingId(null);
    setNewName('');
  };

  const handleSelect = (formula: CustomFormulaWithPlugin) => {
    if (formula.plugin) {
      onSelectFormula?.(formula.plugin, formula.experienceHint);
    }
  };

  if (showEditor) {
    return (
      <FormulaEditor
        formulaId={editingFormulaId}
        initialSource={editorSource}
        initialExperienceHint={editorExperienceHint}
        currentBounds={currentBounds}
        onSave={(name, source, experienceHint) => handleSave(name, source, experienceHint)}
        onCompile={(plugin, experienceHint) => {
          onSelectFormula?.(plugin, experienceHint);
        }}
        onClose={() => {
          setShowEditor(false);
          setEditingFormulaId(undefined);
          setEditorSource(undefined);
          setEditorExperienceHint(undefined);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">{customT('title')}</CardTitle>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/${locale}/formulas/editor`}>
              <ExternalLink className="mr-1 size-3" />
              {customT('openStandaloneEditor')}
            </a>
          </Button>
          <Badge variant="secondary">{formulas.length}/{MAX_CUSTOM_FORMULAS}</Badge>
          {canAddMore && (
            <Button size="sm" onClick={openBlankEditor}>
              <Plus className="w-4 h-4 mr-1" />
              {customT('new')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
        <div className="rounded-lg border border-dashed p-3 bg-muted/30">
          <div className="mb-3">
            <div className="text-sm font-medium">{customT('examplesTitle')}</div>
            <p className="text-xs text-muted-foreground mt-1">{customT('examplesDescription')}</p>
          </div>
          <div className="grid gap-2">
            {CUSTOM_FORMULA_EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                className="rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60"
                onClick={() => {
                  setEditorSource(example.source);
                  setEditorExperienceHint(example.experienceHint);
                  setShowEditor(true);
                }}
              >
                <div className="font-medium">{t(example.nameKey)}</div>
                <div className="text-xs text-muted-foreground mt-1">{t(example.descriptionKey)}</div>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">{customT('loading')}</div>
        ) : formulas.length === 0 ? (
          <div className="text-center py-8">
            <Code className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">{customT('empty')}</p>
            {canAddMore && (
              <Button onClick={openBlankEditor}>
                <Plus className="w-4 h-4 mr-2" />
                {customT('createFirst')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {formulas.map((formula) => (
              <div
                key={formula.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {formula.plugin ? (
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    {renamingId === formula.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(formula.id);
                            if (e.key === 'Escape') {
                              setRenamingId(null);
                              setNewName('');
                            }
                          }}
                          autoFocus
                          className="h-8"
                        />
                        <Button 
                          size="sm" 
                          onClick={() => handleRename(formula.id)}
                        >
                          {customT('renameConfirm')}
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <button
                          onClick={() => handleSelect(formula)}
                          className="font-medium hover:underline text-left truncate block"
                          disabled={!formula.plugin}
                        >
                          {formula.name}
                        </button>
                        {formula.error && (
                          <p className="text-xs text-red-500 truncate">{formula.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {renamingId !== formula.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setRenamingId(formula.id);
                          setNewName(formula.name);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          openFormulaEditor(formula);
                        }}
                      >
                        <Code className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(formula.id)}
                        data-testid="delete-formula"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!canAddMore && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            {customT('maxReached', { count: MAX_CUSTOM_FORMULAS })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default CustomFormulaList;
