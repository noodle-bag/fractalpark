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
  const { render, cancel } = useFractalRenderWorker();
  const cancelRender = useCallback(() => {
    ++renderGenerationRef.current;
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

  const renderLatest = useCallback((
    params: FractalParams,
    attribution: CreatorChangeAttribution | null,
    remixSource: CreatorRemixSource | null,
  ) => {
    const canvas = canvasRef.current;
    const size = resize();
    if (!canvas || !size) return;

    const generation = ++renderGenerationRef.current;
    canvas.dataset.renderStatus = 'pending';
    canvas.setAttribute('aria-busy', 'true');
    onFrameReadyChange?.(false);

    void render({
      generation,
      width: size.width,
      height: size.height,
      params,
    })
      .then((frame) => {
        if (generation !== renderGenerationRef.current || !canvas.isConnected) {
          frame.bitmap.close();
          return;
        }
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          frame.bitmap.close();
          throw new Error('2D canvas is not supported on this device');
        }
        try {
          if (canvas.width !== size.width) canvas.width = size.width;
          if (canvas.height !== size.height) canvas.height = size.height;
          context.drawImage(frame.bitmap, 0, 0, size.width, size.height);
        } finally {
          frame.bitmap.close();
        }
        canvas.dataset.renderStatus = 'ready';
        canvas.dataset.renderedFormulaId = frame.formulaId;
        canvas.setAttribute('aria-busy', 'false');
        onFrameReadyChange?.(true);
        onRenderComplete?.(attribution, remixSource);
      })
      .catch((error: unknown) => {
        if (
          generation !== renderGenerationRef.current ||
          (error instanceof Error && error.name === 'AbortError')
        ) return;
        canvas.dataset.renderStatus = 'error';
        canvas.setAttribute('aria-busy', 'false');
      });
  }, [onFrameReadyChange, onRenderComplete, render, resize]);

  useLayoutEffect(() => {
    if (!renderEnabled) {
      paramsRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.dataset.renderStatus = 'pending';
        canvasRef.current.setAttribute('aria-busy', 'true');
      }
      onFrameReadyChange?.(false);
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
    return cancelRender;
  }, [
    cancelRender,
    renderEnabled,
    onFrameReadyChange,
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

      <div role="status" className="pointer-events-none absolute left-3 top-3 hidden items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-sm peer-data-[render-status=pending]:flex">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </div>
      <div role="alert" className="pointer-events-none absolute bottom-3 left-3 hidden rounded-md bg-background/90 px-3 py-2 text-sm peer-data-[render-status=error]:block">
        {t('unavailable', { formula })}
      </div>
    </div>
  );
}
