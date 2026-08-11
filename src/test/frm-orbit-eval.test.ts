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

describe('c cross-iteration mutation (Slice 5c)', () => {
  it('j1 shape: c evolves per iteration (c = c + p2), orbit matches hand math', () => {
    // p1 = p2 = 0 (defaults): init z=pixel, c=p1=0; loop z=sqr(z)+c then
    // c=c+p2=0 — c stays 0, so z follows the pure quadratic from the pixel.
    const src = 'J1Probe {\n  z = pixel, c = p1:\n  z = sqr(z) + c,\n  c = c + p2,\n  |z| <= 4\n}';
    const r = compileClassicFrmEntry(src, 'J1Probe', 'j1-orbit', 2);
    expect(r.success).toBe(true);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.3, im: 0.1 },
      maxIterations: 3,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    // z0 = 0.3+0.1i; iter1: z = z0² + 0 = (0.09-0.01) + 0.06i = 0.08+0.06i
    expect(orbit.orbit[0].re).toBeCloseTo(0.08, 10);
    expect(orbit.orbit[0].im).toBeCloseTo(0.06, 10);
    // iter2: (0.08+0.06i)² = (0.0064-0.0036) + 0.0096i = 0.0028+0.0096i
    expect(orbit.orbit[1].re).toBeCloseTo(0.0028, 10);
    expect(orbit.orbit[1].im).toBeCloseTo(0.0096, 10);
  });

  it('c mutation actually compounds when p2 is nonzero', () => {
    const src = 'J1Probe {\n  z = pixel, c = p1:\n  z = sqr(z) + c,\n  c = c + p2,\n  |z| <= 4\n}';
    const r = compileClassicFrmEntry(src, 'J1Probe', 'j1-p2', 2);
    expect(r.success).toBe(true);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.3, im: 0.1 },
      maxIterations: 3,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
      params: { p2: { re: 0.5, im: 0 } },
    });
    // c0=0; iter1: z=0.08+0.06i (c=0), then c=0.5; iter2: z=(0.08+0.06i)²+0.5
    expect(orbit.orbit[1].re).toBeCloseTo(0.5028, 10);
    expect(orbit.orbit[1].im).toBeCloseTo(0.0096, 10);
  });
});

describe('Slice 5c review fixes', () => {
  it('C2 threshold through a renamed c rebind (seed transparency)', () => {
    // c=p1 init + |z|<c bailout: the synthetic seed must not count against
    // the exactly-once init-binding rule — the threshold resolves to p1.
    const src = 'C2C {\n  c = p1, z = 0:\n  z = sqr(z) + c,\n  |z| < c\n}';
    const r = compileClassicFrmEntry(src, 'C2C', 'c2c-seed', 2);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor?.kind).toBe('C2');
  });

  it('a lone `t = pixel` init binding still binds (not mistaken for a seed)', () => {
    const src = 'LoneSeed {\n  t = pixel, z = 0:\n  z = sqr(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(src, 'LoneSeed', 'lone-seed', 2);
    expect(r.success).toBe(true);
  });

  it('julia mode: c is the Julia constant, not the pixel', () => {
    // Loop-only c mutation (no init rebind): the seed cclassic = c is live,
    // so in Julia mode iter1 z = pixel² + juliaC.
    const src = 'J1Julia {\n  z = pixel:\n  z = sqr(z) + c,\n  c = c + p2,\n  |z| <= 4\n}';
    const r = compileClassicFrmEntry(src, 'J1Julia', 'j1-julia', 2);
    expect(r.success).toBe(true);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.3, im: 0.1 },
      juliaC: { re: -0.8, im: 0.156 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    // iter1: z = (0.3+0.1i)² + (-0.8+0.156i) = 0.08+0.06i - 0.8+0.156i
    expect(orbit.orbit[0].re).toBeCloseTo(-0.72, 10);
    expect(orbit.orbit[0].im).toBeCloseTo(0.216, 10);
  });
});

describe('Slice 5c round-3 fix (provenance-gated seed transparency)', () => {
  it('a hand-written cclassic double-assign does NOT claim the seed marker', () => {
    // Codex round-3 reproduction: user code naming cclassic with two init
    // assignments keeps the strict exactly-once rule — the threshold stays
    // unbound and the entry honestly rejects.
    const src = 'UserCclassic {\n  cclassic = pixel, cclassic = p1, z = 0:\n  z = sqr(z) + c,\n  |z| < cclassic\n}';
    const r = compileClassicFrmEntry(src, 'UserCclassic', 'user-cclassic', 2);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/threshold-not-loop-invariant|unknown-predicate|Undeclared/);
  });

  it('the lowering seed itself carries the marker (C2C still compiles to C2)', () => {
    const src = 'C2C {\n  c = p1, z = 0:\n  z = sqr(z) + c,\n  |z| < c\n}';
    const r = compileClassicFrmEntry(src, 'C2C', 'c2c-marker', 2);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor?.kind).toBe('C2');
  });
});

describe('cotanh (Slice 5d)', () => {
  it('cotanh(z) = cosh(z)/sinh(z) — hand-checked orbit', () => {
    // z0 = 0; pixel (0.5, 0.25): iter1 z = cotanh(0) + c = guarded div by
    // sinh(0)=0 → divGuarded(1,0)... hand value: cosh(0)/sinh(0) guarded.
    // Use a nonzero start instead: z = pixel directly.
    const src = 'T {\n  z = pixel:\n  z = cotanh(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(src, 'T', 'cotanh-truth', 2);
    expect(r.success).toBe(true);
    const orbit = evaluateOrbit(r.ast!, {
      pixel: { re: 0.5, im: 0.25 },
      maxIterations: 2,
      descriptor: r.bailoutDescriptor!,
      plugin: r.plugin,
    });
    // iter1: cotanh(0.5+0.25i) = cosh(0.5+0.25i)/sinh(0.5+0.25i) + (0.5+0.25i)
    const sh = [Math.sinh(0.5) * Math.cos(0.25), Math.cosh(0.5) * Math.sin(0.25)];
    const ch = [Math.cosh(0.5) * Math.cos(0.25), Math.sinh(0.5) * Math.sin(0.25)];
    const d = sh[0] * sh[0] + sh[1] * sh[1];
    const q = [(ch[0] * sh[0] + ch[1] * sh[1]) / d, (ch[1] * sh[0] - ch[0] * sh[1]) / d];
    expect(orbit.orbit[0].re).toBeCloseTo(q[0] + 0.5, 10);
    expect(orbit.orbit[0].im).toBeCloseTo(q[1] + 0.25, 10);
  });

  it('function=cotanh bracket resolves to u_fn default 19', () => {
    const src = 'T[function=cotanh] {\n  z = pixel:\n  z = fn1(z) + c,\n  |z| < 4\n}';
    const r = compileClassicFrmEntry(src, 'T', 'cotanh-bracket', 2);
    expect(r.success).toBe(true);
    const u = r.plugin!.uniforms.find((x) => x.name === 'u_fn1');
    expect(u?.default).toBe(19);
  });
});
