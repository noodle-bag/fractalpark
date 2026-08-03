'use client';

import { lazy, Suspense, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  buildPublishedArtworkPlayback,
  type PublishedArtwork,
} from '@/lib/published-artworks';

const AnimatedFractalCanvas = lazy(
  () => import('@/components/fractal/AnimatedFractalCanvas')
);

interface PublishedArtworkCardProps {
  artwork: PublishedArtwork;
  href: string;
  onOpen?: () => void;
}

export function PublishedArtworkCard({
  artwork,
  href,
  onOpen,
}: PublishedArtworkCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const playback = useMemo(
    () => buildPublishedArtworkPlayback(artwork),
    [artwork]
  );
  const hasAnimation = playback.animation.keyframes.length >= 2;

  return (
    <article>
      <Link
        href={href}
        onClick={onOpen}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
            setIsHovered(true);
          }
        }}
        onPointerLeave={() => setIsHovered(false)}
        className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border bg-muted shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md">
          {artwork.thumbnail ? (
            <Image
              src={artwork.thumbnail}
              alt=""
              fill
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-[1.015]"
              sizes="(max-width: 639px) 100vw, (max-width: 899px) 50vw, 33vw"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600" />
          )}
          {isHovered && hasAnimation ? (
            <div className="pointer-events-none absolute inset-0">
              <Suspense fallback={null}>
                <AnimatedFractalCanvas
                  params={playback.params}
                  keyframes={playback.animation.keyframes}
                  dprScale={0.5}
                  className="h-full w-full"
                />
              </Suspense>
            </div>
          ) : null}
        </div>
        <h2 className="mt-3 truncate font-medium group-hover:underline">
          {artwork.name}
        </h2>
      </Link>
    </article>
  );
}