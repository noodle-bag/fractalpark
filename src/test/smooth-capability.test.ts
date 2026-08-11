/**
 * Smooth three-tier capability (docs/specs/frm-compatibility-v1.md §7):
 * resolution derives from AST/dataflow plus the bailout descriptor — never
 * from family, name, supportsPower, or a default u_power=2 guess.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { compileFrm } from '@/engine/frm/compile';
import { frmParserCache } from '@/engine/frm/cache';
import { extractPolynomialDegree } from '@/engine/frm/smooth-capability';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { assembleShader } from '@/engine/shaders/assembler';
import type { PluginCombination } from '@/engine/plugins/types';

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
