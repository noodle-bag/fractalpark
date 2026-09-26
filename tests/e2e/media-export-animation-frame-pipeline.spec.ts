import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

let browserBundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { registerBuiltins } from './src/engine/plugins/builtins';
        import { DEFAULT_FRACTAL_DOCUMENT } from './src/engine/document';
        import * as framePipeline from './src/lib/media-export-animation';
        registerBuiltins({ quiet: true });
        export { DEFAULT_FRACTAL_DOCUMENT, framePipeline };
      `,
      resolveDir: process.cwd(),
      sourcefile: 'animation-frame-pipeline-browser-entry.ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'FractalParkAnimationFramePipeline',
    minify: true,
    target: ['chrome120'],
    loader: { '.glsl': 'text' },
  });
  browserBundle = result.outputFiles[0].text;
});

test('renders distinct fixed-time WebGL frames and releases a canceled bounded queue', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('http://localhost/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>FractalPark animation frame pipeline</title>',
  }));
  await page.goto('http://localhost/animation-frame-pipeline');
  await page.addScriptTag({ content: browserBundle });

  const evidence = await page.evaluate(async () => {
    const harness = (window as typeof window & {
      FractalParkAnimationFramePipeline: {
        DEFAULT_FRACTAL_DOCUMENT: typeof import('../../src/engine/document').DEFAULT_FRACTAL_DOCUMENT;
        framePipeline: typeof import('../../src/lib/media-export-animation');
      };
    }).FractalParkAnimationFramePipeline;
    const documentState = structuredClone(harness.DEFAULT_FRACTAL_DOCUMENT);
    documentState.animation = {
      speed: 4,
      viewKeyframes: [
        { id: 'a', bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'b', bounds: { centerX: -0.745, centerY: 0.113, zoom: 2, rotation: 0.2 } },
      ],
    };
    const request = {
      document: documentState,
      formulaAssets: [],
      kind: 'animation' as const,
      format: 'webm' as const,
      width: 320,
      height: 180,
      sourceViewport: { width: 1200, height: 800 },
      renderQuality: 'off' as const,
      background: '#000000',
      composition: { mode: 'fit' as const, baseline: 'fit' as const, panX: 0, panY: 0, scale: 1, rotation: 0 },
      filename: 'pipeline.webm',
      createdAt: 1,
      fps: 24 as const,
      speed: 4 as const,
      range: { start: 0, end: Math.abs(Math.log10(2 / 0.4)) * 24 * 2 },
      bitrate: 1_000_000,
    };
    const session = harness.framePipeline.createAnimationFrameRenderSession(request);
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = request.width;
    sampleCanvas.height = request.height;
    const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2d-context-unavailable');
    const signature = (bitmap: ImageBitmap) => {
      context.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height);
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      let value = 0;
      for (let index = 0; index < pixels.length; index += 997) value = (value + pixels[index]) % 1_000_000_007;
      return value;
    };

    const first = await session.render(session.schedule.frames[0], new AbortController().signal);
    const middleIndex = Math.floor(session.schedule.frames.length / 2);
    const middle = await session.render(session.schedule.frames[middleIndex], new AbortController().signal);
    const firstSignature = signature(first);
    const middleSignature = signature(middle);
    first.close();
    middle.close();

    const profiles: Array<{ width: number; height: number; bitmapWidth: number; bitmapHeight: number }> = [];
    for (const [width, height] of [[1920, 1080], [3840, 2160]] as const) {
      const profileSession = harness.framePipeline.createAnimationFrameRenderSession({
        ...request,
        width,
        height,
      });
      const bitmap = await profileSession.render(
        profileSession.schedule.frames[0],
        new AbortController().signal,
      );
      profiles.push({ width, height, bitmapWidth: bitmap.width, bitmapHeight: bitmap.height });
      bitmap.close();
      profileSession.dispose();
    }

    const controller = new AbortController();
    const progress: Array<{ phase: string; completed: number; queued: number }> = [];
    let consumed = 0;
    let cancellation = 'none';
    try {
      await harness.framePipeline.runAnimationFramePipeline({
        schedule: session.schedule,
        signal: controller.signal,
        queueDepth: 3,
        renderFrame: (sample, signal) => session.render(sample, signal),
        consumeFrame: async () => {
          consumed += 1;
          if (consumed === 4) controller.abort();
        },
        onProgress: value => progress.push({
          phase: value.phase,
          completed: value.completed,
          queued: value.queued,
        }),
      });
    } catch (error) {
      cancellation = error instanceof DOMException ? error.name : String(error);
    } finally {
      session.dispose();
    }
    return {
      width: request.width,
      height: request.height,
      frameCount: session.schedule.frames.length,
      firstSignature,
      middleSignature,
      consumed,
      cancellation,
      maximumQueued: Math.max(...progress.map(value => value.queued)),
      finalProgress: progress.at(-1),
      profiles,
    };
  });

  expect(evidence).toMatchObject({
    width: 320,
    height: 180,
    consumed: 4,
    cancellation: 'AbortError',
  });
  expect(evidence.frameCount).toBeGreaterThan(4);
  expect(evidence.profiles).toEqual([
    { width: 1920, height: 1080, bitmapWidth: 1920, bitmapHeight: 1080 },
    { width: 3840, height: 2160, bitmapWidth: 3840, bitmapHeight: 2160 },
  ]);
  expect(evidence.firstSignature).not.toBe(evidence.middleSignature);
  expect(evidence.maximumQueued).toBeLessThanOrEqual(3);
  expect(evidence.finalProgress?.phase).toBe('encoding');
  expect(evidence.finalProgress?.completed).toBe(4);
});
