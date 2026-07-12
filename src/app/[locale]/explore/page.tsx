'use client';

import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import FractalCanvas from '@/components/fractal/FractalCanvas';
import { FormulaPanel } from '@/components/fractal/FormulaPanel';
import { ColoringPanel } from '@/components/fractal/ColoringPanel';
import { TransformPanel } from '@/components/fractal/TransformPanel';
import { RenderPanel } from '@/components/fractal/RenderPanel';
import { AnimationPanel } from '@/components/fractal/AnimationPanel';
import { PositionSummaryPanel } from '@/components/fractal/PositionSummaryPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { documentToExploreHref } from '@/lib/url-params';
import { exportFractal } from '@/lib/export-fractal';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import { useExploreDocumentState } from '@/hooks/useExploreDocumentState';
import { useSavedFractals } from '@/hooks/useSavedFractals';
import AnimatedFractalCanvas from '@/components/fractal/AnimatedFractalCanvas';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { FormulaSelectionRequest } from '@/engine/frm/authoring';
import { getDefaultBounds } from '@/engine/plugins/formula-catalog';
import type { PluginParamRecord, PluginParamValue } from '@/engine/types';

function ExploreContent() {
  const locale = useLocale();
  const t = useTranslations('explore');
  const searchParams = useSearchParams();
  const router = useRouter();
  const initializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { document, runtimeParams, updateBounds, updateFormula, updateColoring, updateTransform, updateRender, updateAnimation, loadFromDocument } =
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
    colorAdjustments = document.coloring.adjustments,
  } = runtimeParams;
  const [copied, setCopied] = useState(false);
  const [pickToast, setPickToast] = useState<string | null>(null);
  const keyframes = useMemo(() => document.animation?.keyframes ?? [], [document.animation?.keyframes]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const resetViewRef = useRef<(() => void) | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const pickToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saveDocument, storageInfo } = useSavedFractals();

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

  // Debounced URL update
  useEffect(() => {
    if (!initializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const newUrl = documentToExploreHref(document, locale);
      router.replace(newUrl, { scroll: false });
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    document,
    locale,
    router,
  ]);

  const handleResetView = useCallback(() => {
    loadFromDocument({
      ...DEFAULT_FRACTAL_DOCUMENT,
      animation: document.animation,
      assets: document.assets,
      metadata: document.metadata,
    });
  }, [document.animation, document.assets, document.metadata, loadFromDocument]);

  const handleRegisterReset = useCallback((fn: () => void) => {
    resetViewRef.current = fn;
  }, []);

  const handleJuliaModeChange = useCallback((julia: boolean) => {
    updateFormula({ isJulia: julia });
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

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silent fail
    }
  }, []);

  const handleExport = useCallback(async (scale: number, ssaaLevel?: number) => {
    const width = canvasElRef.current?.clientWidth ?? 1200;
    const height = canvasElRef.current?.clientHeight ?? 800;
    // Determine SSAA level: explicit export quality, or fallback to preview toggle
    const effectiveSsaaLevel = ssaaLevel ?? (useSSAA || scale > 1 ? 4 : 0);
    await exportFractal(
        {
          maxIterations: effectiveIterations,
          paletteIndex,
          bounds,
          isJulia,
          juliaC,
          power,
          formula,
          outsideColoring,
          insideColoring,
          transformId,
          pluginParams,
          orbitTrap,
          useSSAA: effectiveSsaaLevel > 0,
          ssaaLevel: effectiveSsaaLevel,
          adaptiveIterations,
          lighting,
          customGradient,
          colorAdjustments,
        },
      width,
      height,
      scale
    );
  }, [
    effectiveIterations,
    paletteIndex,
    bounds,
    isJulia,
    juliaC,
    power,
    formula,
    outsideColoring,
    insideColoring,
    transformId,
    pluginParams,
    orbitTrap,
    useSSAA,
    adaptiveIterations,
    lighting,
    customGradient,
    colorAdjustments,
  ]);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElRef.current = canvas;
  }, []);

  const handleSave = useCallback((name: string) => {
    const thumbnail = canvasElRef.current
      ? captureThumbnail(canvasElRef.current)
      : '';
    saveDocument(name, document, thumbnail);
  }, [
    document,
    saveDocument,
  ]);

  // Handle formula change - reset to formula's default bounds
  const handleFormulaChange = useCallback((newFormula: string) => {
    updateFormula({ formulaId: newFormula });
    const defaultBounds = getDefaultBounds(newFormula);
    updateBounds(defaultBounds);
  }, [updateBounds, updateFormula]);

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
    updateFormula({ formulaId: selection.formulaId });

    const targetBounds = selection.experienceHint?.bounds ?? getDefaultBounds(selection.formulaId);
    updateBounds(targetBounds);

    if (selection.experienceHint?.coloring) {
      updateColoring({
        customGradient: null,
        ...selection.experienceHint.coloring,
      });
    }
  }, [updateBounds, updateColoring, updateFormula]);

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

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-4rem)] overflow-hidden">
      <div className={`relative bg-black lg:flex-1 ${isPanelCollapsed ? 'flex-1' : 'min-h-[50vh] lg:min-h-0'}`}>
        {!isPreviewPlaying && (
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
            colorAdjustments={colorAdjustments}
            onBoundsChange={updateBounds}
            onPointSelect={isJulia ? undefined : handleCanvasPointSelect}
            onResetView={handleRegisterReset}
            onCanvasReady={handleCanvasReady}
          />
        )}
        {isPreviewPlaying && (
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
              colorAdjustments,
            }}
            keyframes={keyframes}
          />
        )}
        {pickToast && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-mono text-white shadow-sm backdrop-blur-sm">
            {pickToast}
          </div>
        )}

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
                colorAdjustments={colorAdjustments}
                onPaletteChange={(index) => updateColoring({ paletteIndex: index })}
                onOutsideColoringChange={(mode) => updateColoring({ outsideColoringId: mode })}
                onInsideColoringChange={(mode) => updateColoring({ insideColoringId: mode })}
                onOrbitTrapChange={(trap) => updateColoring({ orbitTrap: trap })}
                onGradientChange={(gradient) => updateColoring({ customGradient: gradient })}
                onColorAdjustmentsChange={(adjustments) => updateColoring({ adjustments })}
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
                copied={copied}
                savedCount={storageInfo.count}
                onIterationsChange={(value) => updateRender({ maxIterations: value })}
                onUseSSAAChange={(enabled) => updateRender({ useSSAA: enabled })}
                onAdaptiveIterationsChange={(enabled) => updateRender({ adaptiveIterations: enabled })}
                onLightingChange={(nextLighting) => updateColoring({ lighting: nextLighting })}
                onResetView={handleResetView}
                onShare={handleShare}
                onExport={handleExport}
                onSave={handleSave}
              />
            </TabsContent>

            <TabsContent value="animation" className="mt-0 space-y-4">
              <AnimationPanel
                keyframes={keyframes}
                bounds={bounds}
                onKeyframesChange={(nextKeyframes) => updateAnimation({ keyframes: nextKeyframes })}
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

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreContent />
    </Suspense>
  );
}
