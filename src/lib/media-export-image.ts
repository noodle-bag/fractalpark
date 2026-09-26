import { FractalRenderer } from '@/engine/fractals/renderer';
import { createRenderSnapshot, type RenderSnapshot } from '@/engine/render-snapshot';
import type { ViewBounds } from '@/engine/types';
import {
  MEDIA_EXPORT_JPEG_QUALITY,
  type AnimationExportRequest,
  type ImageExportRequest,
  type MediaExportErrorCode,
} from '@/lib/media-export';

interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null;
  getContext(contextId: 'webgl', options?: WebGLContextAttributes): WebGLRenderingContext | null;
  toBlob(callback: BlobCallback, type?: string, quality?: number): void;
}

export interface ImageExportDependencies {
  createCanvas: () => CanvasLike;
  render: (canvas: CanvasLike, snapshot: RenderSnapshot, signal: AbortSignal) => Promise<void>;
  decode: (blob: Blob) => Promise<{ width: number; height: number; close: () => void }>;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function resolveMediaExportBounds(
  request: ImageExportRequest | AnimationExportRequest,
  current: ViewBounds = request.document.scene.bounds,
): ViewBounds {
  const source = request.sourceViewport;
  const target = { width: request.width, height: request.height };
  if (![source.width, source.height, target.width, target.height, current.zoom].every(positiveFinite)) {
    throw 'invalid-request' satisfies MediaExportErrorCode;
  }
  const sourceMin = Math.min(source.width, source.height);
  const sourceWorldWidth = source.width / sourceMin / current.zoom;
  const sourceWorldHeight = source.height / sourceMin / current.zoom;
  const targetMin = Math.min(target.width, target.height);
  const targetWidthUnits = target.width / targetMin;
  const targetHeightUnits = target.height / targetMin;
  const widthZoom = targetWidthUnits / sourceWorldWidth;
  const heightZoom = targetHeightUnits / sourceWorldHeight;
  const baseline = request.composition.mode === 'custom'
    ? request.composition.baseline
    : request.composition.mode;
  const baseZoom = baseline === 'fit'
    ? Math.min(widthZoom, heightZoom)
    : Math.max(widthZoom, heightZoom);
  const zoom = baseZoom * request.composition.scale;
  const worldWidth = targetWidthUnits / zoom;
  const worldHeight = targetHeightUnits / zoom;
  const rotation = (current.rotation ?? 0) + request.composition.rotation;
  const panX = request.composition.panX * worldWidth;
  const panY = request.composition.panY * worldHeight;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    centerX: current.centerX + panX * cosine - panY * sine,
    centerY: current.centerY + panX * sine + panY * cosine,
    zoom,
    rotation,
  };
}

export function resolveImageExportBounds(request: ImageExportRequest): ViewBounds {
  return resolveMediaExportBounds(request);
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function defaultRender(
  canvas: CanvasLike,
  snapshot: RenderSnapshot,
  signal: AbortSignal,
): Promise<void> {
  abortIfNeeded(signal);
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) throw 'render-failed' satisfies MediaExportErrorCode;
  const renderer = new FractalRenderer(gl);
  try {
    await renderer.render(snapshot);
    abortIfNeeded(signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw 'render-failed' satisfies MediaExportErrorCode;
  } finally {
    renderer.dispose();
  }
}

const DEFAULT_DEPENDENCIES: ImageExportDependencies = {
  createCanvas: () => document.createElement('canvas'),
  render: defaultRender,
  decode: async blob => createImageBitmap(blob),
};

function encodeCanvasBlob(canvas: CanvasLike, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject('encode-failed'), mime, quality);
  });
}

export async function exportImageBlob(
  request: ImageExportRequest,
  signal: AbortSignal,
  dependencies: ImageExportDependencies = DEFAULT_DEPENDENCIES,
): Promise<Blob> {
  abortIfNeeded(signal);
  const renderCanvas = dependencies.createCanvas();
  renderCanvas.width = request.width;
  renderCanvas.height = request.height;
  const snapshot = createRenderSnapshot(request.document, {
    bounds: resolveImageExportBounds(request),
    useSSAA: request.renderQuality !== 'off',
    ssaaLevel: { off: 0, standard: 4, high: 9, ultra: 16 }[request.renderQuality],
  });
  await dependencies.render(renderCanvas, snapshot, signal);
  abortIfNeeded(signal);

  let outputCanvas = renderCanvas;
  if (request.format === 'jpeg') {
    outputCanvas = dependencies.createCanvas();
    outputCanvas.width = request.width;
    outputCanvas.height = request.height;
    const context = outputCanvas.getContext('2d', { alpha: false });
    if (!context) throw 'encode-failed' satisfies MediaExportErrorCode;
    context.fillStyle = request.background;
    context.fillRect(0, 0, request.width, request.height);
    context.drawImage(renderCanvas as unknown as CanvasImageSource, 0, 0);
  }

  const mime = request.format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = request.format === 'jpeg' && request.jpegQuality
    ? MEDIA_EXPORT_JPEG_QUALITY[request.jpegQuality]
    : undefined;
  let blob: Blob;
  try {
    blob = await encodeCanvasBlob(outputCanvas, mime, quality);
  } catch {
    throw 'encode-failed' satisfies MediaExportErrorCode;
  }
  abortIfNeeded(signal);
  if (blob.type !== mime) throw 'mime-mismatch' satisfies MediaExportErrorCode;
  const decoded = await dependencies.decode(blob).catch(() => {
    throw 'encode-failed' satisfies MediaExportErrorCode;
  });
  try {
    if (decoded.width !== request.width || decoded.height !== request.height) {
      throw 'profile-unavailable' satisfies MediaExportErrorCode;
    }
  } finally {
    decoded.close();
  }
  return blob;
}

export function handoffMediaExportDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    throw 'download-failed' satisfies MediaExportErrorCode;
  } finally {
    URL.revokeObjectURL(url);
  }
}
