import type { FractalDocument } from '@/engine/document';
import {
  ANIMATION_PLAYBACK_SPEEDS,
  type AnimationPlaybackSpeed,
} from '@/engine/animation/playback';

export const MEDIA_EXPORT_IMAGE_FORMATS = ['png', 'jpeg'] as const;
export const MEDIA_EXPORT_ANIMATION_FORMATS = ['mp4', 'webm'] as const;
export const MEDIA_EXPORT_SPEEDS = ANIMATION_PLAYBACK_SPEEDS;

export type MediaExportImageFormat = (typeof MEDIA_EXPORT_IMAGE_FORMATS)[number];
export type MediaExportAnimationFormat = (typeof MEDIA_EXPORT_ANIMATION_FORMATS)[number];
export type MediaExportSpeed = AnimationPlaybackSpeed;
export type MediaExportRenderQuality = 'off' | 'standard' | 'high' | 'ultra';
export type MediaExportJpegQuality = 'balanced' | 'high' | 'maximum';
export type MediaExportVideoQuality = 'balanced' | 'high' | 'maximum';
export type MediaExportCompositionMode = 'fit' | 'fill' | 'custom';

export type MediaExportErrorCode =
  | 'invalid-request'
  | 'format-unavailable'
  | 'profile-unavailable'
  | 'resource-limit'
  | 'dependency-load-failed'
  | 'render-failed'
  | 'encode-failed'
  | 'mime-mismatch'
  | 'download-failed'
  | 'canceled';

export type MediaExportJobPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'rendering'
  | 'encoding'
  | 'finalizing'
  | 'succeeded'
  | 'canceled'
  | 'failed';

export const MEDIA_EXPORT_LIMITS = Object.freeze({
  imageMaxSide: 8192,
  imageMaxPixels: 16_777_216,
  imageMaxSampleWork: 150_994_944,
  animationMaxSide: 3840,
  animationMaxPixels: 8_294_400,
  animationMaxFps: 60,
  animationMaxDurationSeconds: 30,
  animationMaxFrames: 1_800,
  animationRawQueueDepth: 3,
  animationMaxRawQueueBytes: 128 * 1024 * 1024,
  animationMaxEstimatedBytes: 200 * 1024 * 1024,
});

export const MEDIA_EXPORT_RENDER_SAMPLES = Object.freeze({
  off: 1,
  standard: 4,
  high: 9,
  ultra: 16,
} satisfies Record<MediaExportRenderQuality, number>);

export const MEDIA_EXPORT_JPEG_QUALITY = Object.freeze({
  balanced: 0.82,
  high: 0.92,
  maximum: 1,
} satisfies Record<MediaExportJpegQuality, number>);

export const MEDIA_EXPORT_VIDEO_BITRATES = Object.freeze({
  balanced: { hd: 8_000_000, uhd: 28_000_000 },
  high: { hd: 12_000_000, uhd: 40_000_000 },
  maximum: { hd: 20_000_000, uhd: 60_000_000 },
} satisfies Record<MediaExportVideoQuality, { hd: number; uhd: number }>);

export function resolveMediaExportVideoBitrate(
  width: number,
  height: number,
  fps: number,
  quality: MediaExportVideoQuality,
): number {
  if (!validPositiveInteger(width) || !validPositiveInteger(height) || ![24, 30, 60].includes(fps)) {
    throw new TypeError('Video profile must use positive dimensions and an approved frame rate.');
  }
  const references = MEDIA_EXPORT_VIDEO_BITRATES[quality];
  const work = width * height * fps;
  const hdWork = 1920 * 1080 * 60;
  const uhdWork = 3840 * 2160 * 60;
  if (work <= hdWork) return Math.max(1_000_000, Math.round(references.hd * work / hdWork));
  if (work >= uhdWork) return references.uhd;
  const ratio = (work - hdWork) / (uhdWork - hdWork);
  return Math.round(references.hd + (references.uhd - references.hd) * ratio);
}

export const MEDIA_EXPORT_PREVIEW_MAX_SIDE = 720;

