'use client';

import { useEffect, useState, lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useLayout } from '@/components/layout/LayoutContext';
import { useFractalSlideshow } from '@/hooks/useFractalSlideshow';
import { useBuiltinPresets } from '@/hooks/useBuiltinPresets';
import { presetToSavedFractal } from '@/lib/gallery-presets';
import { SITE } from '@/lib/site';
import type { SavedFractal } from '@/engine/types';

// Lazy load AnimatedFractalCanvas to reduce initial bundle
const AnimatedFractalCanvas = lazy(() => import('@/components/fractal/AnimatedFractalCanvas'));

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Hook to get gallery presets for homepage slideshow.
 * Loads from gallery-presets.json (same source as the gallery page).
 */
function useHomepagePresets(): SavedFractal[] {
  const locale = useLocale();
  const { presets } = useBuiltinPresets({ locale });

  return useMemo(() => {
    if (presets.length === 0) return [];
    const fractals = presets.map(presetToSavedFractal);
    return shuffleArray(fractals);
  }, [presets]);
}

export default function HomeClient() {
  const { setConfig } = useLayout();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Set transparent navbar on mount, restore on unmount
  useEffect(() => {
    setConfig({ navbarTransparent: true, hideFooter: true });
    return () => setConfig({ navbarTransparent: false, hideFooter: false });
  }, [setConfig]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Esc key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <div className="fixed inset-0 bg-black">
      <FractalSlideshow
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        isPaused={isPaused}
        onTogglePause={togglePause}
      />
    </div>
  );
}

/**
 * Fractal animation slideshow with crossfade — works on all devices including iOS Safari.
 * Mobile devices use dprScale=0.5 to reduce GPU load.
 */
interface FractalSlideshowProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

function FractalSlideshow({
  isFullscreen,
  onToggleFullscreen,
  isPaused,
  onTogglePause,
}: FractalSlideshowProps) {
  const fractals = useHomepagePresets();
  // Lower dprScale on mobile to reduce GPU load on smaller devices
  const dprScale = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.4 : 0.5;
  const {
    fractalA,
    fractalB,
    activeA,
    activeB,
    phase,
    onLoopComplete,
    crossfadeDuration: cfDur,
    boundsA,
    boundsB,
    setBoundsA,
    setBoundsB,
    canGoPrevious,
    canNavigate,
    goPrevious,
    goNext,
  } = useFractalSlideshow({
    fractals,
    crossfadeDuration: 4000,
  });
  const t = useTranslations('home');

  const opacityA = (phase === 'PLAYING_A' || phase === 'CROSSFADE_TO_A') ? 1 : 0;
  const opacityB = (phase === 'PLAYING_B' || phase === 'CROSSFADE_TO_B') ? 1 : 0;
  const transitionStyle = `opacity ${cfDur}ms ease-in-out`;

  const loopA = (phase === 'PLAYING_A' && !isPaused) ? onLoopComplete : undefined;
  const loopB = (phase === 'PLAYING_B' && !isPaused) ? onLoopComplete : undefined;

  return (
    <>
      {/* Static fallback background (visible until WebGL canvases render) */}
      <div className="absolute inset-0 bg-black" />

      {/* Canvas A */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: opacityA, transition: transitionStyle, zIndex: opacityB > 0 ? 0 : 1 }}
      >
        <Suspense fallback={null}>
          <AnimatedFractalCanvas
            params={{ ...fractalA.params, bounds: boundsA }}
            keyframes={fractalA.animation?.keyframes}
            dprScale={dprScale}
            active={activeA && !isPaused}
            resetOnStop={false}
            maxIterationsClamp={300}
            className="w-full h-full"
            onLoopComplete={loopA}
            onFrame={setBoundsA}
          />
        </Suspense>
      </div>

      {/* Canvas B */}
      {fractalB && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: opacityB, transition: transitionStyle, zIndex: 1 }}
        >
          <Suspense fallback={null}>
            <AnimatedFractalCanvas
              params={{ ...fractalB.params, bounds: boundsB }}
              keyframes={fractalB.animation?.keyframes}
              dprScale={dprScale}
              active={activeB && !isPaused}
              resetOnStop={false}
              maxIterationsClamp={300}
              className="w-full h-full"
              onLoopComplete={loopB}
              onFrame={setBoundsB}
            />
          </Suspense>
        </div>
      )}

      {/* Hero UI - always visible unless fullscreen */}
      {!isFullscreen && (
        <>
          {/* Gradient overlay */}
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/60 pointer-events-none" />

          {/* Content */}
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4">
            <p className="mb-4 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-sm font-medium text-white/80 backdrop-blur">
              {t('hero.eyebrow')}
            </p>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight drop-shadow-lg">
              {SITE.name}
            </h1>
            <p className="text-2xl text-white/90 mb-8 max-w-2xl drop-shadow-md">
              {t('hero.subtitle')}
            </p>

            {/* Capability tags */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {t('hero.tags').split('|').map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-sm text-white/60 border border-white/20 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="text-lg px-8 py-6 rounded-full"
              >
                <Link href="/explore">{t('cta.explore')}</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="text-lg px-8 py-6 rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <Link href="/gallery">{t('cta.gallery')}</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="text-lg px-8 py-6 rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <a href={SITE.repositoryUrl} target="_blank" rel="noopener noreferrer">
                  {t('cta.github')}
                </a>
              </Button>
            </div>

            {/* Pause/Play + Fullscreen buttons */}
            <div className="mt-8 flex gap-3">
              <button
                onClick={onTogglePause}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title={isPaused ? t('play') : t('pause')}
              >
                {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
              <button
                onClick={goPrevious}
                disabled={isPaused || !canNavigate || !canGoPrevious}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('previous')}
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                onClick={goNext}
                disabled={isPaused || !canNavigate}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('next')}
              >
                <SkipForward className="h-5 w-5" />
              </button>
              <button
                onClick={onToggleFullscreen}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title={t('fullscreen')}
              >
                <Maximize2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Fullscreen: click anywhere to exit */}
      {isFullscreen && (
        <div
          className="absolute inset-0 z-50 cursor-pointer"
          onClick={onToggleFullscreen}
        >
          <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
            <div
              className="flex flex-wrap items-center justify-center gap-3 rounded-full bg-black/20 px-4 py-3 backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={onTogglePause}
                className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
                title={isPaused ? t('play') : t('pause')}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button
                onClick={goPrevious}
                disabled={isPaused || !canNavigate || !canGoPrevious}
                className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={t('previous')}
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={goNext}
                disabled={isPaused || !canNavigate}
                className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={t('next')}
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                onClick={onToggleFullscreen}
                className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
                title={t('exitFullscreen')}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
