import { describe, expect, it, vi } from 'vitest';
import {
  JPEG_QUALITY_PROTOTYPES,
  STATIC_DIMENSION_LIMITS_PROTOTYPE,
  STATIC_IMAGE_FORMATS,
  STATIC_SAMPLE_ROLES_PROTOTYPE,
  deriveCompositionViewportPrototype,
  probeStaticFormatPrototype,
  validateStaticDimensionsPrototype,
  type CanvasEncoderPrototype,
} from '@/prototypes/export-static-preview';

describe('v0.4.22 Slice 0a static export and preview prototype', () => {
  it('freezes the approved formats, JPEG quality hints, dimensions, and sample roles', () => {
    expect(STATIC_IMAGE_FORMATS).toEqual(['image/png', 'image/jpeg']);
    expect(JPEG_QUALITY_PROTOTYPES).toEqual({ balanced: 0.82, high: 0.92, maximum: 1 });
    expect(STATIC_DIMENSION_LIMITS_PROTOTYPE).toEqual({
      maxSide: 8192,
      maxPixels: 16_777_216,
    });
    expect(STATIC_SAMPLE_ROLES_PROTOTYPE).toEqual([
      'dark-gradient-bands',
      'fine-lines-and-edges',
      'high-frequency-detail',
      'alpha-and-background',
    ]);
  });

  it.each([
    [1920, 1080, 'valid'],
    [4096, 4096, 'valid'],
    [8192, 2048, 'valid'],
    [8192, 2049, 'pixel-limit'],
    [8193, 1, 'side-limit'],
    [0, 1080, 'invalid-dimension'],
    [10.5, 10, 'invalid-dimension'],
  ] as const)('validates %sx%s as %s', (width, height, expected) => {
    expect(validateStaticDimensionsPrototype(width, height)).toBe(expected);
  });

  it('uses the returned Blob MIME as the capability result instead of trusting the request', async () => {
    const toBlob = vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
      callback(new Blob(['sample'], { type: type === 'image/avif' ? 'image/png' : type }));
    });
    const canvas: CanvasEncoderPrototype = { width: 64, height: 40, toBlob };

    await expect(probeStaticFormatPrototype(canvas, 'image/png')).resolves.toMatchObject({
      requestedMime: 'image/png',
      actualMime: 'image/png',
      supported: true,
      width: 64,
      height: 40,
    });
    await expect(probeStaticFormatPrototype(canvas, 'image/avif')).resolves.toMatchObject({
      requestedMime: 'image/avif',
      actualMime: 'image/png',
      supported: false,
    });
  });

  it('derives Fit by containing the source view and Fill by cropping it without stretching', () => {
    const source = {
      width: 1200,
      height: 800,
      centerX: -0.5,
      centerY: 0.125,
      zoom: 0.5,
      rotation: 0.2,
    };
    const fit = deriveCompositionViewportPrototype(source, { width: 1080, height: 1080 }, 'fit');
    const fill = deriveCompositionViewportPrototype(source, { width: 1080, height: 1080 }, 'fill');

    expect(fit.worldWidth).toBeGreaterThanOrEqual(fit.sourceWorldWidth);
    expect(fit.worldHeight).toBeGreaterThanOrEqual(fit.sourceWorldHeight);
    expect(fill.worldWidth).toBeLessThanOrEqual(fill.sourceWorldWidth);
    expect(fill.worldHeight).toBeLessThanOrEqual(fill.sourceWorldHeight);
    expect(fit.centerX).toBe(source.centerX);
    expect(fit.centerY).toBe(source.centerY);
    expect(fit.rotation).toBe(source.rotation);
  });

  it('keeps normalized composition identical across preview and final resolutions', () => {
    const source = {
      width: 960,
      height: 640,
      centerX: -0.75,
      centerY: 0.1,
      zoom: 0.8,
      rotation: -0.1,
    };
    const adjustment = { panX: 0.12, panY: -0.08, scale: 1.4, rotation: 0.3 };
    const preview = deriveCompositionViewportPrototype(
      source,
      { width: 320, height: 180 },
      'fill',
      adjustment,
    );
    const final = deriveCompositionViewportPrototype(
      source,
      { width: 3840, height: 2160 },
      'fill',
      adjustment,
    );

    expect(preview).toEqual(final);
    expect(preview.centerX).not.toBe(source.centerX);
    expect(preview.centerY).not.toBe(source.centerY);
    expect(preview.rotation).toBeCloseTo(0.2);
  });

  it('rejects non-finite and non-positive composition inputs', () => {
    expect(() => deriveCompositionViewportPrototype(
      { width: 0, height: 100, centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
      { width: 100, height: 100 },
      'fit',
    )).toThrow('invalid-composition-input');
    expect(() => deriveCompositionViewportPrototype(
      { width: 100, height: 100, centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
      { width: 100, height: 100 },
      'fit',
      { panX: 0, panY: 0, scale: Number.NaN, rotation: 0 },
    )).toThrow('invalid-composition-input');
  });
});
