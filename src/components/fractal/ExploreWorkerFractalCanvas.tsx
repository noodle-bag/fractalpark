'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import { useFractalRenderWorker } from '@/hooks/useFractalRenderWorker';
import type {
  CreatorChangeAttribution,
  CreatorRemixSource,
} from '@/lib/creator-analytics';
import type { FractalCanvasProps } from './FractalCanvas';
import type { FractalParams, PluginParamRecord } from '@/engine/types';

const EMPTY_PLUGIN_PARAMS: PluginParamRecord = {};
const LOADING_INDICATOR_DELAY_MS = 150;

interface ScheduledRender {
  generation: number;
  width: number;
  height: number;
  params: FractalParams;
  attribution: CreatorChangeAttribution | null;
  remixSource: CreatorRemixSource | null;
}

interface ExploreWorkerFractalCanvasProps extends FractalCanvasProps {
  renderEnabled?: boolean;
  onFrameReadyChange?: (ready: boolean) => void;
  renderAttribution?: CreatorChangeAttribution | null;
  renderRemixSource?: CreatorRemixSource | null;
  onRenderComplete?: (
    attribution: CreatorChangeAttribution | null,
    remixSource: CreatorRemixSource | null,
  ) => void;
}

export default function ExploreWorkerFractalCanvas({
  paletteIndex,
  maxIterations,
  bounds,
  isJulia,
  juliaC,
  power,
  formula,
  outsideColoring,
  insideColoring,
  orbitTrap,
  transformId = 'none',
  pluginParams = EMPTY_PLUGIN_PARAMS,
  useSSAA,
  adaptiveIterations,
  pipelineVersion = 1,
  lighting,
  customGradient,
  onBoundsChange,
  onPointSelect,
  onCanvasReady,
  renderEnabled = true,
  onFrameReadyChange,
  renderAttribution = null,
  renderRemixSource = null,
  onRenderComplete,
}: ExploreWorkerFractalCanvasProps) {
  const t = useTranslations('explore.formula.resolution');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef<FractalParams | null>(null);
  const renderAttributionRef = useRef<CreatorChangeAttribution | null>(null);
  const renderRemixSourceRef = useRef<CreatorRemixSource | null>(null);
  const renderGenerationRef = useRef(0);
  const requestedSizeRef = useRef({ width: 0, height: 0 });
  const inFlightGenerationRef = useRef<number | null>(null);
  const queuedRenderRef = useRef<ScheduledRender | null>(null);
  const loadingIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRenderRef = useRef<(request: ScheduledRender) => void>(() => {});
  const { render, cancel } = useFractalRenderWorker();

  const hideLoadingIndicator = useCallback(() => {
    if (loadingIndicatorTimerRef.current !== null) {
      clearTimeout(loadingIndicatorTimerRef.current);
      loadingIndicatorTimerRef.current = null;
    }
    if (canvasRef.current) canvasRef.current.dataset.loadingIndicator = 'hidden';
  }, []);

  const markPending = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.renderStatus = 'pending';
    canvas.setAttribute('aria-busy', 'true');
    onFrameReadyChange?.(false);
    if (
      canvas.dataset.loadingIndicator !== 'visible' &&
      loadingIndicatorTimerRef.current === null
    ) {
      canvas.dataset.loadingIndicator = 'hidden';
      loadingIndicatorTimerRef.current = setTimeout(() => {
        loadingIndicatorTimerRef.current = null;
        const currentCanvas = canvasRef.current;
        if (currentCanvas?.dataset.renderStatus === 'pending') {
          currentCanvas.dataset.loadingIndicator = 'visible';
        }
      }, LOADING_INDICATOR_DELAY_MS);
    }
  }, [onFrameReadyChange]);

  const cancelScheduledRender = useCallback(() => {
    ++renderGenerationRef.current;
    queuedRenderRef.current = null;
    inFlightGenerationRef.current = null;
    cancel();
  }, [cancel]);

  useLayoutEffect(() => {
    renderAttributionRef.current = renderAttribution;
    renderRemixSourceRef.current = renderRemixSource;
  }, [renderAttribution, renderRemixSource]);

  useCanvasInteraction(canvasRef, {
    onBoundsChange: useCallback((nextBounds) => {
      if (renderEnabled) onBoundsChange?.(nextBounds);
    }, [onBoundsChange, renderEnabled]),
    initialBounds: bounds,
    onPointSelect: renderEnabled ? onPointSelect : undefined,
  });

  useEffect(() => {
    if (canvasRef.current) onCanvasReady?.(canvasRef.current);
  }, [onCanvasReady]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    // Keep the backing pixels until their replacement is ready. CSS scales
    // the last good frame while a new viewport size is being rendered.
    const resized = requestedSizeRef.current.width !== width || requestedSizeRef.current.height !== height;
    requestedSizeRef.current = { width, height };
    return { width, height, resized };
  }, []);

  const startRender = useCallback((request: ScheduledRender) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    inFlightGenerationRef.current = request.generation;

    void render({
      generation: request.generation,
      width: request.width,
      height: request.height,
      params: request.params,
    })
      .then((frame) => {
        if (
          request.generation !== renderGenerationRef.current ||
          !canvas.isConnected
        ) {
          frame.bitmap.close();
          return;
        }
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          frame.bitmap.close();
          throw new Error('2D canvas is not supported on this device');
        }
        try {
          if (canvas.width !== request.width) canvas.width = request.width;
          if (canvas.height !== request.height) canvas.height = request.height;
          context.drawImage(frame.bitmap, 0, 0, request.width, request.height);
        } finally {
          frame.bitmap.close();
        }
        hideLoadingIndicator();
        canvas.dataset.renderStatus = 'ready';
        canvas.dataset.renderedFormulaId = frame.formulaId;
        canvas.setAttribute('aria-busy', 'false');
        onFrameReadyChange?.(true);
        onRenderComplete?.(request.attribution, request.remixSource);
      })
      .catch((error: unknown) => {
        if (
          request.generation !== renderGenerationRef.current ||
          (error instanceof Error && error.name === 'AbortError')
        ) return;
        hideLoadingIndicator();
        canvas.dataset.renderStatus = 'error';
        canvas.setAttribute('aria-busy', 'false');
      })
      .finally(() => {
        if (inFlightGenerationRef.current !== request.generation) return;
        inFlightGenerationRef.current = null;
        const queued = queuedRenderRef.current;
        queuedRenderRef.current = null;
        if (queued) startRenderRef.current(queued);
      });
  }, [hideLoadingIndicator, onFrameReadyChange, onRenderComplete, render]);
  startRenderRef.current = startRender;

  const renderLatest = useCallback((
    params: FractalParams,
    attribution: CreatorChangeAttribution | null,
    remixSource: CreatorRemixSource | null,
  ) => {
    const canvas = canvasRef.current;
    const size = resize();
    if (!canvas || !size) return;

    const request: ScheduledRender = {
      generation: ++renderGenerationRef.current,
      width: size.width,
      height: size.height,
      params,
      attribution,
      remixSource,
    };
    markPending();
    if (inFlightGenerationRef.current !== null) {
      queuedRenderRef.current = request;
      return;
    }
    startRender(request);
  }, [markPending, resize, startRender]);

  useLayoutEffect(() => {
    if (!renderEnabled) {
      paramsRef.current = null;
      cancelScheduledRender();
      markPending();
      return;
    }
    const params: FractalParams = {
      maxIterations,
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
      useSSAA,
      adaptiveIterations,
      pipelineVersion,
      lighting,
      customGradient,
    };
    paramsRef.current = params;
    renderLatest(
      params,
      renderAttributionRef.current,
      renderRemixSourceRef.current,
    );
  }, [
    cancelScheduledRender,
    renderEnabled,
    markPending,
    adaptiveIterations,
    bounds,
    customGradient,
    formula,
    insideColoring,
    isJulia,
    juliaC,
    lighting,
    maxIterations,
    orbitTrap,
    outsideColoring,
    paletteIndex,
    pipelineVersion,
    pluginParams,
    power,
    renderLatest,
    transformId,
    useSSAA,
  ]);

  useEffect(() => () => {
    cancelScheduledRender();
    hideLoadingIndicator();
  }, [cancelScheduledRender, hideLoadingIndicator]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const params = paramsRef.current;
      if (params && resize()?.resized) {
        renderLatest(
          params,
          renderAttributionRef.current,
          renderRemixSourceRef.current,
        );
      }
    });
    const canvas = canvasRef.current;
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderLatest, resize]);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        data-testid="fractal-canvas"
        data-render-backend="worker"
        className="peer h-full w-full cursor-grab rounded-lg active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      />

      <div role="status" className="pointer-events-none absolute left-3 top-3 hidden items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-sm peer-data-[loading-indicator=visible]:flex">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </div>
      <div role="alert" className="pointer-events-none absolute bottom-3 left-3 hidden rounded-md bg-background/90 px-3 py-2 text-sm peer-data-[render-status=error]:block">
        {t('unavailable', { formula })}
      </div>
    </div>
  );
}
