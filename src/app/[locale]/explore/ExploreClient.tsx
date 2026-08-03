'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import FractalCanvas from '@/components/fractal/FractalCanvas';
import { FormulaPanel } from '@/components/fractal/FormulaPanel';
import { ColoringPanel } from '@/components/fractal/ColoringPanel';
import { TransformPanel } from '@/components/fractal/TransformPanel';
import { RenderPanel } from '@/components/fractal/RenderPanel';
import { AnimationPanel } from '@/components/fractal/AnimationPanel';
import { PositionSummaryPanel } from '@/components/fractal/PositionSummaryPanel';
import { ArtworkActions } from '@/components/fractal/ArtworkActions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { documentToExploreHref } from '@/lib/url-params';
import { trackEvent } from '@/components/analytics/PageViewTracker';
import { useExploreDocumentState } from '@/hooks/useExploreDocumentState';
import { useArtworkActions } from '@/hooks/useArtworkActions';
import { useCloudDraftSession } from '@/hooks/useCloudDraftSession';
import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { resolveCustomFormula } from '@/lib/formula-resolver';
import AnimatedFractalCanvas from '@/components/fractal/AnimatedFractalCanvas';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { FormulaSelectionRequest } from '@/engine/frm/authoring';
import { getDefaultBounds } from '@/engine/plugins/formula-catalog';
import type { PluginParamRecord, PluginParamValue } from '@/engine/types';
import {
  CUSTOM_FORMULAS_CHANGED_EVENT,
  readPersistedCustomFormulas,
  readEffectiveFormulaAssets,
} from '@/lib/custom-formula-storage';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import { readFractalDocumentEnvelope } from '@/engine/document-envelope';
import { consumeRemixHandoff } from '@/lib/remix-handoff';
import {
  parseEditorToExploreIntent,
  stripEditorToExploreIntent,
} from '@/lib/frm-editor';
import {
  resolveFormulaReference,
  type FormulaResolution,
} from '@/lib/formula-resolver';

type ExploreFormulaResolution =
  | FormulaResolution
  | {
      success: false;
      formulaId: string;
      code: 'storage-invalid';
      errors: string[];
    };

