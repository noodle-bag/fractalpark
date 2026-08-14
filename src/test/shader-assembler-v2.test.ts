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
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { pluginRegistry } from '@/engine/plugins/registry';
import { compileFrm, compileClassicFrmEntry } from '@/engine/frm/compile';
import { frmParserCache } from '@/engine/frm/cache';
import type { PluginCombination } from '@/engine/plugins/types';

const COMBO_BASE: Omit<PluginCombination, 'formulaId'> = {
  outsideColoringId: 'smooth',
  insideColoringId: 'black',
  transformId: 'none',
  // Strict-v2 behaviors are gated on the renderer pipeline version
  // (spec §7) — these tests exercise the v2 pipeline.
  pipelineVersion: 2,
};

const COMBO_BASE_V1: Omit<PluginCombination, 'formulaId'> = {
  outsideColoringId: 'smooth',
  insideColoringId: 'black',
  transformId: 'none',
  pipelineVersion: 1,
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
    // `<` continues while |z| < 4 → escape when |z| >= 4.
    expect(shader).toMatch(INJECTED_INCLUSIVE);
    // FRM codegen owns exactly one declaration. LastSqr is a general classic
    // side channel, so even this C1 formula resets it per orbit.
    expect(shader.match(/\bfloat frmLastSqr\b/g)).toHaveLength(1);
    expect(shader).toMatch(/^#define HAS_FRM_LAST_SQR$/m);
    expect(shader).not.toMatch(/^#define ESCAPE_C5$/m);
  });

  it('v2 C1 > flips the escape condition and falls back to Escape Time smoothing', () => {
    const plugin = compileV2('V2Gt', '4 < |z|', 'v2-gt'); // ≡ |z| > 4
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('16.0'));
    expect(shader).toMatch(INJECTED_INVERSE);
    // `>` continues while |z| > 4 → escape when |z| <= 4.
    expect(shader).toMatch(INJECTED_INCLUSIVE);
    // Smooth is not meaningful for inside-out escapes: Escape Time fallback.
    expect(shader).toContain('smoothIter = float(i);');
  });

  it('v2 C1 <= negates to a strict escape boundary without direction flip', () => {
    const plugin = compileV2('V2Le', '|z| <= 9', 'v2-le');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('81.0'));
    expect(shader).not.toMatch(INJECTED_INVERSE);
    expect(shader).not.toMatch(INJECTED_INCLUSIVE);
  });

  it('v2 C1 >= flips direction and negates to a strict escape boundary', () => {
    const plugin = compileV2('V2Ge', '9 <= |z|', 'v2-ge'); // ≡ |z| >= 9
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(shader).toMatch(injectedRadius('81.0'));
    expect(shader).toMatch(INJECTED_INVERSE);
    expect(shader).not.toMatch(INJECTED_INCLUSIVE);
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
    // Both escape sites route inverse-direction AND capability-unavailable
    // formulas through the same deterministic fallback (spec §7).
    expect(escapeHeightBlock).toContain(
      '#if defined(ESCAPE_INVERSE_DIRECTION) || defined(SMOOTH_ESCAPE_TIME)',
    );
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

  it('registry-backed strict formulas use the same descriptor for source and cache key', () => {
    const plugin = compileV2('RegistryV2', '|z| < 4', 'registry-v2-key');
    pluginRegistry.register(plugin);
    try {
      const combo: PluginCombination = { formulaId: plugin.id, ...COMBO_BASE };
      const key = makeCacheKey(combo);
      const shader = assembleShader(combo);
      expect(key).toContain('bo:C1:<:4');
      expect(shader).toMatch(/^#define BAILOUT_RADIUS 16\.0$/m);
      expect(shader).toMatch(INJECTED_INCLUSIVE);
      expect(makeCacheKey({ ...combo, pipelineVersion: 1 })).not.toBe(key);
    } finally {
      pluginRegistry.unregister('formula', plugin.id);
    }
  });

  it('pipeline v1 renders a strict-v2 formula through the LEGACY path (spec §7)', () => {
    const plugin = compileV2('V2Gate', '|z| < 4', 'v2-gate');
    expect(plugin.bailoutDescriptor).toBeDefined();
    const legacy = assembleShader({ formulaId: plugin.id, ...COMBO_BASE_V1 }, plugin);
    // No descriptor-driven defines on pipeline v1 — the historical numeric
    // bailout semantics stay byte-for-byte.
    expect(legacy).not.toMatch(/^#define BAILOUT_LE /m);
    expect(legacy).not.toMatch(/^#define ESCAPE_AFTER_STEP$/m);
    expect(legacy).not.toMatch(/^#define SMOOTH_ESCAPE_TIME$/m);
    expect(legacy).toMatch(/^#define BAILOUT_RADIUS 4\.0$/m);
    const strict = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // Pipeline v2 drives the escape from the descriptor: the threshold is
    // squared (|z|<4 compares zz<16), unlike the legacy raw 4.0.
    expect(strict).toMatch(/^#define BAILOUT_RADIUS 16\.0$/m);
    expect(strict).not.toMatch(/^#define BAILOUT_RADIUS 4\.0$/m);
    // And the two pipelines never share a compiled program.
    const keyLegacy = makeCacheKey({ formulaId: plugin.id, ...COMBO_BASE_V1 }, plugin);
    const keyStrict = makeCacheKey({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    expect(keyLegacy).toBe(`${plugin.id}|smooth|black|none`);
    expect(keyStrict).toContain('bo:C1:<:4');
    expect(keyLegacy).not.toBe(keyStrict);
  });
});

describe('assembleShader: C4-R projection escapes and after-step timing', () => {
  beforeAll(() => {
    frmParserCache.clear();
    registerBuiltins();
  });

  it('C4-R abs-real injects a z.x escape expression with the negated operator', () => {
    const plugin = compileV2('V2C4R', '|real(z)| < 2', 'v2-c4r-abs');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // continue while abs(z.x) < 2 → escape when abs(z.x) >= 2.
    expect(shader).toMatch(/^#define ESCAPE_C4R$/m);
    expect(shader).toMatch(/^#define C4R_ESCAPE_CHECK\(z\) \(abs\(\(z\)\.x\) >= 2\.0\)$/m);
    // C4-R must not touch the radial radius define.
    expect(shader).not.toMatch(injectedRadius('4.0'));
  });

  it('C4-R real form compares z.x without abs and preserves direction via negation', () => {
    const plugin = compileV2('V2C4RR', 'real(z) >= -1', 'v2-c4r-real');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // continue while z.x >= -1 → escape when z.x < -1.
    expect(shader).toMatch(/^#define C4R_ESCAPE_CHECK\(z\) \(\(z\)\.x < -1\.0\)$/m);
  });

  it('C5 LastSqr injects a raw zz threshold without a second square', () => {
    const plugin = compileV2('V2C5', 'LastSqr <= 4', 'v2-c5');
    const shader = assembleShader({ formulaId: plugin.id, ...COMBO_BASE }, plugin);
    // Continue while zz <= 4 → escape when zz > 4.  `4` is already a
    // squared-magnitude threshold, unlike C1's radius threshold.
    expect(shader).toMatch(/^#define ESCAPE_C5$/m);
    expect(shader).toMatch(/^#define C5_ESCAPE_CHECK\(zz\) \(\(zz\) > 4\.0\)$/m);
    expect(shader).not.toMatch(injectedRadius('16.0'));
    expect(shader.match(/\bfloat frmLastSqr\b/g)).toHaveLength(1);
    expect(shader).toMatch(/^#define HAS_FRM_LAST_SQR$/m);
    expect(
      shader.match(/#ifdef HAS_FRM_LAST_SQR\s+frmLastSqr = 0\.0;\s+#endif/g),
    ).toHaveLength(2);
  });

  it('classic dialect under v2 sets afterStepTiming and injects ESCAPE_AFTER_STEP', () => {
    const result = compileClassicFrmEntry('AfterStep {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}', undefined, 'v2-after-step', 2);
    expect(result.success).toBe(true);
    expect(result.plugin?.afterStepTiming).toBe(true);
    const shader = assembleShader({ formulaId: 'v2-after-step', ...COMBO_BASE }, result.plugin);
    expect(shader).toMatch(/^#define ESCAPE_AFTER_STEP$/m);
    // The loop evaluates the predicate after the iterate step.
    const loopStart = shader.indexOf('for (int i = 0; i < 10000; i++) {', shader.indexOf('vec3 render('));
    const afterStepIdx = shader.indexOf('vec2 steppedZ = iterateStep', loopStart);
    const zzIdx = shader.indexOf('float zz = dot(z, z);', loopStart);
    expect(afterStepIdx).toBeGreaterThan(-1);
    expect(afterStepIdx).toBeLessThan(zzIdx);
  });

  it('classic dialect under v1 and native dialect under v2 never set afterStepTiming', () => {
    const classicV1 = compileClassicFrmEntry('PreStep {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}', undefined, 'v1-pre-step', 1);
    expect(classicV1.success).toBe(true);
    expect(classicV1.plugin?.afterStepTiming).toBeUndefined();

    const nativeV2 = compileV2('NativeV2', '|z| < 4', 'native-v2-pre');
    expect(nativeV2.afterStepTiming).toBeUndefined();
    const shader = assembleShader({ formulaId: nativeV2.id, ...COMBO_BASE }, nativeV2);
    expect(shader).not.toMatch(/^#define ESCAPE_AFTER_STEP$/m);
  });

  it('after-step escapes count i+1 steps in both iter and smooth iteration', () => {
    const result = compileClassicFrmEntry('SmoothAfter {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}', undefined, 'v2-smooth-after', 2);
    expect(result.success).toBe(true);
    const shader = assembleShader({ formulaId: 'v2-smooth-after', ...COMBO_BASE }, result.plugin);
    expect(shader).toContain('smoothIter = float(i + 1) - log2(log2(max(zn, 1.00001)))');
    expect(shader).toContain('iter = i + 1;');
  });

  it('cache keys include the after-step timing bit', () => {
    const classicV2 = compileClassicFrmEntry('Timed {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}', undefined, 'timed-id', 2);
    expect(classicV2.success).toBe(true);
    const combo: PluginCombination = { formulaId: 'timed-id', ...COMBO_BASE };
    const key = makeCacheKey(combo, classicV2.plugin);
    expect(key).toContain('|t:after');
    // Same id without after-step timing must not collide.
    const nativeV2 = compileV2('Timed', '|z| < 4', 'timed-id');
    const nativeKey = makeCacheKey(combo, nativeV2);
    expect(nativeKey).not.toBe(key);
    expect(nativeKey).not.toContain('|t:after');
  });

  it('C2 parameter expressions keep the frozen numeric v1 channel', () => {
    // The descriptor/GLSL channel is authoritative for pipeline v2. The
    // numeric plugin.bailout remains the v1 heuristic fallback so a
    // pipeline-v1 render of the same compiled formula stays byte-compatible.
    const result = compileFrm(
      `C2Default {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < p1 + 1\n}`,
      'c2-default',
      2,
    );
    expect(result.success).toBe(true);
    expect(result.bailoutDescriptor?.kind).toBe('C2');
    expect(result.plugin?.bailout).toBe(4);
  });

  it('C2 constant expressions also leave the numeric v1 channel unchanged', () => {
    const result = compileFrm(
      `C2Const {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < sqrt(16)\n}`,
      'c2-const',
      2,
    );
    expect(result.success).toBe(true);
    expect(result.bailoutDescriptor?.kind).toBe('C2');
    expect(result.plugin?.bailout).toBe(4);
  });

  it('C2 thresholds inline as uniform-driven GLSL (parameter edits need no recompile)', () => {
    const result = compileFrm(
      `C2Inline {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < p1 * p2 + 1\n}`,
      'c2-inline',
      2,
    );
    expect(result.success).toBe(true);
    // Serialized through the compiler's own expression pipeline.
    expect(result.plugin?.c2ThresholdGlsl).toBeDefined();
    expect(result.plugin?.c2ThresholdGlsl).toContain('u_p1');
    expect(result.plugin?.c2ThresholdGlsl).toContain('u_p2');

    const shader = assembleShader({ formulaId: 'c2-inline', ...COMBO_BASE }, result.plugin);
    expect(shader).toMatch(/^#define ESCAPE_C2$/m);
    // Escape negates the continue predicate over the squared expression.
    // Parameters are complex-typed in the FRM type system; the expression
    // coerces to real (.x) — exact for real-valued parameters (imag = 0).
    expect(shader).toContain('#define C2_ESCAPE_CHECK(zz) ((zz) >= (');
    expect(shader).toContain('complexMul(u_p1, u_p2)');
    expect(shader).toContain(').x)');
    // The threshold expression is uniform-driven: uniforms must be declared.
    expect(shader).toContain('uniform vec2 u_p1;');
    expect(shader).toContain('uniform vec2 u_p2;');
  });

  it('C2 inverse direction negates the escape comparison', () => {
    const result = compileFrm(
      `C2Inv {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| > p1\n}`,
      'c2-inv',
      2,
    );
    expect(result.success).toBe(true);
    const shader = assembleShader({ formulaId: 'c2-inv', ...COMBO_BASE }, result.plugin);
    // continue while |z| > p1 → escape when zz <= p1² (real part squared).
    expect(shader).toContain('#define C2_ESCAPE_CHECK(zz) ((zz) <= (');
    expect(shader).toContain('(u_p1).x');
  });

  it('C2 inclusive operators negate to strict escapes (<= → >, >= → <)', () => {
    const le = compileFrm(
      `C2Le {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| <= p1\n}`,
      'c2-le',
      2,
    );
    expect(le.success).toBe(true);
    expect(assembleShader({ formulaId: 'c2-le', ...COMBO_BASE }, le.plugin)).toContain(
      '#define C2_ESCAPE_CHECK(zz) ((zz) > (',
    );

    const ge = compileFrm(
      `C2Ge {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| >= p1\n}`,
      'c2-ge',
      2,
    );
    expect(ge.success).toBe(true);
    expect(assembleShader({ formulaId: 'c2-ge', ...COMBO_BASE }, ge.plugin)).toContain(
      '#define C2_ESCAPE_CHECK(zz) ((zz) < (',
    );
  });

  it('C2 swapped operands flip the operator before inlining', () => {
    // p1 < |z| is continue-while |z| > p1: descriptor normalization swaps
    // operands and flips the operator, so the escape is <=.
    const swapped = compileFrm(
      `C2Swap {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  p1 < |z|\n}`,
      'c2-swap',
      2,
    );
    expect(swapped.success).toBe(true);
    expect(swapped.bailoutDescriptor?.kind).toBe('C2');
    expect(assembleShader({ formulaId: 'c2-swap', ...COMBO_BASE }, swapped.plugin)).toContain(
      '#define C2_ESCAPE_CHECK(zz) ((zz) <= (',
    );
  });

  it('C2 parameterized thresholds surface the .x coercion warning; constants stay silent', () => {
    const withParams = compileFrm(
      `C2Warn {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < p1 * p2 + 1\n}`,
      'c2-warn',
      2,
    );
    expect(withParams.success).toBe(true);
    expect(withParams.warnings.some((w) => w.includes('coerces to real'))).toBe(true);
    expect(withParams.warnings.some((w) => w.includes('p1') && w.includes('p2'))).toBe(true);

    const constOnly = compileFrm(
      `C2Quiet {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < sqrt(16)\n}`,
      'c2-quiet',
      2,
    );
    expect(constOnly.success).toBe(true);
    expect(constOnly.bailoutDescriptor?.kind).toBe('C2');
    expect(constOnly.warnings.some((w) => w.includes('coerces to real'))).toBe(false);
  });
});
