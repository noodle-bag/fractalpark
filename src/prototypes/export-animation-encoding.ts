/**
 * v0.4.22 Slice 0b evidence only. This module is imported by focused tests and
 * the isolated browser prototype; it is not part of the production export
 * path or a product bundle dependency.
 */

import type { VideoCodec } from 'mediabunny';

type AnimationMediaPrototype = typeof import('./export-animation-mediabunny');

export const ANIMATION_SPEEDS_PROTOTYPE = [
  0.25,
  0.5,
  0.75,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
] as const;

export type AnimationSpeedPrototype = (typeof ANIMATION_SPEEDS_PROTOTYPE)[number];
export type AnimationContainerPrototype = 'mp4' | 'webm';

export const ANIMATION_CONTAINERS_PROTOTYPE = {
  mp4: {
    mimeType: 'video/mp4',
    extension: 'mp4',
    codecPriority: ['avc', 'hevc', 'av1'],
  },
  webm: {
    mimeType: 'video/webm',
    extension: 'webm',
    codecPriority: ['vp9', 'vp8', 'av1'],
  },
} as const satisfies Record<AnimationContainerPrototype, {
  mimeType: string;
  extension: string;
  codecPriority: readonly VideoCodec[];
}>;

export interface AnimationProfilePrototype {
  id: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export const ANIMATION_PROFILES_PROTOTYPE = {
  default: {
    id: 'default-1080p60',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrate: 12_000_000,
  },
  maximum: {
    id: 'maximum-4k60',
    width: 3840,
    height: 2160,
    fps: 60,
    bitrate: 40_000_000,
  },
} as const satisfies Record<string, AnimationProfilePrototype>;

export interface FixedFramePrototype {
  index: number;
  outputTime: number;
  canonicalTime: number;
  duration: number;
}

export interface FixedFrameSchedulePrototype {
  baseDuration: number;
  effectiveDuration: number;
  speed: AnimationSpeedPrototype;
  fps: number;
  frames: FixedFramePrototype[];
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function buildFixedFrameSchedulePrototype(
  baseDuration: number,
  speed: AnimationSpeedPrototype,
  fps: number,
): FixedFrameSchedulePrototype {
  if (
    !positiveFinite(baseDuration)
    || !positiveFinite(fps)
    || !ANIMATION_SPEEDS_PROTOTYPE.includes(speed)
  ) {
    throw new Error('invalid-animation-schedule');
  }

  const effectiveDuration = baseDuration / speed;
  const nominalFrameDuration = 1 / fps;
  const frameCount = Math.max(1, Math.ceil(effectiveDuration * fps - Number.EPSILON));
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const outputTime = index * nominalFrameDuration;
    return {
      index,
      outputTime,
      canonicalTime: outputTime * speed,
      duration: Math.min(nominalFrameDuration, effectiveDuration - outputTime),
    };
  });

  return { baseDuration, effectiveDuration, speed, fps, frames };
}

export function estimateAnimationResourcesPrototype(
  profile: AnimationProfilePrototype,
  duration: number,
  queueDepth = 3,
): {
  frameCount: number;
  rgbaQueueBytes: number;
  estimatedEncodedBytes: number;
} {
  if (
    !Number.isInteger(profile.width)
    || !Number.isInteger(profile.height)
    || !positiveFinite(profile.width)
    || !positiveFinite(profile.height)
    || !positiveFinite(profile.fps)
    || !positiveFinite(profile.bitrate)
    || !positiveFinite(duration)
    || !Number.isInteger(queueDepth)
    || queueDepth <= 0
  ) {
    throw new Error('invalid-animation-budget');
  }
  return {
    frameCount: Math.ceil(duration * profile.fps),
    rgbaQueueBytes: profile.width * profile.height * 4 * queueDepth,
    estimatedEncodedBytes: Math.ceil(profile.bitrate * duration / 8),
  };
}

export function raceAbortPrototype<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

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

export function createRetryableLoaderPrototype<T>(
  load: () => Promise<T>,
): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

const getMediabunnyPrototype = createRetryableLoaderPrototype(
  () => import('./export-animation-mediabunny'),
);

