import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  FractalRenderWorkerClient,
  type RenderWorkerLike,
} from '@/engine/fractals/render-worker-client';
import type {
  FractalRenderWorkerRequest,
  FractalRenderWorkerResponse,
} from '@/engine/fractals/render-worker-protocol';
import { registerBuiltins } from '@/engine/plugins/builtins';
import type { FractalParams } from '@/engine/types';

class FakeWorker implements RenderWorkerLike {
  onmessage: ((event: MessageEvent<FractalRenderWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: FractalRenderWorkerRequest[] = [];
  terminate = vi.fn();

  postMessage(message: FractalRenderWorkerRequest): void {
    this.messages.push(message);
  }

  emit(response: FractalRenderWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<FractalRenderWorkerResponse>);
  }
}

function params(formula: string): FractalParams {
  return {
    maxIterations: 100,
    paletteIndex: 0,
    bounds: { centerX: -0.5, centerY: 0, zoom: 1 },
    isJulia: false,
    juliaC: [-0.7, 0.27],
    power: 2,
    customGradient: null,
    formula,
    outsideColoring: 'smooth',
    insideColoring: 'black',
    transformId: 'none',
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
  };
}

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

describe('FractalRenderWorkerClient', () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it('terminates an in-flight worker when a newer render supersedes it', async () => {
    const workers: FakeWorker[] = [];
    const client = new FractalRenderWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const first = client.render({
      generation: 1,
      width: 64,
      height: 64,
      params: params('burningShip'),
    });
    const firstResult = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = client.render({
      generation: 2,
      width: 64,
      height: 64,
      params: params('mandelbrot'),
    });

    await firstResult;
    expect(workers).toHaveLength(2);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].messages[0]).toMatchObject({
      type: 'render',
      generation: 2,
      params: { formula: 'mandelbrot' },
    });

    const firstMessage = workers[0].messages[0];
    const staleBitmap = bitmap();
    workers[0].emit({
      type: 'frame',
      requestId: firstMessage.requestId,
      generation: firstMessage.generation,
      formulaId: 'burningShip',
      bitmap: staleBitmap,
    });
    expect(staleBitmap.close).toHaveBeenCalledOnce();

    const message = workers[1].messages[0];
    const frameBitmap = bitmap();
    workers[1].emit({
      type: 'frame',
      requestId: message.requestId,
      generation: message.generation,
      formulaId: 'mandelbrot',
      bitmap: frameBitmap,
    });
    await expect(second).resolves.toMatchObject({
      generation: 2,
      formulaId: 'mandelbrot',
    });
    expect(frameBitmap.close).not.toHaveBeenCalled();

    client.dispose();
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });

  it('closes a frame whose generation does not match the active request', async () => {
    const worker = new FakeWorker();
    const client = new FractalRenderWorkerClient(() => worker);
    const pending = client.render({
      generation: 7,
      width: 64,
      height: 64,
      params: params('mandelbrot'),
    });
    const message = worker.messages[0];
    const staleBitmap = bitmap();

    worker.emit({
      type: 'frame',
      requestId: message.requestId,
      generation: 6,
      formulaId: 'mandelbrot',
      bitmap: staleBitmap,
    });

    expect(staleBitmap.close).toHaveBeenCalledOnce();
    const currentBitmap = bitmap();
    worker.emit({
      type: 'frame',
      requestId: message.requestId,
      generation: 7,
      formulaId: 'mandelbrot',
      bitmap: currentBitmap,
    });
    await expect(pending).resolves.toMatchObject({ generation: 7 });
    client.dispose();
  });
});