function ExploreClient({ posterImage }: { posterImage?: string }) {
  const locale = useLocale();
  const t = useTranslations('explore');
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialHandoffIntentRef = useRef(
    parseEditorToExploreIntent(new URLSearchParams(searchParams.toString()))
  );
  const initializedRef = useRef(false);
  const handoffConsumedRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { document, runtimeParams, updateBounds, updateFormula, updateColoring, updateTransform, updateRender, updateAnimation, selectBuiltInFormula, loadFromDocument } =
    useExploreDocumentState(new URLSearchParams(searchParams.toString()));

  const {
    paletteIndex,
    maxIterations,
    bounds,
    isJulia,
    juliaC,
    power,
    formula,
    outsideColoring,
    insideColoring,
    transformId,
    pluginParams = {},
    orbitTrap,
    useSSAA,
    adaptiveIterations,
    lighting,
    customGradient,
  } = runtimeParams;
  const [pickToast, setPickToast] = useState<string | null>(null);
  const keyframes = useMemo(
    () => document.animation?.viewKeyframes ?? [],
    [document.animation?.viewKeyframes]
  );
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [formulaResolution, setFormulaResolution] =
    useState<ExploreFormulaResolution | null>(null);
  const [handoffTargetId, setHandoffTargetId] = useState<string | null>(() =>
    initialHandoffIntentRef.current.status === 'valid'
      ? initialHandoffIntentRef.current.formulaId
      : null
  );
  const [handoffError, setHandoffError] =
    useState<ExploreFormulaResolution | null>(() => {
      const intent = initialHandoffIntentRef.current;
      if (intent.status !== 'invalid') return null;
      return {
        success: false,
        formulaId: intent.formulaId,
        code: 'storage-invalid',
        errors: [
          intent.reason === 'missing'
            ? 'Missing custom formula handoff.'
            : 'Invalid custom formula handoff.',
        ],
      };
    });
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const pickToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveIterations = useMemo(() => {
    if (!adaptiveIterations) return maxIterations;
    const zoomFactor = Math.log2(Math.max(bounds.zoom, 0.0001));
    const extra = Math.max(0, Math.round(zoomFactor * 18));
    return Math.min(2000, maxIterations + extra);
  }, [adaptiveIterations, maxIterations, bounds.zoom]);

  // Mark as initialized after first render
  useEffect(() => {
    initializedRef.current = true;
  }, []);

  // This one-time identity handoff is intentionally separate from the URL codec.
  useEffect(() => {
    const currentParams = new URLSearchParams(searchParams.toString());
    const intent = parseEditorToExploreIntent(currentParams);
    if (intent.status === 'none') return;

    const handoffKey = `${intent.status}:${intent.formulaId}`;
    if (handoffConsumedRef.current === handoffKey) return;
    handoffConsumedRef.current = handoffKey;

    if (intent.status === 'invalid') {
      queueMicrotask(() => {
        setHandoffTargetId(null);
        setHandoffError({
          success: false,
          formulaId: intent.formulaId,
          code: 'storage-invalid',
          errors: [
            intent.reason === 'missing'
              ? 'Missing custom formula handoff.'
              : 'Invalid custom formula handoff.',
          ],
        });
        router.replace(
          stripEditorToExploreIntent(locale, currentParams),
          { scroll: false }
        );
      });
      return;
    }

    try {
      const resolution = resolveFormulaReference(
        intent.formulaId,
        readPersistedCustomFormulas()
      );
      if (!resolution.success) {
        queueMicrotask(() => {
          setHandoffTargetId(null);
          setHandoffError(resolution);
          router.replace(
            stripEditorToExploreIntent(locale, currentParams),
            { scroll: false }
          );
        });
        return;
      }

      queueMicrotask(() => {
        setHandoffTargetId(intent.formulaId);
        setHandoffError(null);
        updateFormula({ formulaId: intent.formulaId });
        updateBounds(
          resolution.experienceHint?.bounds ??
            getDefaultBounds(intent.formulaId)
        );
        if (resolution.experienceHint?.coloring) {
          updateColoring({
            customGradient: null,
            ...resolution.experienceHint.coloring,
          });
        }
        router.replace(
          stripEditorToExploreIntent(locale, currentParams),
          { scroll: false }
        );
      });
    } catch (error) {
      queueMicrotask(() => {
        setHandoffTargetId(null);
        setHandoffError({
          success: false,
          formulaId: intent.formulaId,
          code: 'storage-invalid',
          errors: [
            error instanceof Error
              ? error.message
              : 'Custom formula storage is invalid.',
          ],
        });
        router.replace(
          stripEditorToExploreIntent(locale, currentParams),
          { scroll: false }
        );
      });
    }
  }, [locale, router, searchParams, updateBounds, updateColoring, updateFormula]);

  useEffect(() => {
    const resolveCurrentFormula = () => {
      try {
        setFormulaResolution(
          resolveFormulaReference(formula, readPersistedCustomFormulas())
        );
      } catch (error) {
        setFormulaResolution({
          success: false,
          formulaId: formula,
          code: 'storage-invalid',
          errors: [
            error instanceof Error
              ? error.message
              : 'Custom formula storage is invalid.',
          ],
        });
      }
    };

    resolveCurrentFormula();
    window.addEventListener(
      CUSTOM_FORMULAS_CHANGED_EVENT,
      resolveCurrentFormula
    );
    return () => {
      window.removeEventListener(
        CUSTOM_FORMULAS_CHANGED_EVENT,
        resolveCurrentFormula
      );
    };
  }, [formula]);

  useEffect(() => {
    if (
      !handoffTargetId ||
      formula !== handoffTargetId ||
      !formulaResolution?.success ||
      formulaResolution.formulaId !== handoffTargetId
    ) {
      return;
    }
    queueMicrotask(() => setHandoffTargetId(null));
  }, [formula, formulaResolution, handoffTargetId]);

  // Cloud-authoritative draft session (ADR 0006): ?draft= loads from the
  // cloud, save writes the cloud, identity lives here and in the URL.
  const cloudDraft = useCloudDraftSession();
  const { state: cloudSessionState } = useCloudSession();
  const draftParam = searchParams.get('draft');
  const draftLoadConsumedRef = useRef<string | null>(null);
  const prevSessionStatusRef = useRef(cloudSessionState.status);
  // Double-fire guard for the conflict exits (review N2).
  const [conflictBusy, setConflictBusy] = useState(false);

  const pinDraftParam = useCallback(
    (draftId: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (draftId) {
        params.set('draft', draftId);
      } else {
        params.delete('draft');
      }
      const query = params.toString();
      router.replace(`/${locale}/explore${query ? `?${query}` : ''}`, { scroll: false });
    },
    [locale, router],
  );

  // Debounced URL update — keeps the draft identity pinned so a refresh
  // reopens the same cloud draft (spec §17: Explore identity is the URL).
  useEffect(() => {
    if (!initializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Never project while a ?draft= load is unresolved: rebuilding the
      // URL from the canvas would erase the param before identity lands
      // and the draft would silently never load (review N1).
      if (draftParam && !cloudDraft.identity) return;
      const newUrl = documentToExploreHref(document, locale);
      const withDraft = cloudDraft.identity
        ? `${newUrl}${newUrl.includes('?') ? '&' : '?'}draft=${cloudDraft.identity.id}`
        : newUrl;
      router.replace(withDraft, { scroll: false });
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    document,
    locale,
    router,
    cloudDraft.identity,
    draftParam,
  ]);

  // Anonymous remix handoff consumption (spec §17 transient): a one-shot
  // sessionStorage envelope becomes the canvas — nothing persists until
  // the user explicitly saves. Consumed once, deleted on read.
  const remixParam = searchParams.get('remix');
  const remixConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!remixParam || remixConsumedRef.current === remixParam) return;
    remixConsumedRef.current = remixParam;
    const handoff = consumeRemixHandoff();
    if (!handoff) return;
    const read = readFractalDocumentEnvelope(handoff.envelope);
    if (read.mode !== 'editable') return;
    for (const asset of read.envelope.assets?.formulas ?? []) {
      resolveCustomFormula({ id: asset.id, source: asset.source });
    }
    cloudDraft.setPendingRemixSource({ type: 'publication', id: handoff.publicationId });
    handleLoadDocument(read.envelope.document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixParam]);

  const clearHandoffFailure = useCallback(() => {
    setHandoffError(null);
    setHandoffTargetId(null);
  }, []);

  const handleLoadDocument = useCallback((nextDocument: typeof document) => {
    clearHandoffFailure();
    setIsPreviewPlaying(false);
    loadFromDocument(nextDocument);
  }, [clearHandoffFailure, loadFromDocument]);

  // `?draft=` cloud session load: waits for the session probe, then loads
  // the draft and registers its formula assets in memory so the referenced
  // custom formula resolves. The in-flight guard (not the consumed ref)
  // prevents duplicate fires; the consumed ref is set on success so a
  // transient failure stays retryable (review N4).
  const draftLoadInFlightRef = useRef<string | null>(null);
  const attemptDraftLoad = useCallback(
    (draftId: string) => {
      if (draftLoadInFlightRef.current === draftId) return;
      draftLoadInFlightRef.current = draftId;
      void cloudDraft.loadDraft(draftId).then((loaded) => {
        draftLoadInFlightRef.current = null;
        if (!loaded) return;
        draftLoadConsumedRef.current = draftId;
        for (const asset of loaded.formulaAssets) {
          resolveCustomFormula({ id: asset.id, source: asset.source });
        }
        handleLoadDocument(loaded.document);
      });
    },
    [cloudDraft, handleLoadDocument],
  );

  useEffect(() => {
    if (!draftParam) return;
    if (draftLoadConsumedRef.current === draftParam) return;
    if (cloudSessionState.status === 'loading') return;
    if (cloudSessionState.status !== 'authenticated') return;
    attemptDraftLoad(draftParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftParam, cloudSessionState.status, attemptDraftLoad]);

  // Sign-out / session loss clears the draft identity but never the canvas:
  // the user keeps looking at exactly what they were editing (spec §17).
  useEffect(() => {
    const previous = prevSessionStatusRef.current;
    prevSessionStatusRef.current = cloudSessionState.status;
    if (previous === 'authenticated' && cloudSessionState.status !== 'authenticated') {
      cloudDraft.clearIdentity();
      draftLoadConsumedRef.current = null;
      if (draftParam) pinDraftParam(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSessionState.status]);

  const handleResetView = useCallback(() => {
    // Reset means a fresh canvas — the draft session ends with it, so a
    // later save creates a new draft instead of silently overwriting the
    // one that was just on screen (review follow-up).
    cloudDraft.clearIdentity();
    if (draftParam) pinDraftParam(null);
    handleLoadDocument(DEFAULT_FRACTAL_DOCUMENT);
  }, [cloudDraft, draftParam, handleLoadDocument, pinDraftParam]);

  const getCanvas = useCallback(() => canvasElRef.current, []);

  const artworkActions = useArtworkActions({
    document,
    effectiveIterations,
    getCanvas,
    loadDocument: handleLoadDocument,
    cloudDraft,
    onDraftCreated: (created) => pinDraftParam(created.id),
  });

  const handleJuliaModeChange = useCallback((julia: boolean) => {
    updateFormula({ isJulia: julia });
    trackEvent('julia_mode_toggle', { mode: julia ? 'julia' : 'mandelbrot' });
    if (julia) {
      updateBounds({ centerX: 0, centerY: 0, zoom: 0.4, rotation: bounds.rotation });
    } else {
      updateBounds(DEFAULT_FRACTAL_DOCUMENT.scene.bounds);
    }
  }, [bounds.rotation, updateBounds, updateFormula]);

  const handleRotationChange = useCallback((rotation: number) => {
    updateBounds({ ...bounds, rotation });
  }, [bounds, updateBounds]);

  const handleCanvasPointSelect = useCallback((point: [number, number]) => {
    updateFormula({ juliaC: point, isJulia: true });
    if (pickToastTimerRef.current) clearTimeout(pickToastTimerRef.current);
    setPickToast(
      t('controls.juliaC.picked', {
        re: point[0].toFixed(4),
        im: point[1].toFixed(4),
      })
    );
    pickToastTimerRef.current = setTimeout(() => {
      setPickToast(null);
    }, 2200);
  }, [t, updateFormula]);

  useEffect(() => {
    return () => {
      if (pickToastTimerRef.current) clearTimeout(pickToastTimerRef.current);
    };
  }, []);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElRef.current = canvas;
    // Track first render complete (new user activation signal)
    if (!initializedRef.current) {
      trackEvent('first_render_complete', { page: 'explore' });
    }
  }, []);

  // Handle formula change - reset to formula's default bounds
  const handleFormulaChange = useCallback((newFormula: string) => {
    clearHandoffFailure();
    selectBuiltInFormula(newFormula);
    trackEvent('change_formula', { formula: newFormula });
  }, [clearHandoffFailure, selectBuiltInFormula]);

  const handleFormulaParamChange = useCallback((name: string, value: PluginParamValue) => {
    updateFormula({
      params: {
        formula: {
          ...(document.formula.params?.formula ?? {}),
          [name]: value,
        },
      },
    });
  }, [document.formula.params?.formula, updateFormula]);

  const handleCustomFormulaSelect = useCallback((selection: FormulaSelectionRequest) => {
    clearHandoffFailure();
    updateFormula({ formulaId: selection.formulaId });

    const targetBounds = selection.experienceHint?.bounds ?? getDefaultBounds(selection.formulaId);
    updateBounds(targetBounds);

    if (selection.experienceHint?.coloring) {
      updateColoring({
        customGradient: null,
        ...selection.experienceHint.coloring,
      });
    }
  }, [clearHandoffFailure, updateBounds, updateColoring, updateFormula]);

  // Handle transform change
  const handleTransformChange = useCallback((newTransform: string) => {
    updateTransform({ transformId: newTransform });
  }, [updateTransform]);

  const handleTransformParamChange = useCallback((name: string, value: number) => {
    updateTransform({
      params: {
        transform: {
          ...(document.transform.params?.transform ?? {}),
          [name]: value,
        },
      },
    });
  }, [document.transform.params?.transform, updateTransform]);

  const handleTransformParamsChange = useCallback((params: PluginParamRecord) => {
    updateTransform({
      params: {
        transform: {
          ...(document.transform.params?.transform ?? {}),
          ...params,
        },
      },
    });
  }, [document.transform.params?.transform, updateTransform]);

  const activeResolution = handoffError ?? formulaResolution;
  const isHandoffPending = Boolean(handoffTargetId);
  const formulaResolutionMatches =
    !handoffError &&
    !isHandoffPending &&
    formulaResolution?.formulaId === formula;
  const isFormulaReady =
    !handoffError && formulaResolutionMatches && formulaResolution?.success === true;
  let formulaResolutionMessage = t('formula.resolution.loading');

  if (
    !isHandoffPending &&
    activeResolution &&
    !activeResolution.success
  ) {
    switch (activeResolution.code) {
      case 'formula-not-found':
        formulaResolutionMessage = t('formula.resolution.notFound', {
          formula: activeResolution.formulaId,
        });
        break;
      case 'storage-invalid':
        formulaResolutionMessage = t('formula.resolution.storageInvalid');
        break;
      case 'builtin-id-conflict':
        formulaResolutionMessage = t('formula.resolution.idConflict', {
          formula: activeResolution.formulaId,
        });
        break;
      case 'compile-failed':
        formulaResolutionMessage = t('formula.resolution.compileFailed', {
          formula: activeResolution.formulaId,
        });
        break;
      case 'builtin-unavailable':
      case 'registration-failed':
        formulaResolutionMessage = t('formula.resolution.unavailable', {
          formula: activeResolution.formulaId,
        });
        break;
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-3rem)] overflow-hidden">
      <div
        className={`relative bg-black lg:flex-1 ${isPanelCollapsed ? 'flex-1' : 'min-h-[50vh] lg:min-h-0'}`}
        style={posterImage ? {
          backgroundImage: `url("${posterImage}")`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        } : undefined}
      >
        {/* Cloud draft session states (spec §17): loading shows an honest
            shell; failures never fake a default canvas. The probe window
            (draftParam present, session still resolving) counts as loading
            so the default canvas cannot be edited under it (review N5). */}
        {(cloudDraft.loadState === 'loading' ||
          (draftParam !== null &&
            cloudDraft.identity === null &&
            cloudDraft.loadState !== 'not_found' &&
            cloudDraft.loadState !== 'unavailable')) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 text-sm text-neutral-200 backdrop-blur-sm" role="status">
            {t('draft.loading')}
          </div>
        )}
        {(cloudDraft.loadState === 'not_found' || cloudDraft.loadState === 'unavailable') && (
          <div className="absolute left-3 top-3 z-30 max-w-sm rounded-md border border-amber-400/40 bg-amber-950/85 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md" role="alert">
            {cloudDraft.loadState === 'not_found' ? t('draft.notFound') : t('draft.unavailable')}
            {cloudDraft.loadState === 'unavailable' && draftParam && (
              <button
                type="button"
                onClick={() => attemptDraftLoad(draftParam)}
                className="ml-2 underline underline-offset-2 hover:text-white"
              >
                {t('draft.retry')}
              </button>
            )}
          </div>
        )}
        {cloudDraft.identity && cloudDraft.draftTitle && cloudDraft.loadState === 'ready' && (
          <div className="absolute left-3 top-3 z-20 rounded-md border border-white/15 bg-black/55 px-2.5 py-1 text-xs text-neutral-200 backdrop-blur-md">
            {cloudDraft.draftTitle}
          </div>
        )}
        {isFormulaReady && !isPreviewPlaying && (
          <FractalCanvas
            paletteIndex={paletteIndex}
            maxIterations={effectiveIterations}
            bounds={bounds}
            isJulia={isJulia}
            juliaC={juliaC}
            power={power}
            formula={formula}
            outsideColoring={outsideColoring}
            insideColoring={insideColoring}
            orbitTrap={orbitTrap}
            transformId={transformId}
            pluginParams={pluginParams}
            useSSAA={useSSAA}
            adaptiveIterations={adaptiveIterations}
            lighting={lighting}
            customGradient={customGradient}
            onBoundsChange={updateBounds}
            onPointSelect={isJulia ? undefined : handleCanvasPointSelect}
            onCanvasReady={handleCanvasReady}
          />
        )}
        {isFormulaReady && isPreviewPlaying && (
          <AnimatedFractalCanvas
            params={{
              maxIterations: effectiveIterations,
              paletteIndex,
              bounds,
              isJulia,
              juliaC,
              power,
              formula,
              outsideColoring,
              insideColoring,
              orbitTrap,
              transformId,
              pluginParams,
              useSSAA: false,
              adaptiveIterations,
              lighting,
              customGradient,
            }}
            keyframes={keyframes}
          />
        )}
        {!isFormulaReady && (
          <div className="flex h-full w-full items-center justify-center bg-neutral-950 p-8 text-center text-neutral-200">
            <div className="max-w-md">
              {activeResolution && !activeResolution.success && (
                <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-amber-400" />
              )}
              <p>{formulaResolutionMessage}</p>
            </div>
          </div>
        )}
        {pickToast && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-mono text-white shadow-sm backdrop-blur-sm">
            {pickToast}
          </div>
        )}
        <ArtworkActions
          status={artworkActions.status}
          cloudPhase={artworkActions.cloudPhase}
          defaultSaveName={cloudDraft.draftTitle ?? 'Untitled'}
          onClearStatus={artworkActions.clearStatus}
          onSave={artworkActions.save}
          onDownload={artworkActions.download}
          onImport={artworkActions.importFile}
          onExport={artworkActions.exportPng}
          onReset={handleResetView}
          onConflictReload={() => {
            // Reload discards the in-memory edits that conflicted — confirm
            // first (review N3), and guard against double-fire (N2).
            if (conflictBusy) return;
            if (!window.confirm(t('artworkActions.conflict.discardConfirm'))) return;
            setConflictBusy(true);
            void cloudDraft.reloadConflictDraft().then((loaded) => {
              setConflictBusy(false);
              if (!loaded) return;
              for (const asset of loaded.formulaAssets) {
                resolveCustomFormula({ id: asset.id, source: asset.source });
              }
              handleLoadDocument(loaded.document);
              artworkActions.clearStatus();
              artworkActions.resetCloudPhase();
            });
          }}
          onConflictSaveAsNew={() => {
            if (conflictBusy) return;
            setConflictBusy(true);
            const name = cloudDraft.draftTitle ?? 'Untitled';
            const canvas = getCanvas();
            void cloudDraft
              .saveAsNewDraft({
                name,
                document,
                thumbnail: canvas ? captureThumbnail(canvas) : '',
                formulaAssets: readEffectiveFormulaAssets(),
              })
              .then((result) => {
                setConflictBusy(false);
                if (result.ok) {
                  pinDraftParam(result.identity.id);
                  artworkActions.clearStatus();
                  artworkActions.resetCloudPhase();
                }
              });
          }}
          conflictBusy={conflictBusy}
        />

        {/* Mobile: toggle controls panel button */}
        <button
          className="lg:hidden absolute bottom-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white shadow-lg"
          onClick={() => setIsPanelCollapsed((v) => !v)}
          aria-label={isPanelCollapsed ? 'Show controls' : 'Hide controls'}
        >
          {isPanelCollapsed
            ? <ChevronDown className="h-5 w-5" />
            : <ChevronUp className="h-5 w-5" />
          }
        </button>
      </div>

      <div className={`w-full lg:w-[30%] xl:w-[25%] border-t lg:border-t-0 lg:border-l bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-y-auto ${isPanelCollapsed ? 'hidden lg:block' : ''}`}>
        <div className="p-4">
          <PositionSummaryPanel bounds={bounds} />

          <Tabs defaultValue="formula" className="w-full mt-4">
            <TabsList className="w-full grid grid-cols-5 mb-4 h-auto">
              <TabsTrigger value="formula" className="px-1 py-1.5 text-[11px] sm:text-xs xl:text-sm">{t('tabs.formula')}</TabsTrigger>
              <TabsTrigger value="coloring" className="px-1 py-1.5 text-[11px] sm:text-xs xl:text-sm">{t('tabs.coloring')}</TabsTrigger>
              <TabsTrigger value="transform" className="px-1 py-1.5 text-[11px] sm:text-xs xl:text-sm">{t('tabs.transform')}</TabsTrigger>
              <TabsTrigger value="render" className="px-1 py-1.5 text-[11px] sm:text-xs xl:text-sm">{t('tabs.render')}</TabsTrigger>
              <TabsTrigger value="animation" className="px-1 py-1.5 text-[11px] sm:text-xs xl:text-sm">{t('tabs.animation')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="formula" className="mt-0 space-y-4">
              <FormulaPanel
                isJulia={isJulia}
                juliaC={juliaC}
                currentBounds={bounds}
                pluginParams={document.formula.params?.formula}
                onJuliaModeChange={handleJuliaModeChange}
                onJuliaCChange={(value) => updateFormula({ juliaC: value })}
                currentFormula={formula}
                onFormulaChange={handleFormulaChange}
                onFormulaParamChange={handleFormulaParamChange}
                onCustomFormulaSelect={handleCustomFormulaSelect}
              />
            </TabsContent>

            <TabsContent value="coloring" className="mt-0 space-y-4">
              <ColoringPanel
                paletteIndex={paletteIndex}
                outsideColoring={outsideColoring}
                insideColoring={insideColoring}
                orbitTrap={orbitTrap}
                customGradient={customGradient}
                onPaletteChange={(index) => updateColoring({ paletteIndex: index })}
                onOutsideColoringChange={(mode) => updateColoring({ outsideColoringId: mode })}
                onInsideColoringChange={(mode) => updateColoring({ insideColoringId: mode })}
                onOrbitTrapChange={(trap) => updateColoring({ orbitTrap: trap })}
                onGradientChange={(gradient) => updateColoring({ customGradient: gradient })}
              />
            </TabsContent>

            <TabsContent value="transform" className="mt-0 space-y-4">
              <TransformPanel
                transformId={transformId}
                bounds={bounds}
                pluginParams={pluginParams}
                onTransformChange={handleTransformChange}
                onRotationChange={handleRotationChange}
                onTransformParamChange={handleTransformParamChange}
                onTransformParamsChange={handleTransformParamsChange}
              />
            </TabsContent>

            <TabsContent value="render" className="mt-0 space-y-4">
              <RenderPanel
                maxIterations={maxIterations}
                useSSAA={useSSAA}
                adaptiveIterations={adaptiveIterations}
                lighting={lighting}
                onIterationsChange={(value) => updateRender({ maxIterations: value })}
                onUseSSAAChange={(enabled) => updateRender({ useSSAA: enabled })}
                onAdaptiveIterationsChange={(enabled) => updateRender({ adaptiveIterations: enabled })}
                onLightingChange={(nextLighting) => updateColoring({ lighting: nextLighting })}
              />
            </TabsContent>

            <TabsContent value="animation" className="mt-0 space-y-4">
              <AnimationPanel
                keyframes={keyframes}
                bounds={bounds}
                onKeyframesChange={(nextKeyframes) => {
                  if (nextKeyframes.length > keyframes.length) {
                    trackEvent('add_keyframe', { count: nextKeyframes.length });
                  }
                  updateAnimation({ viewKeyframes: nextKeyframes });
                }}
                onPreviewToggle={setIsPreviewPlaying}
                isPreviewPlaying={isPreviewPlaying}
                onBoundsChange={updateBounds}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default ExploreClient;
