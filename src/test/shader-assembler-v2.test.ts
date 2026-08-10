/**
 * Renderer-pipeline v2 tests (v0.4.18 Slice 3, commit 8a): the shader
 * assembler consumes a formula's bounded bailout descriptor to drive the
 * escape defines, while descriptor-less (legacy/v1) formulas keep the
 * historical BAILOUT_RADIUS semantics byte-for-byte.
 *
 * Assertions target assembler-injected `#define` lines (line-anchored), not
 * the framework template's conditional-compilation text (which always
 * contains every branch). Visual sentinel verification (orbits, NaN,
 * flicker) is a physical-device gate owned by the maintainer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { assembleShader, makeCacheKey } from '@/engine/shaders/assembler';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { compileFrm } from '@/engine/frm/compile';
import { frmParserCache } from '@/engine/frm/cache';
import type { PluginCombination } from '@/engine/plugins/types';

const COMBO_BASE: Omit<PluginCombination, 'formulaId'> = {
  outsideColoringId: 'smooth',
  insideColoringId: 'black',
  transformId: 'none',
};

const INJECTED_INVERSE = /^#define ESCAPE_INVERSE_DIRECTION$/m;
const INJECTED_INCLUSIVE = /^#define BAILOUT_INCLUSIVE$/m;
const injectedRadius = (value: string) => new RegExp(`^#define BAILOUT_RADIUS ${value}$`, 'm');

function compileV2(name: string, bailout: string, id: string) {
  const r = compileFrm(
    `${name} {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  ${bailout}\n}`,
    id,
    2,
  );
  expect(r.success).toBe(true);
  expect(r.plugin).toBeDefined();
  return r.plugin!;
}

describe('assembleShader: renderer-pipeline v2 (bailout descriptor consumption)', () => {
  beforeAll(() => {
    frmParserCache.clear();
    registerBuiltins();
  });

  it('legacy formulas without a descriptor keep the historical radius semantics', () => {
    const shader = assembleShader({ formulaId: 'mandelbrot', ...COMBO_BASE });
    // builtin mandelbrot: bailout 65536.0 (zz threshold, |z| > 256).
    expect(shader).toMatch(injectedRadius('65536.0'));
    expect(shader).not.toMatch(INJECTED_INVERSE);
    expect(shader).not.toMatch(INJECTED_INCLUSIVE);
  });

  it('v2 C1 < squares the magnitude threshold for the zz comparison', () => {
    const plugin = compileV2('V2Lt', '|z| < 4', 'v2-lt');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // magnitude 4 → zz threshold 16 (strict-v2 radius semantics).
    expect(shader).toMatch(injectedRadius('16.0'));
    expect(shader).not.toMatch(INJECTED_INVERSE);
    // `<` continues while |z| < 4 → escape at the inclusive boundary.
    expect(shader).not.toMatch(INJECTED_INCLUSIVE);
  });

  it('v2 C1 > flips the escape condition and falls back to Escape Time smoothing', () => {
    const plugin = compileV2('V2Gt', '4 < |z|', 'v2-gt'); // ≡ |z| > 4
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('16.0'));
    expect(shader).toMatch(INJECTED_INVERSE);
    // Smooth is not meaningful for inside-out escapes: Escape Time fallback.
    expect(shader).toContain('smoothIter = float(i);');
  });

  it('v2 C1 <= keeps the inclusive boundary without direction flip', () => {
    const plugin = compileV2('V2Le', '|z| <= 9', 'v2-le');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('81.0'));
    expect(shader).not.toMatch(INJECTED_INVERSE);
    expect(shader).toMatch(INJECTED_INCLUSIVE);
  });

  it('v2 C1 >= flips direction and keeps the inclusive boundary', () => {
    const plugin = compileV2('V2Ge', '9 <= |z|', 'v2-ge'); // ≡ |z| >= 9
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('81.0'));
    expect(shader).toMatch(INJECTED_INVERSE);
    expect(shader).toMatch(INJECTED_INCLUSIVE);
  });

  it('v1 compile of the same source produces no descriptor defines', () => {
    const v1 = compileFrm(
      `V1Same {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}`,
      'v1-same',
      1,
    );
    expect(v1.success).toBe(true);
    expect(v1.plugin?.bailoutDescriptor).toBeUndefined();
    const shader = assembleShader({ formulaId: v1.plugin!.id, ...COMBO_BASE }, v1.plugin);
    // v1 channel: heuristic value 4 straight into the zz comparison.
    expect(shader).toMatch(injectedRadius('4.0'));
    expect(shader).not.toMatch(INJECTED_INVERSE);
    expect(shader).not.toMatch(INJECTED_INCLUSIVE);
  });

  it('preserves fractional thresholds at full precision (no radius collapse)', () => {
    const plugin = compileV2('V2Frac', '|z| < 0.1', 'v2-frac');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // 0.1² = 0.010000000000000002 (IEEE 754) — must not round to 0.0.
    expect(shader).toMatch(/^#define BAILOUT_RADIUS 0\.01/m);
    expect(shader).not.toMatch(/^#define BAILOUT_RADIUS 0\.0$/m);
  });

  it('escapeHeight falls back to Escape Time for inverse-direction escapes too', () => {
    const plugin = compileV2('V2InvH', '4 < |z|', 'v2-inv-h');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // Both escape sites must honor the Smooth-Unavailable fallback.
    const escapeHeightBlock = shader.slice(shader.indexOf('float escapeHeight'), shader.indexOf('vec3 applyLighting'));
    expect(escapeHeightBlock).toContain('float(i) / float(u_maxIterations)');
    expect(escapeHeightBlock).toContain('#ifdef ESCAPE_INVERSE_DIRECTION');
  });

  it('v1/v2 variants of the same formula id never share a shader cache key', () => {
    const v1 = compileFrm(`Same {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}`, 'same-id', 1);
    const v2 = compileFrm(`Same {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}`, 'same-id', 2);
    expect(v1.success && v2.success).toBe(true);
    const combo: PluginCombination = { formulaId: 'same-id', ...COMBO_BASE };
    const keyV1 = makeCacheKey(combo, v1.plugin);
    const keyV2 = makeCacheKey(combo, v2.plugin);
    expect(keyV1).not.toBe(keyV2);
    expect(keyV2).toContain('bo:C1:<:4');
    // A descriptor-less formula keeps the legacy key shape byte-for-byte.
    expect(keyV1).toBe('same-id|smooth|black|none');
  });
});
