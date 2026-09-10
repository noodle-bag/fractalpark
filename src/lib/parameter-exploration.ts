export interface ExplorationWindow {
  min: number;
  max: number;
}

/** A finite, movable UI window; never used to validate stored parameters. */
export function explorationWindow(value: number, halfSpan = 2): ExplorationWindow | null {
  if (!Number.isFinite(value) || !Number.isFinite(halfSpan) || halfSpan <= 0) return null;
  const span = Math.max(halfSpan, Math.abs(value) * Number.EPSILON * 8);
  const min = value - span;
  const max = value + span;
  return Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(max - min) && min < max
    ? { min, max }
    : null;
}

export function fromPolar(magnitude: number, degrees: number): [number, number] | null {
  if (!Number.isFinite(magnitude) || magnitude < 0 || !Number.isFinite(degrees)) return null;
  const radians = degrees * Math.PI / 180;
  const re = magnitude * Math.cos(radians);
  const im = magnitude * Math.sin(radians);
  return Number.isFinite(re) && Number.isFinite(im) ? [re, im] : null;
}
