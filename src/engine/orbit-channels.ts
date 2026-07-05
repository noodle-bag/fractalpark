export interface OrbitData {
  escapeIter: number;
  normalizedIter: number;
  /** Current z value at the escape/converge check, not nextZ after another iteration. */
  finalZ: [number, number];
  /** Previous z value at the escape/converge check, from the end of the prior iteration. */
  zPrev: [number, number];
  /** |z|^2 at the escape/converge check. */
  radius2: number;
  minRadius: number;
  maxRadius: number;
  /** Matches GLSL OrbitStats.finalAngle: the final iteration angle atan(z.y, z.x). */
  angle: number;
  angleAccum?: number;
  trapDistance?: number;
  orbitEnergy?: number;
}

export const PHASE2_REQUIRED_ORBIT_CHANNELS = [
  'escapeIter',
  'normalizedIter',
  'finalZ',
  'zPrev',
  'radius2',
  'minRadius',
  'maxRadius',
  'angle',
] as const;
