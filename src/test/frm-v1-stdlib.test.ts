import { describe, expect, it } from "vitest";

import {
  FRM_V1_FUNCTION_SLOT_NAMES,
  FRM_V1_STDLIB_NAMES,
  FRM_V1_UNARY_FUNCTION_NAMES,
  frmV1Acos,
  frmV1Acosh,
  frmV1Asin,
  frmV1Asinh,
  frmV1Atan,
  frmV1Atanh,
  frmV1Classify,
  frmV1Cotanh,
  frmV1Identity,
  frmV1QuantizeStandard32Boundary,
  frmV1Log,
  frmV1Round,
  frmV1Sin,
  frmV1Sqrt,
  frmV1Standard32Close,
  frmV1Tanh,
  resolveFrmV1FunctionSlot,
  type FrmV1Complex,
} from "@/engine/frm/frm-v1-stdlib";
import { FRM_V1_GLSL_PRELUDE } from "@/engine/frm/frm-v1-glsl-prelude";
import { compileClassicFrmEntry } from "@/engine/frm/compile";
import { evaluateOrbit } from "@/engine/frm/orbit-eval";

const closeTo = (
  actual: FrmV1Complex,
  expected: FrmV1Complex,
  tolerance = 1e-12,
) => {
  expect(actual.re).toBeCloseTo(
    expected.re,
    Math.max(0, Math.floor(-Math.log10(tolerance))),
  );
  expect(actual.im).toBeCloseTo(
    expected.im,
    Math.max(0, Math.floor(-Math.log10(tolerance))),
  );
};

const conjugate = (z: FrmV1Complex): FrmV1Complex => ({ re: z.re, im: -z.im });

