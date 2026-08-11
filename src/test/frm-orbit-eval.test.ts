/**
 * Orbit evaluator anchors (v0.4.18 Slice 4 — 轨道 fixtures mechanism).
 *
 * Every golden here is project-authored and hand-verifiable; they pin the
 * evaluator against the production AST + descriptor (never the source
 * text), and document the dialect choices (squared magnitude, polar
 * complexPow, componentwise abs, after-step timing).
 */

import { describe, it, expect } from 'vitest';
import { compileFrmDetailed, compileClassicFrmEntry } from '../engine/frm/compile';
import { evaluateOrbit, type OrbitOptions } from '../engine/frm/orbit-eval';
import { frmParserCache } from '../engine/frm/cache';
import { beforeEach } from 'vitest';

beforeEach(() => frmParserCache.clear());

function orbitFor(
  source: string,
  pixel: [number, number],
  extra?: Partial<OrbitOptions>,
) {
  const r = compileFrmDetailed(source, 'orbit-fixture', 2);
  expect(r.success).toBe(true);
  expect(r.ast).toBeDefined();
  expect(r.bailoutDescriptor).toBeDefined();
  return evaluateOrbit(r.ast!, {
    pixel: { re: pixel[0], im: pixel[1] },
    maxIterations: 12,
    descriptor: r.bailoutDescriptor!,
    ...extra,
  });
}

describe('orbit evaluator anchors (hand-verified)', () => {
  it('z=z^2+c at pixel (2,0): escapes at iteration 2 (after-step timing)', () => {
    // z1 = 0^2 + 2 = 2; descriptor |z| < 4 → 2² ≥ 4² is false →
    // predicate 4 < 16 holds... wait: |z|=2 < 4 holds → continue.
    // z2 = 2^2+2 = 6 → |z|=6 ≥ 4 → escape at n=2.
    const r = orbitFor('T {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}', [2, 0]);
    expect(r.escapedAt).toBe(2);
    expect(r.orbit[0]).toEqual({ re: 2, im: 0 });
    expect(r.orbit[1].re).toBeCloseTo(6, 12);
  });

  it('z=z^2+c at pixel (0.25,0) converges toward the 0.5 fixed point', () => {
    const r = orbitFor('T {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}', [0.25, 0]);
    expect(r.escapedAt).toBeNull();
    const last = r.orbit[r.orbit.length - 1];
    // Fixed point (1 - sqrt(1 - 4c)) / 2 = 0.5 for c = 0.25.
    expect(last.re).toBeGreaterThan(0.3);
    expect(last.re).toBeLessThan(0.5);
    expect(last.im).toBe(0);
  });

  it('v2 descriptor radius is the TRUE radius (no v1 compression): |z|<4 keeps |z|=3 alive', () => {
    // z constant at 3: |z|=3 < 4 → never escapes under v2; under the v1
    // compressed reading (radius 2) it would escape immediately.
    const r = orbitFor('T {\ninit:\n  z = 3\nloop:\n  z = z\nbailout:\n  |z| < 4\n}', [0, 0]);
    expect(r.escapedAt).toBeNull();
  });

  it('componentwise abs drives the burning-ship shape', () => {
    // z = sqr(abs(z)) + c at pixel (0.5, 0.5): z1 = sqr(abs(0)) + c =
    // 0.5+0.5i; z2 = sqr(0.5+0.5i)+c = (0+0.5i)+c = 0.5+1i.
    const r = orbitFor(
      'T {\ninit:\n  z = 0\nloop:\n  z = sqr(abs(z)) + c\nbailout:\n  |z| < 4\n}',
      [0.5, 0.5],
    );
    expect(r.orbit[0]).toEqual({ re: 0.5, im: 0.5 });
    expect(r.orbit[1].re).toBeCloseTo(0.5, 12);
    expect(r.orbit[1].im).toBeCloseTo(1.0, 12);
  });

  it('fn slot defaults execute via the plugin uniforms (no caller mapping)', () => {
    const source = 'FnOrbit[function=sqr] {\n  z = 0:\n  z = fn1(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(source, 'FnOrbit', 'fn-orbit-fixture', 2);
    expect(r.success).toBe(true);
    const uFn1 = r.plugin?.uniforms.find((u) => u.name === 'u_fn1');
    expect(uFn1?.default).toBe(8); // sqr
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 2, im: 0 },
      maxIterations: 4,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    expect(result.orbit[0]).toEqual({ re: 2, im: 0 });
    expect(result.orbit[1].re).toBeCloseTo(6, 12);
    expect(result.escapedAt).toBe(2);
  });

  it('init-bound threshold substitution: |z| <= t with t = p1 + 4 uses the param default', () => {
    // p1 defaults to 0 → t = 4 → same escape shape as |z| <= 4.
    const r = orbitFor('T {\ninit:\n  t = p1 + 4\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}', [2, 0]);
    expect(r.escapedAt).toBe(2);
  });

  it('if/elseif/else branches execute in orbit order (elseif exercised)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 0\nloop:\n  if real(z) > 1\n    z = 0\n  elseif real(z) < 0\n    z = 2\n  else\n    z = z + c\n  endif\nbailout:\n  |z| < 4\n}',
      'orbit-if',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0.75, im: 0 },
      maxIterations: 8,
      descriptor: r.bailoutDescriptor!,
    });
    // 0.75 → 1.5 → (real>1 → 0) → 0.75 → 1.5 → 0 …
    expect(result.orbit[0].re).toBeCloseTo(0.75, 12);
    expect(result.orbit[1].re).toBeCloseTo(1.5, 12);
    expect(result.orbit[2].re).toBeCloseTo(0, 12);
    expect(result.escapedAt).toBeNull();
    const neg = evaluateOrbit(r.ast!, {
      pixel: { re: -0.25, im: 0 },
      maxIterations: 4,
      descriptor: r.bailoutDescriptor!,
    });
    // z=0 → else: z=-0.25 → elseif (real<0): z=2 → if (real>1): z=0 → else: -0.25
    expect(neg.orbit[0].re).toBeCloseTo(-0.25, 12);
    expect(neg.orbit[1].re).toBeCloseTo(2, 12);
    expect(neg.orbit[2].re).toBeCloseTo(0, 12);
    expect(neg.orbit[3].re).toBeCloseTo(-0.25, 12);
  });
});

