import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PublishedArtworkCanvas from '@/components/fractal/PublishedArtworkCanvas';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FractalParams } from '@/engine/types';

const resolveRuntime = vi.hoisted(() => vi.fn());

vi.mock('@/lib/published-artwork-runtime', () => ({
  resolvePublishedArtworkRuntime: resolveRuntime,
}));

vi.mock('@/components/fractal/AnimatedFractalCanvas', () => ({
  default: ({ params, formulaPlugin }: { params: FractalParams; formulaPlugin?: FormulaPlugin }) => (
    <div
      data-testid="animated-fractal-canvas"
      data-formula={params.formula}
      data-julia={String(params.isJulia)}
      data-rendering={formulaPlugin?.cacheFingerprint}
    />
  ),
}));

const BUILTIN_PARAMS: FractalParams = {
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
  orbitTrap: {
    shape: 'point',
    point: [0, 0],
    radius: 0.35,
    width: 0.02,
  },
  useSSAA: false,
  adaptiveIterations: false,
  lighting: {
    enabled: false,
    mode: 'normalMap',
    azimuth: 45,
    elevation: 35,
    intensity: 0.65,
  },
  transformId: 'none',
  pluginParams: {},
};

describe('PublishedArtworkCanvas', () => {
  beforeEach(() => {
    resolveRuntime.mockReset();
  });

  it('renders built-in parameter-plane playback without loading the library', async () => {
    render(<PublishedArtworkCanvas artwork={{ params: BUILTIN_PARAMS }} />);

    expect(await screen.findByTestId('animated-fractal-canvas')).toHaveAttribute(
      'data-formula',
      'mandelbrot',
    );
    expect(resolveRuntime).not.toHaveBeenCalled();
  });

  it('waits for canonical Julia resolution before mounting a canvas', async () => {
    let finish: ((value: unknown) => void) | undefined;
    resolveRuntime.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    render(
      <PublishedArtworkCanvas
        artwork={{
          params: BUILTIN_PARAMS,
          runtimeFormula: { runtimeId: 'lambda' },
        }}
      />,
    );

    expect(screen.queryByTestId('animated-fractal-canvas')).toBeNull();

    finish?.({
      ok: true,
      value: {
        params: {
          ...BUILTIN_PARAMS,
          formula: 'canonical-lambda',
          isJulia: true,
        },
        formulaPlugin: { id: 'canonical-lambda' } as FormulaPlugin,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('animated-fractal-canvas')).toHaveAttribute(
        'data-formula',
        'canonical-lambda',
      );
    });
  });

  it('uses the reviewed Newton math for synchronous artwork playback', async () => {
    render(<PublishedArtworkCanvas artwork={{ params: { ...BUILTIN_PARAMS, formula: 'newtonCosh' } }} />);
    expect(await screen.findByTestId('animated-fractal-canvas')).toHaveAttribute('data-rendering', 'newtonCosh:render-builtin-hyperbolic-v1');
    expect(resolveRuntime).not.toHaveBeenCalled();
  });

  it('keeps the static parent image exposed when Julia resolution fails', async () => {
    const onUnavailable = vi.fn();
    resolveRuntime.mockResolvedValue({
      ok: false,
      reason: 'julia-unsupported',
    });

    render(
      <PublishedArtworkCanvas
        artwork={{
          params: BUILTIN_PARAMS,
          runtimeFormula: { runtimeId: 'magnet1' },
        }}
        onUnavailable={onUnavailable}
      />,
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('animated-fractal-canvas')).toBeNull();
  });
});
