/**
 * Custom Formula List (v0.4.16, spec §17.1): the owner's cloud formula
 * library. Summaries render directly; a formula's source is fetched on
 * demand (select/edit) and registered in memory. Saving while anonymous
 * queues a sign-in intent and resumes the frozen write after OTP — the
 * library never touches browser storage.
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
  CheckCircle,
  Code,
  ExternalLink,
} from 'lucide-react';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import {
  useCloudFormulaLibrary,
  type FormulaMutationResult,
} from '@/hooks/useCloudFormulaLibrary';
import { resolveFormulaReference } from '@/lib/formula-resolver';
import { readSessionFormulaAssets } from '@/lib/formula-resolver';
import { FormulaEditor } from './FormulaEditor';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { CUSTOM_FORMULA_EXAMPLES } from '@/engine/frm/example-library';
import type { ViewBounds } from '@/engine/types';
import { MAX_CUSTOM_FORMULAS } from '@/lib/formula-resolver';
import type { CloudCustomFormulaSummary } from '@/lib/cloud/client';

interface CustomFormulaListProps {
  currentBounds?: ViewBounds;
  onSelectFormula?: (plugin: FormulaPlugin, experienceHint?: FormulaExperienceHint) => void;
}

export function CustomFormulaList({ currentBounds, onSelectFormula }: CustomFormulaListProps) {
  const t = useTranslations('explore');
  const customT = useTranslations('explore.formula.customLibrary');
  const locale = useLocale();
  const { state: session, openSignIn } = useCloudSession();
  const {
    formulas,
    isLoading,
    getDetail,
    ensureRegistered,
    saveFormula,
    deleteFormula,
    renameFormula,
  } = useCloudFormulaLibrary();

  const [showEditor, setShowEditor] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | undefined>(undefined);
  const [editorSource, setEditorSource] = useState<string | undefined>(undefined);
  const [editorExperienceHint, setEditorExperienceHint] = useState<FormulaExperienceHint | undefined>(undefined);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const authenticated = session.status === 'authenticated';

  const localizeError = (result: FormulaMutationResult): string => {
    switch (result.code) {
      case 'quota':
        return customT('maxReached', { count: MAX_CUSTOM_FORMULAS });
      case 'conflict':
        return customT('conflict');
      case 'not_found':
        return customT('formulaNotFound');
      case 'compile-failed':
        return customT('compileFailed');
      case 'builtin-conflict':
        return customT('builtinConflict');
      default:
        return customT('unavailable');
    }
  };

  const openBlankEditor = () => {
    setActionError('');
    setEditingFormulaId(undefined);
    setEditorSource(undefined);
    setEditorExperienceHint(undefined);
    setShowEditor(true);
  };

  const openFormulaEditor = async (formula: CloudCustomFormulaSummary) => {
    setActionError('');
    setBusyId(formula.id);
    const detail = await getDetail(formula.id);
    setBusyId(null);
    if (!detail) {
      setActionError(customT('unavailable'));
      return;
    }
    setEditingFormulaId(detail.id);
    setEditorSource(detail.source);
    setEditorExperienceHint(
      (detail.experienceHint ?? undefined) as FormulaExperienceHint | undefined,
    );
    setShowEditor(true);
  };

  const handleSave = async (
    name: string,
    source: string,
    experienceHint?: FormulaExperienceHint,
  ): Promise<{ success: boolean; error?: string; id?: string; silent?: boolean }> => {
    const result = await saveFormula({
      name,
      source,
      experienceHint,
      formulaId: editingFormulaId,
    });
    if (result.success) {
      setActionError('');
      const resolved = resolveFormulaReference(
        result.formulaId ?? '',
        readSessionFormulaAssets(),
      );
      if (resolved.success && resolved.kind === 'custom') {
        onSelectFormula?.(resolved.plugin, resolved.experienceHint);
      }
      setShowEditor(false);
      setEditingFormulaId(undefined);
      return { success: true, id: result.formulaId };
    }
    if (result.code === 'auth-intent') {
      // The OTP dialog is now the pending UI; close the editor quietly.
      setShowEditor(false);
      setEditingFormulaId(undefined);
      setActionError('');
      return { success: true, silent: true };
    }
    const message = localizeError(result);
    setActionError(message);
    return { success: false, error: message };
  };

  const handleDelete = async (id: string) => {
    if (!confirm(customT('deleteConfirm'))) return;
    setBusyId(id);
    const result = await deleteFormula(id);
    setBusyId(null);
    setActionError(result.success ? '' : localizeError(result));
  };

  const handleRename = async (id: string) => {
    if (newName.trim()) {
      setBusyId(id);
      const result = await renameFormula(id, newName.trim());
      setBusyId(null);
      if (!result.success) {
        setActionError(localizeError(result));
        return;
      }
    }
    setActionError('');
    setRenamingId(null);
    setNewName('');
  };

  const handleSelect = async (formula: CloudCustomFormulaSummary) => {
    setBusyId(formula.id);
    const registered = await ensureRegistered(formula.id);
    setBusyId(null);
    if (!registered) {
      setActionError(customT('unavailable'));
      return;
    }
    const resolved = resolveFormulaReference(formula.id, readSessionFormulaAssets());
    if (resolved.success) {
      setActionError('');
      onSelectFormula?.(resolved.plugin, resolved.experienceHint);
    } else {
      setActionError(resolved.errors.join('; '));
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
          {authenticated && (
            <Badge variant="secondary">{formulas.length}/{MAX_CUSTOM_FORMULAS}</Badge>
          )}
          {session.status !== 'unavailable' && (
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
                  setEditingFormulaId(undefined);
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

        {session.status === 'anonymous' ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">{customT('signInHint')}</p>
            <Button variant="outline" className="mt-3" onClick={() => openSignIn()}>
              {customT('signIn')}
            </Button>
          </div>
        ) : session.status === 'unavailable' ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {customT('unavailableHint')}
          </p>
        ) : isLoading ? (
          <div className="text-center py-4 text-muted-foreground">{customT('loading')}</div>
        ) : formulas.length === 0 ? (
          <div className="text-center py-8">
            <Code className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">{customT('empty')}</p>
            <Button onClick={openBlankEditor}>
              <Plus className="w-4 h-4 mr-2" />
              {customT('createFirst')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {formulas.map((formula) => (
              <div
                key={formula.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Cloud formulas compiled server-side at save time — a
                      listed formula is a valid one. */}
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />

                  <div className="flex-1 min-w-0">
                    {renamingId === formula.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRename(formula.id);
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
                          disabled={busyId === formula.id}
                          onClick={() => void handleRename(formula.id)}
                        >
                          {customT('renameConfirm')}
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <button
                          onClick={() => void handleSelect(formula)}
                          className="font-medium hover:underline text-left truncate block"
                          disabled={busyId === formula.id}
                        >
                          {formula.name}
                        </button>
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
                        disabled={busyId === formula.id}
                        onClick={() => void openFormulaEditor(formula)}
                      >
                        <Code className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyId === formula.id}
                        onClick={() => void handleDelete(formula.id)}
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

        {authenticated && formulas.length >= MAX_CUSTOM_FORMULAS && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            {customT('maxReached', { count: MAX_CUSTOM_FORMULAS })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default CustomFormulaList;
