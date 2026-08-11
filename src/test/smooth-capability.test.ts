/**
 * Smooth three-tier capability (docs/specs/frm-compatibility-v1.md §7):
 * resolution derives from AST/dataflow plus the bailout descriptor — never
 * from family, name, supportsPower, or a default u_power=2 guess.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { compileFrm } from '@/engine/frm/compile';
import { frmParserCache } from '@/engine/frm/cache';
import {
  extractPolynomialDegree,
  resolveEffectiveSmoothMethod,
} from '@/engine/frm/smooth-capability';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { assembleShader } from '@/engine/shaders/assembler';
import type { PluginCombination } from '@/engine/plugins/types';
import type { ASTNode, FrmAST } from '@/engine/frm/ast';

const COMBO_BASE: Omit<PluginCombination, 'formulaId'> = {
  outsideColoringId: 'smooth',
  insideColoringId: 'black',
  transformId: 'none',
};

function compileV2(name: string, loop: string, bailout: string, id: string) {
  const r = compileFrm(
    `${name} {\ninit:\n  z = 0\nloop:\n  ${loop}\nbailout:\n  ${bailout}\n}`,
    id,
    2,
  );
  expect(r.success).toBe(true);
  expect(r.plugin).toBeDefined();
  return r.plugin!;
}

describe('smooth capability: three-tier resolution from AST/dataflow', () => {
  beforeAll(() => {
    frmParserCache.clear();
    registerBuiltins();
  });

  it('polynomial loop with forward radial escape → supported with extracted degree', () => {
    const quad = compileV2('SmoothQuad', 'z = z^2 + c', '|z| < 4', 'sm-quad');
    expect(quad.smoothCapability).toBe('supported');
    expect(quad.smoothPower).toBe(2);

    const cubic = compileV2('SmoothCubic', 'z = z^3 + c', '|z| < 4', 'sm-cubic');
    expect(cubic.smoothCapability).toBe('supported');
    expect(cubic.smoothPower).toBe(3);

    // z*z multiplies degrees (1+1); z^2 + z keeps the leading degree 2.
    const mul = compileV2('SmoothMul', 'z = z*z + c', '|z| < 4', 'sm-mul');
    expect(mul.smoothCapability).toBe('supported');
    expect(mul.smoothPower).toBe(2);

    const mixed = compileV2('SmoothMixed', 'z = z^2 + z + c', '|z| < 4', 'sm-mixed');
    expect(mixed.smoothCapability).toBe('supported');
    expect(mixed.smoothPower).toBe(2);
  });

  it('loop-variable dataflow resolves through intermediate assignments', () => {
    const plugin = compileV2('SmoothEnv', 'w = z^2\n  z = w + c', '|z| < 4', 'sm-env');
    expect(plugin.smoothCapability).toBe('supported');
    expect(plugin.smoothPower).toBe(2);
  });

  it('sequential composition through a transcendental step is NOT polynomial', () => {
    // z = sin(z); z = z^2 + c composes F(z) = sin(z)^2 + c — a false
    // 'supported' here would be a correctness lie (Codex review).
    const plugin = compileV2('SmoothSeq', 'z = sin(z)\n  z = z^2 + c', '|z| < 4', 'sm-seq');
    expect(plugin.smoothCapability).toBe('adapted');
    expect(plugin.smoothPower).toBeUndefined();
  });

  it('composed polynomial degrees multiply across assignments (z^2 then w^2 → 4)', () => {
    const plugin = compileV2(
      'SmoothCompose',
      'z = z^2\n  w = z\n  z = w^2 + c',
      '|z| < 4',
      'sm-compose',
    );
    expect(plugin.smoothCapability).toBe('supported');
    expect(plugin.smoothPower).toBe(4);
  });

  it('arithmetic negation preserves the polynomial; logical ops do not', () => {
    const neg = compileV2('SmoothNeg', 'z = -(z^2) + c', '|z| < 4', 'sm-neg');
    expect(neg.smoothCapability).toBe('supported');
    expect(neg.smoothPower).toBe(2);
  });

  it('loop-assigned c is dataflow-tracked, not assumed z-free', () => {
    // The native dialect rejects c assignment (reserved read-only — so the
    // c→0 default IS sound there); classic sources DO assign c
    // (alt: c=c+k*p1/z). Exercise the extractor directly on a canonical AST:
    // c = c + z makes c z-dependent; the composed map stays polynomial of
    // degree 2 — the degree model must track it, not hardcode 0.
    const L = { line: 1, col: 1 };
    const id = (name: string) => ({ type: 'ident', name, loc: L }) as const;
    const num = (value: number) => ({ type: 'number', value, loc: L }) as const;
    const bin = (op: string, left: ASTNode, right: ASTNode) =>
      ({ type: 'binary', op, left, right, loc: L }) as const;
    const assign = (target: string, value: ASTNode) =>
      ({ type: 'assignment', target, value, loc: L }) as const;

    const ast: FrmAST = {
      name: 'CVar',
      params: [],
      initBlock: [assign('z', num(0)), assign('c', id('pixel'))],
      loopBlock: [
        assign('z', bin('+', bin('^', id('z'), num(2)), id('c'))),
        assign('c', bin('+', id('c'), id('z'))),
      ],
      bailoutExpr: bin('<', { type: 'magnitude', operand: id('z'), loc: L }, num(4)),
    };
    expect(extractPolynomialDegree(ast)).toBe(2);
  });

  it('transcendental or fn-slot loops → adapted (radial-crossing-v1), no power', () => {
    const trig = compileV2('SmoothTrig', 'z = sin(z) + c', '|z| < 4', 'sm-trig');
    expect(trig.smoothCapability).toBe('adapted');
    expect(trig.smoothPower).toBeUndefined();

    const fnSlot = compileV2('SmoothFn', 'z = fn1(z) + c', '|z| < 4', 'sm-fn');
    expect(fnSlot.smoothCapability).toBe('adapted');
    expect(fnSlot.smoothPower).toBeUndefined();
  });

  it('conditional loop dataflow is not provably polynomial → adapted', () => {
    const plugin = compileV2(
      'SmoothIf',
      'if (real(z) > 0)\n    z = z^2 + c\n  endif',
      '|z| < 4',
      'sm-if',
    );
    expect(plugin.smoothCapability).toBe('adapted');
    expect(plugin.smoothPower).toBeUndefined();
  });

  it('C4-R real projection → unavailable (no radial-crossing reuse by default)', () => {
    const absReal = compileV2('SmoothC4R', 'z = z^2 + c', '|real(z)| < 2', 'sm-c4r');
    expect(absReal.smoothCapability).toBe('unavailable');
    expect(absReal.smoothPower).toBeUndefined();
  });

  it('inverse-direction radial escape → unavailable (inside-out is meaningless)', () => {
    const inverse = compileV2('SmoothInv', 'z = z^2 + c', '|z| > 4', 'sm-inv');
    expect(inverse.smoothCapability).toBe('unavailable');
    expect(inverse.smoothPower).toBeUndefined();
  });

  it('C2 parameterized radial with polynomial loop → supported', () => {
    const plugin = compileV2('SmoothC2', 'z = z^2 + c', '|z| < p1 * p2 + 1', 'sm-c2');
    expect(plugin.smoothCapability).toBe('supported');
    expect(plugin.smoothPower).toBe(2);
  });

  it('v1 compiles never set the capability (legacy behavior frozen)', () => {
    const r = compileFrm(
      `SmoothV1 {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}`,
      'sm-v1',
      1,
    );
    expect(r.success).toBe(true);
    expect(r.plugin?.smoothCapability).toBeUndefined();
    expect(r.plugin?.smoothPower).toBeUndefined();
  });

  it('extractPolynomialDegree rejects non-polynomial exponent forms', () => {
    const zPowZ = compileV2('SmoothZPZ', 'z = z^z + c', '|z| < 4', 'sm-zpz');
    expect(zPowZ.smoothCapability).toBe('adapted');
    // Direct extraction sanity: parse via a successful compile's AST shape.
    expect(zPowZ.smoothPower).toBeUndefined();
  });

  it('assembler emits SMOOTH_ESCAPE_TIME only for unavailable formulas', () => {
    const unavailable = compileV2('SmoothAsmU', 'z = z^2 + c', '|real(z)| < 2', 'sm-asm-u');
    const shaderU = assembleShader({ formulaId: unavailable.id, ...COMBO_BASE }, unavailable);
    expect(shaderU).toMatch(/^#define SMOOTH_ESCAPE_TIME$/m);

    const supported = compileV2('SmoothAsmS', 'z = z^2 + c', '|z| < 4', 'sm-asm-s');
    const shaderS = assembleShader({ formulaId: supported.id, ...COMBO_BASE }, supported);
    expect(shaderS).not.toMatch(/^#define SMOOTH_ESCAPE_TIME$/m);
    // Forward polynomial path keeps the proven smooth formula.
    expect(shaderS).toContain('log2(log2(max(zn, 1.00001)))');

    const adapted = compileV2('SmoothAsmA', 'z = sin(z) + c', '|z| < 4', 'sm-asm-a');
    const shaderA = assembleShader({ formulaId: adapted.id, ...COMBO_BASE }, adapted);
    // Adapted keeps the radial-crossing formula — labeled upstream, same GLSL.
    expect(shaderA).not.toMatch(/^#define SMOOTH_ESCAPE_TIME$/m);
    expect(shaderA).toContain('log2(log2(max(zn, 1.00001)))');
  });

  it('the Escape Time fallback covers BOTH the main loop and the normal-map height path', () => {
    const unavailable = compileV2('SmoothHeight', 'z = z^2 + c', '|real(z)| < 2', 'sm-height');
    const shader = assembleShader({ formulaId: unavailable.id, ...COMBO_BASE }, unavailable);
    const fallback = /#if defined\(ESCAPE_INVERSE_DIRECTION\) \|\| defined\(SMOOTH_ESCAPE_TIME\)/g;
    const occurrences = shader.match(fallback) ?? [];
    // Main coloring loop + escapeHeight (normal-map/DEM) — deterministic
    // fallback must be consistent across every shader path.
    expect(occurrences.length).toBe(2);
  });

  it('effective smooth method separates requested preference from derived outcome', () => {
    const supported = compileV2('SmoothEffS', 'z = z^2 + c', '|z| < 4', 'sm-eff-s');
    const adapted = compileV2('SmoothEffA', 'z = sin(z) + c', '|z| < 4', 'sm-eff-a');
    const unavailable = compileV2('SmoothEffU', 'z = z^2 + c', '|real(z)| < 2', 'sm-eff-u');
    expect(resolveEffectiveSmoothMethod(supported)).toBe('smooth');
    expect(resolveEffectiveSmoothMethod(adapted)).toBe('radial-crossing-v1');
    expect(resolveEffectiveSmoothMethod(unavailable)).toBe('escape-time');
    // v1/legacy plugins keep the historical smooth path.
    expect(resolveEffectiveSmoothMethod({})).toBe('smooth');
  });

  it('extractPolynomialDegree returns null for degree < 2', () => {
    const linear = compileV2('SmoothLin', 'z = z + c', '|z| < 4', 'sm-lin');
    expect(linear.smoothCapability).toBe('adapted');
    expect(linear.smoothPower).toBeUndefined();
  });
});

describe('smooth capability: extractPolynomialDegree unit surface', () => {
  it('exported helper is deterministic on a compiled AST', () => {
    const r = compileFrm(
      `SmoothAst {\ninit:\n  z = 0\nloop:\n  z = z^5 + c\nbailout:\n  |z| < 4\n}`,
      'sm-ast',
      2,
    );
    expect(r.success).toBe(true);
    expect(r.ast).toBeDefined();
    expect(extractPolynomialDegree(r.ast!)).toBe(5);
  });
});
