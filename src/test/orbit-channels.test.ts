import { describe, it, expectTypeOf } from 'vitest';
import type { OrbitData } from '@/engine/orbit-channels';

describe('Orbit Channels', () => {
  it('should expose the Phase 2 OrbitData contract', () => {
    expectTypeOf<OrbitData>().toMatchTypeOf<{
      escapeIter: number;
      normalizedIter: number;
      finalZ: [number, number];
      zPrev: [number, number];
      radius2: number;
      minRadius: number;
      maxRadius: number;
      angle: number;
      angleAccum?: number;
      trapDistance?: number;
      orbitEnergy?: number;
    }>();
  });
});