describe("isolated FRM-like stdlib v1 CPU reference", () => {
  it("separates frozen stdlib names from typed fn1-fn4 mappings", () => {
    expect(FRM_V1_STDLIB_NAMES).toEqual([
      "abs",
      "sqr",
      "sqrt",
      "exp",
      "log",
      "recip",
      "conj",
      "flip",
      "real",
      "imag",
      "cabs",
      "round",
      "atan2",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "sinh",
      "cosh",
      "tanh",
      "asinh",
      "acosh",
      "atanh",
      "cotanh",
      "cosxx",
      "identity",
    ]);
    expect(Object.isFrozen(FRM_V1_STDLIB_NAMES)).toBe(true);
    expect(FRM_V1_FUNCTION_SLOT_NAMES).toEqual(["fn1", "fn2", "fn3", "fn4"]);
    expect(FRM_V1_UNARY_FUNCTION_NAMES).toEqual(
      FRM_V1_STDLIB_NAMES.filter((name) => name !== "atan2"),
    );
    expect(resolveFrmV1FunctionSlot("fn3", { fn1: "sin", fn3: "asinh" })).toBe(
      "asinh",
    );
    expect(resolveFrmV1FunctionSlot("fn2", { fn1: "sin" })).toBeUndefined();
  });

  it("uses the principal log and sqrt on their cuts without a zero-radius repair", () => {
    const logZero = frmV1Log({ re: 0, im: 0 });
    expect(logZero.re).toBe(-Infinity);
    expect(logZero.im).toBe(0);
    expect(frmV1Classify(logZero)).toEqual({
      finite: false,
      event: "nonFinite",
    });
    expect(frmV1Log({ re: -2, im: 0 }).im).toBeCloseTo(Math.PI, 14);

    closeTo(frmV1Sqrt({ re: -4, im: 0 }), { re: 0, im: 2 });
    const canonicalizedNegativeZero = frmV1Sqrt({ re: -4, im: -0 });
    expect(canonicalizedNegativeZero.re).toBe(0);
    expect(canonicalizedNegativeZero.im).toBe(2);
    expect(frmV1Log({ re: -2, im: -0 }).im).toBeCloseTo(Math.PI, 14);
  });

  it("preserves nonzero one-sided branch-cut limits while canonicalizing exact zero", () => {
    const epsilon = 1e-9;
    const upperRoot = frmV1Sqrt({ re: -4, im: epsilon });
    const lowerRoot = frmV1Sqrt({ re: -4, im: -epsilon });
    expect(upperRoot.im).toBeGreaterThan(0);
    expect(lowerRoot.im).toBeLessThan(0);

    const upperAcosh = frmV1Acosh({ re: -2, im: epsilon });
    const lowerAcosh = frmV1Acosh({ re: -2, im: -epsilon });
    expect(upperAcosh.re).toBeCloseTo(Math.acosh(2), 10);
    expect(lowerAcosh.re).toBeCloseTo(Math.acosh(2), 10);
    expect(upperAcosh.im).toBeCloseTo(Math.PI, 8);
    expect(lowerAcosh.im).toBeCloseTo(-Math.PI, 8);

    const upperAtanh = frmV1Atanh({ re: 2, im: epsilon });
    const lowerAtanh = frmV1Atanh({ re: 2, im: -epsilon });
    expect(upperAtanh.re).toBeCloseTo(Math.log(3) / 2, 10);
    expect(lowerAtanh.re).toBeCloseTo(Math.log(3) / 2, 10);
    expect(upperAtanh.im).toBeCloseTo(Math.PI / 2, 8);
    expect(lowerAtanh.im).toBeCloseTo(-Math.PI / 2, 8);
  });

  it("matches real-axis golden values for inverse circular and hyperbolic functions", () => {
    closeTo(frmV1Asin({ re: 0.5, im: 0 }), { re: Math.PI / 6, im: 0 });
    closeTo(frmV1Acos({ re: 0.5, im: 0 }), { re: Math.PI / 3, im: 0 });
    closeTo(frmV1Atan({ re: 1, im: 0 }), { re: Math.PI / 4, im: 0 });
    closeTo(frmV1Asinh({ re: 1, im: 0 }), { re: Math.asinh(1), im: 0 });
    closeTo(frmV1Acosh({ re: 2, im: 0 }), { re: Math.acosh(2), im: 0 });
    closeTo(frmV1Atanh({ re: 0.5, im: 0 }), { re: Math.atanh(0.5), im: 0 });
  });

  it("preserves conjugate symmetry away from branch cuts", () => {
    const samples = [
      { re: 0.4, im: 0.7 },
      { re: -0.3, im: 0.4 },
    ];
    for (const fn of [
      frmV1Sin,
      frmV1Asin,
      frmV1Acos,
      frmV1Atan,
      frmV1Asinh,
      frmV1Acosh,
      frmV1Atanh,
      frmV1Tanh,
      frmV1Cotanh,
    ]) {
      for (const sample of samples) {
        closeTo(fn(conjugate(sample)), conjugate(fn(sample)), 1e-10);
      }
    }
  });

  it("classifies singularities and non-finite inputs as a nonFinite event instead of throwing", () => {
    expect(frmV1Classify(frmV1Atanh({ re: 1, im: 0 }))).toEqual({
      finite: false,
      event: "nonFinite",
    });
    expect(frmV1Classify(frmV1Atanh({ re: -1, im: 0 }))).toEqual({
      finite: false,
      event: "nonFinite",
    });
    expect(frmV1Classify(frmV1Asin({ re: Infinity, im: 0 }))).toEqual({
      finite: false,
      event: "nonFinite",
    });
    expect(frmV1Classify({ re: NaN, im: 0 })).toEqual({
      finite: false,
      event: "nonFinite",
    });
  });

  it("rounds every component with exact ties away from zero", () => {
    expect(frmV1Round({ re: -1.5, im: -0.5 })).toEqual({ re: -2, im: -1 });
    expect(frmV1Round({ re: 0.5, im: 1.5 })).toEqual({ re: 1, im: 2 });
  });

  it("labels boundary quantization as tolerance evidence, not a standard32 oracle", () => {
    const input = { re: 1 / 3, im: -1 / 3 };
    const result = frmV1QuantizeStandard32Boundary(
      (z) => ({ re: z.re * 3, im: z.im * 3 }),
      input,
    );
    expect(result.value).toEqual({
      re: Math.fround(Math.fround(1 / 3) * 3),
      im: Math.fround(Math.fround(-1 / 3) * 3),
    });
    expect(result.classification).toEqual({ finite: true });
    expect(frmV1Standard32Close(result.value, { re: 1, im: -1 }, 1e-6)).toBe(
      true,
    );
  });

  it("identity returns its input unchanged and quantizes like any other primitive boundary", () => {
    const input = { re: 0.1, im: -2.5 };
    expect(frmV1Identity(input)).toEqual({ re: 0.1, im: -2.5 });
    expect(Object.is(frmV1Identity({ re: -0, im: 1 }).re, -0)).toBe(true);
    expect(frmV1Classify(frmV1Identity({ re: Number.NaN, im: 0 }))).toEqual({
      finite: false,
      event: "nonFinite",
    });

    const boundary = frmV1QuantizeStandard32Boundary(frmV1Identity, {
      re: 0.1,
      im: -0,
    });
    expect(boundary.classification).toEqual({ finite: true });
    expect(boundary.value.re).toBe(Math.fround(0.1));
    expect(Object.is(boundary.value.im, 0)).toBe(true);
  });
});