export function getMediaExportPreviewDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!validPositiveInteger(width) || !validPositiveInteger(height)) {
    throw new TypeError('Preview dimensions must be positive integers.');
  }
  if (Math.max(width, height) <= MEDIA_EXPORT_PREVIEW_MAX_SIDE) return { width, height };
  let left = width;
  let right = height;
  while (right !== 0) [left, right] = [right, left % right];
  const reducedWidth = width / left;
  const reducedHeight = height / left;
  const exactScale = Math.floor(
    MEDIA_EXPORT_PREVIEW_MAX_SIDE / Math.max(reducedWidth, reducedHeight),
  );
  if (exactScale >= 1) {
    return { width: reducedWidth * exactScale, height: reducedHeight * exactScale };
  }
  const scale = Math.min(1, MEDIA_EXPORT_PREVIEW_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface MediaExportFormulaAsset {
  id: string;
  source: string;
  hash?: string;
  frmSemanticsVersion?: number;
}

export interface MediaExportComposition {
  mode: MediaExportCompositionMode;
  baseline: 'fit' | 'fill';
  panX: number;
  panY: number;
  scale: number;
  rotation: number;
}

interface MediaExportRequestBase {
  document: FractalDocument;
  formulaAssets: MediaExportFormulaAsset[];
  width: number;
  height: number;
  sourceViewport: { width: number; height: number };
  renderQuality: MediaExportRenderQuality;
  background: string;
  composition: MediaExportComposition;
  filename: string;
  createdAt: number;
}

export interface ImageExportRequest extends MediaExportRequestBase {
  kind: 'image';
  format: MediaExportImageFormat;
  jpegQuality?: MediaExportJpegQuality;
}

export interface AnimationExportRequest extends MediaExportRequestBase {
  kind: 'animation';
  format: MediaExportAnimationFormat;
  fps: 24 | 30 | 60;
  speed: MediaExportSpeed;
  range: { start: number; end: number };
  bitrate: number;
}

export type MediaExportRequest = ImageExportRequest | AnimationExportRequest;
export type MediaExportRequestInput = Omit<ImageExportRequest, 'filename'> & { filename?: string }
  | Omit<AnimationExportRequest, 'filename'> & { filename?: string };

export interface MediaExportPreflight {
  outputPixels: number;
  renderSamples: number;
  renderSampleWork: number;
  effectiveDuration?: number;
  frameCount?: number;
  rawQueueBytes?: number;
  estimatedEncodedBytes?: number;
  capabilityQualified: boolean;
}

export type MediaExportValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'invalid-request' | 'resource-limit' | 'format-unavailable' | 'profile-unavailable' };

export interface MediaExportCapability {
  qualified: boolean;
  reason?: 'format-unavailable' | 'profile-unavailable';
}

const RESERVED_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/;

function cloneValue<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validComposition(value: MediaExportComposition): boolean {
  return ['fit', 'fill', 'custom'].includes(value.mode)
    && ['fit', 'fill'].includes(value.baseline)
    && Number.isFinite(value.panX)
    && Number.isFinite(value.panY)
    && Number.isFinite(value.rotation)
    && Number.isFinite(value.scale)
    && value.scale > 0;
}

export function sanitizeMediaExportBasename(value?: string): string {
  const sanitized = (value ?? '')
    .normalize('NFC')
    .replace(RESERVED_FILENAME, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_DOTS_OR_SPACES, '')
    .slice(0, 96)
    .replace(TRAILING_DOTS_OR_SPACES, '');
  return sanitized || 'fractalpark';
}

