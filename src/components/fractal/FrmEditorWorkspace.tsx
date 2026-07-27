'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  FileUp,
  FolderOpen,
  Library,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormulaEditor } from '@/components/fractal/FormulaEditor';
import FractalCanvas from '@/components/fractal/FractalCanvas';
import { Button } from '@/components/ui/button';
import {
  FRM_GUIDE_TUTORIALS,
  getFrmGuideTutorialById,
} from '@/content/frm-guide';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import type { FormulaPlugin } from '@/engine/plugins/types';
import {
  useCustomFormulas,
  type CustomFormulaMutationResult,
} from '@/hooks/useCustomFormulas';
import { MAX_CUSTOM_FORMULAS } from '@/lib/custom-formula-storage';
import {
  createFrmDownload,
  editorToExploreHref,
  preflightFrmSource,
  readFrmFile,
} from '@/lib/frm-editor';

const DEFAULT_SOURCE = `MyFormula {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

interface CompiledPreview {
  plugin: FormulaPlugin;
  source: string;
}

function experienceHintKey(hint?: FormulaExperienceHint): string {
  return JSON.stringify([
    hint?.bounds?.centerX ?? null,
    hint?.bounds?.centerY ?? null,
    hint?.bounds?.zoom ?? null,
    hint?.bounds?.rotation ?? null,
    hint?.coloring?.outsideColoringId ?? null,
    hint?.coloring?.insideColoringId ?? null,
    hint?.coloring?.paletteIndex ?? null,
  ]);
}

export function FrmEditorWorkspace() {
  const t = useTranslations('frmEditor');
  const formulaT = useTranslations('explore');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const requestedExample = searchParams.get('example');
  const [initialDraft] = useState(() => {
    const exampleId = searchParams.get('example');
    const tutorial = exampleId
      ? getFrmGuideTutorialById(exampleId)
      : undefined;
    return {
      requestedExample: exampleId,
      source: exampleId ? tutorial?.example.source ?? '' : DEFAULT_SOURCE,
      hint: tutorial?.example.experienceHint,
      unknown: Boolean(exampleId && !tutorial),
    };
  });
  const lastExampleRequestRef = useRef(initialDraft.requestedExample);

  const { formulas, isLoading, saveFormula, canAddMore } = useCustomFormulas();
  const [source, setSource] = useState(initialDraft.source);
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [savedHintKey, setSavedHintKey] = useState(
    experienceHintKey(undefined)
  );
  const [hint, setHint] = useState<FormulaExperienceHint | undefined>(
    initialDraft.hint
  );
  const [recordId, setRecordId] = useState<string | undefined>();
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState(
    initialDraft.unknown ? t('unknownExample') : ''
  );
  const [compiledPreview, setCompiledPreview] =
    useState<CompiledPreview | null>(null);
  const [bounds, setBounds] = useState(
    initialDraft.hint?.bounds ?? DEFAULT_FRACTAL_DOCUMENT.scene.bounds
  );
  const [showExamples, setShowExamples] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);

  const currentHintKey = experienceHintKey(hint);
  const isDirty =
    savedSource === null
      ? source.length > 0 || currentHintKey !== experienceHintKey(undefined)
      : source !== savedSource || currentHintKey !== savedHintKey;
  const sourcePreflight = useMemo(() => preflightFrmSource(source), [source]);
  const sourcePreflightError =
    sourcePreflight.status === 'multiple'
      ? t('source.multiple')
      : sourcePreflight.status === 'trailing'
        ? t('source.trailing')
        : undefined;
  const canSaveAndOpen = Boolean(
    compiledPreview &&
      compiledPreview.source === source &&
      !sourcePreflightError
  );
  const previewIsStale = Boolean(
    compiledPreview && compiledPreview.source !== source
  );

  const loadSource = useCallback(
    (
      nextSource: string,
      nextHint?: FormulaExperienceHint,
      id?: string
    ): boolean => {
      const nextHintKey = experienceHintKey(nextHint);
      if (
        isDirty &&
        (source !== nextSource || currentHintKey !== nextHintKey) &&
        !window.confirm(t('replaceConfirm'))
      ) {
        return false;
      }

      setSource(nextSource);
      setSavedSource(id ? nextSource : null);
      setSavedHintKey(id ? nextHintKey : experienceHintKey(undefined));
      setHint(nextHint);
      setRecordId(id);
      setCompiledPreview(null);
      setBounds(nextHint?.bounds ?? DEFAULT_FRACTAL_DOCUMENT.scene.bounds);
      setRevision((value) => value + 1);
      setNotice('');
      return true;
    },
    [currentHintKey, isDirty, source, t]
  );

  useEffect(() => {
    if (lastExampleRequestRef.current === requestedExample) return;
    lastExampleRequestRef.current = requestedExample;
    if (!requestedExample) return;

    const selected = getFrmGuideTutorialById(requestedExample);
    queueMicrotask(() => {
      if (selected) {
        loadSource(selected.example.source, selected.example.experienceHint);
        return;
      }

      if (loadSource('')) {
        setNotice(t('unknownExample'));
      }
    });
  }, [loadSource, requestedExample, t]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [isDirty]);

  useEffect(() => {
    const protectNavigation = (event: MouseEvent) => {
      if (!isDirty || event.defaultPrevented || event.button !== 0) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (
        !target ||
        target.target === '_blank' ||
        target.hasAttribute('download') ||
        target.href.startsWith('blob:') ||
        target.href === window.location.href
      ) {
        return;
      }
      if (!window.confirm(t('leaveConfirm'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', protectNavigation, true);
    return () => document.removeEventListener('click', protectNavigation, true);
  }, [isDirty, t]);

  const mutationErrorMessage = useCallback(
    (result: CustomFormulaMutationResult): string => {
      switch (result.code) {
        case 'max-count':
          return t('errors.maxCount', { count: MAX_CUSTOM_FORMULAS });
        case 'formula-not-found':
          return t('errors.formulaNotFound');
        case 'storage-unavailable':
          return t('errors.storageUnavailable');
        case 'compile-failed':
          return result.error ?? t('errors.compileFailed');
        default:
          return result.error ?? t('saveError');
      }
    },
    [t]
  );

  const save = useCallback(
    (
      name: string,
      currentSource: string,
      experienceHint?: FormulaExperienceHint,
      id?: string
    ) => {
      const result = saveFormula(
        name,
        currentSource,
        experienceHint,
        id ?? recordId
      );
      if (result.success) {
        setRecordId(result.id);
        setSavedSource(currentSource);
        setSavedHintKey(experienceHintKey(experienceHint));
        setHint(experienceHint);
        setNotice(t('saved'));
        return result;
      } else {
        const error = mutationErrorMessage(result);
        setNotice(error);
        return { ...result, error };
      }
    },
    [mutationErrorMessage, recordId, saveFormula, t]
  );

  const download = useCallback(() => {
    const { blob, filename } = createFrmDownload(
      source,
      compiledPreview?.plugin.name
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  }, [compiledPreview?.plugin.name, source]);

  const importFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      const result = await readFrmFile(file);
      if (!result.success) {
        setNotice(t(`file.${result.error}`));
        return;
      }
      loadSource(result.source);
    },
    [loadSource, t]
  );

  const saveAndOpen = useCallback(() => {
    if (!compiledPreview || compiledPreview.source !== source) {
      setNotice(t('compileFirst'));
      return;
    }
    const result = save(
      compiledPreview.plugin.name,
      source,
      hint,
      recordId
    );
    if (result.success && result.id) {
      router.push(editorToExploreHref(locale, result.id));
    }
  }, [compiledPreview, hint, locale, recordId, router, save, source, t]);

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12"
      data-testid="frm-editor-workspace"
    >
      {notice && (
        <p
          className="mb-4 rounded-md border bg-muted/40 p-3 text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2" aria-label={t('actions')}>
        <Button
          disabled={!canAddMore}
          onClick={() => loadSource(DEFAULT_SOURCE)}
          variant="outline"
        >
          <Plus className="mr-2 size-4" />
          {t('new')}
        </Button>
        <Button
          aria-controls="frm-editor-examples"
          aria-expanded={showExamples}
          onClick={() => setShowExamples((value) => !value)}
          variant={showExamples ? 'secondary' : 'outline'}
        >
          <BookOpen className="mr-2 size-4" />
          {t('examples')}
        </Button>
        <Button
          aria-controls="frm-editor-library"
          aria-expanded={showLibrary}
          onClick={() => setShowLibrary((value) => !value)}
          variant={showLibrary ? 'secondary' : 'outline'}
        >
          <Library className="mr-2 size-4" />
          {t('myFormulas')}
        </Button>
        <input
          accept=".frm,text/plain"
          className="sr-only"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
          ref={fileRef}
          type="file"
        />
        <Button onClick={() => fileRef.current?.click()} variant="outline">
          <FileUp className="mr-2 size-4" />
          {t('import')}
        </Button>
        <Button onClick={download} variant="outline">
          <Download className="mr-2 size-4" />
          {t('download')}
        </Button>
        <Button
          data-testid="frm-save-open"
          disabled={!canSaveAndOpen}
          onClick={saveAndOpen}
        >
          <ExternalLink className="mr-2 size-4" />
          {t('saveOpen')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0 space-y-4">
          <details
            className="rounded-lg border p-4"
            id="frm-editor-examples"
            onToggle={(event) => setShowExamples(event.currentTarget.open)}
            open={showExamples}
          >
            <summary className="cursor-pointer font-medium">
              {t('examples')}
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {FRM_GUIDE_TUTORIALS.map((tutorial) => (
                <button
                  className="rounded border p-3 text-left text-sm hover:bg-muted"
                  key={tutorial.id}
                  onClick={() =>
                    loadSource(
                      tutorial.example.source,
                      tutorial.example.experienceHint
                    )
                  }
                  type="button"
                >
                  <strong>{formulaT(tutorial.example.nameKey)}</strong>
                  <span className="mt-1 block text-muted-foreground">
                    {formulaT(tutorial.example.descriptionKey)}
                  </span>
                </button>
              ))}
            </div>
          </details>

          <details
            className="rounded-lg border p-4"
            id="frm-editor-library"
            onToggle={(event) => setShowLibrary(event.currentTarget.open)}
            open={showLibrary}
          >
            <summary className="cursor-pointer font-medium">
              {t('myFormulas')}
            </summary>
            <div className="mt-3 grid gap-2">
              {isLoading ? (
                t('loading')
              ) : formulas.length ? (
                formulas.map((formula) => (
                  <button
                    className="rounded border p-2 text-left hover:bg-muted"
                    key={formula.id}
                    onClick={() =>
                      loadSource(
                        formula.source,
                        formula.experienceHint,
                        formula.id
                      )
                    }
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <FolderOpen className="size-4 shrink-0" />
                      <span className="truncate">{formula.name}</span>
                    </span>
                    {formula.error && (
                      <span className="mt-1 block text-xs text-destructive">
                        {formula.error}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t('empty')}</p>
              )}
            </div>
          </details>

          <FormulaEditor
            currentBounds={bounds}
            formulaId={recordId}
            initialExperienceHint={hint}
            initialSource={source}
            key={revision}
            onCompile={(plugin, effectiveHint) => {
              setCompiledPreview({ plugin, source });
              setHint(effectiveHint);
              setBounds(
                effectiveHint?.bounds ??
                  DEFAULT_FRACTAL_DOCUMENT.scene.bounds
              );
            }}
            onExperienceHintChange={setHint}
            onSave={save}
            onSourceChange={setSource}
            sourcePreflightError={sourcePreflightError}
          />
        </div>

        <aside
          className="min-h-[420px] rounded-xl border bg-black p-3"
          data-testid="frm-editor-preview"
        >
          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-white">
            <span>{t('preview')}</span>
            <Button
              disabled={!compiledPreview}
              onClick={() =>
                setBounds(
                  hint?.bounds ?? DEFAULT_FRACTAL_DOCUMENT.scene.bounds
                )
              }
              size="sm"
              variant="secondary"
            >
              <RotateCcw className="mr-1 size-3" />
              {t('reset')}
            </Button>
          </div>
          {previewIsStale && (
            <p className="mb-3 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-100">
              {t('previewStale')}
            </p>
          )}
          {compiledPreview ? (
            <div className="h-[380px]">
              <FractalCanvas
                adaptiveIterations={false}
                bounds={bounds}
                customGradient={null}
                formula={compiledPreview.plugin.id}
                insideColoring={
                  hint?.coloring?.insideColoringId ??
                  DEFAULT_FRACTAL_DOCUMENT.coloring.insideColoringId
                }
                isJulia={DEFAULT_FRACTAL_DOCUMENT.formula.isJulia}
                juliaC={DEFAULT_FRACTAL_DOCUMENT.formula.juliaC}
                lighting={DEFAULT_FRACTAL_DOCUMENT.coloring.lighting}
                maxIterations={DEFAULT_FRACTAL_DOCUMENT.render.maxIterations}
                onBoundsChange={setBounds}
                orbitTrap={DEFAULT_FRACTAL_DOCUMENT.coloring.orbitTrap}
                outsideColoring={
                  hint?.coloring?.outsideColoringId ??
                  DEFAULT_FRACTAL_DOCUMENT.coloring.outsideColoringId
                }
                paletteIndex={
                  hint?.coloring?.paletteIndex ??
                  DEFAULT_FRACTAL_DOCUMENT.coloring.paletteIndex
                }
                power={DEFAULT_FRACTAL_DOCUMENT.formula.power}
                useSSAA={false}
              />
            </div>
          ) : (
            <div className="flex h-[380px] items-center justify-center p-8 text-center text-sm text-neutral-300">
              {t('previewEmpty')}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