describe("isolated FRM-like stdlib v1 GLSL source-shape contract", () => {
  it("contains the same unintegrated principal inverse formulas and no legacy log call", () => {
    expect(FRM_V1_GLSL_PRELUDE).toContain("vec2 frmV1Log(vec2 z) {");
    expect(FRM_V1_GLSL_PRELUDE).toContain("frmV1NonFiniteEvent = true;");
    expect(FRM_V1_GLSL_PRELUDE).toContain("log(radius)");
    expect(FRM_V1_GLSL_PRELUDE).toContain("vec2 frmV1Asin(vec2 z)");
    expect(FRM_V1_GLSL_PRELUDE).toContain("vec2 frmV1Acosh(vec2 z)");
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "return frmV1Mul(vec2(0.0, -1.0), frmV1Log(frmV1Add(iz, root)));",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "frmV1Sub(frmV1Log(frmV1Add(vec2(1.0, 0.0), iz)), frmV1Log(frmV1Sub(vec2(1.0, 0.0), iz)))",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "frmV1Sqrt(frmV1Sub(z, vec2(1.0, 0.0)))",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "frmV1Sub(frmV1Log(frmV1Add(vec2(1.0, 0.0), z)), frmV1Log(frmV1Sub(vec2(1.0, 0.0), z))) * 0.5",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "float frmV1SinhReal(float value) { return (exp(value) - exp(-value)) * 0.5; }",
    );
    expect(FRM_V1_GLSL_PRELUDE).not.toContain("complexLog");
    expect(FRM_V1_GLSL_PRELUDE).not.toMatch(/max\s*\(\s*length\s*\(/);
    expect(FRM_V1_GLSL_PRELUDE).not.toContain("1.0 / z.y");
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "if (imaginary == 0.0 && z.x < 0.0) return 3.14159265358979323846;",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "vec2 frmV1Identity(vec2 z) { return frmV1Checked(z); }",
    );
  });

  it("has deterministic componentwise ties-away rounding and no identity/provenance branches", () => {
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "value < 0.0 ? ceil(value - 0.5) : floor(value + 0.5)",
    );
    expect(FRM_V1_GLSL_PRELUDE).toContain(
      "return frmV1Checked(vec2(frmV1RoundComponent(z.x), frmV1RoundComponent(z.y)));",
    );
    expect(FRM_V1_GLSL_PRELUDE).not.toMatch(
      /\b(?:formulaId|scope|provenance|trusted)\b/i,
    );
  });
});

/**
 * Differential guard: every v1 stdlib function whose name the classic
 * dialect shares must agree with the classic orbit evaluator (the fixture
 * generator for the migration evidence) on complex probe inputs. This is
 * the test that would have caught the v1 flip rotation bug found by the 12d
 * conformance diagnosis (v1 had (-im, re); Fractint documents and the
 * classic engine implements the component swap).
 *
 * Probe regime note: classic clamps hyperbolic scalar inputs to ±80 and
 * floors the log radius at 1e-20 — v1 deliberately does neither — so the
 * probes stay in the moderate range where the two semantics coincide.
 */
describe("v1 stdlib vs classic orbit-eval differential", () => {
  const probes: readonly (readonly [number, number])[] = [
    [0.25, 0.1],
    [-0.5, 0.3],
    [1.1, -0.4],
    [0.7, 0.9],
  ];

  const sharedUnary = [
    "sin",
    "cos",
    "cosxx",
    "cotanh",
    "tan",
    "sinh",
    "cosh",
    "tanh",
    "exp",
    "log",
    "sqrt",
    "abs",
    "sqr",
    "conj",
    "flip",
    "recip",
    "cabs",
    "real",
    "imag",
  ] as const;

  for (const name of sharedUnary) {
    it(`${name} matches the classic evaluator on moderate complex inputs`, async () => {
      const v1 = (await import("@/engine/frm/frm-v1-stdlib")) as Record<
        string,
        unknown
      >;
      const exportName = `frmV1${name[0]!.toUpperCase()}${name.slice(1)}`;
      const v1Fn = v1[exportName] as (z: FrmV1Complex) => FrmV1Complex;
      expect(typeof v1Fn).toBe("function");

      const classic = compileClassicFrmEntry(
        `DiffProbe {\n  z = pixel:\n  z = ${name}(z),\n  |z| <= 4\n}`,
        "DiffProbe",
        "stdlib-differential-fixture",
        2,
      );
      expect(classic.success).toBe(true);
      if (!classic.success || !classic.ast || !classic.bailoutDescriptor)
        throw new Error(`classic-compile-failed:${name}`);

      for (const [re, im] of probes) {
        const classicResult = evaluateOrbit(classic.ast, {
          pixel: { re, im },
          maxIterations: 1,
          descriptor: classic.bailoutDescriptor,
        });
        const classicZ1 = classicResult.orbit[0];
        expect(classicZ1).toBeDefined();
        const v1Z1 = v1Fn({ re, im });
        const scale = Math.max(
          1,
          Math.abs(classicZ1!.re),
          Math.abs(classicZ1!.im),
          Math.abs(v1Z1.re),
          Math.abs(v1Z1.im),
        );
        expect(
          Math.abs(v1Z1.re - classicZ1!.re) / scale,
          `${name}(${re},${im}) re: v1=${v1Z1.re} classic=${classicZ1!.re}`,
        ).toBeLessThan(1e-9);
        expect(
          Math.abs(v1Z1.im - classicZ1!.im) / scale,
          `${name}(${re},${im}) im: v1=${v1Z1.im} classic=${classicZ1!.im}`,
        ).toBeLessThan(1e-9);
      }
    });
  }
});
