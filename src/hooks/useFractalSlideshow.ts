'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SavedFractal, ViewBounds } from '@/engine/types';

/**
 * Simplified state: no per-frame progress tracking.
 * Crossfade opacity is handled by CSS transitions in the consuming component.
 */
type SlidePhase = 'PLAYING_A' | 'CROSSFADE_TO_B' | 'PLAYING_B' | 'CROSSFADE_TO_A';

interface UseFractalSlideshowOptions {
  fractals: SavedFractal[];
  crossfadeDuration?: number; // milliseconds, default 2000
}

interface UseFractalSlideshowReturn {
  // Which fractal is on each canvas
  fractalA: SavedFractal;
  fractalB: SavedFractal | null;
  // Whether each canvas should be active (rendering WebGL)
  activeA: boolean;
  activeB: boolean;
  // Which canvas is "on top" (visible) — drives CSS opacity via className
  phase: SlidePhase;
  // Callback when a loop completes — triggers crossfade
  onLoopComplete: () => void;
  // Crossfade duration for CSS transition
  crossfadeDuration: number;
  // Bounds for animation
  boundsA: ViewBounds;
  boundsB: ViewBounds;
  setBoundsA: (bounds: ViewBounds) => void;
  setBoundsB: (bounds: ViewBounds) => void;
  canGoPrevious: boolean;
  canNavigate: boolean;
  goPrevious: () => void;
  goNext: () => void;
}

const PLACEHOLDER_FRACTAL: SavedFractal = {
  id: 'placeholder',
  name: 'Placeholder',
  params: {
    maxIterations: 200,
    paletteIndex: 0,
    bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
    isJulia: false,
    juliaC: [-0.7, 0.27],
    power: 2,
    customGradient: null,
    formula: 'mandelbrot',
    outsideColoring: 'smooth',
    insideColoring: 'black',
    orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
    useSSAA: false,
    adaptiveIterations: false,
    lighting: { enabled: false, mode: 'normalMap' as const, azimuth: 45, elevation: 35, intensity: 0.65 },
    transformId: 'none',
    pluginParams: {},
  },
  createdAt: Date.now(),
  thumbnail: '',
  starred: false,
};

/**
 * Hook for managing crossfade slideshow between fractals.
 *
 * State machine (no per-frame setState — crossfade driven by CSS transition):
 *   PLAYING_A → CROSSFADE_TO_B → PLAYING_B → CROSSFADE_TO_A → PLAYING_A
 *
 * - When onLoopComplete fires: set next fractal on inactive canvas, activate it,
 *   then transition phase to crossfade. CSS transition handles opacity animation.
 * - After crossfadeDuration ms: deactivate the old canvas, switch to PLAYING state.
 */
