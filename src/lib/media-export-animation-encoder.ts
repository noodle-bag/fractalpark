import type { VideoCodec } from 'mediabunny';

import {
  type AnimationExportRequest,
  type MediaExportErrorCode,
  isMediaExportErrorCode,
  preflightMediaExportRequest,
} from '@/lib/media-export';
import {
  createAnimationFrameRenderSession,
  runAnimationFramePipeline,
  type AnimationFramePipelineProgress,
} from '@/lib/media-export-animation';

type EncoderBridge = typeof import('./media-export-encoder-bridge');

const CONTAINERS = {
  mp4: {
    mime: 'video/mp4',
    codecs: ['avc', 'hevc', 'av1'],
  },
  webm: {
    mime: 'video/webm',
    codecs: ['vp9', 'vp8', 'av1'],
  },
} as const satisfies Record<AnimationExportRequest['format'], {
  mime: string;
  codecs: readonly VideoCodec[];
}>;

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  abortIfNeeded(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

let bridgePromise: Promise<EncoderBridge> | null = null;

export function loadMediaExportEncoder(signal: AbortSignal): Promise<EncoderBridge> {
  bridgePromise ??= import('./media-export-encoder-bridge').catch(() => {
    bridgePromise = null;
    throw 'dependency-load-failed' satisfies MediaExportErrorCode;
  });
  return raceAbort(bridgePromise, signal);
}

export interface AnimationExportCapabilityResult {
  readonly qualified: boolean;
  readonly format: AnimationExportRequest['format'];
  readonly mimeType: string;
  readonly codec: VideoCodec | null;
  readonly candidates: readonly VideoCodec[];
  readonly reason?: Extract<MediaExportErrorCode, 'profile-unavailable' | 'dependency-load-failed'>;
}

const capabilityCache = new Map<string, Promise<AnimationExportCapabilityResult>>();

function capabilityKey(request: AnimationExportRequest): string {
  return [request.format, request.width, request.height, request.fps, request.bitrate].join(':');
}

export async function probeAnimationExportCapability(
  request: AnimationExportRequest,
  signal: AbortSignal,
): Promise<AnimationExportCapabilityResult> {
  const key = capabilityKey(request);
  let pending = capabilityCache.get(key);
  if (!pending) {
    pending = (async () => {
      const bridge = await loadMediaExportEncoder(new AbortController().signal);
      const format = request.format === 'mp4'
        ? new bridge.Mp4OutputFormat({ fastStart: false })
        : new bridge.WebMOutputFormat();
      const supportedByContainer = new Set(format.getSupportedVideoCodecs());
      const candidates = CONTAINERS[request.format].codecs.filter(codec => supportedByContainer.has(codec));
      const supported = await bridge.getEncodableVideoCodecs([...candidates], {
        width: request.width,
        height: request.height,
        frameRate: request.fps,
        quality: new bridge.Quality({ bitrate: request.bitrate }),
      });
      return {
        qualified: supported.length > 0,
        format: request.format,
        mimeType: format.mimeType,
        codec: supported[0] ?? null,
        candidates,
        reason: supported.length > 0 ? undefined : 'profile-unavailable',
      } satisfies AnimationExportCapabilityResult;
    })().catch(error => {
      capabilityCache.delete(key);
      throw error;
    });
    capabilityCache.set(key, pending);
  }
  return raceAbort(pending, signal);
}

export interface EncodedAnimationExport {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly codec: VideoCodec;
  readonly frameCount: number;
  readonly duration: number;
}

export interface ExportAnimationBlobOptions {
  signal: AbortSignal;
  onProgress?: (progress: AnimationFramePipelineProgress) => void;
}

export async function exportAnimationBlob(
  request: AnimationExportRequest,
  options: ExportAnimationBlobOptions,
): Promise<EncodedAnimationExport> {
  const { signal, onProgress } = options;
  abortIfNeeded(signal);
  const bridge = await loadMediaExportEncoder(signal);
  const capability = await probeAnimationExportCapability(request, signal);
  if (!capability.qualified || !capability.codec) {
    throw capability.reason ?? 'profile-unavailable' satisfies MediaExportErrorCode;
  }
  const preflight = preflightMediaExportRequest(request, { qualified: true });
  if (!preflight.ok) throw preflight.code;

  const session = createAnimationFrameRenderSession(request);
  const format = request.format === 'mp4'
    ? new bridge.Mp4OutputFormat({ fastStart: false })
    : new bridge.WebMOutputFormat();
  const target = new bridge.BufferTarget();
  const output = new bridge.Output({ format, target });
  const source = new bridge.VideoSampleSource({
    codec: capability.codec,
    quality: new bridge.Quality({ bitrate: request.bitrate }),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, {
    frameRate: request.fps,
    maximumPacketCount: session.schedule.frames.length,
    bitrate: request.bitrate,
    averageBitrate: request.bitrate,
  });
  const encodeCanvas = document.createElement('canvas');
  encodeCanvas.width = request.width;
  encodeCanvas.height = request.height;
  const encodeContext = encodeCanvas.getContext('2d', { alpha: false });
  if (!encodeContext) throw 'encode-failed' satisfies MediaExportErrorCode;
  let sourceClosed = false;
  const closeSource = () => {
    if (sourceClosed) return;
    sourceClosed = true;
    source.close();
  };

  try {
    await output.start();
    await runAnimationFramePipeline({
      schedule: session.schedule,
      signal,
      renderFrame: (sample, frameSignal) => session.render(sample, frameSignal),
      consumeFrame: async (bitmap, sample) => {
        encodeContext.fillStyle = request.background;
        encodeContext.fillRect(0, 0, request.width, request.height);
        encodeContext.drawImage(bitmap, 0, 0, request.width, request.height);
        const videoSample = new bridge.VideoSample(encodeCanvas, {
          timestamp: sample.outputTime,
          duration: sample.duration,
        });
        try {
          await source.add(videoSample, {
            keyFrame: sample.index % Math.max(1, request.fps * 2) === 0,
          });
        } finally {
          videoSample.close();
        }
      },
      onProgress,
    });
    closeSource();
    abortIfNeeded(signal);
    await output.finalize();
    const mimeType = await output.getMimeType();
    if (!mimeType.startsWith(CONTAINERS[request.format].mime)) {
      throw 'mime-mismatch' satisfies MediaExportErrorCode;
    }
    if (!target.buffer) throw 'encode-failed' satisfies MediaExportErrorCode;
    return {
      blob: new Blob([target.buffer], { type: CONTAINERS[request.format].mime }),
      mimeType,
      codec: capability.codec,
      frameCount: session.schedule.frames.length,
      duration: session.schedule.effectiveDuration,
    };
  } catch (error) {
    closeSource();
    if (output.state !== 'canceled' && output.state !== 'finalized') {
      await output.cancel().catch(() => undefined);
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (isMediaExportErrorCode(error)) throw error;
    throw 'encode-failed' satisfies MediaExportErrorCode;
  } finally {
    session.dispose();
  }
}
