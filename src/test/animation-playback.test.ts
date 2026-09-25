import { describe, expect, it } from 'vitest';

import {
  ANIMATION_PLAYBACK_SPEEDS,
  getEffectiveAnimationDuration,
  mapOutputTimeToCanonicalTime,
  normalizeAnimationPlaybackSpeed,
} from '@/engine/animation/playback';

describe('animation playback speed contract', () => {
  it('accepts only the nine approved speeds and defaults every other value to 1x', () => {
    for (const speed of ANIMATION_PLAYBACK_SPEEDS) {
      expect(normalizeAnimationPlaybackSpeed(speed)).toBe(speed);
    }
    for (const invalid of [undefined, null, NaN, Infinity, -1, 0, 0.3, 5, '2']) {
      expect(normalizeAnimationPlaybackSpeed(invalid)).toBe(1);
    }
  });

  it.each(ANIMATION_PLAYBACK_SPEEDS)(
    'maps preview and export time through the same %sx clock',
    speed => {
      expect(getEffectiveAnimationDuration(12, speed)).toBe(12 / speed);
      expect(mapOutputTimeToCanonicalTime(2, speed)).toBe(2 * speed);
    },
  );

  it('rejects invalid time inputs instead of manufacturing a timeline', () => {
    expect(() => getEffectiveAnimationDuration(-1, 1)).toThrow(TypeError);
    expect(() => mapOutputTimeToCanonicalTime(Number.NaN, 1)).toThrow(TypeError);
  });
});
