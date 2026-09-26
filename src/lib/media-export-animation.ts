import { buildTimeline, interpolateAtTime, totalDuration } from '@/engine/animation/interpolate';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { createRenderSnapshot, type RenderSnapshot } from '@/engine/render-snapshot';
import type { ViewBounds } from '@/engine/types';
import {
  MEDIA_EXPORT_LIMITS,
  type AnimationExportRequest,
  type MediaExportErrorCode,
} from '@/lib/media-export';
import { resolveMediaExportBounds } from '@/lib/media-export-image';

export interface AnimationFrameSample {
  readonly index: number;
  readonly outputTime: number;
  readonly canonicalTime: number;
  readonly duration: number;
}

export interface AnimationFrameSchedule {
  readonly baseDuration: number;
  readonly effectiveDuration: number;
  readonly fps: AnimationExportRequest['fps'];
  readonly speed: AnimationExportRequest['speed'];
  readonly frames: readonly AnimationFrameSample[];
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-9;
}

export function buildAnimationFrameSchedule(request: AnimationExportRequest): AnimationFrameSchedule {
  const keyframes = request.document.animation?.viewKeyframes ?? [];
  const timeline = buildTimeline(keyframes);
  const baseDuration = totalDuration(timeline);
  if (
    keyframes.length < 2
    || !Number.isFinite(baseDuration)
    || baseDuration <= 0
    || !nearlyEqual(request.range.start, 0)
    || !nearlyEqual(request.range.end, baseDuration)
  ) {
    throw 'invalid-request' satisfies MediaExportErrorCode;
  }

  const effectiveDuration = baseDuration / request.speed;
  const nominalFrameDuration = 1 / request.fps;
  const frameCount = Math.max(
    1,
    Math.ceil(effectiveDuration * request.fps - Number.EPSILON),
  );
  if (
    effectiveDuration > MEDIA_EXPORT_LIMITS.animationMaxDurationSeconds
  ) {
    throw 'resource-limit' satisfies MediaExportErrorCode;
  }

  const frames = Array.from({ length: frameCount }, (_, index) => {
    const outputTime = index * nominalFrameDuration;
    return Object.freeze({
      index,
      outputTime,
      canonicalTime: request.range.start + outputTime * request.speed,
      duration: Math.min(nominalFrameDuration, effectiveDuration - outputTime),
    });
  });
  return Object.freeze({
    baseDuration,
    effectiveDuration,
    fps: request.fps,
    speed: request.speed,
    frames: Object.freeze(frames),
  });
}

export interface AnimationFramePipelineProgress {
  readonly phase: 'rendering' | 'encoding';
  readonly completed: number;
  readonly total: number;
  readonly rendered: number;
  readonly encoded: number;
  readonly queued: number;
}

export interface DisposableAnimationFrame {
  close(): void;
}

export interface AnimationFramePipelineOptions<TFrame extends DisposableAnimationFrame> {
  schedule: AnimationFrameSchedule;
  signal: AbortSignal;
  renderFrame: (sample: AnimationFrameSample, signal: AbortSignal) => Promise<TFrame>;
  consumeFrame: (
    frame: TFrame,
    sample: AnimationFrameSample,
    signal: AbortSignal,
  ) => Promise<void>;
  queueDepth?: number;
  onProgress?: (progress: AnimationFramePipelineProgress) => void;
}

/**
 * Runs one ordered producer/consumer pipeline. Rendering can overlap encoding,
 * while reservations keep the number of retained raw frames at or below the
 * declared queue depth. Every produced frame is closed exactly once.
 */
