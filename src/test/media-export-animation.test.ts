import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { RenderSnapshot } from '@/engine/render-snapshot';
import {
  buildAnimationFrameSchedule,
  createAnimationFrameRenderSession,
  runAnimationFramePipeline,
  type AnimationFrameSchedule,
} from '@/lib/media-export-animation';
import { createMediaExportRequest, type AnimationExportRequest } from '@/lib/media-export';

function animationRequest(overrides: Partial<AnimationExportRequest> = {}): AnimationExportRequest {
  const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  document.animation = {
    speed: 1,
    viewKeyframes: [
      { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
      { id: 'b', bounds: { centerX: 1, centerY: 0, zoom: 1, rotation: 0 } },
    ],
  };
  const result = createMediaExportRequest({
    document,
    formulaAssets: [],
    kind: 'animation',
    format: 'webm',
    width: 1920,
    height: 1080,
    sourceViewport: { width: 1200, height: 800 },
    renderQuality: 'high',
    background: '#000000',
    composition: { mode: 'fit', baseline: 'fit', panX: 0, panY: 0, scale: 1, rotation: 0 },
    filename: 'test',
    createdAt: 1,
    fps: 24,
    speed: 4,
    range: { start: 0, end: 18 },
    bitrate: 12_000_000,
    ...overrides,
  });
  if (!result.ok || result.value.kind !== 'animation') throw new Error('request fixture failed');
  return result.value;
}

function shortSchedule(count = 6): AnimationFrameSchedule {
  return {
    baseDuration: count,
    effectiveDuration: count,
    fps: 24,
    speed: 1,
    frames: Array.from({ length: count }, (_, index) => ({
      index,
      outputTime: index / 24,
      canonicalTime: index / 24,
      duration: 1 / 24,
    })),
  };
}

describe('animation export frame pipeline', () => {
  it('builds one exact full-loop fixed-timestep schedule without a duplicate seam frame', () => {
    const schedule = buildAnimationFrameSchedule(animationRequest());
    expect(schedule.baseDuration).toBe(18);
    expect(schedule.effectiveDuration).toBe(4.5);
    expect(schedule.frames).toHaveLength(108);
    expect(schedule.frames[0]).toEqual({ index: 0, outputTime: 0, canonicalTime: 0, duration: 1 / 24 });
    expect(schedule.frames.at(-1)?.outputTime).toBeCloseTo(107 / 24);
    expect(schedule.frames.at(-1)?.canonicalTime).toBeCloseTo(107 / 6);
    expect(schedule.frames.at(-1)?.duration).toBeCloseTo(1 / 24);
    expect((schedule.frames.at(-1)?.canonicalTime ?? 18) < schedule.baseDuration).toBe(true);
  });

  it('rejects partial ranges and schedules beyond the sixty-second duration limit', () => {
    expect(() => buildAnimationFrameSchedule(animationRequest({ range: { start: 1, end: 18 } })))
      .toThrow('invalid-request');
    expect(() => buildAnimationFrameSchedule(animationRequest({ speed: 0.25, range: { start: 0, end: 18 } })))
      .toThrow('resource-limit');
  });

  it('renders timeline samples at target dimensions with shared composition and reusable WebGL state', async () => {
    const snapshots: RenderSnapshot[] = [];
    const dispose = vi.fn();
    const loseContext = vi.fn();
    const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
    const session = createAnimationFrameRenderSession(animationRequest({ width: 3840, height: 2160 }), {
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          getExtension: () => ({ loseContext }),
        }) as unknown as WebGLRenderingContext,
      }),
      createRenderer: () => ({
        render: async snapshot => { snapshots.push(snapshot); return true; },
        dispose,
      }),
      createBitmap: async () => bitmap(),
    });
    const signal = new AbortController().signal;
    const first = await session.render(session.schedule.frames[0], signal);
    const middle = await session.render(session.schedule.frames[54], signal);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].bounds.centerX).toBeCloseTo(0);
    expect(snapshots[1].bounds.centerX).not.toBe(snapshots[0].bounds.centerX);
    expect(snapshots.every(snapshot => snapshot.ssaaLevel === 9)).toBe(true);
    first.close();
    middle.close();
    session.dispose();
    session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('preserves order and applies bounded backpressure while render and encode overlap', async () => {
    let retained = 0;
    let maximumRetained = 0;
    const consumed: number[] = [];
    const progress: string[] = [];
    await runAnimationFramePipeline({
      schedule: shortSchedule(),
      signal: new AbortController().signal,
      queueDepth: 2,
      renderFrame: async sample => {
        retained += 1;
        maximumRetained = Math.max(maximumRetained, retained);
        return { index: sample.index, close: () => { retained -= 1; } };
      },
      consumeFrame: async (frame) => {
        await Promise.resolve();
        consumed.push(frame.index);
      },
      onProgress: value => progress.push(`${value.phase}:${value.completed}/${value.total}`),
    });

    expect(consumed).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maximumRetained).toBeLessThanOrEqual(2);
    expect(retained).toBe(0);
    expect(progress).toContain('rendering:6/6');
    expect(progress.at(-1)).toBe('encoding:6/6');
  });

  it('cancels without consuming late frames and closes every retained frame', async () => {
    const controller = new AbortController();
    const closed: number[] = [];
    const consumed: number[] = [];
    await expect(runAnimationFramePipeline({
      schedule: shortSchedule(8),
      signal: controller.signal,
      queueDepth: 3,
      renderFrame: async sample => ({
        index: sample.index,
        close: () => closed.push(sample.index),
      }),
      consumeFrame: async frame => {
        consumed.push(frame.index);
        if (frame.index === 1) controller.abort();
      },
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(consumed).toEqual([0, 1]);
    expect(closed.sort((a, b) => a - b)).toEqual([...new Set(closed)].sort((a, b) => a - b));
    expect(closed.length).toBeGreaterThanOrEqual(consumed.length);
  });

  it('preserves the consumer failure while aborting production and cleaning queued frames', async () => {
    const closed: number[] = [];
    await expect(runAnimationFramePipeline({
      schedule: shortSchedule(5),
      signal: new AbortController().signal,
      queueDepth: 3,
      renderFrame: async sample => ({
        index: sample.index,
        close: () => closed.push(sample.index),
      }),
      consumeFrame: async frame => {
        if (frame.index === 1) throw 'encode-failed';
      },
    })).rejects.toBe('encode-failed');

    expect(closed).toContain(0);
    expect(closed).toContain(1);
    expect(closed).toEqual([...new Set(closed)]);
  });
});
