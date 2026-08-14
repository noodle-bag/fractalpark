/**
 * T2 threshold idioms (v0.4.18 Slice 6b3): boolean-arithmetic thresholds,
 * init if/else threshold bindings, and branch-uniform final |z| aliases.
 *
 * Clean-room fixtures only — every source is project-authored. The oracle
 * strategy is A/B equivalence: each new-idiom formula must produce the
 * EXACT same orbit as the same loop with the equivalent literal threshold
 * (whose C1 semantics are pinned by the existing suite), plus the expected
 * descriptor shape. Negative cases pin the honesty gates (orbit-state
 * conditions, missing else, imag() thresholds stay rejected).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileClassicFrmEntry } from '../engine/frm/compile';
import {
  evaluateOrbit,
  evalDescriptorThreshold,
  type OrbitOptions,
} from '../engine/frm/orbit-eval';
import { frmParserCache } from '../engine/frm/cache';

beforeEach(() => frmParserCache.clear());

function compileNamed(source: string, name: string) {
  return compileClassicFrmEntry(source, name, '6b3-fixture', 2);
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
  return evaluateOrbit(r.ast!, {
    pixel: { re: pixel[0], im: pixel[1] },
    maxIterations: 12,
    descriptor: r.bailoutDescriptor!,
    ...extra,
  });
}

const LITERAL_4 =
  'LiteralThr {\n  z=pixel:\n  z=z*z+pixel\n  |z| < 4\n}';
const LITERAL_4_LE =
  'LiteralThrLe {\n  z=pixel:\n  z=z*z+pixel\n  |z| <= 4\n}';
const LITERAL_3 =
  'LiteralThr3 {\n  z=pixel:\n  z=z*z+pixel\n  |z| <= 3\n}';

const PIXELS: Array<[number, number]> = [
  [0.25, 0.1],
  [-0.5, 0.3],
  [1.1, -0.4],
];

describe('boolean-arithmetic thresholds (test=(4*(p2<=0))+... idiom)', () => {
  const BOOL_THR =
    'BoolThr {\n  test=(4*(p2<=0))+(p2*(0<p2)), z=pixel:\n  z=z*z+pixel\n  |z| < test\n}';

  it('compiles to a C2 descriptor over p2', () => {
    const r = compileNamed(BOOL_THR, 'BoolThr');
    expect(r.success).toBe(true);
    const d = r.bailoutDescriptor!;
    expect(d.kind).toBe('C2');
    if (d.kind === 'C2') expect(d.params).toEqual(['p2']);
    // Default params (p2 = 0): (0<=0)*4 + 0*(0<0) = 4.
    expect(evalDescriptorThreshold(r.bailoutDescriptor!)).toBe(4);
    // p2 = 3: (3<=0)*4 + 3*(0<3) = 3.
    expect(
      evalDescriptorThreshold(r.bailoutDescriptor!, { p2: { re: 3, im: 0 } }),
    ).toBe(3);
  });

  it('orbits equal the literal-4 threshold under default params', () => {
    for (const px of PIXELS) {
      const viaIdiom = orbitFor(BOOL_THR, 'BoolThr', px);
      const viaLiteral = orbitFor(LITERAL_4, 'LiteralThr', px);
      expect(viaIdiom.escapedAt).toBe(viaLiteral.escapedAt);
      expect(viaIdiom.orbit).toEqual(viaLiteral.orbit);
    }
  });

  it('honours a live p2 value (threshold 3 tracks the literal-3 orbit)', () => {
    const p2 = { p2: { re: 3, im: 0 } };
    for (const px of PIXELS) {
      const viaIdiom = orbitFor(BOOL_THR, 'BoolThr', px, { params: p2 });
      const viaLiteral = orbitFor(LITERAL_3, 'LiteralThr3', px);
      expect(viaIdiom.escapedAt).toBe(viaLiteral.escapedAt);
      expect(viaIdiom.orbit).toEqual(viaLiteral.orbit);
    }
  });
});

describe('init if/else threshold bindings (test if-else idiom)', () => {
  const IFELSE_THR =
    'IfElseThr {\n  if(real(p2)<=0)\n    test=4\n  else\n    test=real(p2)\n  endif\n  z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}';

  it('compiles to C2 and evaluates the selected branch', () => {
    const r = compileNamed(IFELSE_THR, 'IfElseThr');
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor!.kind).toBe('C2');
    expect(evalDescriptorThreshold(r.bailoutDescriptor!)).toBe(4);
    expect(
      evalDescriptorThreshold(r.bailoutDescriptor!, { p2: { re: 2.5, im: 0 } }),
    ).toBe(2.5);
  });

  it('orbits equal the literal-4 (<=) threshold under default params', () => {
    for (const px of PIXELS) {
      const viaIdiom = orbitFor(IFELSE_THR, 'IfElseThr', px);
      const viaLiteral = orbitFor(LITERAL_4_LE, 'LiteralThrLe', px);
      expect(viaIdiom.escapedAt).toBe(viaLiteral.escapedAt);
      expect(viaIdiom.orbit).toEqual(viaLiteral.orbit);
    }
  });

  it('an if without else leaves the name unbound (honest reject)', () => {
    const r = compileNamed(
      'NoElse {\n  if(real(p2)<=0)\n    test=4\n  endif\n  z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}',
      'NoElse',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('a branch condition over orbit state stays rejected', () => {
    const r = compileNamed(
      'OrbitCond {\n  if(real(z)<=0)\n    test=4\n  else\n    test=real(p2)\n  endif\n  z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}',
      'OrbitCond',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('imag() in a threshold stays outside the scalar contract', () => {
    const r = compileNamed(
      'ImagThr {\n  z=pixel:\n  z=z*z+pixel\n  |z| <= imag(p2)+4\n}',
      'ImagThr',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('a bare-param condition is not synthesized (raw value would leak into the fold)', () => {
    // `if(p2)` uses truthiness (0/1) at runtime, but the synthesized
    // `p2*4 + (1-p2)*9` would evaluate the RAW param — p2=2 gives -1
    // instead of 4 (Codex 6b3 round-1 reproducer). Honest reject instead.
    const r = compileNamed(
      'BareCond {\n  if(p2)\n    test=4\n  else\n    test=9\n  endif\n  z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}',
      'BareCond',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('component stores never synthesize or seed whole-variable bindings', () => {
    // Branch form: `real(test)=4` writes one lane only.
    const branch = compileNamed(
      'LaneBranch {\n  if(real(p2)<=0)\n    real(test)=4\n  else\n    real(test)=9\n  endif\n  z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}',
      'LaneBranch',
    );
    expect(branch.success).toBe(false);
    expect(branch.errors.join('\n')).toContain('threshold-not-loop-invariant');
    // Top-level form: `real(test)=4` in init must not bind `test`.
    const topLevel = compileNamed(
      'LaneTop {\n  real(test)=4, z=pixel:\n  z=z*z+pixel\n  |z| <= test\n}',
      'LaneTop',
    );
    expect(topLevel.success).toBe(false);
    expect(topLevel.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });
});

describe('branch-uniform final |z| aliases (mz<=test idiom)', () => {
  // The whole loop body is the final if; both branches refresh m = |z|
  // after mutating z, so m at the bailout is the completed round's
  // magnitude — equivalent to the plain radial predicate.
  const BRANCH_ALIAS =
    'BranchAlias {\n  z=pixel:\n  if(real(z)<=0.3)\n    z=z+pixel\n    m=|z|\n  else\n    z=z+1\n    m=|z|\n  endif\n  m <= 4\n}';
  const BRANCH_LITERAL =
    'BranchLiteral {\n  z=pixel:\n  if(real(z)<=0.3)\n    z=z+pixel\n  else\n    z=z+1\n  endif\n  |z| <= 4\n}';

  it('compiles to a radial descriptor (alias classified as |z|)', () => {
    const r = compileNamed(BRANCH_ALIAS, 'BranchAlias');
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor!.kind).toBe('C1');
  });

  it('orbits equal the plain radial predicate', () => {
    for (const px of PIXELS) {
      const viaAlias = orbitFor(BRANCH_ALIAS, 'BranchAlias', px);
      const viaLiteral = orbitFor(BRANCH_LITERAL, 'BranchLiteral', px);
      expect(viaAlias.escapedAt).toBe(viaLiteral.escapedAt);
      expect(viaAlias.orbit).toEqual(viaLiteral.orbit);
    }
  });

  it('a final if without else is not an alias (stale value could leak)', () => {
    const r = compileNamed(
      'NoElseAlias {\n  z=pixel:\n  z=z+1\n  if(real(z)<=0.3)\n    m=|z|\n  endif\n  m <= 4\n}',
      'NoElseAlias',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('unknown-magnitude-form');
  });

  it('branches refreshing different names do not form an alias', () => {
    const r = compileNamed(
      'SplitAlias {\n  z=pixel:\n  if(real(z)<=0.3)\n    m=|z|\n  else\n    n=|z|\n  endif\n  m <= 4\n}',
      'SplitAlias',
    );
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('unknown-magnitude-form');
  });
});
