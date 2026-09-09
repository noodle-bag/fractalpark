'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import { useFractalRenderWorker } from '@/hooks/useFractalRenderWorker';
import type { FractalCanvasProps } from './FractalCanvas';
import type { FractalParams } from '@/engine/types';

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
  pluginParams = {},
  useSSAA,
  adaptiveIterations,
  pipelineVersion = 1,
  lighting,
  customGradient,
  onBoundsChange,
  onPointSelect,
  onCanvasReady,
}: FractalCanvasProps) {
  const t = useTranslations('explore.formula.resolution');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef<FractalParams | null>(null);
  const renderGenerationRef = useRef(0);
  const { render } = useFractalRenderWorker();

  useCanvasInteraction(canvasRef, {
    onBoundsChange: onBoundsChange ?? (() => {}),
    initialBounds: bounds,
    onPointSelect,
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
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, resized };
  }, []);

  const renderLatest = useCallback((params: FractalParams) => {
    const canvas = canvasRef.current;
    const size = resize();
    if (!canvas || !size) return;

    const generation = ++renderGenerationRef.current;
    canvas.dataset.renderStatus = 'pending';
    canvas.setAttribute('aria-busy', 'true');
    delete canvas.dataset.renderedFormulaId;

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
        context.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
        frame.bitmap.close();
        canvas.dataset.renderStatus = 'ready';
        canvas.dataset.renderedFormulaId = frame.formulaId;
        canvas.setAttribute('aria-busy', 'false');
      })
      .catch((error: unknown) => {
        if (
          generation !== renderGenerationRef.current ||
          (error instanceof Error && error.name === 'AbortError')
        ) return;
        canvas.dataset.renderStatus = 'error';
        canvas.setAttribute('aria-busy', 'false');
      });
  }, [render, resize]);

  useEffect(() => {
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
    renderLatest(params);
  }, [
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
      if (params && resize()?.resized) renderLatest(params);
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
    </div>
  );
}
