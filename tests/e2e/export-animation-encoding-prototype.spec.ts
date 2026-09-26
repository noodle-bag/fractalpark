import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

let browserBundle = '';
let bundleBytes = 0;
let bundleGzipBytes = 0;

async function openSecurePrototypePage(
  page: import('@playwright/test').Page,
  title: string,
): Promise<void> {
  await page.route('http://localhost/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>${title}</title>`,
  }));
  await page.goto('http://localhost/prototype');
}

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve('src/prototypes/export-animation-encoding.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'FractalParkAnimationPrototype',
    minify: true,
    target: ['chrome120'],
  });
  browserBundle = result.outputFiles[0].text;
  bundleBytes = result.outputFiles[0].contents.byteLength;
  bundleGzipBytes = gzipSync(result.outputFiles[0].contents).byteLength;
});

test('probes exact 1080p60 and 4K60 MP4/WebM capabilities', async ({ browserName, page }, testInfo) => {
  await openSecurePrototypePage(page, 'FractalPark animation capability prototype');
  await page.addScriptTag({ content: browserBundle });

  const evidence = await page.evaluate(async () => {
    const prototype = (window as typeof window & {
      FractalParkAnimationPrototype: typeof import('../../src/prototypes/export-animation-encoding');
    }).FractalParkAnimationPrototype;
    const profiles = [
      prototype.ANIMATION_PROFILES_PROTOTYPE.default,
      prototype.ANIMATION_PROFILES_PROTOTYPE.maximum,
    ];
    const results = [];
    for (const profile of profiles) {
      for (const container of ['mp4', 'webm'] as const) {
        results.push(await prototype.probeAnimationCapabilityPrototype(container, profile));
      }
    }
    return {
      userAgent: navigator.userAgent,
      crossOriginIsolated,
      videoEncoder: typeof VideoEncoder !== 'undefined',
      worker: typeof Worker !== 'undefined',
      results,
    };
  });

  expect(evidence.videoEncoder).toBe(true);
  expect(evidence.results).toHaveLength(4);
  for (const result of evidence.results) {
    expect(result.profile.fps).toBe(60);
    expect(result.selected).not.toBeNull();
    expect(result.supported).toContain(result.selected);
  }
  console.info('[0b-capability]', JSON.stringify({
    ...evidence,
    dependencyBundle: { rawBytes: bundleBytes, gzipBytes: bundleGzipBytes },
  }));
  await testInfo.attach(`${browserName}-animation-capabilities.json`, {
    body: Buffer.from(JSON.stringify({
      ...evidence,
      dependencyBundle: { rawBytes: bundleBytes, gzipBytes: bundleGzipBytes },
    }, null, 2)),
    contentType: 'application/json',
  });
});