describe('Codex round-1 regressions (static typing & builtin fidelity)', () => {
  it('z is statically complex: z=0; z=sqrt(z-1) yields i, not NaN', () => {
    const r = orbitFor('T {\ninit:\n  z = 0\nloop:\n  z = sqrt(z-1)\nbailout:\n  |z| < 4\n}', [0, 0]);
    expect(Number.isNaN(r.orbit[0].re)).toBe(false);
    expect(r.orbit[0].re).toBeCloseTo(0, 12);
    expect(r.orbit[0].im).toBeCloseTo(1, 12);
  });

  it('real recip(0) returns 0 (frmRecip guard), not Infinity', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 0\nloop:\n  z = recip(real(z)) + c\nbailout:\n  |z| < 4\n}',
      'orbit-recip',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0 },
      maxIterations: 3,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(0.5, 12);
  });

  it('one-arg atan2 on a static real is atan, not atan2(0, x)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 0\nloop:\n  z = atan2(real(z) - 1)\nbailout:\n  |z| < 4\n}',
      'orbit-atan2',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(Math.atan(-1), 12);
  });

  it('sqr feeds the LastSqr side channel (even discarded)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 0\nloop:\n  sqr(z)\n  z = LastSqr + c\nbailout:\n  |z| < 4\n}',
      'orbit-lastsqr',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0 },
      maxIterations: 4,
      descriptor: r.bailoutDescriptor!,
    });
    // n1: sqr(0) → LastSqr=0 → z=0.5; n2: sqr(0.5) → 0.25 → z=0.75;
    // n3: sqr(0.75)=0.5625 → z=1.0625
    expect(result.orbit[0].re).toBeCloseTo(0.5, 12);
    expect(result.orbit[1].re).toBeCloseTo(0.75, 12);
    expect(result.orbit[2].re).toBeCloseTo(1.0625, 12);
  });

  it('zPrev lags one body run (0 on the first)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 1\n  w = 0\nloop:\n  w = zPrev\n  z = z + c\nbailout:\n  |z| < 4\n}',
      'orbit-zprev',
      2,
    );
    expect(r.success).toBe(true);
    const r2 = evaluateOrbit(r.ast!, {
      pixel: { re: 10, im: 0 },
      maxIterations: 3,
      descriptor: r.bailoutDescriptor!,
    });
    // body1: zPrev=0 → w=0; z=11 → |z|≥4 escapes immediately.
    expect(r2.orbit[0].re).toBeCloseTo(11, 12);
    expect(r2.escapedAt).toBe(1);
    // w observed indirectly: re-run with w copied into z to expose it.
    const exposed = compileFrmDetailed(
      'T {\ninit:\n  z = 1\n  w = 0\nloop:\n  w = zPrev\n  z = w + c\nbailout:\n  |z| < 100\n}',
      'orbit-zprev2',
      2,
    );
    const r3 = evaluateOrbit(exposed.ast!, {
      pixel: { re: 5, im: 0 },
      maxIterations: 4,
      descriptor: exposed.bailoutDescriptor!,
    });
    // body1: w=zPrev=0 → z=0+5=5; body2: w=1 → z=6; body3: w=5 → z=10; body4: w=6 → z=11
    expect(r3.orbit.map((z) => Math.round(z.re))).toEqual([5, 6, 10, 11]);
  });
});

