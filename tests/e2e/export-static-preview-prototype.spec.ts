import { expect, test } from '@playwright/test';
import {
  JPEG_QUALITY_PROTOTYPES,
  deriveCompositionViewportPrototype,
} from '../../src/prototypes/export-static-preview';

const SOURCE = {
  width: 960,
  height: 640,
  centerX: -0.5,
  centerY: 0.1,
  zoom: 0.72,
  rotation: 0.12,
};

type BrowserSample = {
  requestedMime: string;
  actualMime: string;
  bytes: number;
  width: number;
  height: number;
  alphaAtCorner: number;
  dataUrl: string;
};

async function renderSample(
  page: import('@playwright/test').Page,
  options: {
    width: number;
    height: number;
    mime: string;
    quality?: number;
    background?: string;
    viewport: ReturnType<typeof deriveCompositionViewportPrototype>;
  },
): Promise<BrowserSample> {
  return page.evaluate(async ({ width, height, mime, quality, background, viewport }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2d-context-unavailable');
    const backgroundRgb = background
      ? [
          Number.parseInt(background.slice(1, 3), 16),
          Number.parseInt(background.slice(3, 5), 16),
          Number.parseInt(background.slice(5, 7), 16),
        ]
      : null;

    const pixels = context.createImageData(width, height);
    const cos = Math.cos(viewport.rotation);
    const sin = Math.sin(viewport.rotation);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = ((x + 0.5) / width - 0.5) * viewport.worldWidth;
        const ny = ((y + 0.5) / height - 0.5) * viewport.worldHeight;
        const wx = viewport.centerX + nx * cos - ny * sin;
        const wy = viewport.centerY + nx * sin + ny * cos;
        const radial = Math.hypot(wx + 0.35, wy - 0.05);
        const bands = (Math.sin(radial * 42) + 1) / 2;
        const filaments = Math.abs(Math.sin(wx * 115) * Math.cos(wy * 97));
        const edge = wx + 0.28 * Math.sin(wy * 18) > -0.35 ? 1 : 0;
        const alpha = radial < 0.24 ? Math.min(1, radial / 0.24) : 1;
        const red = Math.round(12 + 190 * bands * edge);
        const green = Math.round(8 + 110 * filaments);
        const blue = Math.round(24 + 210 * (1 - bands));
        const index = (y * width + x) * 4;
        pixels.data[index] = backgroundRgb
          ? Math.round(red * alpha + backgroundRgb[0] * (1 - alpha))
          : red;
        pixels.data[index + 1] = backgroundRgb
          ? Math.round(green * alpha + backgroundRgb[1] * (1 - alpha))
          : green;
        pixels.data[index + 2] = backgroundRgb
          ? Math.round(blue * alpha + backgroundRgb[2] * (1 - alpha))
          : blue;
        pixels.data[index + 3] = backgroundRgb ? 255 : Math.round(alpha * 255);
      }
    }
    context.putImageData(pixels, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('encode-failed')), mime, quality);
    });
    const bitmap = await createImageBitmap(blob);
    const decoded = document.createElement('canvas');
    decoded.width = bitmap.width;
    decoded.height = bitmap.height;
    const decodedWidth = bitmap.width;
    const decodedHeight = bitmap.height;
    const decodedContext = decoded.getContext('2d', { willReadFrequently: true });
    if (!decodedContext) throw new Error('decode-context-unavailable');
    decodedContext.drawImage(bitmap, 0, 0);
    bitmap.close();
    const alphaAtCorner = decodedContext.getImageData(0, 0, 1, 1).data[3];
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('read-failed'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    return {
      requestedMime: mime,
      actualMime: blob.type,
      bytes: blob.size,
      width: decodedWidth,
      height: decodedHeight,
      alphaAtCorner,
      dataUrl,
    };
  }, options);
}

function attachmentBody(sample: BrowserSample): Buffer {
  return Buffer.from(sample.dataUrl.split(',')[1], 'base64');
}

