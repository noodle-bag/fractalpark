import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

let browserBundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { registerBuiltins } from './src/engine/plugins/builtins';
        import { DEFAULT_FRACTAL_DOCUMENT } from './src/engine/document';
        import * as encoder from './src/lib/media-export-animation-encoder';
        registerBuiltins({ quiet: true });
        export { DEFAULT_FRACTAL_DOCUMENT, encoder };
      `,
      resolveDir: process.cwd(),
      sourcefile: 'animation-encoder-browser-entry.ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'FractalParkAnimationEncoder',
    minify: true,
    target: ['chrome120'],
    loader: { '.glsl': 'text' },
  });
  browserBundle = result.outputFiles[0].text;
});

test('encodes playable MP4 and WebM through the production fixed-frame route and cancels cleanly', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('http://localhost/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>FractalPark production animation encoder</title>',
  }));
  await page.goto('http://localhost/animation-encoder');
  await page.addScriptTag({ content: browserBundle });

  const evidence = await page.evaluate(async () => {
    const harness = (window as typeof window & {
      FractalParkAnimationEncoder: {
        DEFAULT_FRACTAL_DOCUMENT: typeof import('../../src/engine/document').DEFAULT_FRACTAL_DOCUMENT;
        encoder: typeof import('../../src/lib/media-export-animation-encoder');
      };
    }).FractalParkAnimationEncoder;
    const documentState = structuredClone(harness.DEFAULT_FRACTAL_DOCUMENT);
    documentState.animation = {
      speed: 4,
      viewKeyframes: [
        { id: 'a', bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'b', bounds: { centerX: 0.1, centerY: 0.1, zoom: 0.4, rotation: 0.2 } },
      ],
    };
    const baseRequest = {
      document: documentState,
      formulaAssets: [],
      kind: 'animation' as const,
      width: 320,
      height: 180,
      sourceViewport: { width: 1200, height: 800 },
      renderQuality: 'off' as const,
      background: '#000000',
      composition: { mode: 'fit' as const, baseline: 'fit' as const, panX: 0, panY: 0, scale: 1, rotation: 0 },
      filename: 'animation',
      createdAt: 1,
      fps: 24 as const,
      speed: 4 as const,
      range: { start: 0, end: 18 },
      bitrate: 1_000_000,
    };

    const encoded = [];
    for (const format of ['mp4', 'webm'] as const) {
      const progress: Array<{ phase: string; completed: number; total: number }> = [];
      const result = await harness.encoder.exportAnimationBlob(
        { ...baseRequest, format },
        { signal: new AbortController().signal, onProgress: value => progress.push(value) },
      );
      const url = URL.createObjectURL(result.blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(`decode-failed:${format}`));
      });
      encoded.push({
        format,
        blobType: result.blob.type,
        mimeType: result.mimeType,
        codec: result.codec,
        bytes: result.blob.size,
        frameCount: result.frameCount,
        expectedDuration: result.duration,
        decodedDuration: video.duration,
        decodedWidth: video.videoWidth,
        decodedHeight: video.videoHeight,
        finalProgress: progress.at(-1),
      });
      URL.revokeObjectURL(url);
    }

    const controller = new AbortController();
    let cancellation = 'none';
    let canceledAt = 0;
    try {
      await harness.encoder.exportAnimationBlob(
        { ...baseRequest, format: 'webm' },
        {
          signal: controller.signal,
          onProgress: value => {
            if (value.phase === 'encoding' && value.completed === 4) {
              canceledAt = value.completed;
              controller.abort();
            }
          },
        },
      );
    } catch (error) {
      cancellation = error instanceof DOMException ? error.name : String(error);
    }
    return { encoded, cancellation, canceledAt };
  });

  expect(evidence.cancellation).toBe('AbortError');
  expect(evidence.canceledAt).toBe(4);
  expect(evidence.encoded).toHaveLength(2);
  for (const result of evidence.encoded) {
    expect(result.blobType).toBe(`video/${result.format}`);
    expect(result.mimeType).toContain(`video/${result.format}`);
    expect(result.codec).toBeTruthy();
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.frameCount).toBe(108);
    expect(result.expectedDuration).toBeCloseTo(4.5, 5);
    expect(result.decodedDuration).toBeCloseTo(4.5, 1);
    expect(result.decodedWidth).toBe(320);
    expect(result.decodedHeight).toBe(180);
    expect(result.finalProgress).toMatchObject({ phase: 'encoding', completed: 108, total: 108 });
  }
});