export async function runAnimationFramePipeline<TFrame extends DisposableAnimationFrame>(
  options: AnimationFramePipelineOptions<TFrame>,
): Promise<void> {
  const {
    schedule,
    renderFrame,
    consumeFrame,
    onProgress,
    signal: externalSignal,
    queueDepth = MEDIA_EXPORT_LIMITS.animationRawQueueDepth,
  } = options;
  if (!Number.isInteger(queueDepth) || queueDepth <= 0) {
    throw 'invalid-request' satisfies MediaExportErrorCode;
  }
  abortIfNeeded(externalSignal);

  const controller = new AbortController();
  const signal = controller.signal;

  type QueueItem = { frame: TFrame; sample: AnimationFrameSample };
  const queue: QueueItem[] = [];
  const waiters = new Set<() => void>();
  let producerDone = false;
  let reservations = 0;
  let rendered = 0;
  let encoded = 0;

  const notify = () => {
    for (const wake of waiters) wake();
    waiters.clear();
  };
  const relayAbort = () => {
    controller.abort();
    notify();
  };
  externalSignal.addEventListener('abort', relayAbort, { once: true });
  const waitForChange = async () => {
    abortIfNeeded(signal);
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        waiters.delete(wake);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      waiters.add(wake);
      signal.addEventListener('abort', abort, { once: true });
    });
  };
  const report = (phase: AnimationFramePipelineProgress['phase']) => onProgress?.({
    phase,
    completed: phase === 'rendering' ? rendered : encoded,
    total: schedule.frames.length,
    rendered,
    encoded,
    queued: reservations,
  });

  const producer = async () => {
    try {
      for (const sample of schedule.frames) {
        while (reservations >= queueDepth) await waitForChange();
        abortIfNeeded(signal);
        reservations += 1;
        let frame: TFrame;
        try {
          frame = await renderFrame(sample, signal);
        } catch (error) {
          reservations -= 1;
          notify();
          throw error;
        }
        if (signal.aborted) {
          frame.close();
          reservations -= 1;
          throw new DOMException('Aborted', 'AbortError');
        }
        queue.push({ frame, sample });
        rendered += 1;
        report('rendering');
        notify();
      }
    } finally {
      producerDone = true;
      notify();
    }
  };

  const consumer = async () => {
    while (!producerDone || queue.length > 0) {
      if (queue.length === 0) {
        await waitForChange();
        continue;
      }
      const item = queue.shift()!;
      try {
        abortIfNeeded(signal);
        await consumeFrame(item.frame, item.sample, signal);
        encoded += 1;
        report('encoding');
      } finally {
        item.frame.close();
        reservations -= 1;
        notify();
      }
    }
  };

  const failFast = async (task: Promise<void>) => {
    try {
      await task;
    } catch (error) {
      controller.abort();
      notify();
      throw error;
    }
  };
  const tasks = [failFast(producer()), failFast(consumer())];
  try {
    const results = await Promise.allSettled(tasks);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    const failure = rejected.find(result => !isAbortError(result.reason)) ?? rejected[0];
    if (failure) throw failure.reason;
    abortIfNeeded(externalSignal);
  } catch (error) {
    controller.abort();
    notify();
    await Promise.allSettled(tasks);
    throw error;
  } finally {
    externalSignal.removeEventListener('abort', relayAbort);
    controller.abort();
    for (const item of queue.splice(0)) {
      item.frame.close();
      reservations -= 1;
    }
    notify();
  }
}

interface AnimationCanvasLike {
  width: number;
  height: number;
  getContext(contextId: 'webgl', options?: WebGLContextAttributes): WebGLRenderingContext | null;
}

interface AnimationRendererLike {
  render(snapshot: RenderSnapshot): Promise<boolean>;
  dispose(): void;
}

export interface AnimationFrameRenderDependencies {
  createCanvas: () => AnimationCanvasLike;
  createRenderer: (context: WebGLRenderingContext) => AnimationRendererLike;
  createBitmap: (canvas: AnimationCanvasLike) => Promise<ImageBitmap>;
}

const DEFAULT_RENDER_DEPENDENCIES: AnimationFrameRenderDependencies = {
  createCanvas: () => document.createElement('canvas'),
  createRenderer: context => new FractalRenderer(context),
  createBitmap: canvas => createImageBitmap(canvas as unknown as ImageBitmapSource),
};

export interface AnimationFrameRenderSession {
  readonly schedule: AnimationFrameSchedule;
  render(sample: AnimationFrameSample, signal: AbortSignal): Promise<ImageBitmap>;
  dispose(): void;
}

export function createAnimationFrameRenderSession(
  request: AnimationExportRequest,
  dependencies: AnimationFrameRenderDependencies = DEFAULT_RENDER_DEPENDENCIES,
): AnimationFrameRenderSession {
  const schedule = buildAnimationFrameSchedule(request);
  const timeline = buildTimeline(request.document.animation?.viewKeyframes ?? []);
  const canvas = dependencies.createCanvas();
  canvas.width = request.width;
  canvas.height = request.height;
  const context = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!context) throw 'render-failed' satisfies MediaExportErrorCode;
  const renderer = dependencies.createRenderer(context);
  let disposed = false;

  return {
    schedule,
    async render(sample, signal) {
      if (disposed) throw 'render-failed' satisfies MediaExportErrorCode;
      abortIfNeeded(signal);
      const animatedBounds = interpolateAtTime(
        timeline,
        schedule.baseDuration,
        sample.canonicalTime,
      );
      const bounds: ViewBounds = resolveMediaExportBounds(request, animatedBounds);
      const snapshot = createRenderSnapshot(request.document, {
        bounds,
        useSSAA: request.renderQuality !== 'off',
        ssaaLevel: { off: 0, standard: 4, high: 9, ultra: 16 }[request.renderQuality],
      });
      try {
        if (!await renderer.render(snapshot)) throw 'render-failed';
        abortIfNeeded(signal);
        const bitmap = await dependencies.createBitmap(canvas);
        if (signal.aborted) {
          bitmap.close();
          throw new DOMException('Aborted', 'AbortError');
        }
        return bitmap;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw 'render-failed' satisfies MediaExportErrorCode;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.dispose();
      context.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
