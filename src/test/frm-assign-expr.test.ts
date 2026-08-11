/**
 * Assignment expressions, boolean arithmetic, implicit multiplication,
 * and component lvalues (v0.4.18 Slice 6b2).
 *
 * Clean-room fixtures only — every source is project-authored and every
 * golden is hand-computed in this file's comments. The dialect truth being
 * pinned: both operands of `*`/`+` always evaluate left-to-right (the
 * guarded-assignment idiom's writes are NOT conditional), an assignment
 * expression yields the stored value, and the sequencing pass makes CPU
 * and GPU agree by construction (GLSL operand order is unspecified).
 *
 * Also pins the 6b2 honesty gate: parse errors are fatal (recovered
 * fragment ASTs previously compiled into silently-wrong shaders while
 * `success` stayed true).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileClassicFrmEntry } from '../engine/frm/compile';
import { evaluateOrbit, type OrbitOptions } from '../engine/frm/orbit-eval';
import { frmParserCache } from '../engine/frm/cache';
import { tokenize } from '../engine/frm/lexer';

beforeEach(() => frmParserCache.clear());

function compileNamed(source: string, name: string) {
  return compileClassicFrmEntry(source, name, '6b2-fixture', 2);
}

function orbitFor(
  source: string,
  name: string,
  pixel: [number, number],
  extra?: Partial<OrbitOptions>,
) {
  const r = compileNamed(source, name);
  expect(r.success).toBe(true);
  expect(r.ast).toBeDefined();
  expect(r.bailoutDescriptor).toBeDefined();
  expect(r.parseErrors ?? []).toHaveLength(0);
  return evaluateOrbit(r.ast!, {
    pixel: { re: pixel[0], im: pixel[1] },
    maxIterations: 12,
    descriptor: r.bailoutDescriptor!,
    ...extra,
  });
}

describe('assignment expressions: sequencing and truth', () => {
  it('lifts guarded assignments into left-to-right statements with frozen temps', () => {
    const r = compileNamed(
      'SeqGLSL {\n  z=p1,x=1:\n  (z=fn1(z)+pixel)*(x<10)+(z=fn2(z)+pixel)*(10<=x)\n  x=x+1\n  |z|<=p2\n}',
      'SeqGLSL',
    );
    expect(r.success).toBe(true);
    const glsl = (r.plugin as unknown as { iterateGlsl?: string; glsl?: string });
    const body = glsl.iterateGlsl ?? glsl.glsl ?? '';
    // Target-first sequencing: store first, then freeze the stored value.
    const i1 = body.indexOf('z = (applyFn1(z) + pixel);');
    const i2 = body.indexOf('frmseq1 = z;');
    const i3 = body.indexOf('z = (applyFn2(z) + pixel);');
    const i4 = body.indexOf('frmseq2 = z;');
    // Full left-to-right order: both writes always execute, the second
    // reads the first's result — the guards never gate the writes.
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
    // Boolean guards materialize as real 0/1 in the residual expression.
    expect(body).toContain('? 1.0 : 0.0');
  });

  it('evaluation order changes the orbit (guard-first vs guard-last)', () => {
    // A-shape: z := conj(sqr(z) + pixel) + pixel each round.
    // pixel (0.25, 0.1), z0 = (0.25, 0.1):
    //   sqr = (0.0525, 0.05) → +pixel (0.3025, 0.15) → conj (0.3025, -0.15)
    //   → +pixel = z1 (0.5525, -0.05); round 2 → z2 (0.80275625, 0.05525).
    const a = orbitFor(
      'OrderA {\n  z=pixel:\n  (z<0)*(z=sqr(z)+pixel)\n  (0<=z)*(z=conj(z)+pixel)\n  |z|<=100\n}',
      'OrderA',
      [0.25, 0.1],
    );
    // B-shape swaps the WRITE order (not just the guard position):
    // z := sqr(conj(z) + pixel) + pixel — z1 = (0.5, 0.1).
    const b = orbitFor(
      'OrderB {\n  z=pixel:\n  (z=conj(z)+pixel)*(0<=z)\n  (z=sqr(z)+pixel)*(z<0)\n  |z|<=100\n}',
      'OrderB',
      [0.25, 0.1],
    );
    expect(a.orbit[0].re).toBeCloseTo(0.5525, 9);
    expect(a.orbit[0].im).toBeCloseTo(-0.05, 9);
    expect(a.orbit[1].re).toBeCloseTo(0.80275625, 9);
    expect(a.orbit[1].im).toBeCloseTo(0.05525, 9);
    expect(b.orbit[0].re).toBeCloseTo(0.5, 9);
    expect(b.orbit[0].im).toBeCloseTo(0.1, 9);
    // Sanity: the two orders genuinely diverge.
    expect(a.orbit[0].re).not.toBeCloseTo(b.orbit[0].re, 6);
  });

  it('an assignment expression yields the stored value', () => {
    // z0 = pixel = (0.25, 0.1); z^2+pixel = (0.3025, 0.15); w = 2x value;
    // z := w → z1 = (0.605, 0.3).
    const r = orbitFor(
      'YieldVal {\n  z=pixel:\n  w=(z=z^2+pixel)*2\n  z=w\n  |z|<=100\n}',
      'YieldVal',
      [0.25, 0.1],
    );
    expect(r.orbit[0].re).toBeCloseTo(0.605, 9);
    expect(r.orbit[0].im).toBeCloseTo(0.3, 9);
  });

  it('yields the TARGET-TYPED stored value, not the raw RHS (flip(z=1))', () => {
    // z is complex (init z=pixel), so (z=1) stores (1,0) and the
    // expression must yield complex (1,0): flip((1,0)) = (0,1). A raw-RHS
    // freeze would type the temp real and flip(1.0) would be the identity
    // (Codex 6b2 round-1 reproducer).
    const r = orbitFor(
      'TargetTyped {\n  z=pixel:\n  w=flip(z=1)\n  z=w\n  |z|<=100\n}',
      'TargetTyped',
      [0.25, 0.1],
    );
    expect(r.orbit[0].re).toBeCloseTo(0, 9);
    expect(r.orbit[0].im).toBeCloseTo(1, 9);
    // imag reads the stored complex value's .y: imag(z=1) = 0.
    const im = orbitFor(
      'TargetTypedImag {\n  z=pixel:\n  w=imag(z=1)\n  z=w\n  |z|<=100\n}',
      'TargetTypedImag',
      [0.25, 0.1],
    );
    expect(im.orbit[0].re).toBeCloseTo(0, 9);
    expect(im.orbit[0].im).toBeCloseTo(0, 9);
  });

  it('sequences an assignment inside an if condition before the branch', () => {
    // z0 = (0.25, 0.1); condition assigns z := z+pixel = (0.5, 0.2) (truthy
    // .x), then z := z*z = (0.21, 0.2).
    const r = orbitFor(
      'IfCond {\n  z=pixel:\n  if (z=z+pixel)\n  z=z*z\n  endif\n  |z|<=100\n}',
      'IfCond',
      [0.25, 0.1],
    );
    expect(r.orbit[0].re).toBeCloseTo(0.21, 9);
    expect(r.orbit[0].im).toBeCloseTo(0.2, 9);
  });
});

describe('implicit multiplication (classic `3z` form)', () => {
  it('parses number-adjacent identifiers as multiplication with identical orbits', () => {
    const implicit = orbitFor(
      'ImpMult {\n  z=pixel:\n  z=(z^2+3z+pixel)/(z^2-3z-pixel)\n  |z|<=100\n}',
      'ImpMult',
      [0.3, -0.2],
    );
    const explicit = orbitFor(
      'ExpMult {\n  z=pixel:\n  z=(z^2+3*z+pixel)/(z^2-3*z-pixel)\n  |z|<=100\n}',
      'ExpMult',
      [0.3, -0.2],
    );
    expect(implicit.orbit.length).toBeGreaterThan(0);
    expect(implicit.orbit.length).toBe(explicit.orbit.length);
    implicit.orbit.forEach((p, i) => {
      expect(p.re).toBeCloseTo(explicit.orbit[i].re, 9);
      expect(p.im).toBeCloseTo(explicit.orbit[i].im, 9);
    });
  });

  it('never multiplies across a whitespace boundary', () => {
    // `3 z` (space) is not adjacency: the lexer must not invent a STAR
    // (the parser drops NEWLINEs, so only raw-source adjacency is safe).
    const spaced = tokenize('z=z^2+3 z');
    expect(spaced.tokens.some((t) => t.type === 'STAR')).toBe(false);
    const tight = tokenize('z=z^2+3z');
    expect(tight.tokens.some((t) => t.type === 'STAR')).toBe(true);
    // And the spaced form must not silently compile either: the trailing
    // bare `z` is a no-effect statement, which is a loud parse error.
    const r = compileNamed('Spaced {\n  z=pixel:\n  z=z^2+3 z\n  |z|<=4\n}', 'Spaced');
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('no effect');
  });

  it('reads scientific notation as one number (1e-12, not 1*e-12)', () => {
    const toks = tokenize('z=1e-12');
    expect(toks.tokens.map((t) => `${t.type}:${t.value}`)).toEqual([
      'IDENT:z',
      'EQUALS:=',
      'NUMBER:1e-12',
      'EOF:',
    ]);
    // Orbit value check: z1 = pixel*1e-12 + pixel ≈ pixel (a corrupted
    // `1*e-12` reading would land near -9.28 and escape instantly).
    const r = orbitFor(
      'SciNot {\n  z=pixel:\n  z=z*1e-12+pixel\n  |z|<=100\n}',
      'SciNot',
      [0.25, 0.1],
    );
    expect(r.orbit[0].re).toBeCloseTo(0.25, 9);
    expect(r.orbit[0].im).toBeCloseTo(0.1, 9);
    // `2e` keeps the Euler reading via implicit multiplication.
    const euler = orbitFor('Euler {\n  z=pixel:\n  z=2e\n  |z|<=100\n}', 'Euler', [0.25, 0.1]);
    expect(euler.orbit[0].re).toBeCloseTo(2 * Math.E, 6);
    expect(euler.orbit[0].im).toBeCloseTo(0, 9);
  });
});

describe('component lvalues', () => {
  it('real()/imag() stores run sequentially and later reads see the update', () => {
    // pixel (0.3, -0.2); tmp = z^2 = (0.05, -0.12);
    // real(tmp) := 0.05*0.3 - (-0.12)(-0.2) = -0.009  → tmp (-0.009, -0.12)
    // imag(tmp) := (-0.009)(-0.2) - (-0.12)(0.3) = 0.0378 (reads the NEW
    // real lane — the classic sequential truth)  → z1 = (-0.009, 0.0378).
    const r = orbitFor(
      'CompStore {\n  z=pixel, c=pixel:\n  tmp=z*z\n  real(tmp)=real(tmp)*real(c)-imag(tmp)*imag(c)\n  imag(tmp)=real(tmp)*imag(c)-imag(tmp)*real(c)\n  z=tmp\n  |z|<=100\n}',
      'CompStore',
      [0.3, -0.2],
    );
    expect(r.orbit[0].re).toBeCloseTo(-0.009, 9);
    expect(r.orbit[0].im).toBeCloseTo(0.0378, 9);
  });
});

describe('honesty gates', () => {
  it('parse errors are fatal — recovered fragments never compile', () => {
    const r = compileNamed('Broken {\n  z=pixel:\n  z=(z^2+pixel\n  |z|<=4\n}', 'Broken');
    expect(r.success).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects assignments inside && / || right operands', () => {
    const r = compileNamed(
      'GuardSC {\n  z=pixel:\n  x=(1<2)&&(z=5)\n  |z|<=4\n}',
      'GuardSC',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('short-circuit');
  });

  it('rejects assignments inside the bailout predicate', () => {
    const r = compileNamed(
      'GuardBail {\n  z=pixel:\n  z=z^2+pixel\n  |(z=z+1)|<=4\n}',
      'GuardBail',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('bailout');
  });

  it('rejects component lvalues in expression position', () => {
    // The parser only accepts component stores at statement level, so this
    // fails loudly at parse time — never silently shredded.
    const r = compileNamed(
      'GuardComp {\n  z=pixel:\n  tmp=z\n  w=(real(tmp)=5)*2\n  |z|<=4\n}',
      'GuardComp',
    );
    expect(r.success).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects system-variable assignments in expression position', () => {
    const r = compileNamed(
      'GuardSys {\n  z=pixel:\n  w=(pixel=3)*2\n  |z|<=4\n}',
      'GuardSys',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('system variable');
  });
});
