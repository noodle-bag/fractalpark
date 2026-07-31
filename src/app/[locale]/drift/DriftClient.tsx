'use client';

import { useEffect, useState, lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useLayout } from '@/components/layout/LayoutContext';
import {
  useFractalSlideshow,
  type SlideshowArtwork,
} from '@/hooks/useFractalSlideshow';
import {
  buildPublishedArtworkPlayback,
  type PublishedArtwork,
} from '@/lib/published-artworks';

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
 * Project and shuffle the server-provided published collection after mount,
 * so SSR and hydration both render the deterministic empty black shell.
 */
function useDriftArtworks(artworks: PublishedArtwork[]): SlideshowArtwork[] {
  const playbackArtworks = useMemo(
    () => artworks.map(buildPublishedArtworkPlayback),
    [artworks]
  );
  const [shuffledArtworks, setShuffledArtworks] = useState<SlideshowArtwork[]>([]);

  useEffect(() => {
    setShuffledArtworks(shuffleArray(playbackArtworks));
  }, [playbackArtworks]);

  return shuffledArtworks;
}

/**
 * Drift — full-viewport immersive preset playback.
 *
 * Migrated from the legacy homepage (Slice 2.1). Deliberately minimal:
 * no hero copy, no CTAs, and no fullscreen mode — the route itself is the
 * immersive state. The only controls are Play/Pause, Previous, and Next in a
 * bottom bar; the transparent navbar stays on top as the way out.
 */
interface DriftClientProps {
  artworks: PublishedArtwork[];
}

export default function DriftClient({ artworks }: DriftClientProps) {
  const { setConfig } = useLayout();
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

  return (
    <div className="fixed inset-0 bg-black">
      <DriftSlideshow
        artworks={artworks}
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
interface DriftSlideshowProps {
  artworks: PublishedArtwork[];
  isPaused: boolean;
  onTogglePause: () => void;
}

function DriftSlideshow({ artworks, isPaused, onTogglePause }: DriftSlideshowProps) {
  const fractals = useDriftArtworks(artworks);
  // Lower dprScale on mobile to reduce GPU load on smaller devices
  const dprScale = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.4 : 0.5;
  const {
    isReady,
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
  const t = useTranslations('drift');

  const opacityA = (phase === 'PLAYING_A' || phase === 'CROSSFADE_TO_A') ? 1 : 0;
  const opacityB = (phase === 'PLAYING_B' || phase === 'CROSSFADE_TO_B') ? 1 : 0;
  const transitionStyle = `opacity ${cfDur}ms ease-in-out`;

  const loopA = (phase === 'PLAYING_A' && !isPaused) ? onLoopComplete : undefined;
  const loopB = (phase === 'PLAYING_B' && !isPaused) ? onLoopComplete : undefined;

  return (
    <>
      {/* Static fallback background (visible until WebGL canvases render,
          and the no-WebGL poster via canvas A's thumbnail background) */}
      <div className="absolute inset-0 bg-black" />

      {/* Canvas A */}
      {isReady && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: opacityA,
            transition: transitionStyle,
            zIndex: opacityB > 0 ? 0 : 1,
            backgroundImage: fractalA.thumbnail ? `url("${fractalA.thumbnail}")` : undefined,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
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
      )}

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

      {/* Bottom control bar — the only chrome on this page.
          Exactly three accessible controls: Play/Pause, Previous, Next. */}
      <div className="absolute bottom-4 left-0 right-0 z-10 flex justify-center px-4">
        <div className="flex items-center justify-center gap-3 rounded-full bg-black/20 px-4 py-3 backdrop-blur-sm">
          <button
            onClick={onTogglePause}
            className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
            title={isPaused ? t('play') : t('pause')}
            aria-label={isPaused ? t('play') : t('pause')}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            onClick={goPrevious}
            disabled={isPaused || !canNavigate || !canGoPrevious}
            className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={t('previous')}
            aria-label={t('previous')}
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={goNext}
            disabled={isPaused || !canNavigate || !isReady}
            className="inline-flex items-center rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={t('next')}
            aria-label={t('next')}
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
