'use client';

import { useEffect, useState } from 'react';
import FractalCanvas from '@/components/fractal/FractalCanvas';
import type { FractalParams, ViewBounds } from '@/engine/types';

interface ThumbnailRendererProps {
  params: FractalParams;
  height?: number;
  width?: number;
  useSSAA?: boolean;
}

export function ThumbnailRenderer({
  params,
  height = 600,
  width = 600,
  useSSAA = false,
}: ThumbnailRendererProps) {
  const [bounds, setBounds] = useState<ViewBounds>(params.bounds);

  useEffect(() => {
    setBounds(params.bounds);
  }, [params]);

  return (
    <div
      className="shrink-0 bg-black"
      data-testid="thumbnail-renderer"
      style={{ height, width }}
    >
      <FractalCanvas
        paletteIndex={params.paletteIndex}
        maxIterations={params.maxIterations}
        bounds={bounds}
        isJulia={params.isJulia}
        juliaC={params.juliaC}
        power={params.power}
        formula={params.formula}
        outsideColoring={params.outsideColoring}
        insideColoring={params.insideColoring}
        orbitTrap={params.orbitTrap}
        transformId={params.transformId}
        pluginParams={params.pluginParams}
        useSSAA={useSSAA}
        adaptiveIterations={params.adaptiveIterations}
        pipelineVersion={params.pipelineVersion ?? 1}
        lighting={params.lighting}
        customGradient={params.customGradient}
        onBoundsChange={setBounds}
      />
    </div>
  );
}
