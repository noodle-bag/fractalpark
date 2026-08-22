'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useWebGL } from '@/hooks/useWebGL';
import { useFractalRenderer } from '@/hooks/useFractalRenderer';
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import type {
  FractalFormula,
  FractalParams,
  GradientStop,
  InsideColoringMode,
  LightingConfig,
  OrbitTrapConfig,
  OutsideColoringMode,
  PluginParamRecord,
  ViewBounds,
} from '@/engine/types';

interface FractalCanvasProps {
  paletteIndex: number;
  maxIterations: number;
  bounds: ViewBounds;
  isJulia: boolean;
  juliaC: [number, number];
  power: number;
  formula: FractalFormula;
  outsideColoring: OutsideColoringMode;
  insideColoring: InsideColoringMode;
  orbitTrap: OrbitTrapConfig;
  transformId?: string;
  pluginParams?: PluginParamRecord;
  useSSAA: boolean;
  adaptiveIterations: boolean;
  /** Rendering pipeline version (spec §7); defaults to 1 (legacy). */
  pipelineVersion?: 1 | 2;
  lighting: LightingConfig;
  customGradient: GradientStop[] | null;
  onBoundsChange?: (bounds: ViewBounds) => void;
  onPointSelect?: (point: [number, number]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export default function FractalCanvas({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { glRef, isContextLost, error, resize } = useWebGL(canvasRef);
  const { render, rendererRef } = useFractalRenderer(glRef);
  const paramsRef = useRef<FractalParams | null>(null);
  const renderGenerationRef = useRef(0);

  useCanvasInteraction(canvasRef, {
    onBoundsChange: onBoundsChange ?? (() => {}),
    initialBounds: bounds,
    onPointSelect,
  });

  useEffect(() => {
    if (canvasRef.current) {
      onCanvasReady?.(canvasRef.current);
    }
  }, [onCanvasReady]);

  const renderLatest = useCallback(
    (params: FractalParams) => {
      const canvas = canvasRef.current;
      const generation = ++renderGenerationRef.current;
      if (canvas) {
        canvas.dataset.renderStatus = 'pending';
        delete canvas.dataset.renderedFormulaId;
      }
      void render(params)
        .then((didRender) => {
          if (
            !didRender ||
            generation !== renderGenerationRef.current ||
            !canvas
          )
            return;
          canvas.dataset.renderStatus = 'ready';
          canvas.dataset.renderedFormulaId = String(params.formula);
        })
        .catch(() => {
          if (generation !== renderGenerationRef.current || !canvas) return;
          canvas.dataset.renderStatus = 'error';
        });
    },
    [render],
  );

  useEffect(() => {
    if (!rendererRef.current) return;

    const params: FractalParams = {
      maxIterations,
      paletteIndex,
      bounds: bounds,
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
    resize();
    renderLatest(params);
  }, [
    bounds,
    paletteIndex,
    maxIterations,
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
    resize,
    renderLatest,
    rendererRef,
  ]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      resize();
      const params = paramsRef.current;
      if (rendererRef.current && params) {
        renderLatest(params);
      }
    });

    if (canvasRef.current) {
      observer.observe(canvasRef.current);
    }

    return () => observer.disconnect();
  }, [resize, renderLatest, rendererRef]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted p-8 text-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        data-testid="fractal-canvas"
        className="h-full w-full cursor-grab rounded-lg active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      />

      {isContextLost && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
          <p className="text-white">WebGL context lost. Restoring...</p>
        </div>
      )}
    </div>
  );
}
