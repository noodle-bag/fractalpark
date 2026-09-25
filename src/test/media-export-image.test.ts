import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { createMediaExportRequest, type ImageExportRequest } from '@/lib/media-export';
import {
  exportImageBlob,
  resolveImageExportBounds,
  type ImageExportDependencies,
} from '@/lib/media-export-image';

function request(overrides: Partial<ImageExportRequest> = {}): ImageExportRequest {
  const result = createMediaExportRequest({
    document: DEFAULT_FRACTAL_DOCUMENT,
    formulaAssets: [],
    kind: 'image',
    format: 'png',
    width: 1920,
    height: 1080,
    sourceViewport: { width: 1200, height: 800 },
    renderQuality: 'high',
    background: '#123456',
    composition: { mode: 'fit', baseline: 'fit', panX: 0, panY: 0, scale: 1, rotation: 0 },
    createdAt: 0,
    ...overrides,
  });
  if (!result.ok || result.value.kind !== 'image') throw new Error('fixture');
  return result.value;
}

function dependencies(actualMime = 'image/png'): ImageExportDependencies & { contexts: Array<Record<string, ReturnType<typeof vi.fn>>> } {
  const contexts: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  return {
    contexts,
    createCanvas: () => {
      const context = { fillRect: vi.fn(), drawImage: vi.fn() };
      contexts.push(context);
      return {
        width: 0,
        height: 0,
        getContext: vi.fn((kind: string) => kind === '2d' ? context : null) as never,
        toBlob: (callback, _mime, quality) => {
          const blob = new Blob([String(quality ?? '')], { type: actualMime });
          callback(blob);
        },
      };
    },
    render: vi.fn(async () => undefined),
    decode: vi.fn(async () => ({ width: 1920, height: 1080, close: vi.fn() })),
  };
}

describe('image media export', () => {
  it('derives Fit and Fill without stretching the current visible world', () => {
    const fit = resolveImageExportBounds(request());
    const fill = resolveImageExportBounds(request({
      composition: { mode: 'fill', baseline: 'fill', panX: 0, panY: 0, scale: 1, rotation: 0 },
    }));
    expect(fit.zoom).toBeCloseTo(0.4);
    expect(fill.zoom).toBeCloseTo(0.474074);
  });

  it('applies normalized Custom pan, scale, and rotation from its baseline', () => {
    const bounds = resolveImageExportBounds(request({
      composition: { mode: 'custom', baseline: 'fit', panX: 0.25, panY: -0.5, scale: 2, rotation: 0.2 },
    }));
    expect(bounds.zoom).toBeCloseTo(0.8);
    expect(bounds.centerX).toBeCloseTo(0.055555, 5);
    expect(bounds.centerY).toBeCloseTo(-0.625);
    expect(bounds.rotation).toBeCloseTo(0.2);
  });

  it('encodes PNG with exact MIME and decoded dimensions', async () => {
    const deps = dependencies();
    const blob = await exportImageBlob(request(), new AbortController().signal, deps);
    expect(blob.type).toBe('image/png');
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.decode).toHaveBeenCalledOnce();
  });

  it('composites JPEG onto the selected background and passes the quality hint', async () => {
    const deps = dependencies('image/jpeg');
    const blob = await exportImageBlob(request({ format: 'jpeg', jpegQuality: 'maximum' }), new AbortController().signal, deps);
    expect(blob.type).toBe('image/jpeg');
    expect(deps.contexts[1]?.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(await blob.text()).toBe('1');
  });

  it('rejects browser MIME substitution and decoded size drift', async () => {
    await expect(exportImageBlob(request(), new AbortController().signal, dependencies('image/jpeg')))
      .rejects.toBe('mime-mismatch');
    const deps = dependencies();
    deps.decode = vi.fn(async () => ({ width: 1919, height: 1080, close: vi.fn() }));
    await expect(exportImageBlob(request(), new AbortController().signal, deps))
      .rejects.toBe('profile-unavailable');
  });

  it('does not encode after cancellation', async () => {
    const controller = new AbortController();
    const deps = dependencies();
    deps.render = vi.fn(async () => controller.abort());
    await expect(exportImageBlob(request(), controller.signal, deps)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
