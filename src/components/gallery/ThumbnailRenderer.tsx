'use client';

import { useEffect, useState } from 'react';
import FractalCanvas from '@/components/fractal/FractalCanvas';
import type { FractalParams, ViewBounds } from '@/engine/types';

interface ThumbnailRendererProps {
  params: FractalParams;
}

export function ThumbnailRenderer({ params }: ThumbnailRendererProps) {
  const [bounds, setBounds] = useState<ViewBounds>(params.bounds);

  useEffect(() => {
    setBounds(params.bounds);
  }, [params]);

  return (
    <div className="w-[600px] h-[600px] bg-black">
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
        useSSAA={false}
        adaptiveIterations={params.adaptiveIterations}
        lighting={params.lighting}
        customGradient={params.customGradient}
        onBoundsChange={setBounds}
      />
    </div>
  );
}
