'use client';

import Image from 'next/image';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import type { PublishedArtworkPlayback } from '@/lib/published-artworks';
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
    resume: string;
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
  const [isPaused, setIsPaused] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.fullscreenElement === dialogRef.current) {
          void document.exitFullscreen();
        }
        setIsOpen(false);
        setIsPaused(false);
      }
    };
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== dialogRef.current) {
        setIsOpen(false);
        setIsPaused(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isOpen]);

  function openViewer() {
    flushSync(() => {
      setIsPaused(false);
      setIsOpen(true);
    });
    const dialog = dialogRef.current;
    if (!dialog?.requestFullscreen) return;
    void dialog.requestFullscreen().catch(() => {
      // Keep the full-viewport dialog as a fallback when the API is unavailable.
    });
  }

  function closeViewer() {
    if (document.fullscreenElement === dialogRef.current) {
      void document.exitFullscreen();
    }
    setIsOpen(false);
    setIsPaused(false);
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
          {!isOpen ? (
            <div className="pointer-events-none absolute inset-0">
              <Suspense fallback={null}>
                <AnimatedFractalCanvas
                  params={artwork.params}
                  keyframes={artwork.animation.keyframes}
                  dprScale={0.75}
                  className="h-full w-full"
                />
              </Suspense>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={openViewer}>
            <Maximize2 aria-hidden />
            {labels.viewFullscreen}
          </Button>
        </div>
      </figure>

      {isOpen ? (
        <div
          ref={dialogRef}
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

          <div className="pointer-events-none absolute inset-0">
            <Suspense fallback={null}>
              <AnimatedFractalCanvas
                params={artwork.params}
                keyframes={artwork.animation.keyframes}
                dprScale={0.75}
                paused={isPaused}
                resetOnStop={false}
                className="h-full w-full"
              />
            </Suspense>
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 px-4">
            <div className={PLAYBACK_CONTROL_BAR_CLASS}>
              <button
                type="button"
                className={PLAYBACK_CONTROL_BUTTON_CLASS}
                aria-label={isPaused ? labels.resume : labels.pause}
                title={isPaused ? labels.resume : labels.pause}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsPaused((paused) => !paused);
                }}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
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