function timestampForFilename(createdAt: number): string {
  return new Date(createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const MEDIA_EXPORT_FILENAME_MAX_LENGTH = 140;

export function createMediaExportFilename(
  input: Pick<MediaExportRequestInput, 'kind' | 'width' | 'height' | 'createdAt'> & {
    fps?: number;
    format: MediaExportImageFormat | MediaExportAnimationFormat;
    name?: string;
  },
): string {
  const dimensions = `${input.width}x${input.height}`;
  const fps = input.kind === 'animation' ? `-${input.fps}fps` : '';
  const suffix = `-${dimensions}${fps}-${timestampForFilename(input.createdAt)}.${input.format === 'jpeg' ? 'jpg' : input.format}`;
  const base = sanitizeMediaExportBasename(input.name)
    .slice(0, Math.max(1, MEDIA_EXPORT_FILENAME_MAX_LENGTH - suffix.length))
    .replace(TRAILING_DOTS_OR_SPACES, '') || 'fractalpark';
  return `${base}${suffix}`;
}

export function createMediaExportRequest(
  input: MediaExportRequestInput,
): MediaExportValidationResult<MediaExportRequest> {
  if (
    !validPositiveInteger(input.width)
    || !validPositiveInteger(input.height)
    || !validPositiveInteger(input.sourceViewport.width)
    || !validPositiveInteger(input.sourceViewport.height)
    || !Number.isFinite(input.createdAt)
    || !validComposition(input.composition)
    || !(input.renderQuality in MEDIA_EXPORT_RENDER_SAMPLES)
  ) {
    return { ok: false, code: 'invalid-request' };
  }
  if (input.kind === 'image') {
    if (!MEDIA_EXPORT_IMAGE_FORMATS.includes(input.format)) return { ok: false, code: 'invalid-request' };
    if (input.format === 'jpeg' && (!input.jpegQuality || !(input.jpegQuality in MEDIA_EXPORT_JPEG_QUALITY))) {
      return { ok: false, code: 'invalid-request' };
    }
  } else {
    if (
      !MEDIA_EXPORT_ANIMATION_FORMATS.includes(input.format)
      || ![24, 30, 60].includes(input.fps)
      || !MEDIA_EXPORT_SPEEDS.includes(input.speed)
      || !Number.isFinite(input.range.start)
      || !Number.isFinite(input.range.end)
      || input.range.start < 0
      || input.range.end <= input.range.start
      || !Number.isFinite(input.bitrate)
      || input.bitrate <= 0
    ) {
      return { ok: false, code: 'invalid-request' };
    }
  }

  const snapshot = cloneValue(input) as MediaExportRequestInput;
  const filename = createMediaExportFilename({
    kind: snapshot.kind,
    format: snapshot.format,
    width: snapshot.width,
    height: snapshot.height,
    createdAt: snapshot.createdAt,
    fps: snapshot.kind === 'animation' ? snapshot.fps : undefined,
    name: snapshot.filename || snapshot.document.metadata?.name,
  });
  return { ok: true, value: deepFreeze({ ...snapshot, filename } as MediaExportRequest) };
}

export function preflightMediaExportRequest(
  request: MediaExportRequest,
  capability: MediaExportCapability,
): MediaExportValidationResult<MediaExportPreflight> {
  const outputPixels = request.width * request.height;
  const renderSamples = MEDIA_EXPORT_RENDER_SAMPLES[request.renderQuality];
  if (request.kind === 'image') {
    if (
      request.width > MEDIA_EXPORT_LIMITS.imageMaxSide
      || request.height > MEDIA_EXPORT_LIMITS.imageMaxSide
      || outputPixels > MEDIA_EXPORT_LIMITS.imageMaxPixels
      || outputPixels * renderSamples > MEDIA_EXPORT_LIMITS.imageMaxSampleWork
    ) return { ok: false, code: 'resource-limit' };
  } else {
    const baseDuration = request.range.end - request.range.start;
    const effectiveDuration = baseDuration / request.speed;
    const frameCount = Math.max(1, Math.ceil(effectiveDuration * request.fps - Number.EPSILON));
    const rawQueueBytes = outputPixels * 4 * MEDIA_EXPORT_LIMITS.animationRawQueueDepth;
    const estimatedEncodedBytes = Math.ceil(request.bitrate * effectiveDuration / 8);
    if (
      Math.max(request.width, request.height) > MEDIA_EXPORT_LIMITS.animationMaxSide
      || outputPixels > MEDIA_EXPORT_LIMITS.animationMaxPixels
      || request.fps > MEDIA_EXPORT_LIMITS.animationMaxFps
      || effectiveDuration > MEDIA_EXPORT_LIMITS.animationMaxDurationSeconds
      || frameCount > MEDIA_EXPORT_LIMITS.animationMaxFrames
      || rawQueueBytes > MEDIA_EXPORT_LIMITS.animationMaxRawQueueBytes
      || estimatedEncodedBytes > MEDIA_EXPORT_LIMITS.animationMaxEstimatedBytes
    ) return { ok: false, code: 'resource-limit' };
    if (!capability.qualified) return { ok: false, code: capability.reason ?? 'profile-unavailable' };
    return {
      ok: true,
      value: {
        outputPixels,
        renderSamples,
        renderSampleWork: outputPixels * renderSamples * frameCount,
        effectiveDuration,
        frameCount,
        rawQueueBytes,
        estimatedEncodedBytes,
        capabilityQualified: true,
      },
    };
  }
  if (!capability.qualified) return { ok: false, code: capability.reason ?? 'format-unavailable' };
  return {
    ok: true,
    value: {
      outputPixels,
      renderSamples,
      renderSampleWork: outputPixels * renderSamples,
      capabilityQualified: true,
    },
  };
}

export interface MediaExportJobState {
  phase: MediaExportJobPhase;
  progress?: { completed: number; total: number };
  error?: MediaExportErrorCode;
  blob?: Blob;
}

export interface MediaExportJobContext {
  request: MediaExportRequest;
  signal: AbortSignal;
  transition: (phase: Extract<MediaExportJobPhase, 'ready' | 'rendering' | 'encoding' | 'finalizing'>, progress?: { completed: number; total: number }) => void;
}

export type MediaExportJobExecutor = (context: MediaExportJobContext) => Promise<Blob>;

export class MediaExportJobController {
  private generation = 0;
  private abortController: AbortController | null = null;
  private currentState: MediaExportJobState = { phase: 'idle' };

  constructor(private readonly onChange?: (state: MediaExportJobState) => void) {}

  get state(): MediaExportJobState {
    return this.currentState;
  }

  private publish(state: MediaExportJobState): void {
    this.currentState = state;
    this.onChange?.(state);
  }

  cancel(): void {
    if (!this.abortController || ['succeeded', 'failed', 'canceled'].includes(this.currentState.phase)) return;
    this.generation += 1;
    this.abortController.abort();
    this.abortController = null;
    this.publish({ phase: 'canceled', error: 'canceled' });
  }

  async start(request: MediaExportRequest, execute: MediaExportJobExecutor): Promise<MediaExportJobState> {
    this.cancel();
    const generation = ++this.generation;
    const abortController = new AbortController();
    this.abortController = abortController;
    const publishIfCurrent = (state: MediaExportJobState) => {
      if (generation === this.generation && !abortController.signal.aborted) this.publish(state);
    };
    this.publish({ phase: 'preparing' });
    try {
      const blob = await execute({
        request,
        signal: abortController.signal,
        transition: (phase, progress) => publishIfCurrent({ phase, progress }),
      });
      if (generation !== this.generation || abortController.signal.aborted) return { phase: 'canceled', error: 'canceled' };
      this.abortController = null;
      const succeeded = { phase: 'succeeded', blob } as const;
      this.publish(succeeded);
      return succeeded;
    } catch (error) {
      if (generation !== this.generation || abortController.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return { phase: 'canceled', error: 'canceled' };
      }
      this.abortController = null;
      const code = isMediaExportErrorCode(error) ? error : 'render-failed';
      const failed = { phase: 'failed', error: code } as const;
      this.publish(failed);
      return failed;
    }
  }
}

export function isMediaExportErrorCode(value: unknown): value is MediaExportErrorCode {
  return typeof value === 'string' && [
    'invalid-request', 'format-unavailable', 'profile-unavailable', 'resource-limit',
    'dependency-load-failed', 'render-failed', 'encode-failed', 'mime-mismatch',
    'download-failed', 'canceled',
  ].includes(value);
}