test('encodes deterministic MP4 and WebM with explicit timestamps and playable metadata', async ({ browserName, page }, testInfo) => {
  test.setTimeout(180_000);
  await openSecurePrototypePage(page, 'FractalPark fixed-step animation prototype');
  await page.addScriptTag({ content: browserBundle });

  const evidence = await page.evaluate(async () => {
    const prototype = (window as typeof window & {
      FractalParkAnimationPrototype: typeof import('../../src/prototypes/export-animation-encoding');
    }).FractalParkAnimationPrototype;

    async function encode(container: 'mp4' | 'webm', width: number, height: number, fps: number) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2d-context-unavailable');
      const profile = {
        id: `${width}x${height}-${fps}`,
        width,
        height,
        fps,
        bitrate: width >= 3840 ? 40_000_000 : width >= 1920 ? 12_000_000 : 1_000_000,
      };
      const schedule = prototype.buildFixedFrameSchedulePrototype(1, 1, fps);
      const heapBefore = (performance as Performance & {
        memory?: { usedJSHeapSize: number };
      }).memory?.usedJSHeapSize ?? null;
      let progress = 0;
      const encoded = await prototype.encodeCanvasAnimationPrototype({
        canvas,
        container,
        profile,
        schedule,
        onProgress: completed => { progress = completed; },
        renderFrame: canonicalTime => {
          const hue = Math.round(canonicalTime * 360);
          const gradient = context.createLinearGradient(0, 0, width, height);
          gradient.addColorStop(0, `hsl(${hue} 80% 18%)`);
          gradient.addColorStop(1, `hsl(${(hue + 150) % 360} 90% 55%)`);
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
          context.strokeStyle = '#ffffff';
          context.lineWidth = Math.max(1, width / 960);
          context.beginPath();
          for (let x = 0; x < width; x += Math.max(1, width / 120)) {
            const y = height / 2 + Math.sin(x / width * Math.PI * 10 + canonicalTime * 12)
              * height * 0.32;
            if (x === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.stroke();
        },
      });
      const blob = new Blob([encoded.buffer], { type: encoded.mimeType.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(`decode-failed:${container}`));
      });
      const result = {
        container,
        width,
        height,
        fps,
        codec: encoded.codec,
        mimeType: encoded.mimeType,
        bytes: encoded.buffer.byteLength,
        frames: encoded.frameCount,
        expectedDuration: encoded.duration,
        decodedDuration: video.duration,
        decodedWidth: video.videoWidth,
        decodedHeight: video.videoHeight,
        encodeMilliseconds: encoded.encodeMilliseconds,
        progress,
        heapBefore,
        heapAfter: (performance as Performance & {
          memory?: { usedJSHeapSize: number };
        }).memory?.usedJSHeapSize ?? null,
      };
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      return result;
    }

    const samples = [
      await encode('mp4', 320, 180, 30),
      await encode('webm', 320, 180, 30),
      await encode('mp4', 1920, 1080, 60),
      await encode('webm', 1920, 1080, 60),
      await encode('mp4', 3840, 2160, 60),
      await encode('webm', 3840, 2160, 60),
    ];
    return { samples };
  });

  for (const sample of evidence.samples) {
    expect(sample.bytes).toBeGreaterThan(0);
    expect(sample.frames).toBe(sample.fps);
    expect(sample.progress).toBe(sample.frames);
    expect(sample.decodedWidth).toBe(sample.width);
    expect(sample.decodedHeight).toBe(sample.height);
    expect(sample.decodedDuration).toBeCloseTo(sample.expectedDuration, 2);
    expect(sample.mimeType).toContain(`video/${sample.container}`);
  }
  console.info('[0b-encoding]', JSON.stringify(evidence));
  await testInfo.attach(`${browserName}-animation-encoding.json`, {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
});

test('cancels active encoding and runs the same fixed-step route in a Dedicated Worker', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openSecurePrototypePage(page, 'FractalPark animation cancellation and worker prototype');
  await page.addScriptTag({ content: browserBundle });

  const evidence = await page.evaluate(async ({ workerBundle }) => {
    const prototype = (window as typeof window & {
      FractalParkAnimationPrototype: typeof import('../../src/prototypes/export-animation-encoding');
    }).FractalParkAnimationPrototype;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d-context-unavailable');
    const profile = { id: 'cancel', width: 320, height: 180, fps: 30, bitrate: 1_000_000 };
    const controller = new AbortController();
    let progress = 0;
    let cancellation = 'none';
    try {
      await prototype.encodeCanvasAnimationPrototype({
        canvas,
        container: 'webm',
        profile,
        schedule: prototype.buildFixedFrameSchedulePrototype(2, 1, 30),
        signal: controller.signal,
        onProgress: completed => {
          progress = completed;
          if (completed === 4) controller.abort();
        },
        renderFrame: canonicalTime => {
          context.fillStyle = `hsl(${canonicalTime * 180} 80% 45%)`;
          context.fillRect(0, 0, canvas.width, canvas.height);
        },
      });
    } catch (error) {
      cancellation = error instanceof DOMException ? error.name : String(error);
    }

    const workerSource = `${workerBundle}\nself.onmessage = async () => {
      try {
        const prototype = FractalParkAnimationPrototype;
        const canvas = new OffscreenCanvas(320, 180);
        const context = canvas.getContext('2d');
        const profile = { id: 'worker', width: 320, height: 180, fps: 30, bitrate: 1000000 };
        const schedule = prototype.buildFixedFrameSchedulePrototype(0.5, 1, 30);
        const encoded = await prototype.encodeCanvasAnimationPrototype({
          canvas,
          container: 'webm',
          profile,
          schedule,
          renderFrame: (canonicalTime) => {
            context.fillStyle = 'hsl(' + (canonicalTime * 360) + ' 80% 45%)';
            context.fillRect(0, 0, canvas.width, canvas.height);
          },
        });
        self.postMessage({ ok: true, bytes: encoded.buffer.byteLength, codec: encoded.codec,
          mimeType: encoded.mimeType, frames: encoded.frameCount, duration: encoded.duration });
      } catch (error) {
        self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    };`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const workerResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
      worker.onmessage = event => resolve(event.data);
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage(null);
    });
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    return { cancellation, progress, workerResult };
  }, { workerBundle: browserBundle });

  expect(evidence.cancellation).toBe('AbortError');
  expect(evidence.progress).toBe(4);
  expect(evidence.workerResult).toMatchObject({
    ok: true,
    frames: 15,
    duration: 0.5,
  });
  expect(Number(evidence.workerResult.bytes)).toBeGreaterThan(0);
  expect(String(evidence.workerResult.mimeType)).toContain('video/webm');
  console.info('[0b-cancel-worker]', JSON.stringify(evidence));
  await testInfo.attach('chromium-animation-cancel-worker.json', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
});
