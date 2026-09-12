import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExploreWorkerFractalCanvas from '@/components/fractal/ExploreWorkerFractalCanvas';
import type { FractalParams } from '@/engine/types';
import type { FractalRenderWorkerFrame } from '@/engine/fractals/render-worker-protocol';

const worker = vi.hoisted(() => ({ render: vi.fn(), cancel: vi.fn() }));
vi.mock('@/hooks/useFractalRenderWorker', () => ({ useFractalRenderWorker: () => worker }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useCanvasInteraction', () => ({ useCanvasInteraction: vi.fn() }));

const params: FractalParams = {
  formula: 'mandelbrot', maxIterations: 32, paletteIndex: 0,
  bounds: { centerX: 0, centerY: 0, zoom: 1 }, isJulia: false,
  juliaC: [0, 0], power: 2, outsideColoring: 'smooth', insideColoring: 'black',
  orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
  useSSAA: false, adaptiveIterations: false, pluginParams: {}, customGradient: null,
  lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
};
let requests: { resolve: (frame: FractalRenderWorkerFrame) => void; reject: (error: Error) => void }[];
let resized: () => void;
let width: number;
const drawImage = vi.fn();

async function complete(index: number, formulaId: string) {
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  await act(async () => requests[index].resolve({
    type: 'frame', requestId: index + 1, generation: index + 1, formulaId, bitmap,
  }));
  return bitmap;
}

beforeEach(() => {
  requests = [];
  width = 640;
  worker.render.mockReset().mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  worker.cancel.mockReset();
  drawImage.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 480 } as DOMRect));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Explore last-good-frame presentation', () => {
  it('does not request another frame on a readiness-only rerender without extra parameters', async () => {
    const { rerender } = render(<ExploreWorkerFractalCanvas {...params} pluginParams={undefined} />);
    await complete(0, 'mandelbrot');
    rerender(<ExploreWorkerFractalCanvas {...params} pluginParams={undefined} />);
    expect(worker.render).toHaveBeenCalledTimes(1);
  });

  it('keeps the same canvas through resolution gaps and draws only the latest successful frame', async () => {
    const onRenderComplete = vi.fn();
    const onFrameReadyChange = vi.fn();
    const props = { ...params, onRenderComplete, onFrameReadyChange };
    const { rerender } = render(<ExploreWorkerFractalCanvas {...props} />);
    const canvas = screen.getByTestId('fractal-canvas');
    await complete(0, 'mandelbrot');
    expect(onFrameReadyChange).toHaveBeenLastCalledWith(true);
    rerender(<ExploreWorkerFractalCanvas {...props} formula="burningShip" renderEnabled={false} />);
    expect(screen.getByTestId('fractal-canvas')).toBe(canvas);
    expect(canvas).toHaveAttribute('data-rendered-formula-id', 'mandelbrot');
    expect(canvas).toHaveAttribute('data-render-status', 'pending');
    expect(worker.render).toHaveBeenCalledTimes(1);
    expect(onFrameReadyChange).toHaveBeenLastCalledWith(false);
    rerender(<ExploreWorkerFractalCanvas {...props} formula="burningShip" />);
    rerender(<ExploreWorkerFractalCanvas {...props} formula="tricorn" renderEnabled={false} />);
    const stale = await complete(1, 'burningShip');
    expect(stale.close).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(onRenderComplete).toHaveBeenCalledTimes(1);
    rerender(<ExploreWorkerFractalCanvas {...props} formula="tricorn" />);
    await complete(2, 'tricorn');
    expect(canvas).toHaveAttribute('data-rendered-formula-id', 'tricorn');
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(onRenderComplete).toHaveBeenCalledTimes(2);
  });

  it('retains pixels and backing size during resize or failure and can recover', async () => {
    const onRenderComplete = vi.fn();
    const { rerender } = render(<ExploreWorkerFractalCanvas {...params} onRenderComplete={onRenderComplete} />);
    await complete(0, 'mandelbrot');
    const canvas = screen.getByTestId('fractal-canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(640);
    width = 800;
    act(() => resized());
    expect(canvas.width).toBe(640);
    await act(async () => requests[1].reject(new Error('GPU failed')));
    expect(canvas.width).toBe(640);
    expect(canvas).toHaveAttribute('data-render-status', 'error');
    expect(canvas).toHaveAttribute('data-rendered-formula-id', 'mandelbrot');
    expect(onRenderComplete).toHaveBeenCalledTimes(1);
    rerender(<ExploreWorkerFractalCanvas {...params} formula="tricorn" onRenderComplete={onRenderComplete} />);
    await complete(2, 'tricorn');
    expect(canvas.width).toBe(800);
    expect(canvas).toHaveAttribute('data-render-status', 'ready');
  });

  it('never renders an unresolved first entry and releases late frames after unmount', async () => {
    const { rerender, unmount } = render(<ExploreWorkerFractalCanvas {...params} renderEnabled={false} />);
    expect(worker.render).not.toHaveBeenCalled();
    rerender(<ExploreWorkerFractalCanvas {...params} />);
    unmount();
    const bitmap = await complete(0, 'mandelbrot');
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(drawImage).not.toHaveBeenCalled();
    expect(worker.cancel).toHaveBeenCalled();
  });

  it('attributes a replacement to its own change, never the retained frame', async () => {
    const onRenderComplete = vi.fn();
    const { rerender } = render(<ExploreWorkerFractalCanvas {...params} onRenderComplete={onRenderComplete} />);
    await complete(0, 'mandelbrot');
    const attribution = { changeId: 2, changeType: 'formula' as const, weekKey: '2026-09-07' };
    rerender(<ExploreWorkerFractalCanvas {...params} formula="tricorn" renderAttribution={attribution} onRenderComplete={onRenderComplete} />);
    expect(onRenderComplete).toHaveBeenCalledTimes(1);
    await complete(1, 'tricorn');
    expect(onRenderComplete).toHaveBeenLastCalledWith(attribution, null);
  });
});
