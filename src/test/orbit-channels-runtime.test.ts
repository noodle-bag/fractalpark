import { describe, expect, it } from 'vitest';

type Complex = [number, number];

interface SimulatedOrbitSnapshot {
  finalZ: Complex;
  zPrev: Complex;
  radius2: number;
  minRadius: number;
  maxRadius: number;
}

function complexSqr([x, y]: Complex): Complex {
  return [x * x - y * y, 2 * x * y];
}

function complexAdd([ax, ay]: Complex, [bx, by]: Complex): Complex {
  return [ax + bx, ay + by];
}

function radius2([x, y]: Complex): number {
  return x * x + y * y;
}

function simulateEscapeOrbit(c: Complex, maxIterations: number, bailoutRadius2: number): SimulatedOrbitSnapshot {
  let z: Complex = [0, 0];
  let zPrev: Complex = [0, 0];
  let min = radius2(z);
  let max = radius2(z);

  for (let i = 0; i < maxIterations; i++) {
    const zz = radius2(z);
    min = Math.min(min, zz);
    max = Math.max(max, zz);

    if (zz > bailoutRadius2) {
      return {
        finalZ: z,
        zPrev,
        radius2: zz,
        minRadius: min,
        maxRadius: max,
      };
    }

    const nextZ = complexAdd(complexSqr(z), c);
    zPrev = z;
    z = nextZ;
  }

  return {
    finalZ: z,
    zPrev,
    radius2: radius2(z),
    minRadius: min,
    maxRadius: max,
  };
}

describe('Orbit channel runtime invariants', () => {
  it('tracks zPrev / minRadius / maxRadius with the same snapshot semantics as framework.frag.glsl', () => {
    const snapshot = simulateEscapeOrbit([2, 0], 16, 4);

    expect(snapshot.finalZ).toEqual([6, 0]);
    expect(snapshot.zPrev).toEqual([2, 0]);
    expect(snapshot.radius2).toBe(36);
    expect(snapshot.minRadius).toBe(0);
    expect(snapshot.maxRadius).toBe(36);
  });

  it('preserves basic orbit-channel invariants for non-escaping points', () => {
    const snapshot = simulateEscapeOrbit([0, 0], 8, 4);

    expect(snapshot.finalZ).toEqual([0, 0]);
    expect(snapshot.zPrev).toEqual([0, 0]);
    expect(snapshot.minRadius).toBeLessThanOrEqual(snapshot.maxRadius);
    expect(snapshot.radius2).toBeGreaterThanOrEqual(snapshot.minRadius);
    expect(snapshot.radius2).toBeLessThanOrEqual(snapshot.maxRadius);
  });
});
