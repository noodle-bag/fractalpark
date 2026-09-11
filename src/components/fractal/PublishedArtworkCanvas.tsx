'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import type { AnimatedFractalCanvasProps } from '@/components/fractal/AnimatedFractalCanvas';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FractalParams, ViewBounds } from '@/engine/types';
import type { PublishedArtworkPlayback } from '@/lib/published-artworks';
import { getReviewedNewtonRenderingV1 } from '@/engine/formulas/v1/reviewed-newton-rendering-v1';

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
  onUnavailable?: () => void;
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
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null);
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
          setUnavailableKey(null);
          return;
        }
        setResolved(null);
        setUnavailableKey(runtimeKey);
      }, () => {
        if (!active) return;
        setResolved(null);
        setUnavailableKey(runtimeKey);
      });

    return () => {
      active = false;
    };
  }, [artwork, runtimeKey]);

  useEffect(() => {
    if (
      !runtimeKey ||
      unavailableKey !== runtimeKey ||
      !onUnavailable ||
      reportedUnavailableRef.current === runtimeKey
    ) {
      return;
    }
    reportedUnavailableRef.current = runtimeKey;
    onUnavailable();
  }, [onUnavailable, runtimeKey, unavailableKey]);

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
