export const ANIMATION_PLAYBACK_SPEEDS = [
  0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

export type AnimationPlaybackSpeed = (typeof ANIMATION_PLAYBACK_SPEEDS)[number];

export const DEFAULT_ANIMATION_PLAYBACK_SPEED: AnimationPlaybackSpeed = 1;

export function normalizeAnimationPlaybackSpeed(value: unknown): AnimationPlaybackSpeed {
  return typeof value === 'number' && Number.isFinite(value)
    && ANIMATION_PLAYBACK_SPEEDS.includes(value as AnimationPlaybackSpeed)
    ? value as AnimationPlaybackSpeed
    : DEFAULT_ANIMATION_PLAYBACK_SPEED;
}

export function getEffectiveAnimationDuration(
  baseDuration: number,
  speed: AnimationPlaybackSpeed,
): number {
  if (!Number.isFinite(baseDuration) || baseDuration < 0) {
    throw new TypeError('Animation duration must be a finite non-negative number.');
  }
  return baseDuration / normalizeAnimationPlaybackSpeed(speed);
}

export function mapOutputTimeToCanonicalTime(
  outputTime: number,
  speed: AnimationPlaybackSpeed,
): number {
  if (!Number.isFinite(outputTime) || outputTime < 0) {
    throw new TypeError('Animation output time must be a finite non-negative number.');
  }
  return outputTime * normalizeAnimationPlaybackSpeed(speed);
}
