'use client';

import { pluginRegistry } from '../plugins/registry';
import type { FractalParams } from '../types';
import type { FractalPlugin } from '../plugins/types';
import type {
  FractalRenderWorkerFrame,
  FractalRenderWorkerRequest,
  FractalRenderWorkerResponse,
} from './render-worker-protocol';

export interface RenderWorkerLike {
  onmessage: ((event: MessageEvent<FractalRenderWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: FractalRenderWorkerRequest): void;
  terminate(): void;
}

export type RenderWorkerFactory = () => RenderWorkerLike;

export interface FractalRenderRequest {
  generation: number;
  width: number;
  height: number;
  params: FractalParams;
}

interface PendingRender {
  requestId: number;
  generation: number;
  resolve: (frame: FractalRenderWorkerFrame) => void;
  reject: (error: Error) => void;
}

export class RenderWorkerCancelledError extends Error {
  constructor() {
    super('Fractal render superseded by a newer request');
    this.name = 'AbortError';
  }
}

function createBrowserWorker(): RenderWorkerLike {
  return new Worker(new URL('./render.worker.ts', import.meta.url), {
    type: 'module',
  });
}

export function collectRenderPlugins(params: FractalParams): FractalPlugin[] {
  const plugins = [
    pluginRegistry.getFormula(params.formula),
    pluginRegistry.getOutsideColoring(params.outsideColoring),
    pluginRegistry.getInsideColoring(params.insideColoring),
    pluginRegistry.getTransform(params.transformId ?? 'none'),
  ];
  const missing = plugins.findIndex((plugin) => !plugin);
  if (missing >= 0) {
    throw new Error(`Missing render plugin for ${params.formula}`);
  }
  return plugins as FractalPlugin[];
}

export class FractalRenderWorkerClient {
  private worker: RenderWorkerLike | null = null;
  private pending: PendingRender | null = null;
  private nextRequestId = 0;

  constructor(private readonly createWorker: RenderWorkerFactory = createBrowserWorker) {}

  render(request: FractalRenderRequest): Promise<FractalRenderWorkerFrame> {
    this.cancelPending();
    let worker: RenderWorkerLike;
    let message: FractalRenderWorkerRequest;
    try {
      worker = this.ensureWorker();
      message = {
        type: 'render',
        requestId: ++this.nextRequestId,
        generation: request.generation,
        width: request.width,
        height: request.height,
        params: request.params,
        plugins: collectRenderPlugins(request.params),
      };
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    return new Promise((resolve, reject) => {
      this.pending = {
        requestId: message.requestId,
        generation: request.generation,
        resolve,
        reject,
      };
      try {
        worker.postMessage(message);
      } catch (error) {
        this.pending = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    this.cancelPending();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): RenderWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      const error = new Error(event.message || 'Fractal render worker failed');
      this.failPending(error);
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(response: FractalRenderWorkerResponse): void {
    const pending = this.pending;
    if (
      !pending ||
      response.requestId !== pending.requestId ||
      response.generation !== pending.generation
    ) {
      if (response.type === 'frame') response.bitmap.close();
      return;
    }

    this.pending = null;
    if (response.type === 'error') {
      pending.reject(new Error(response.message));
      return;
    }
    pending.resolve(response);
  }

  private cancelPending(): void {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    pending.reject(new RenderWorkerCancelledError());
  }

  private failPending(error: Error): void {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    pending.reject(error);
  }
}