export function loadAnimationEncoderPrototype(signal?: AbortSignal): Promise<AnimationMediaPrototype> {
  return raceAbortPrototype(getMediabunnyPrototype(), signal);
}

export interface AnimationCapabilityPrototype {
  container: AnimationContainerPrototype;
  mimeType: string;
  profile: AnimationProfilePrototype;
  candidates: VideoCodec[];
  supported: VideoCodec[];
  selected: VideoCodec | null;
  probeMilliseconds: number;
}

export async function probeAnimationCapabilityPrototype(
  container: AnimationContainerPrototype,
  profile: AnimationProfilePrototype,
  signal?: AbortSignal,
): Promise<AnimationCapabilityPrototype> {
  const startedAt = performance.now();
  const media = await loadAnimationEncoderPrototype(signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const format = container === 'mp4'
    ? new media.Mp4OutputFormat({ fastStart: false })
    : new media.WebMOutputFormat();
  const supportedByContainer = new Set(format.getSupportedVideoCodecs());
  const candidates = ANIMATION_CONTAINERS_PROTOTYPE[container].codecPriority
    .filter(codec => supportedByContainer.has(codec));
  const quality = new media.Quality({ bitrate: profile.bitrate });
  const supported = await media.getEncodableVideoCodecs([...candidates], {
    width: profile.width,
    height: profile.height,
    frameRate: profile.fps,
    quality,
  });

  return {
    container,
    mimeType: format.mimeType,
    profile,
    candidates: [...candidates],
    supported,
    selected: supported[0] ?? null,
    probeMilliseconds: performance.now() - startedAt,
  };
}

export interface EncodeCanvasAnimationPrototypeOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  container: AnimationContainerPrototype;
  profile: AnimationProfilePrototype;
  schedule: FixedFrameSchedulePrototype;
  renderFrame: (canonicalTime: number, index: number) => void | Promise<void>;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface EncodedAnimationPrototype {
  buffer: ArrayBuffer;
  mimeType: string;
  codec: VideoCodec;
  frameCount: number;
  duration: number;
  encodeMilliseconds: number;
}

export async function encodeCanvasAnimationPrototype(
  options: EncodeCanvasAnimationPrototypeOptions,
): Promise<EncodedAnimationPrototype> {
  const { canvas, container, profile, schedule, renderFrame, signal, onProgress } = options;
  if (
    canvas.width !== profile.width
    || canvas.height !== profile.height
    || schedule.fps !== profile.fps
  ) {
    throw new Error('animation-profile-mismatch');
  }

  const media = await loadAnimationEncoderPrototype(signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const capability = await probeAnimationCapabilityPrototype(container, profile, signal);
  if (!capability.selected) throw new Error(`animation-codec-unavailable:${container}`);

  const format = container === 'mp4'
    ? new media.Mp4OutputFormat({ fastStart: false })
    : new media.WebMOutputFormat();
  const target = new media.BufferTarget();
  const output = new media.Output({ format, target });
  const source = new media.CanvasSource(canvas, {
    codec: capability.selected,
    quality: new media.Quality({ bitrate: profile.bitrate }),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, {
    frameRate: profile.fps,
    maximumPacketCount: schedule.frames.length,
    bitrate: profile.bitrate,
    averageBitrate: profile.bitrate,
  });

  const startedAt = performance.now();
  try {
    await output.start();
    for (const frame of schedule.frames) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await renderFrame(frame.canonicalTime, frame.index);
      await source.add(frame.outputTime, frame.duration, {
        keyFrame: frame.index % Math.max(1, profile.fps * 2) === 0,
      });
      onProgress?.(frame.index + 1, schedule.frames.length);
    }
    source.close();
    await output.finalize();
    const mimeType = await output.getMimeType();
    if (!target.buffer) throw new Error('animation-buffer-unavailable');
    return {
      buffer: target.buffer,
      mimeType,
      codec: capability.selected,
      frameCount: schedule.frames.length,
      duration: schedule.effectiveDuration,
      encodeMilliseconds: performance.now() - startedAt,
    };
  } catch (error) {
    source.close();
    if (output.state !== 'canceled' && output.state !== 'finalized') {
      await output.cancel();
    }
    throw error;
  }
}
