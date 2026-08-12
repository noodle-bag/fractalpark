/**
 * Custom Formula List (v0.4.16, spec §17.1): the owner's cloud formula
 * library. Summaries render directly; a formula's source is fetched on
 * demand (select/edit) and registered in memory. Saving while anonymous
 * queues a sign-in intent and resumes the frozen write after OTP — the
 * library never touches browser storage.
 */

'use client';

import React, { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
import type { CustomFormulaSemanticsAction } from '@/lib/cloud/client';
import { resolveFormulaReference } from '@/lib/formula-resolver';
import { readSessionFormulaAssets } from '@/lib/formula-resolver';
import { FormulaEditor } from './FormulaEditor';
import { FrmSemanticsComparisonView } from './FrmSemanticsComparisonView';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import {
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from '@/engine/frm/semantics-version';
import { CUSTOM_FORMULA_EXAMPLES } from '@/engine/frm/example-library';
import type { ViewBounds } from '@/engine/types';
import { MAX_CUSTOM_FORMULAS } from '@/lib/formula-resolver';
import type {
  CloudCustomFormulaDetail,
  CloudCustomFormulaSummary,
} from '@/lib/cloud/client';
import {
  compareFrmSemantics,
  type FrmSemanticsComparison,
} from '@/lib/frm-semantics-comparison';

interface CustomFormulaListProps {
  currentBounds?: ViewBounds;
  onSelectFormula?: (plugin: FormulaPlugin, experienceHint?: FormulaExperienceHint) => void;
}

/** Strict v2 (explicit column) vs legacy v1 (missing column reads as v1). */
function isStrictV2(formula: CloudCustomFormulaSummary): boolean {
  return formula.frmSemanticsVersion === 2;
}

export function CustomFormulaList({ currentBounds, onSelectFormula }: CustomFormulaListProps) {
  const t = useTranslations('explore');
  const customT = useTranslations('explore.formula.customLibrary');
  const semanticsT = useTranslations('cloud.customFormulas.semantics');
  const locale = useLocale();
  const { toast } = useToast();
  const { state: session, openSignIn } = useCloudSession();
  const {
    formulas,
    isLoading,
    getDetail,
    inspectDetail,
    ensureRegistered,
    saveFormula,
    deleteFormula,
    renameFormula,
    changeSemantics,
  } = useCloudFormulaLibrary();

  const [showEditor, setShowEditor] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | undefined>(undefined);
  const [editorSource, setEditorSource] = useState<string | undefined>(undefined);
  const [editorExperienceHint, setEditorExperienceHint] = useState<FormulaExperienceHint | undefined>(undefined);
  const [editorSemanticsVersion, setEditorSemanticsVersion] =
    useState<FrmSemanticsVersion>(2);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Pending explicit FRM semantics change awaiting confirmation (v0.4.18). */
  const [semanticsAction, setSemanticsAction] = useState<{
    formulaId: string;
    action: CustomFormulaSemanticsAction;
  } | null>(null);
  const [semanticsComparison, setSemanticsComparison] =
    useState<FrmSemanticsComparison | null>(null);
  const [semanticsCompareStatus, setSemanticsCompareStatus] =
    useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const semanticsRequestRef = useRef(0);

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
    setEditorSemanticsVersion(2);
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
    setEditorSemanticsVersion(
      resolveFrmSemanticsVersion(detail.frmSemanticsVersion),
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
    if (result.code === 'auth-cancelled') {
      // Dialog closed without verifying — nothing saved, nothing to say.
      return { success: false, silent: true };
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

  const openSemanticsDialog = async (
    formula: CloudCustomFormulaSummary,
  ) => {
    const action: CustomFormulaSemanticsAction = isStrictV2(formula)
      ? 'revertSemantics'
      : 'upgradeSemantics';
    const requestId = semanticsRequestRef.current + 1;
    semanticsRequestRef.current = requestId;
    setSemanticsAction({ formulaId: formula.id, action });
    setSemanticsComparison(null);

    if (action === 'revertSemantics') {
      setSemanticsCompareStatus('idle');
      return;
    }

    setSemanticsCompareStatus('loading');
    const detail: CloudCustomFormulaDetail | null = await inspectDetail(formula.id);
    if (semanticsRequestRef.current !== requestId) return;
    if (!detail) {
      setSemanticsCompareStatus('failed');
      return;
    }

    try {
      setSemanticsComparison(
        compareFrmSemantics({
          formulaId: detail.id,
          source: detail.source,
          experienceHint: (detail.experienceHint ?? undefined) as
            | FormulaExperienceHint
            | undefined,
        }),
      );
      setSemanticsCompareStatus('ready');
    } catch {
      setSemanticsCompareStatus('failed');
    }
  };

  const closeSemanticsDialog = () => {
    semanticsRequestRef.current += 1;
    setSemanticsAction(null);
    setSemanticsComparison(null);
    setSemanticsCompareStatus('idle');
  };

  /**
   * Explicit FRM semantics change (v0.4.18 Upgrade & Compare): comparison
   * is read-only; only this final confirmation persists the revision-checked
   * version change.
   */
  const handleSemanticsChange = async (
    formulaId: string,
    action: CustomFormulaSemanticsAction,
  ) => {
    setBusyId(formulaId);
    closeSemanticsDialog();
    const result = await changeSemantics(formulaId, action);
    setBusyId(null);
    if (result.success) {
      setActionError('');
      toast({
        title:
          action === 'upgradeSemantics'
            ? semanticsT('upgradeSuccess')
            : semanticsT('revertSuccess'),
      });
      return;
    }
    toast({
      title:
        action === 'upgradeSemantics'
          ? semanticsT('upgradeFailed')
          : semanticsT('revertFailed'),
      variant: 'destructive',
    });
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
        frmSemanticsVersion={editorSemanticsVersion}
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
          setEditorSemanticsVersion(2);
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
                  setEditorSemanticsVersion(2);
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
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => void handleSelect(formula)}
                          className="font-medium hover:underline text-left truncate"
                          disabled={busyId === formula.id}
                        >
                          {formula.name}
                        </button>
                        {/* FRM semantics contract badge: explicit v2 vs legacy v1. */}
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px] leading-4"
                          data-testid={`semantics-badge-${formula.id}`}
                        >
                          {isStrictV2(formula)
                            ? semanticsT('badgeV2')
                            : semanticsT('badgeV1')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {renamingId !== formula.id && (
                    <>
                      {/* Explicit, reversible FRM semantics change (v0.4.18). */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === formula.id}
                        onClick={() => void openSemanticsDialog(formula)}
                      >
                        {isStrictV2(formula)
                          ? semanticsT('revertButton')
                          : semanticsT('upgradeButton')}
                      </Button>

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

      {/* Explicit FRM semantics change. Upgrade compares the stored source
          through both frozen contracts before the revision-checked write;
          revert remains a direct, reversible confirmation. */}
      <Dialog
        open={semanticsAction !== null}
        onOpenChange={(open) => {
          if (!open) closeSemanticsDialog();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {semanticsAction?.action === 'upgradeSemantics'
                ? semanticsT('upgradeTitle')
                : semanticsT('revertTitle')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {semanticsAction?.action === 'upgradeSemantics'
                    ? semanticsT('upgradeIntro')
                    : semanticsT('revertIntro')}
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{semanticsT('diffSelectedEntry')}</li>
                  <li>{semanticsT('diffBailout')}</li>
                  <li>{semanticsT('diffStrictPredicates')}</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          {semanticsAction?.action === 'upgradeSemantics' ? (
            <div aria-live="polite" className="space-y-3">
              {semanticsCompareStatus === 'loading' ? (
                <div
                  className="flex min-h-48 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="semantics-comparison-loading"
                >
                  {semanticsT('comparisonLoading')}
                </div>
              ) : semanticsCompareStatus === 'failed' ? (
                <p
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {semanticsT('comparisonFailed')}
                </p>
              ) : semanticsComparison ? (
                <FrmSemanticsComparisonView comparison={semanticsComparison} />
              ) : null}
              <p className="text-sm text-muted-foreground">
                {semanticsComparison?.v2.result.success
                  ? semanticsT('upgradeNote')
                  : semanticsCompareStatus === 'ready'
                    ? semanticsT('upgradeBlocked')
                    : semanticsT('comparisonReadOnly')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {semanticsT('revertNote')}
            </p>
          )}

          <DialogFooter>
            <Button onClick={closeSemanticsDialog} type="button" variant="outline">
              {semanticsT('cancel')}
            </Button>
            <Button
              disabled={
                semanticsAction?.action === 'upgradeSemantics' &&
                !(
                  semanticsCompareStatus === 'ready' &&
                  semanticsComparison?.v2.result.success &&
                  semanticsComparison.v2.result.plugin
                )
              }
              onClick={() => {
                if (semanticsAction) {
                  void handleSemanticsChange(
                    semanticsAction.formulaId,
                    semanticsAction.action,
                  );
                }
              }}
              type="button"
            >
              {semanticsAction?.action === 'upgradeSemantics'
                ? semanticsT('confirmUpgrade')
                : semanticsT('confirmRevert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default CustomFormulaList;
