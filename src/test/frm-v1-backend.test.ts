import { describe, expect, it } from "vitest";

import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import {
  FRM_LIKE_V1_DEFAULT_LIMITS,
  parseFrmLikeV1,
  type FrmLikeV1Ir,
} from "@/engine/frm/v1";

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
NativeCandidate {
  parameters:
    gain: real = 2
    offset: complex = (1, -1)
    transform: function = sqr
  init:
    z = pixel
  loop:
    old = z
    z = transform(z) + offset
    real(z) = real(z) + gain
    if real(z) > 1
      imag(z) = imag(z) + 3
    else
      imag(z) = imag(z) - 3
    endif
  bailout:
    |z| < 100
}`;
function backend(source = SOURCE) {
  const parsed = parseFrmLikeV1(source);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.reason);
  const compiled = compileFrmLikeV1Backend(parsed.ir);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(compiled.reason);
  return compiled.backend;
}

function sourceFor(
  loop: string,
  bailout = "|z| < 100",
  parameters = "",
): string {
  const parameterSection = parameters ? `  parameters:\n${parameters}\n` : "";
  return `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Focused {
${parameterSection}  init:
    z = pixel
  loop:
${loop}
  bailout:
    ${bailout}
}`;
}

describe("isolated FRM-like v1 backend candidate", () => {
  it("lowers parsed typed IR deterministically into parameterized GLSL fragments", () => {
    const one = backend();
    const two = backend();
    expect(one.glsl).toEqual(two.glsl);
    expect(one.glsl.functionDefaults).toEqual({ transform: "sqr" });
    expect(one.glsl.generatedBytes).toBeGreaterThan(0);
    expect(one.glsl.generatedBytes).toBeLessThanOrEqual(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxGeneratedShaderBytes,
    );
    expect(one.glsl.declarations).toContain("uniform vec2 gain;");
    expect(one.glsl.declarations).toContain("uniform vec2 offset;");
    expect(one.glsl.declarations).toContain("uniform int u_frm_transform;");
    expect(one.glsl.declarations).toContain("vec2 old = vec2(0.0);");
    expect(one.glsl.declarations).toContain("frmV1Dispatch_transform");
    expect(one.glsl.loop).toContain("z.x =");
    expect(one.glsl.loop).toMatch(
      /if \([^\n]*frmV1Real\(z\)[^\n]*>[^\n]*vec2\(1\.0, 0\.0\)/,
    );
    expect(one.glsl.continuePredicate).toContain("frmV1Radius(z)");
    expect(one.glsl.eventFlag).toBe("frmV1NonFiniteEvent");
    expect(one.glsl.declarations).toContain("frmV1NonFiniteEvent = true");
    expect(one.glsl.declarations).not.toMatch(
      /formulaId|scope|provenance|trusted/i,
    );
    expect(one.metadata).toEqual({
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      numericProfile: "standard32",
      evaluationOrder: "source-order-left-to-right",
      nonFinite: "terminate-with-event",
    });
  });

  it("uses resolved parameter/function mappings without recompilation and preserves source-order stores", () => {
    const compiled = backend();
    const squared = compiled.cpu.createState({
      pixel: { re: 1, im: 0 },
      parameters: { gain: 2, offset: [1, -1], transform: "sqr" },
    });
    compiled.cpu.init(squared);
    compiled.cpu.step(squared);
    expect(squared.values.old).toEqual({ re: 1, im: 0 });
    expect(squared.values.z).toEqual({ re: 4, im: 2 });
    expect(squared.values.zPrev).toEqual({ re: 1, im: 0 });
    expect(squared.values.LastSqr).toEqual({ re: 20, im: 0 });
    expect(compiled.cpu.shouldContinue(squared).continue).toBe(true);

    const sine = compiled.cpu.createState({
      pixel: { re: 1, im: 0 },
      parameters: { gain: 3, offset: [0, 0], transform: "sin" },
    });
    compiled.cpu.init(sine);
    compiled.cpu.step(sine);
    expect(sine.values.z.re).toBeCloseTo(Math.fround(Math.sin(1) + 3), 5);
    expect(sine.values.z.im).toBeCloseTo(3, 5);

    const initialSystems = backend(
      sourceFor("    z = z").replace(
        "    z = pixel",
        "    z = zPrev + LastSqr",
      ),
    );
    const initialState = initialSystems.cpu.createState({
      pixel: { re: 9, im: 9 },
    });
    initialSystems.cpu.init(initialState);
    expect(initialState.values.z).toEqual({ re: 0, im: 0 });
    expect(initialSystems.glsl.declarations).not.toContain(
      "uniform vec2 zPrev",
    );
    expect(initialSystems.glsl.declarations).not.toContain(
      "uniform vec2 LastSqr",
    );
  });

  it("takes branches by real-part comparisons and reports versioned nonfinite termination", () => {
    const compiled = backend();
    const low = compiled.cpu.createState({
      pixel: { re: 0, im: 0 },
      parameters: { offset: [0, 0] },
    });
    compiled.cpu.init(low);
    compiled.cpu.step(low);
    expect(low.values.z).toEqual({ re: 2, im: 3 });

    const singularSource = SOURCE.replace(
      "z = transform(z) + offset",
      "z = recip(z)",
    );
    const singular = backend(singularSource).cpu.createState({
      pixel: { re: 0, im: 0 },
    });
    backend(singularSource).cpu.init(singular);
    const result = backend(singularSource).cpu.step(singular);
    expect(result.event).toBe("nonFinite");
    expect(backend(singularSource).cpu.shouldContinue(singular).event).toBe(
      "nonFinite",
    );
  });

  it("fails closed on malformed manually supplied IR rather than emitting a fallback backend", () => {
    const parsed = parseFrmLikeV1(SOURCE);
    if (parsed.ok === false) throw new Error(parsed.reason);
    expect(
      compileFrmLikeV1Backend(parsed.ir, {
        limits: { maxGeneratedShaderBytes: 0 },
      }),
    ).toEqual({ ok: false, reason: "generated-shader-too-large" });
    expect(
      compileFrmLikeV1Backend(parsed.ir, {
        limits: {
          maxGeneratedShaderBytes:
            FRM_LIKE_V1_DEFAULT_LIMITS.maxGeneratedShaderBytes + 1,
        },
      }).ok,
    ).toBe(true);
    expect(
      compileFrmLikeV1Backend(parsed.ir, {
        limits: { maxGeneratedShaderBytes: 1.5 },
      }),
    ).toEqual({ ok: false, reason: "invalid-safety-limit" });
    const malformed: FrmLikeV1Ir = {
      ...parsed.ir,
      numericProfile: "standard32",
      bailout: { kind: "call", callee: "notFrozen", args: [] },
    };
    expect(compileFrmLikeV1Backend(malformed)).toEqual({
      ok: false,
      reason: "unknown-function",
    });

    const oversizedName = `transform${"x".repeat(20_000)}`;
    const oversized = parseFrmLikeV1(
      sourceFor(
        "    z = sqr(z)",
        "|z| < 4",
        `    ${oversizedName}: function = sin`,
      ),
    );
    expect(oversized.ok).toBe(true);
    if (oversized.ok)
      expect(compileFrmLikeV1Backend(oversized.ir)).toEqual({
        ok: false,
        reason: "generated-shader-too-large",
      });
  });

  it("uses explicit boolean coercion, complex inequality OR, and real-projected powers", () => {
    const booleans = backend(
      sourceFor("    flag = z != (1, 1)\n    z = flag + 2"),
    );
    const booleanState = booleans.cpu.createState({
      pixel: { re: 1, im: 1 },
    });
    booleans.cpu.init(booleanState);
    booleans.cpu.step(booleanState);
    expect(booleanState.booleans.flag).toBe(false);
    expect(booleanState.values.z).toEqual({ re: 2, im: 0 });
    expect(booleans.glsl.declarations).toContain("bool flag = false;");
    expect(booleans.glsl.loop).toContain("!=");
    expect(booleans.glsl.loop).toContain("||");

    const powers = backend(sourceFor("    z = (2, 0) ^ (2, 9)"));
    const powerState = powers.cpu.createState();
    powers.cpu.init(powerState);
    powers.cpu.step(powerState);
    expect(powerState.values.z).toEqual({ re: 4, im: 0 });
    expect(powers.glsl.loop).toMatch(/frmV1Pow\([^\n]+\.x\)/);
  });

  it("saturates the LastSqr side channel instead of terminating finite orbits whose squared modulus overflows f32", () => {
    const compiled = backend(sourceFor("    z = z * z", "|z| < 100"));
    const state = compiled.cpu.createState({
      pixel: { re: 1e6, im: 0 },
    });
    compiled.cpu.init(state);
    compiled.cpu.step(state);
    expect(state.values.z).toEqual({ re: Math.fround(1e12), im: 0 });
    const second = compiled.cpu.step(state);
    // z = 1e24 is finite, but dot(z, z) = 1e48 overflows f32: the decision
    // channel saturates instead of terminating the orbit (classic evaluates
    // the channel at host precision and escapes normally).
    expect(second.event).toBeUndefined();
    expect(state.values.LastSqr.re).toBe(Number.POSITIVE_INFINITY);
    const continuation = compiled.cpu.shouldContinue(state);
    expect(continuation.event).toBeUndefined();
    expect(continuation.continue).toBe(false);
  });

  it("emits the GLSL LastSqr side-channel update without the nonFinite guard", () => {
    const compiled = backend(sourceFor("    z = z * z", "|z| < 100"));
    // dot(z, z) may saturate to +Inf for finite z; the shader must mirror
    // the CPU's saturating decision channel instead of raising the event.
    expect(compiled.glsl.loop).toContain("LastSqr = vec2(dot(z, z), 0.0);");
    expect(compiled.glsl.loop).not.toContain(
      "frmV1Checked(vec2(dot(z, z), 0.0))",
    );
  });

  it("rounds every primitive complex multiplication and short-circuits an unselected singular RHS", () => {
    const arithmetic = backend(
      sourceFor("    z = (0.1, 0.1) * (0.1, 0.1)", "0 && recip((0, 0))"),
    );
    const state = arithmetic.cpu.createState();
    arithmetic.cpu.init(state);
    arithmetic.cpu.step(state);
    const product = Math.fround(
      Math.fround(Math.fround(0.1) * Math.fround(0.1)) +
        Math.fround(Math.fround(0.1) * Math.fround(0.1)),
    );
    expect(state.values.z).toEqual({ re: 0, im: product });
    expect(state.values.z.im).not.toBe(Math.fround(0.02));
    expect(arithmetic.cpu.shouldContinue(state)).toMatchObject({
      continue: false,
    });
    expect(state.terminated).toBeUndefined();
  });

  it("resolves typed fn slots and rejects invalid runtime parameter values", () => {
    const functions = backend(
      sourceFor(
        "    z = fn1(z)",
        "|z| < 100",
        "    transform: function = sin classic fn1",
      ),
    );
    expect(functions.glsl.functionDefaults).toEqual({ transform: "sin" });
    expect(functions.glsl.classicBindings).toEqual({ fn1: "transform" });
    expect(functions.glsl.declarations).not.toContain("u_frm_fn1");
    const state = functions.cpu.createState({
      pixel: { re: 2, im: 0 },
      parameters: { transform: "sqr" },
    });
    functions.cpu.init(state);
    functions.cpu.step(state);
    expect(state.values.z).toEqual({ re: 4, im: 0 });
    expect(state.functions.fn1).toBe("sqr");
    expect(functions.glsl.declarations).toContain("frmV1Dispatch_transform");
    expect(functions.glsl.loop).toContain("frmV1Dispatch_transform");

    expect(() =>
      backend(
        SOURCE.replace("gain: real = 2", "gain: real = 2 domain [1, 3]"),
      ).cpu.createState({
        parameters: { gain: 4 },
      }),
    ).toThrow("runtime-parameter-out-of-domain");
    expect(() =>
      functions.cpu.createState({
        parameters: { transform: "atan2" as never },
      }),
    ).toThrow("runtime-invalid-function-selection");
  });
});