export function useFractalSlideshow({
  fractals,
  crossfadeDuration = 2000,
}: UseFractalSlideshowOptions): UseFractalSlideshowReturn {
  const initialFractal = fractals.length > 0 ? fractals[0] : PLACEHOLDER_FRACTAL;

  const [phase, setPhase] = useState<SlidePhase>('PLAYING_A');
  const [fractalA, setFractalA] = useState<SavedFractal>(initialFractal);
  const [fractalB, setFractalB] = useState<SavedFractal | null>(null);

  const [boundsA, setBoundsA] = useState<ViewBounds>(initialFractal.params.bounds);
  const [boundsB, setBoundsB] = useState<ViewBounds>({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 });

  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fractalsRef = useRef(fractals);
  const historyRef = useRef<SavedFractal[]>(initialFractal.id === PLACEHOLDER_FRACTAL.id ? [] : [initialFractal]);
  const [historyIndex, setHistoryIndex] = useState(0);
  useEffect(() => {
    fractalsRef.current = fractals;
  }, [fractals]);

  // When fractals load asynchronously (e.g. fetched from gallery-presets.json),
  // reinitialise fractalA with the first real preset so animation can start.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (fractals.length === 0) return;
    const next = fractals[0];
    const frameId = requestAnimationFrame(() => {
      initializedRef.current = true;
      setFractalA(next);
      setBoundsA(next.params.bounds);
      historyRef.current = [next];
      setHistoryIndex(0);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [fractals]);

  // Pick next fractal (random, avoid repeating current)
  const pickNext = useCallback((currentId: string): SavedFractal => {
    const pool = fractalsRef.current;
    if (pool.length <= 1) return pool[0] || PLACEHOLDER_FRACTAL;
    const others = pool.filter((f) => f.id !== currentId);
    return others[Math.floor(Math.random() * others.length)];
  }, []);

  const recordAdvance = useCallback((next: SavedFractal) => {
    const trimmed = historyRef.current.slice(0, historyIndex + 1);
    trimmed.push(next);
    historyRef.current = trimmed;
    setHistoryIndex(trimmed.length - 1);
  }, [historyIndex]);

  const recordPrevious = useCallback((): SavedFractal | null => {
    if (historyIndex <= 0) return null;
    const nextIndex = historyIndex - 1;
    const previous = historyRef.current[nextIndex] ?? null;
    if (!previous) return null;
    setHistoryIndex(nextIndex);
    return previous;
  }, [historyIndex]);

  const transitionTo = useCallback((next: SavedFractal) => {
    if (phase === 'PLAYING_A') {
      setFractalB(next);
      requestAnimationFrame(() => {
        setPhase('CROSSFADE_TO_B');
      });
      return true;
    }

    if (phase === 'PLAYING_B') {
      setFractalA(next);
      requestAnimationFrame(() => {
        setPhase('CROSSFADE_TO_A');
      });
      return true;
    }

    return false;
  }, [phase]);

  // Called when the active canvas finishes one animation loop
  const onLoopComplete = useCallback(() => {
    const currentId = phase === 'PLAYING_A' ? fractalA.id : fractalB?.id ?? '';
    const next = pickNext(currentId);
    if (transitionTo(next)) {
      recordAdvance(next);
    }
  }, [phase, fractalA.id, fractalB?.id, pickNext, recordAdvance, transitionTo]);

  const goNext = useCallback(() => {
    const currentId = phase === 'PLAYING_A' ? fractalA.id : phase === 'PLAYING_B' ? fractalB?.id ?? '' : '';
    if (!currentId) return;
    const next = pickNext(currentId);
    if (transitionTo(next)) {
      recordAdvance(next);
    }
  }, [phase, fractalA.id, fractalB?.id, pickNext, recordAdvance, transitionTo]);

  const goPrevious = useCallback(() => {
    const previous = recordPrevious();
    if (!previous) return;
    if (!transitionTo(previous)) {
      setHistoryIndex((current) => current + 1);
    }
  }, [recordPrevious, transitionTo]);

  // After crossfade duration, finalize the transition
  useEffect(() => {
    if (phase !== 'CROSSFADE_TO_B' && phase !== 'CROSSFADE_TO_A') return;

    crossfadeTimerRef.current = setTimeout(() => {
      if (phase === 'CROSSFADE_TO_B') {
        setPhase('PLAYING_B');
      } else {
        setPhase('PLAYING_A');
      }
    }, crossfadeDuration);

    return () => {
      if (crossfadeTimerRef.current) {
        clearTimeout(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
    };
  }, [phase, crossfadeDuration]);

  // Derive active states
  const activeA = phase === 'PLAYING_A' || phase === 'CROSSFADE_TO_B' || phase === 'CROSSFADE_TO_A';
  const activeB = phase === 'PLAYING_B' || phase === 'CROSSFADE_TO_B' || phase === 'CROSSFADE_TO_A';
  const canNavigate = phase === 'PLAYING_A' || phase === 'PLAYING_B';

  return {
    fractalA,
    fractalB,
    activeA,
    activeB,
    phase,
    onLoopComplete,
    crossfadeDuration,
    boundsA,
    boundsB,
    setBoundsA,
    setBoundsB,
    canGoPrevious: historyIndex > 0,
    canNavigate,
    goPrevious,
    goNext,
  };
}
