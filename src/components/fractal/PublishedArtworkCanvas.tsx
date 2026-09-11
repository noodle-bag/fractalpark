'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import type { AnimatedFractalCanvasProps } from '@/components/fractal/AnimatedFractalCanvas';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FractalParams, ViewBounds } from '@/engine/types';
import type { PublishedArtworkPlayback } from '@/lib/published-artworks';
import { getReviewedNewtonRenderingV1 } from '@/engine/formulas/v1/reviewed-newton-rendering-v1';
import type { PublishedArtworkRuntimeFailure } from '@/lib/published-artwork-runtime';

const AnimatedFractalCanvas = lazy(
  () => import('@/components/fractal/AnimatedFractalCanvas'),
);

type CanvasProps = Omit<
  AnimatedFractalCanvasProps,
  'params' | 'formulaPlugin'
>;

interface PublishedArtworkCanvasProps extends CanvasProps {
  artwork: Pick<PublishedArtworkPlayback, 'params' | 'runtimeFormula'>;
  bounds?: ViewBounds;
  onUnavailable?: (reason: PublishedArtworkRuntimeFailure) => void;
}

interface ResolvedRuntime {
  key: string;
  params: FractalParams;
  formulaPlugin?: FormulaPlugin;
}

export default function PublishedArtworkCanvas({
  artwork,
  bounds,
  onUnavailable,
  ...canvasProps
}: PublishedArtworkCanvasProps) {
  const runtimeKey = artwork.runtimeFormula?.runtimeId;
  const [resolved, setResolved] = useState<ResolvedRuntime | null>(null);
  const [unavailable, setUnavailable] = useState<{ key: string; reason: PublishedArtworkRuntimeFailure } | null>(null);
  const reportedUnavailableRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runtimeKey) return;

    let active = true;
    reportedUnavailableRef.current = null;
    void import('@/lib/published-artwork-runtime')
      .then(({ resolvePublishedArtworkRuntime }) =>
        resolvePublishedArtworkRuntime(artwork),
      )
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setResolved({
            key: runtimeKey,
            params: result.value.params,
            formulaPlugin: result.value.formulaPlugin,
          });
          setUnavailable(null);
          return;
        }
        setResolved(null);
        setUnavailable({ key: runtimeKey, reason: result.reason });
      }, () => {
        if (!active) return;
        setResolved(null);
        setUnavailable({ key: runtimeKey, reason: 'formula-load-failed' });
      });

    return () => {
      active = false;
    };
  }, [artwork, runtimeKey]);

  useEffect(() => {
    if (
      !runtimeKey ||
      unavailable?.key !== runtimeKey ||
      !onUnavailable ||
      reportedUnavailableRef.current === runtimeKey
    ) {
      return;
    }
    reportedUnavailableRef.current = runtimeKey;
    onUnavailable(unavailable.reason);
  }, [onUnavailable, runtimeKey, unavailable]);

  const runtime = runtimeKey
    ? resolved?.key === runtimeKey
      ? resolved
      : null
    : { key: 'builtin', params: artwork.params, formulaPlugin: getReviewedNewtonRenderingV1(artwork.params.formula) };
  if (!runtime) return null;

  return (
    <Suspense fallback={null}>
      <AnimatedFractalCanvas
        {...canvasProps}
        params={bounds ? { ...runtime.params, bounds } : runtime.params}
        formulaPlugin={runtime.formulaPlugin}
      />
    </Suspense>
  );
}