test('probes real MIME and decodes approved static formats', async ({ browser, browserName, page }, testInfo) => {
  await page.setContent('<!doctype html><title>FractalPark export prototype</title>');
  const viewport = deriveCompositionViewportPrototype(SOURCE, { width: 320, height: 180 }, 'fit');
  const png = await renderSample(page, { width: 320, height: 180, mime: 'image/png', viewport });
  const jpeg = await renderSample(page, {
    width: 320,
    height: 180,
    mime: 'image/jpeg',
    quality: JPEG_QUALITY_PROTOTYPES.high,
    background: '#10131a',
    viewport,
  });
  const avif = await renderSample(page, {
    width: 32,
    height: 32,
    mime: 'image/avif',
    viewport,
  });

  expect(png).toMatchObject({ actualMime: 'image/png', width: 320, height: 180 });
  expect(jpeg).toMatchObject({ actualMime: 'image/jpeg', width: 320, height: 180 });
  expect(png.bytes).toBeGreaterThan(0);
  expect(jpeg.bytes).toBeGreaterThan(0);
  expect(jpeg.alphaAtCorner).toBe(255);
  expect(['image/avif', 'image/png']).toContain(avif.actualMime);

  await testInfo.attach(`${browserName}-fit.png`, { body: attachmentBody(png), contentType: 'image/png' });
  await testInfo.attach(`${browserName}-fit-high.jpg`, { body: attachmentBody(jpeg), contentType: 'image/jpeg' });
  await testInfo.attach(`${browserName}-capabilities.json`, {
    body: Buffer.from(JSON.stringify({ browserName, version: browser.version(), png, jpeg, avif }, (key, value) => key === 'dataUrl' ? undefined : value, 2)),
    contentType: 'application/json',
  });
});

test('uses one normalized camera for preview/final Fit, Fill, and Custom samples', async ({ browserName, page }, testInfo) => {
  await page.setContent('<!doctype html><title>FractalPark composition prototype</title>');
  const fitPreviewViewport = deriveCompositionViewportPrototype(SOURCE, { width: 320, height: 180 }, 'fit');
  const fitFinalViewport = deriveCompositionViewportPrototype(SOURCE, { width: 1280, height: 720 }, 'fit');
  const fillFinalViewport = deriveCompositionViewportPrototype(SOURCE, { width: 1280, height: 720 }, 'fill');
  const customPreviewViewport = deriveCompositionViewportPrototype(
    SOURCE,
    { width: 320, height: 180 },
    'fill',
    { panX: 0.12, panY: -0.08, scale: 1.35, rotation: 0.25 },
  );
  const customFinalViewport = deriveCompositionViewportPrototype(
    SOURCE,
    { width: 1280, height: 720 },
    'fill',
    { panX: 0.12, panY: -0.08, scale: 1.35, rotation: 0.25 },
  );
  expect(fitPreviewViewport).toEqual(fitFinalViewport);
  expect(customPreviewViewport).toEqual(customFinalViewport);

  const fitPreview = await renderSample(page, { width: 320, height: 180, mime: 'image/png', viewport: fitPreviewViewport });
  const fitFinal = await renderSample(page, { width: 1280, height: 720, mime: 'image/png', viewport: fitFinalViewport });
  const fillFinal = await renderSample(page, { width: 1280, height: 720, mime: 'image/png', viewport: fillFinalViewport });
  const customFinal = await renderSample(page, {
    width: 1280,
    height: 720,
    mime: 'image/jpeg',
    quality: JPEG_QUALITY_PROTOTYPES.high,
    background: '#10131a',
    viewport: customFinalViewport,
  });

  for (const sample of [fitPreview, fitFinal, fillFinal, customFinal]) {
    expect(sample.bytes).toBeGreaterThan(0);
    expect(sample.actualMime).toBe(sample.requestedMime);
  }
  await testInfo.attach(`${browserName}-fit-preview.png`, { body: attachmentBody(fitPreview), contentType: 'image/png' });
  await testInfo.attach(`${browserName}-fit-final.png`, { body: attachmentBody(fitFinal), contentType: 'image/png' });
  await testInfo.attach(`${browserName}-fill-final.png`, { body: attachmentBody(fillFinal), contentType: 'image/png' });
  await testInfo.attach(`${browserName}-custom-final.jpg`, { body: attachmentBody(customFinal), contentType: 'image/jpeg' });
});
