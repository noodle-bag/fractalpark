import { describe, expect, it } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import {
  MEDIA_EXPORT_LIMITS,
  MediaExportJobController,
  createMediaExportRequest,
  preflightMediaExportRequest,
  sanitizeMediaExportBasename,
} from '@/lib/media-export';

const base = {
  document: DEFAULT_FRACTAL_DOCUMENT,
  formulaAssets: [],
  width: 1920,
  height: 1080,
  renderQuality: 'high' as const,
  background: '#000000',
  composition: { mode: 'fit' as const, panX: 0, panY: 0, scale: 1, rotation: 0 },
  createdAt: Date.UTC(2026, 8, 25, 8, 0, 0),
};

describe('media export request and job core', () => {
  it('freezes an immutable image snapshot and resolves a safe filename', () => {
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.metadata = { name: 'Sea / Stars.' };
    const result = createMediaExportRequest({
      ...base,
      document,
      kind: 'image',
      format: 'jpeg',
      jpegQuality: 'high',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    document.scene.bounds.zoom = 99;
    expect(result.value.document.scene.bounds.zoom).toBe(DEFAULT_FRACTAL_DOCUMENT.scene.bounds.zoom);
    expect(result.value.filename).toBe('Sea - Stars-1920x1080-2026-09-25T08-00-00.jpg');
    expect(Object.isFrozen(result.value.document.scene.bounds)).toBe(true);
  });

  it('uses the product fallback for an unusable filename', () => {
    expect(sanitizeMediaExportBasename('  ...  ')).toBe('fractalpark');
  });

  it('reports image work and rejects hard dimension limits', () => {
    const valid = createMediaExportRequest({ ...base, kind: 'image', format: 'png' });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(preflightMediaExportRequest(valid.value, { qualified: true })).toEqual({
      ok: true,
      value: {
        outputPixels: 2_073_600,
        renderSamples: 9,
        renderSampleWork: 18_662_400,
        capabilityQualified: true,
      },
    });
    const oversized = createMediaExportRequest({ ...base, kind: 'image', format: 'png', width: 8192, height: 8192 });
    expect(oversized.ok && preflightMediaExportRequest(oversized.value, { qualified: true })).toEqual({ ok: false, code: 'resource-limit' });
  });

  it('freezes central animation duration, frame, queue, and byte budgets', () => {
    const request = createMediaExportRequest({
      ...base,
      kind: 'animation',
      format: 'mp4',
      fps: 60,
      speed: 1,
      range: { start: 0, end: 30 },
      bitrate: 40_000_000,
    });
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    const result = preflightMediaExportRequest(request.value, { qualified: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frameCount).toBe(MEDIA_EXPORT_LIMITS.animationMaxFrames);
    expect(result.value.rawQueueBytes).toBe(1920 * 1080 * 4 * 3);
    const tooLong = createMediaExportRequest({
      ...base,
      kind: 'animation',
      format: 'mp4',
      fps: 60,
      speed: 1,
      range: { start: 0, end: 30.01 },
      bitrate: 40_000_000,
    });
    expect(tooLong.ok && preflightMediaExportRequest(tooLong.value, { qualified: true })).toEqual({ ok: false, code: 'resource-limit' });
  });

  it('fails closed for an unqualified exact capability tuple', () => {
    const request = createMediaExportRequest({ ...base, kind: 'image', format: 'png' });
    expect(request.ok && preflightMediaExportRequest(request.value, { qualified: false, reason: 'format-unavailable' }))
      .toEqual({ ok: false, code: 'format-unavailable' });
  });

  it('cancels replacement work and ignores its late result', async () => {
    const request = createMediaExportRequest({ ...base, kind: 'image', format: 'png' });
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    const states: string[] = [];
    const controller = new MediaExportJobController(state => states.push(state.phase));
    let finishFirst!: (blob: Blob) => void;
    const first = controller.start(request.value, ({ transition }) => {
      transition('rendering', { completed: 0, total: 1 });
      return new Promise(resolve => { finishFirst = resolve; });
    });
    const second = controller.start(request.value, async ({ transition }) => {
      transition('ready');
      transition('rendering', { completed: 1, total: 1 });
      transition('finalizing');
      return new Blob(['new'], { type: 'image/png' });
    });
    finishFirst(new Blob(['old'], { type: 'image/png' }));
    expect(await first).toEqual({ phase: 'canceled', error: 'canceled' });
    expect((await second).phase).toBe('succeeded');
    expect(controller.state.phase).toBe('succeeded');
    expect(states).toContain('canceled');
  });

  it('treats explicit cancellation as a terminal non-success state', async () => {
    const request = createMediaExportRequest({ ...base, kind: 'image', format: 'png' });
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    const controller = new MediaExportJobController();
    const running = controller.start(request.value, ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    controller.cancel();
    expect(await running).toEqual({ phase: 'canceled', error: 'canceled' });
    expect(controller.state).toEqual({ phase: 'canceled', error: 'canceled' });
  });
});
