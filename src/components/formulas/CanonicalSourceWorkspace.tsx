'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileCode2, GitFork, Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CanonicalSourceEditor } from '@/components/formulas/CanonicalSourceEditor';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  type PublishedFormulaCanonicalSourceV1,
  type PublishedFormulaSourceLoadResultV1,
  type PublishedFormulaSourceReferenceV1,
} from '@/lib/published-formula-source';
import { getPublishedFormulaLibraryClient } from '@/lib/published-formula-library';

async function loadAuthoritativePublishedFormulaSource(
  reference: PublishedFormulaSourceReferenceV1,
  signal?: AbortSignal,
): Promise<PublishedFormulaSourceLoadResultV1> {
  if (signal?.aborted) return { ok: false, code: 'source-aborted' };
  const client = await getPublishedFormulaLibraryClient();
  if (!client.ok) return { ok: false, code: 'source-authority-mismatch' };
  return client.value.loadSource(reference, signal);
}

export const CANONICAL_SOURCE_PREVIEW_LINES = 7;

type SourceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly value: PublishedFormulaCanonicalSourceV1;
    };

type StoredSourceState = SourceState & { readonly requestKey: string };

interface CanonicalSourceWorkspaceProps {
  readonly displayName: string;
  readonly reference: PublishedFormulaSourceReferenceV1;
  readonly remixHref: string;
  readonly variant: 'explore' | 'record';
  readonly loadSource?: (
    reference: PublishedFormulaSourceReferenceV1,
    signal?: AbortSignal,
  ) => Promise<PublishedFormulaSourceLoadResultV1>;
}

function previewLines(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .slice(0, CANONICAL_SOURCE_PREVIEW_LINES)
    .join('\n');
}

function SourceActions({
  remixHref,
  source,
}: {
  readonly remixHref: string;
  readonly source: PublishedFormulaCanonicalSourceV1;
}) {
  const t = useTranslations('formulas.sourceWorkspace');
  const downloadHref = `data:text/plain;charset=utf-8,${encodeURIComponent(source.source)}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary">
        <a href={remixHref}>
          <GitFork aria-hidden />
          {t('remix')}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a download={`${source.formulaId}.frm`} href={downloadHref}>
          <Download aria-hidden />
          {t('download')}
        </a>
      </Button>
    </div>
  );
}

function SourceStatus({
  retry,
  state,
}: {
  readonly retry: () => void;
  readonly state: Exclude<SourceState, { status: 'ready' }>;
}) {
  const t = useTranslations('formulas.sourceWorkspace');
  if (state.status === 'loading') {
    return (
      <div
        aria-live="polite"
        className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }
  return (
    <div
      className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 p-5 text-center"
      role="alert"
    >
      <p className="text-sm text-destructive">{t('unavailable')}</p>
      <Button onClick={retry} size="sm" type="button" variant="outline">
        <RotateCcw aria-hidden />
        {t('retry')}
      </Button>
    </div>
  );
}

export function CanonicalSourceWorkspace({
  displayName,
  reference,
  remixHref,
  variant,
  loadSource = loadAuthoritativePublishedFormulaSource,
}: CanonicalSourceWorkspaceProps) {
  const t = useTranslations('formulas.sourceWorkspace');
  const [storedState, setStoredState] = useState<StoredSourceState>();
  const [open, setOpen] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGeneration = useRef(0);
  const referenceKey = useMemo(
    () =>
      [
        reference.formulaId,
        reference.sourceRevision,
        reference.semanticHash,
        reference.href,
      ].join(':'),
    [reference],
  );
  const requestKey = `${referenceKey}:${retryGeneration}`;
  const state: SourceState =
    storedState?.requestKey === requestKey
      ? storedState
      : { status: 'loading' };

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    void loadSource(reference, controller.signal).then((result) => {
      if (generation !== requestGeneration.current || controller.signal.aborted) return;
      setStoredState(
        result.ok
          ? { requestKey, status: 'ready', value: result.value }
          : { requestKey, status: 'error' },
      );
    });
    return () => controller.abort();
  }, [loadSource, reference, requestKey]);

  const retry = () => setRetryGeneration((generation) => generation + 1);
  const editorLabel = t('editorLabel', { name: displayName });

  if (variant === 'record') {
    return (
      <section
        aria-busy={state.status === 'loading'}
        aria-labelledby={`canonical-source-${reference.formulaId}`}
        className="mt-10 rounded-2xl border bg-card p-5 sm:p-6"
        data-source-variant="record"
        data-testid="canonical-source-workspace"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3
              className="text-xl font-semibold"
              id={`canonical-source-${reference.formulaId}`}
            >
              {t('title')}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t('readOnlyDescription')}
            </p>
          </div>
          {state.status === 'ready' ? (
            <SourceActions remixHref={remixHref} source={state.value} />
          ) : null}
        </div>
        <div className="mt-5">
          {state.status === 'ready' ? (
            <CanonicalSourceEditor label={editorLabel} source={state.value.source} />
          ) : (
            <SourceStatus retry={retry} state={state} />
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={t('previewLabel', { name: displayName })}
      className="space-y-2"
      data-source-variant="explore"
      data-testid="canonical-source-workspace"
    >
      {state.status === 'ready' ? (
        <pre
          aria-label={t('previewLabel', { name: displayName })}
          className="max-h-40 overflow-hidden whitespace-pre rounded-md border bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200"
          data-preview-lines={CANONICAL_SOURCE_PREVIEW_LINES}
          data-testid="canonical-source-preview"
        >
          {previewLines(state.value.source)}
        </pre>
      ) : (
        <SourceStatus retry={retry} state={state} />
      )}

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <Button
            className="w-full justify-center"
            disabled={state.status !== 'ready'}
            size="sm"
            type="button"
            variant="outline"
          >
            <FileCode2 aria-hidden />
            {t('open')}
          </Button>
        </SheetTrigger>
        <SheetContent
          className="inset-y-0 right-0 h-dvh w-screen max-w-none gap-0 p-0 sm:w-[min(92vw,64rem)] sm:max-w-5xl"
          data-testid="canonical-source-drawer"
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>
              {t('workspaceDescription', { name: displayName })}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t('readOnly')}</p>
              {state.status === 'ready' ? (
                <SourceActions remixHref={remixHref} source={state.value} />
              ) : null}
            </div>
            {state.status === 'ready' ? (
              <CanonicalSourceEditor label={editorLabel} source={state.value.source} />
            ) : (
              <SourceStatus retry={retry} state={state} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
