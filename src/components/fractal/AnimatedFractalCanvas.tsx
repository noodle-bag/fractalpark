'use client';

import { useRef, useEffect, useCallback } from 'react';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { useKeyframeAnimation } from '@/hooks/useKeyframeAnimation';
import { cn } from '@/lib/utils';
import type { FractalParams, ViewBounds, Keyframe } from '@/engine/types';

// Singleton plugin registration
let builtinsRegistered = false;

export interface AnimatedFractalCanvasProps {
  params: FractalParams;           // Formula/coloring params (fixed)
  keyframes?: Keyframe[];          // Animation keyframes (if provided, animates)
  dprScale?: number;               // DPR scale factor (default: 1.0)
  active?: boolean;                // Whether to render (default: true)
  resetOnStop?: boolean;           // Reset progress when stopped (default: true). Set false to resume from current position.
  maxIterationsClamp?: number;     // Cap maxIterations (e.g. 300 for homepage)
  className?: string;
  onFrame?: (bounds: ViewBounds) => void;  // Called on each animation frame
  onLoopComplete?: () => void;     // Called when animation loop completes
}

/**
 * Non-interactive animated fractal canvas
 * 
 * Key features:
 * - Manages its own WebGL context and DPR (doesn't use useWebGL)
 * - Plays keyframe animation when keyframes provided
 * - Renders static frame when no keyframes
 * - Disposes renderer when active=false to free GPU resources
 * - No React state updates during animation (imperative rendering)
 */
export default function AnimatedFractalCanvas({
  params,
  keyframes = [],
  dprScale = 1.0,
  active = true,
  resetOnStop = true,
  maxIterationsClamp,
  className,
  onFrame,
  onLoopComplete,
}: AnimatedFractalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const rendererRef = useRef<FractalRenderer | null>(null);
  const boundsRef = useRef<ViewBounds>(params.bounds);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Render function (defined before useEffect that references it)
  const render = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const iterations = maxIterationsClamp
      ? Math.min(params.maxIterations, maxIterationsClamp)
      : params.maxIterations;

    renderer.render({
      ...params,
      maxIterations: iterations,
      bounds: boundsRef.current,
      useSSAA: false, // Always disable SSAA for animation performance
    });
  }, [params, maxIterationsClamp]);

  // Stable ref for render so ResizeObserver always calls the latest version
  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
  }, [render]);

  // Initialize WebGL context
  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get WebGL context
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;

    // Register plugins
    if (!builtinsRegistered) {
      registerBuiltins();
      builtinsRegistered = true;
    }

    // Create renderer
    const renderer = new FractalRenderer(gl);
    rendererRef.current = renderer;
    void renderer.precompileDefault();

    // Handle resize with custom DPR
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = (window.devicePixelRatio || 1) * dprScale;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        renderRef.current();
      }
    };

    // Set up ResizeObserver
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(canvas);

    // Initial size set
    handleResize();

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      glRef.current = null;
    };
  }, [active, dprScale]);

  // Update bounds ref when params change (for static rendering)
  useEffect(() => {
    boundsRef.current = params.bounds;
  }, [params.bounds]);

  // Animation frame handler
  const handleFrame = useCallback((bounds: ViewBounds) => {
    boundsRef.current = bounds;
    render();
    onFrame?.(bounds);
  }, [render, onFrame]);

  // Set up keyframe animation
  useKeyframeAnimation({
    keyframes,
    onFrame: handleFrame,
    onLoopComplete,
    active: active && keyframes.length >= 2,
    resetOnStop,
  });

  // Static render when no keyframes or not active
  useEffect(() => {
    if (active && keyframes.length < 2 && rendererRef.current) {
      render();
    }
  }, [active, keyframes.length, render]);

  // Re-render when params change (excluding bounds which are animated)
  useEffect(() => {
    if (active && rendererRef.current) {
      render();
    }
  }, [
    active,
    params.paletteIndex,
    params.maxIterations,
    params.isJulia,
    params.juliaC,
    params.power,
    params.formula,
    params.outsideColoring,
    params.insideColoring,
    params.orbitTrap,
    params.transformId,
    params.pluginParams,
    params.adaptiveIterations,
    params.lighting,
    params.customGradient,
    render,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('h-full w-full', className)}
      style={{ touchAction: 'none' }}
    />
  );
}
