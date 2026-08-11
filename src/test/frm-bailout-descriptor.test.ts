/**
 * Bounded bailout descriptor tests (v0.4.18 Slice 3, commit 7;
 * docs/specs/frm-compatibility-v1.md §4 and the IR/BO regression rows).
 *
 * Contract under test: strict v2 extracts bounded C1/C2/C4-R descriptors
 * with exact comparison direction; swapped operands flip the operator
 * without changing meaning; unknown predicates are rejected with stable
 * reasons and NEVER fall back to a default radius. Legacy v1 keeps its
 * frozen heuristic (left-side number as threshold, direction discarded,
 * unknown → 4.0) — pinned here as a control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractBailoutDescriptor, type BailoutDescriptor } from '../engine/frm/bailout-descriptor';
import { compileFrmDetailed, compileFrm } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';
import { tokenize } from '../engine/frm/lexer';
import { parse } from '../engine/frm/parser';
import type { ASTNode } from '../engine/frm/ast';

function bailoutAst(bailoutExpr: string): ASTNode {
  const source = `T {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  ${bailoutExpr}\n}`;
  const { tokens } = tokenize(source);
  const { ast, errors } = parse(tokens);
  expect(errors).toEqual([]);
  expect(ast).not.toBeNull();
  return ast!.bailoutExpr;
}

const NO_PARAMS = new Set<string>();
const P_PARAMS = new Set<string>(['p1', 'p2', 'p3', 'p4', 'p5']);

const probeSource = (name: string, bailout: string) =>
  `${name} {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  ${bailout}\n}`;

describe('extractBailoutDescriptor: bounded forms', () => {
  it('C1 fixed radial with each comparison direction', () => {
    const ops = ['<', '<=', '>', '>='] as const;
    for (const op of ops) {
      const r = extractBailoutDescriptor(bailoutAst(`|z| ${op} 4`), NO_PARAMS);
      expect(r).toEqual({
        ok: true,
        descriptor: { kind: 'C1', op, magnitude: 'z', threshold: 4 },
      });
    }
  });

  it('C2 parameterized radial collects sorted declared params and keeps the AST', () => {
    const r = extractBailoutDescriptor(bailoutAst('|z| < p1 * p2 + 1'), P_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.descriptor.kind).toBe('C2');
    if (r.descriptor.kind !== 'C2') return;
    expect(r.descriptor.params).toEqual(['p1', 'p2']);
    // The descriptor carries the verified AST subtree (not a re-serialized
    // string) so consumers evaluate through the compiler's expression path.
    expect(r.descriptor.thresholdNode.type).toBe('binary');
    if (r.descriptor.thresholdNode.type !== 'binary') return;
    expect(r.descriptor.thresholdNode.op).toBe('+');
  });

  it('C2 accepts pure function expressions over parameters', () => {
    const r = extractBailoutDescriptor(bailoutAst('|z| <= sqrt(p1) * 2'), P_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok || r.descriptor.kind !== 'C2') return;
    expect(r.descriptor.params).toEqual(['p1']);
    expect(r.descriptor.thresholdNode.type).toBe('binary');
  });

  it('C4-R abs-real and real forms with numeric thresholds', () => {
    const absReal = extractBailoutDescriptor(bailoutAst('|real(z)| < 2'), NO_PARAMS);
    expect(absReal).toEqual({
      ok: true,
      descriptor: { kind: 'C4R', form: 'abs-real', op: '<', threshold: 2 },
    });
    const real = extractBailoutDescriptor(bailoutAst('real(z) >= -1'), NO_PARAMS);
    expect(real).toEqual({
      ok: true,
      descriptor: { kind: 'C4R', form: 'real', op: '>=', threshold: -1 },
    });
  });

  it('swapped operands flip the operator without changing meaning', () => {
    // `4 < |z|` means "|z| > 4" — the v1 heuristic reads this as threshold
    // 4 with direction discarded; v2 must preserve the direction exactly.
    const r = extractBailoutDescriptor(bailoutAst('4 < |z|'), NO_PARAMS);
    expect(r).toEqual({
      ok: true,
      descriptor: { kind: 'C1', op: '>', magnitude: 'z', threshold: 4 },
    });
    const le = extractBailoutDescriptor(bailoutAst('16 <= |z|'), NO_PARAMS);
    expect(le).toEqual({
      ok: true,
      descriptor: { kind: 'C1', op: '>=', magnitude: 'z', threshold: 16 },
    });
  });

  it('swapped operands flip > and >= directions as well', () => {
    const gt = extractBailoutDescriptor(bailoutAst('4 > |z|'), NO_PARAMS);
    expect(gt).toEqual({
      ok: true,
      descriptor: { kind: 'C1', op: '<', magnitude: 'z', threshold: 4 },
    });
    const ge = extractBailoutDescriptor(bailoutAst('9 >= |z|'), NO_PARAMS);
    expect(ge).toEqual({
      ok: true,
      descriptor: { kind: 'C1', op: '<=', magnitude: 'z', threshold: 9 },
    });
  });

  it('swapped C4-R operands flip direction and keep the projection form', () => {
    const r = extractBailoutDescriptor(bailoutAst('2 < |real(z)|'), NO_PARAMS);
    expect(r).toEqual({
      ok: true,
      descriptor: { kind: 'C4R', form: 'abs-real', op: '>', threshold: 2 },
    });
  });
});

describe('extractBailoutDescriptor: stable rejections (no silent fallback)', () => {
  it('rejects orbit-state thresholds as not loop-invariant', () => {
    expect(extractBailoutDescriptor(bailoutAst('|z| < z'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z| < c'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
  });

  it('rejects unknown magnitude forms', () => {
    expect(extractBailoutDescriptor(bailoutAst('|c| < 4'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-magnitude-form',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z*z| < 4'), NO_PARAMS).ok).toBe(false);
  });

  it('rejects adversarial magnitude lookalikes', () => {
    // Case-sensitive `Z` is not the orbit variable.
    expect(extractBailoutDescriptor(bailoutAst('|Z| < 4'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-magnitude-form',
    });
    // abs(z) is a function call, not the magnitude bars form.
    expect(extractBailoutDescriptor(bailoutAst('abs(z) < 4'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-magnitude-form',
    });
    // real(c) projects the wrong variable.
    expect(extractBailoutDescriptor(bailoutAst('real(c) < 4'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-magnitude-form',
    });
    expect(extractBailoutDescriptor(bailoutAst('|real(c)| < 4'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-magnitude-form',
    });
  });

  it('rejects orbit-state smuggling through nested pure calls and fn slots', () => {
    expect(extractBailoutDescriptor(bailoutAst('|z| < sqrt(z)'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z| < sqrt(sqrt(z))'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z| < fn1(p1)'), P_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z| < (1, 2)'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
  });

  it('rejects non-comparison and degenerate predicates', () => {
    expect(extractBailoutDescriptor(bailoutAst('|z| + 1'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-predicate',
    });
    expect(extractBailoutDescriptor(bailoutAst('|z| < |z|'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'unknown-predicate',
    });
  });

  it('rejects logically combined predicates with an explicit reason', () => {
    expect(extractBailoutDescriptor(bailoutAst('|z| < 4 && real(z) > 0'), NO_PARAMS)).toEqual({
      ok: false,
      reason: 'chained-logical',
    });
  });

  it('rejects parameterized C4-R thresholds (numeric-literal only)', () => {
    expect(extractBailoutDescriptor(bailoutAst('|real(z)| < p1'), P_PARAMS)).toEqual({
      ok: false,
      reason: 'threshold-not-loop-invariant',
    });
  });
});

describe('strict v2 compile integration', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  const src = (bailout: string) => probeSource('V2Probe', bailout);

  it('compiles a bounded C1 bailout and exposes the descriptor', () => {
    const r = compileFrmDetailed(src('|z| < 16'), undefined, 2);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor).toEqual({ kind: 'C1', op: '<', magnitude: 'z', threshold: 16 });
  });

  it('compiles a swapped-operand bailout with the flipped direction', () => {
    const r = compileFrmDetailed(src('4 < |z|'), undefined, 2);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor).toEqual({ kind: 'C1', op: '>', magnitude: 'z', threshold: 4 });
  });

  it('fails an unknown predicate with a stable reason and no fallback', () => {
    const r = compileFrmDetailed(src('tanh(|z|) < 4'), undefined, 2);
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('unknown-magnitude-form');
    expect(r.bailoutDescriptor).toBeUndefined();
    expect(r.plugin).toBeUndefined();
  });

  it('fails an orbit-dependent threshold with a stable reason', () => {
    const r = compileFrmDetailed(src('|z| < z'), undefined, 2);
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('documents the intentional descriptor vs legacy bailout divergence', () => {
    // Under v2 the descriptor is the authoritative contract; the numeric
    // plugin.bailout keeps the legacy v1 channel value for existing
    // renderer consumers until the renderer-pipeline v2 slice lands. Both
    // are exposed side by side, gated by frmSemanticsVersion.
    const r = compileFrmDetailed(src('4 < |z|'), undefined, 2);
    expect(r.success).toBe(true);
    expect(r.frmSemanticsVersion).toBe(2);
    // Descriptor: direction preserved (|z| > 4).
    expect(r.bailoutDescriptor).toEqual({ kind: 'C1', op: '>', magnitude: 'z', threshold: 4 });
    // Legacy channel: v1 heuristic value (threshold 4, direction discarded)
    // — renderer-pipeline v2 will consume the descriptor instead.
    expect(r.plugin?.bailout).toBe(4);
  });
});

describe('legacy v1 frozen controls (defects preserved on purpose)', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('v1 still mis-extracts swapped operands (threshold 4.0, direction lost)', () => {
    const r = compileFrm(probeSource('V1Control', '4 < |z|'), undefined, 1);
    expect(r.success).toBe(true);
    expect(r.plugin?.bailout).toBe(4);
    expect(r.bailoutDescriptor).toBeUndefined();
  });

  it('v1 still falls back to 4.0 for unknown predicates', () => {
    // The v1 heuristic only reads a bare `< number` shape; a parameterized
    // threshold (`< p1`) has no numeric side and falls back to 4.0.
    const r = compileFrm(probeSource('V1Fallback', 'tanh(|z|) < p1'), undefined, 1);
    expect(r.success).toBe(true);
    expect(r.plugin?.bailout).toBe(4.0);
  });

  it('v1 default (no version argument) behaves exactly like explicit v1', () => {
    const source = probeSource('V1Default', '|z| < 9');
    const implicit = compileFrm(source);
    const explicit = compileFrm(source, undefined, 1);
    expect(implicit.success).toBe(true);
    expect(explicit.success).toBe(true);
    expect(implicit.plugin?.bailout).toBe(9);
    expect(explicit.plugin?.bailout).toBe(9);
    expect(implicit.bailoutDescriptor).toBeUndefined();
  });
});

describe('init-bound threshold substitution (T0 evidence: Jm_* idiom)', () => {
  const compileV2 = (source: string) => compileFrm(source, undefined, 2);

  it('an init-bound named constant classifies like its inline form (C2)', () => {
    const source =
      'T {\ninit:\n  t = p1 + 4\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileV2(source);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor?.kind).toBe('C2');
    // The descriptor threshold is the substituted pure subtree — no `t`.
    const text = JSON.stringify(r.bailoutDescriptor);
    expect(text).toContain('"name":"p1"');
    expect(text).not.toContain('"name":"t"');
  });

  it('chained init bindings substitute transitively', () => {
    const source =
      'T {\ninit:\n  u = p1 * 2\n  t = u + 1\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileV2(source);
    expect(r.success).toBe(true);
    expect(r.bailoutDescriptor?.kind).toBe('C2');
    const text = JSON.stringify(r.bailoutDescriptor);
    expect(text).not.toContain('"name":"u"');
    expect(text).not.toContain('"name":"t"');
  });

  it('a loop-reassigned binding is not invariant — still rejected', () => {
    const source =
      'T {\ninit:\n  t = p1 + 4\n  z = pixel\nloop:\n  t = z\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileV2(source);
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('a reassigned init binding is ineligible — still rejected', () => {
    const source =
      'T {\ninit:\n  t = p1\n  t = p1 + 4\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileV2(source);
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });

  it('a self-referencing binding (cycle) is ineligible — still rejected', () => {
    const source =
      'T {\ninit:\n  t = t + 1\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileV2(source);
    expect(r.success).toBe(false);
  });
});

describe('Codex round-2 regressions', () => {
  it('a thrice-assigned init binding is banned (sequential init semantics)', () => {
    // u=1; t=u; u=2; u=3 — classic t equals 1, not the final u. The toggle
    // (set/delete/set) admitted u on the third assignment; the ban sticks.
    const source =
      'T {\ninit:\n  u = 1\n  t = u\n  u = 2\n  u = 3\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= t\n}';
    const r = compileFrm(source, undefined, 2);
    expect(r.success).toBe(false);
    expect(r.errors.join('\n')).toContain('threshold-not-loop-invariant');
  });
});

describe('C2 default-threshold evaluation (cosxx regression)', () => {
  it('|z| < cosxx(p1) with p1 default 0 yields legacy bailout 1, not the 4.0 fallback', async () => {
    const { evaluateC2Threshold, extractBailoutDescriptor } = await import(
      '../engine/frm/bailout-descriptor'
    );
    const r = extractBailoutDescriptor(bailoutAst('|z| < cosxx(p1)'), P_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok || r.descriptor.kind !== 'C2') return;
    // cosxx on a real input equals cos (imag term vanishes): cos(0) = 1.
    expect(evaluateC2Threshold(r.descriptor, new Map([['p1', 0]]))).toBe(1);
  });
});