describe('Codex round-2 regressions', () => {
  it('complex / real division is unguarded (non-finite on zero divisor, like the GPU)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 1\nloop:\n  z = z / real(z - z)\nbailout:\n  |z| < 4\n}',
      'orbit-div',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
    });
    expect(Number.isFinite(result.orbit[0].re)).toBe(false);
    expect(result.escapedAt).toBe(1);
  });

  it('complex / complex keeps the complexDiv guard (0 on zero divisor)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 1\nloop:\n  z = z / (z - z)\nbailout:\n  |z| < 4\n}',
      'orbit-div2',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBe(0);
    expect(result.escapedAt).toBeNull();
  });

  it('&& short-circuits: a skipped sqr never feeds LastSqr', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 1\n  w = 0\nloop:\n  w = 0 && sqr(z)\n  z = LastSqr + c\nbailout:\n  |z| < 4\n}',
      'orbit-shortcircuit',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0 },
      maxIterations: 3,
      descriptor: r.bailoutDescriptor!,
    });
    // sqr(z) never evaluates → LastSqr stays 0 → z = c every iteration.
    expect(result.orbit[0].re).toBeCloseTo(0.5, 12);
    expect(result.orbit[1].re).toBeCloseTo(0.5, 12);
  });
});

describe('Codex round-3 regressions', () => {
  it('tan evaluates its argument once (side-channel-safe)', () => {
    // Codex repro: z=2; z = tan(LastSqr + sqr(z)) — the argument evaluates
    // once: LastSqr(0)+sqr(2)=4 → tan(4) ≈ 1.1578. A double evaluation
    // would observe LastSqr=4 in the cosine pass and return tan(8) math.
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 2\nloop:\n  z = tan(LastSqr + sqr(z))\nbailout:\n  |z| < 4\n}',
      'orbit-tan',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(Math.tan(4), 10);
    expect(result.orbit[0].im).toBeCloseTo(0, 10);
  });

  it('tanh also evaluates its argument once', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 2\nloop:\n  z = tanh(LastSqr + sqr(z))\nbailout:\n  |z| < 4\n}',
      'orbit-tanh',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(Math.tanh(4), 10);
  });
});

describe('Codex round-4 regressions', () => {
  it('abs evaluates its argument once (side-channel-safe)', () => {
    // z=2: abs(LastSqr + sqr(z)) single-eval → 4 and LastSqr stays 4;
    // a second evaluation would observe LastSqr=4 and leave it at 8.
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 2\nloop:\n  w = abs(LastSqr + sqr(z))\n  z = LastSqr\nbailout:\n  |z| < 4\n}',
      'orbit-abs-sc',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 1,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(4, 12);
  });

  it('conj evaluates its argument once (side-channel-safe)', () => {
    const r = compileFrmDetailed(
      'T {\ninit:\n  z = 2\nloop:\n  w = conj(LastSqr + sqr(z))\n  z = LastSqr\nbailout:\n  |z| < 4\n}',
      'orbit-conj-sc',
      2,
    );
    expect(r.success).toBe(true);
    const result = evaluateOrbit(r.ast!, {
      pixel: { re: 0, im: 0 },
      maxIterations: 1,
      descriptor: r.bailoutDescriptor!,
    });
    expect(result.orbit[0].re).toBeCloseTo(4, 12);
  });
});

describe('cosxx truth (Slice 5)', () => {
  it('cosxx(z) = cos(x)cosh(y) + i·sin(x)sinh(y) — the plus-sign bug', () => {
    // fractint.hlp: cosxx duplicates the pre-v16 cos() bug. For z0 = 0,
    // pixel (0.5, 0.25): iter1 z = cosxx(0) + c = (1,0) + c = (1.5, 0.25).
    const src = 'T {\n  z = 0:\n  z = cosxx(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(src, 'T', 'cosxx-truth', 2);
    expect(r.success).toBe(true);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0.25 },
      maxIterations: 4,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    const z1 = orbit.orbit[0];
    expect(z1.re).toBeCloseTo(1.5, 10);
    expect(z1.im).toBeCloseTo(0.25, 10);
    // iter2: cosxx(1.5 + 0.25i) = cos(1.5)cosh(0.25) + i·sin(1.5)sinh(0.25) + c
    const z2 = orbit.orbit[1];
    const re2 = Math.cos(1.5) * Math.cosh(0.25) + 0.5;
    const im2 = Math.sin(1.5) * Math.sinh(0.25) + 0.25; // PLUS — the bug
    expect(z2.re).toBeCloseTo(re2, 10);
    expect(z2.im).toBeCloseTo(im2, 10);
    // and it must differ from correct cos (minus sign) — guards against
    // someone "fixing" the bug away.
    expect(z2.im).not.toBeCloseTo(-Math.sin(1.5) * Math.sinh(0.25) + 0.25, 6);
  });

  it('function=cosxx bracket resolves to u_fn default 18', () => {
    const src =
      'T[function=cosxx] {\n  z = 0:\n  z = fn1(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(src, 'T', 'cosxx-bracket', 2);
    expect(r.success).toBe(true);
    const u = r.plugin!.uniforms.find((x) => x.name === 'u_fn1');
    expect(u?.default).toBe(18);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0.25 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    expect(orbit.orbit[0].re).toBeCloseTo(1.5, 10);
  });
});
