'use client';

import Image from 'next/image';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import type { PublishedArtworkPlayback } from '@/lib/published-artworks';
import type { ViewBounds } from '@/engine/types';
import {
  PLAYBACK_CONTROL_BAR_CLASS,
  PLAYBACK_CONTROL_BUTTON_CLASS,
} from '@/components/fractal/playback-controls';
import { Button } from '@/components/ui/button';

const AnimatedFractalCanvas = lazy(
  () => import('@/components/fractal/AnimatedFractalCanvas')
);

interface ArtworkViewerProps {
  artwork: PublishedArtworkPlayback;
  imagePath: string;
  labels: {
    viewFullscreen: string;
    play: string;
    pause: string;
    minimize: string;
    closeHint: string;
  };
}

export function ArtworkViewer({
  artwork,
  imagePath,
  labels,
}: ArtworkViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const [bounds, setBounds] = useState<ViewBounds>(artwork.params.bounds);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setTimeout(() => setCanvasVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, [isPlaying]);

  function openViewer(play: boolean) {
    setBounds(artwork.params.bounds);
    setIsPaused(false);
    setCanvasVisible(false);
    setIsPlaying(play);
    setIsOpen(true);
  }

  function closeViewer() {
    setIsOpen(false);
    setIsPlaying(false);
    setIsPaused(false);
    setCanvasVisible(false);
  }

  return (
    <>
      <figure>
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border bg-black shadow-sm">
          <Image
            src={imagePath}
            alt={artwork.name}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1280px) 1152px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => openViewer(false)}>
            <Maximize2 aria-hidden />
            {labels.viewFullscreen}
          </Button>
          <Button type="button" onClick={() => openViewer(true)}>
            <Play aria-hidden />
            {labels.play}
          </Button>
        </div>
      </figure>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={artwork.name}
          className="fixed inset-0 z-50 bg-black"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <Image
            src={imagePath}
            alt=""
            fill
            priority
            className="pointer-events-none object-contain"
            sizes="100vw"
          />

          {isPlaying ? (
            <div
              className="pointer-events-none absolute inset-0 transition-opacity duration-700"
              style={{ opacity: canvasVisible ? 1 : 0 }}
            >
              <Suspense fallback={null}>
                <AnimatedFractalCanvas
                  params={{ ...artwork.params, bounds }}
                  keyframes={isPaused ? undefined : artwork.animation.keyframes}
                  dprScale={0.75}
                  resetOnStop={false}
                  className="h-full w-full"
                  onFrame={setBounds}
                />
              </Suspense>
            </div>
          ) : null}

          <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 px-4">
            <div className={PLAYBACK_CONTROL_BAR_CLASS}>
              {isPlaying ? (
                <button
                  type="button"
                  className={PLAYBACK_CONTROL_BUTTON_CLASS}
                  aria-label={isPaused ? labels.play : labels.pause}
                  title={isPaused ? labels.play : labels.pause}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPaused((paused) => !paused);
                  }}
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  className={PLAYBACK_CONTROL_BUTTON_CLASS}
                  aria-label={labels.play}
                  title={labels.play}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCanvasVisible(false);
                    setIsPlaying(true);
                  }}
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                className={PLAYBACK_CONTROL_BUTTON_CLASS}
                aria-label={labels.minimize}
                title={labels.minimize}
                onClick={(event) => {
                  event.stopPropagation();
                  closeViewer();
                }}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-white/60">{labels.closeHint}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
