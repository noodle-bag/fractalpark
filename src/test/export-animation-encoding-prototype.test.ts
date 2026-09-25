import { describe, expect, it } from 'vitest';
import {
  ANIMATION_CONTAINERS_PROTOTYPE,
  ANIMATION_PROFILES_PROTOTYPE,
  ANIMATION_SPEEDS_PROTOTYPE,
  buildFixedFrameSchedulePrototype,
  createRetryableLoaderPrototype,
  estimateAnimationResourcesPrototype,
  raceAbortPrototype,
} from '@/prototypes/export-animation-encoding';

describe('v0.4.22 Slice 0b animation encoding prototype', () => {
  it('freezes the approved containers, speed values, and 1080p60/4K60 profiles', () => {
    expect(ANIMATION_SPEEDS_PROTOTYPE).toEqual([
      0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4,
    ]);
    expect(ANIMATION_CONTAINERS_PROTOTYPE.mp4).toMatchObject({
      mimeType: 'video/mp4',
      extension: 'mp4',
      codecPriority: ['avc', 'hevc', 'av1'],
    });
    expect(ANIMATION_CONTAINERS_PROTOTYPE.webm).toMatchObject({
      mimeType: 'video/webm',
      extension: 'webm',
      codecPriority: ['vp9', 'vp8', 'av1'],
    });
    expect(ANIMATION_PROFILES_PROTOTYPE.default).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 60,
    });
    expect(ANIMATION_PROFILES_PROTOTYPE.maximum).toMatchObject({
      width: 3840,
      height: 2160,
      fps: 60,
    });
  });

  it.each(ANIMATION_SPEEDS_PROTOTYPE)(
    'maps fixed output timestamps back to canonical time at %sx',
    speed => {
      const schedule = buildFixedFrameSchedulePrototype(2, speed, 60);
      expect(schedule.effectiveDuration).toBeCloseTo(2 / speed);
      expect(schedule.frames).toHaveLength(Math.ceil(2 / speed * 60));
      expect(schedule.frames[0]).toEqual({
        index: 0,
        outputTime: 0,
        canonicalTime: 0,
        duration: 1 / 60,
      });
      const last = schedule.frames.at(-1)!;
      expect(last.canonicalTime).toBeCloseTo(last.outputTime * speed);
      expect(last.canonicalTime).toBeLessThan(2);
      expect(last.outputTime + last.duration).toBeCloseTo(2 / speed);
    },
  );

  it('uses a short final sample instead of silently changing the chosen frame rate', () => {
    const schedule = buildFixedFrameSchedulePrototype(1, 3, 24);
    expect(schedule.frames).toHaveLength(8);
    expect(schedule.frames.at(-1)!.duration).toBeCloseTo(1 / 24);

    const fractional = buildFixedFrameSchedulePrototype(1, 4, 30);
    expect(fractional.frames).toHaveLength(8);
    expect(fractional.frames.at(-1)!.duration).toBeCloseTo(1 / 60);
    expect(fractional.frames.at(-1)!.outputTime + fractional.frames.at(-1)!.duration)
      .toBeCloseTo(0.25);
  });

  it('makes the raw queue and encoded-size budgets explicit', () => {
    expect(estimateAnimationResourcesPrototype(
      ANIMATION_PROFILES_PROTOTYPE.default,
      10,
    )).toEqual({
      frameCount: 600,
      rgbaQueueBytes: 24_883_200,
      estimatedEncodedBytes: 15_000_000,
    });
    expect(estimateAnimationResourcesPrototype(
      ANIMATION_PROFILES_PROTOTYPE.maximum,
      10,
    )).toEqual({
      frameCount: 600,
      rgbaQueueBytes: 99_532_800,
      estimatedEncodedBytes: 50_000_000,
    });
  });

  it('lets cancellation win without mutating or restarting the late shared load', async () => {
    let resolveModule!: (value: string) => void;
    const sharedLoad = new Promise<string>(resolve => { resolveModule = resolve; });
    const controller = new AbortController();
    const canceledConsumer = raceAbortPrototype(sharedLoad, controller.signal);
    controller.abort();
    await expect(canceledConsumer).rejects.toMatchObject({ name: 'AbortError' });

    resolveModule('cached-module');
    await expect(raceAbortPrototype(sharedLoad)).resolves.toBe('cached-module');
  });

  it('deduplicates concurrent loads and retries after a failed dynamic load', async () => {
    let attempts = 0;
    let resolveFirst!: (value: string) => void;
    const firstLoad = new Promise<string>(resolve => { resolveFirst = resolve; });
    const load = createRetryableLoaderPrototype(async () => {
      attempts += 1;
      if (attempts === 1) return firstLoad;
      if (attempts === 2) throw new Error('network-failed');
      return 'retried-module';
    });

    const firstConsumer = load();
    const secondConsumer = load();
    expect(attempts).toBe(1);
    resolveFirst('shared-module');
    await expect(Promise.all([firstConsumer, secondConsumer])).resolves.toEqual([
      'shared-module',
      'shared-module',
    ]);

    const failingLoad = createRetryableLoaderPrototype(async () => {
      attempts += 1;
      if (attempts === 2) throw new Error('network-failed');
      return 'retried-module';
    });
    await expect(failingLoad()).rejects.toThrow('network-failed');
    await expect(failingLoad()).resolves.toBe('retried-module');
    expect(attempts).toBe(3);
  });

  it('rejects invalid schedule and budget inputs', () => {
    expect(() => buildFixedFrameSchedulePrototype(0, 1, 60)).toThrow(
      'invalid-animation-schedule',
    );
    expect(() => buildFixedFrameSchedulePrototype(1, 1, Number.NaN)).toThrow(
      'invalid-animation-schedule',
    );
    expect(() => estimateAnimationResourcesPrototype(
      ANIMATION_PROFILES_PROTOTYPE.default,
      -1,
    )).toThrow('invalid-animation-budget');
  });
});
