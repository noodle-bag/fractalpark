/// <reference lib="webworker" />

import { FractalRenderer } from './renderer';
import { pluginRegistry } from '../plugins/registry';
import type { FractalPlugin } from '../plugins/types';
import type {
  FractalRenderWorkerError,
  FractalRenderWorkerFrame,
  FractalRenderWorkerRequest,
} from './render-worker-protocol';

const contextAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true,
};

let canvas: OffscreenCanvas | null = null;
let renderer: FractalRenderer | null = null;
const registeredFingerprints = new Map<string, string>();

function pluginFingerprint(plugin: FractalPlugin): string {
  return JSON.stringify(plugin);
}

function registerPlugins(plugins: FractalPlugin[]): void {
  for (const plugin of plugins) {
    const key = `${plugin.category}:${plugin.id}`;
    const fingerprint = pluginFingerprint(plugin);
    if (registeredFingerprints.get(key) === fingerprint) continue;
    pluginRegistry.register(plugin);
    registeredFingerprints.set(key, fingerprint);
  }
}

function getRenderer(width: number, height: number): FractalRenderer {
  if (!canvas) {
    canvas = new OffscreenCanvas(width, height);
    const gl = canvas.getContext('webgl', contextAttributes) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL is not supported on this device');
    renderer = new FractalRenderer(gl);
  } else if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  if (!renderer) throw new Error('Failed to initialize the fractal renderer');
  return renderer;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<FractalRenderWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'render') return;

  try {
    registerPlugins(request.plugins);
    const activeRenderer = getRenderer(request.width, request.height);
    const didRender = await activeRenderer.render(request.params);
    if (!didRender || !canvas) return;

    const bitmap = canvas.transferToImageBitmap();
    const response: FractalRenderWorkerFrame = {
      type: 'frame',
      requestId: request.requestId,
      generation: request.generation,
      formulaId: request.params.formula,
      bitmap,
    };
    workerScope.postMessage(response, [bitmap]);
  } catch (error) {
    const response: FractalRenderWorkerError = {
      type: 'error',
      requestId: request.requestId,
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};
