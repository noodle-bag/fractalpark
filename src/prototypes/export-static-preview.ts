/**
 * v0.4.22 Slice 0a evidence only. This module is imported by focused tests and
 * the isolated browser prototype; it is not part of the production export
 * path or a product bundle dependency.
 */

export const STATIC_IMAGE_FORMATS = ['image/png', 'image/jpeg'] as const;
export type StaticImageFormatPrototype = (typeof STATIC_IMAGE_FORMATS)[number];

export const JPEG_QUALITY_PROTOTYPES = {
  balanced: 0.82,
  high: 0.92,
  maximum: 1,
} as const;

export const STATIC_DIMENSION_LIMITS_PROTOTYPE = {
  maxSide: 8192,
  maxPixels: 16_777_216,
} as const;

export const STATIC_SAMPLE_ROLES_PROTOTYPE = [
  'dark-gradient-bands',
  'fine-lines-and-edges',
  'high-frequency-detail',
  'alpha-and-background',
] as const;

export type StaticSampleRolePrototype = (typeof STATIC_SAMPLE_ROLES_PROTOTYPE)[number];
export type CompositionModePrototype = 'fit' | 'fill';

export interface CanvasEncoderPrototype {
  readonly width: number;
  readonly height: number;
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void;
}

export interface StaticFormatProbePrototype {
  requestedMime: string;
  actualMime: string | null;
  supported: boolean;
  bytes: number;
  width: number;
  height: number;
}

export interface CompositionSourcePrototype {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  zoom: number;
  rotation: number;
}

export interface CompositionAdjustmentPrototype {
  /** Camera translation as a fraction of the derived target viewport. */
  panX: number;
  panY: number;
  /** Values above one zoom in; values below one zoom out. */
  scale: number;
  rotation: number;
}

export interface CompositionViewportPrototype {
  mode: CompositionModePrototype;
  centerX: number;
  centerY: number;
  zoom: number;
  rotation: number;
  worldWidth: number;
  worldHeight: number;
  sourceWorldWidth: number;
  sourceWorldHeight: number;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateStaticDimensionsPrototype(
  width: number,
  height: number,
): 'valid' | 'invalid-dimension' | 'side-limit' | 'pixel-limit' {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return 'invalid-dimension';
  }
  if (
    width > STATIC_DIMENSION_LIMITS_PROTOTYPE.maxSide
    || height > STATIC_DIMENSION_LIMITS_PROTOTYPE.maxSide
  ) {
    return 'side-limit';
  }
  if (width * height > STATIC_DIMENSION_LIMITS_PROTOTYPE.maxPixels) {
    return 'pixel-limit';
  }
  return 'valid';
}

export async function probeStaticFormatPrototype(
  canvas: CanvasEncoderPrototype,
  requestedMime: string,
  quality?: number,
): Promise<StaticFormatProbePrototype> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, requestedMime, quality);
  });
  return {
    requestedMime,
    actualMime: blob?.type || null,
    supported: blob !== null && blob.type === requestedMime,
    bytes: blob?.size ?? 0,
    width: canvas.width,
    height: canvas.height,
  };
}

export function deriveCompositionViewportPrototype(
  source: CompositionSourcePrototype,
  target: { width: number; height: number },
  mode: CompositionModePrototype,
  adjustment: CompositionAdjustmentPrototype = {
    panX: 0,
    panY: 0,
    scale: 1,
    rotation: 0,
  },
): CompositionViewportPrototype {
  if (
    !positiveFinite(source.width)
    || !positiveFinite(source.height)
    || !positiveFinite(source.zoom)
    || !positiveFinite(target.width)
    || !positiveFinite(target.height)
    || !positiveFinite(adjustment.scale)
    || !Number.isFinite(source.centerX)
    || !Number.isFinite(source.centerY)
    || !Number.isFinite(source.rotation)
    || !Number.isFinite(adjustment.panX)
    || !Number.isFinite(adjustment.panY)
    || !Number.isFinite(adjustment.rotation)
  ) {
    throw new Error('invalid-composition-input');
  }

  // This matches framework.frag.glsl: uv is divided by the shorter pixel
  // dimension and then by zoom. It therefore describes the current visible
  // world without reading back or stretching the current canvas bitmap.
  const sourceMin = Math.min(source.width, source.height);
  const sourceWorldWidth = source.width / sourceMin / source.zoom;
  const sourceWorldHeight = source.height / sourceMin / source.zoom;
  const targetMin = Math.min(target.width, target.height);
  const targetWidthUnits = target.width / targetMin;
  const targetHeightUnits = target.height / targetMin;
  const widthZoom = targetWidthUnits / sourceWorldWidth;
  const heightZoom = targetHeightUnits / sourceWorldHeight;
  const baseZoom = mode === 'fit'
    ? Math.min(widthZoom, heightZoom)
    : Math.max(widthZoom, heightZoom);
  const zoom = baseZoom * adjustment.scale;
  const worldWidth = targetWidthUnits / zoom;
  const worldHeight = targetHeightUnits / zoom;

  return {
    mode,
    centerX: source.centerX + adjustment.panX * worldWidth,
    centerY: source.centerY + adjustment.panY * worldHeight,
    zoom,
    rotation: source.rotation + adjustment.rotation,
    worldWidth,
    worldHeight,
    sourceWorldWidth,
    sourceWorldHeight,
  };
}
