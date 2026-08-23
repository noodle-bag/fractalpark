import { beforeAll, describe, expect, it } from "vitest";

import { registerBuiltins } from "@/engine/plugins/builtins";
import {
  NATIVE_FORMULA_RECIPES_V1,
  NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1,
  compareNativeRecipeOrbitsV1,
  nativeRecipeProbesToOrbitRunV1,
  validateNativeRecipeV1,
  type NativeFormulaRecipeV1,
  type NativeRecipeOrbitRunV1,
  type NativeRecipeProbeV1,
} from "@/engine/formulas/v1/native-recipes";
import { parseFrmLikeV1 } from "@/engine/frm/v1";
import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import { runFormulaLibraryOracle } from "@/engine/formulas/v1/bulk-migration";
import type { FormulaIdV1 } from "@/engine/formulas/v1";

beforeAll(() => {
  registerBuiltins({ quiet: true });
});

describe("native recipe layer v1", () => {
  it("keeps the shared cross-check contract frozen and row-independent", () => {
    expect(NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1).toEqual({
      probePixels: [
        [0.25, 0.1],
        [-0.5, 0.3],
        [0.3, -0.02],
        [2, 2],
      ],
      maxIterations: 16,
      relativeTolerance: 3e-4,
    });
    expect(Object.isFrozen(NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1)).toBe(true);
    expect(Object.isFrozen(NATIVE_FORMULA_RECIPES_V1)).toBe(true);
  });

  it("validates every registered pilot recipe through the full v1 chain", async () => {
    expect(NATIVE_FORMULA_RECIPES_V1.length).toBe(89);
    for (const recipe of NATIVE_FORMULA_RECIPES_V1) {
      const result = await validateNativeRecipeV1(recipe);
      if (!result.ok) throw new Error(`${recipe.runtimeId}: ${result.reasonCode}`);
      expect(result.definition.formulaId).toBe(recipe.formulaId);
      expect(result.definition.source).toBe(recipe.source);
      expect(result.sourceRevision).toMatch(/^[0-9a-f]{64}$/);
      expect(result.semanticHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("fails closed on identity, alias, plugin, family, parse, and canonical tampering", async () => {
    const [mandelbrot] = NATIVE_FORMULA_RECIPES_V1;
    const cases: Array<[string, NativeFormulaRecipeV1, string]> = [
      [
        "non-v5 identity",
        { ...mandelbrot, formulaId: "11111111-1111-4111-8111-111111111111" as FormulaIdV1 },
        "recipe-identity-invalid",
      ],
      [
        "alias join mismatch",
        {
          ...mandelbrot,
          formulaId: "c09b9dec-60a6-5a26-8f03-d5ea40f0d49b" as FormulaIdV1,
        },
        "recipe-runtime-alias-mismatch",
      ],
      [
        "missing runtime plugin",
        { ...mandelbrot, runtimeId: "no-such-plugin" },
        "recipe-runtime-alias-mismatch",
      ],
      [
        "family mismatch",
        { ...mandelbrot, family: "exotic" as const },
        "recipe-family-mismatch",
      ],
      [
        "invalid syntax",
        { ...mandelbrot, source: mandelbrot.source.replace("z = z * z + c", "z = = z") },
        "recipe-parse-failed",
      ],
      [
        "non-canonical whitespace",
        { ...mandelbrot, source: mandelbrot.source.replace("z = z * z + c", "z  =  z * z + c") },
        "recipe-canonical-roundtrip-failed",
      ],
      [
        "off-formatter source",
        { ...mandelbrot, source: `${mandelbrot.source}\n` },
        "recipe-canonical-roundtrip-failed",
      ],
    ];
    for (const [label, recipe, expected] of cases) {
      const result = await validateNativeRecipeV1(recipe);
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.reasonCode, label).toBe(expected);
    }
  });

  it("reproduces the native mandelbrot orbit through the v1 CPU backend", async () => {
    const recipe = NATIVE_FORMULA_RECIPES_V1[0]!;
    const parsed = parseFrmLikeV1(recipe.source);
    if (!parsed.ok) throw new Error("parse");
    const compiled = compileFrmLikeV1Backend(parsed.ir);
    if (!compiled.ok) throw new Error("compile");
    const [run] = runFormulaLibraryOracle(compiled.backend, [[0.25, 0.1]], 4);
    // parameter-plane: z0 = 0, c = pixel; power = 2 fast path z -> z*z + c
    // z1 = c; z2 = c^2 + c; z3 = (c^2+c)^2 + c (double-precision reference)
    const c = { re: 0.25, im: 0.1 };
    const z1 = c;
    const z2 = {
      re: z1.re * z1.re - z1.im * z1.im + c.re,
      im: 2 * z1.re * z1.im + c.im,
    };
    const z3 = {
      re: z2.re * z2.re - z2.im * z2.im + c.re,
      im: 2 * z2.re * z2.im + c.im,
    };
    const expected = [z1, z2, z3];
    expect(run.orbit.length).toBeGreaterThanOrEqual(3);
    for (const [index, point] of expected.entries()) {
      const actual = run.orbit[index]!;
      if (actual[0] === "non-finite" || actual[1] === "non-finite")
        throw new Error("unexpected non-finite");
      expect(actual[0]).toBeCloseTo(point.re, 5);
      expect(actual[1]).toBeCloseTo(point.im, 5);
    }
  });

  it("reproduces the native phoenix two-step orbit memory", async () => {
    const recipe = NATIVE_FORMULA_RECIPES_V1.find(
      (entry) => entry.runtimeId === "phoenix",
    )!;
    const parsed = parseFrmLikeV1(recipe.source);
    if (!parsed.ok) throw new Error("parse");
    const compiled = compileFrmLikeV1Backend(parsed.ir);
    if (!compiled.ok) throw new Error("compile");
    const [run] = runFormulaLibraryOracle(compiled.backend, [[0.25, 0.1]], 4);
    // z1 = c (memory term zero); z2 = z1^2 + c; z3 = z2^2 + c + P * z1, P = -0.5
    const c = { re: 0.25, im: 0.1 };
    const p = -0.5;
    const square = (z: { re: number; im: number }) => ({
      re: z.re * z.re - z.im * z.im,
      im: 2 * z.re * z.im,
    });
    const z1 = c;
    const z2base = square(z1);
    const z2 = { re: z2base.re + c.re, im: z2base.im + c.im };
    const z3base = square(z2);
    const z3 = {
      re: z3base.re + c.re + p * z1.re,
      im: z3base.im + c.im + p * z1.im,
    };
    const z3Point = run.orbit[2]!;
    if (z3Point[0] === "non-finite" || z3Point[1] === "non-finite")
      throw new Error("unexpected non-finite");
    expect(z3Point[0]).toBeCloseTo(z3.re, 5);
    expect(z3Point[1]).toBeCloseTo(z3.im, 5);
  });
});

describe("native recipe holds", () => {
  it("recovers the exact 12-row transcendental set through one shared numeric remedy", async () => {
    const { RECIPES } = await import(
      "@/engine/formulas/v1/native-recipes-b94-recovered-transcendental"
    );
    expect(RECIPES.map((recipe) => recipe.formulaId).sort()).toEqual([
      "17d88272-6dbf-5622-996a-b116ea3a3fab",
      "190fa538-89c9-590f-8170-34b3c570fc5d",
      "201c54f3-a77a-5be0-a0a5-6f4f1998ee6d",
      "22d9a008-eb14-53de-9960-11eb5d37bb8e",
      "3edbea29-956a-5900-9aa7-02ccc2183016",
      "62098934-def3-527a-ac43-2c80449c9848",
      "78e550c6-d58d-57b7-92ff-82e9ed0728f0",
      "8eb342fe-8a05-524e-8b98-35cdc8af5be3",
      "9f301c01-13fa-57b4-a3b2-99add821bfb0",
      "af500910-46ce-5a43-b430-c0154cc05959",
      "beeb4aec-91cd-5d01-83bb-0b98ca851e79",
      "d89f722f-35fe-587a-bee9-efdf05885728",
    ]);
    for (const recipe of RECIPES) {
      expect(recipe.source).toContain("round(");
      expect(recipe.source).toContain("* 16");
    }

    const newton6 = RECIPES.find((recipe) => recipe.runtimeId === "newton6");
    if (!newton6) throw new Error("newton6-recovery-missing");
    const parsed = parseFrmLikeV1(newton6.source);
    if (!parsed.ok) throw new Error("newton6-recovery-parse-failed");
    const compiled = compileFrmLikeV1Backend(parsed.ir);
    if (!compiled.ok) throw new Error("newton6-recovery-compile-failed");
    const [tinyRun] = runFormulaLibraryOracle(compiled.backend, [[0, 0]], 2);
    expect(tinyRun.orbit[0]).toEqual([0, 0]);
    expect(tinyRun.event).toBeNull();
    expect(tinyRun.escapedAt).toBe(2);
  });

  it("recovers the exact 9-row amplified set without changing publication state", async () => {
    const { RECOVERED_AMPLIFIED_RECIPES_V1 } = await import(
      "@/engine/formulas/v1/native-recipes-b94-held"
    );
    expect(RECOVERED_AMPLIFIED_RECIPES_V1.map((recipe) => recipe.formulaId).sort()).toEqual([
      "280cd3e2-865b-5c78-90b7-39b2a36d7be0",
      "42b369a5-2873-50e9-8684-cad5e60630ff",
      "465a5b03-469d-59b3-8564-45af7564e37a",
      "46acfdeb-2dac-59c9-a94a-fd4809420dc2",
      "a89891b1-8ccb-5d58-9fbb-05944b85ce3c",
      "bb186688-4571-5725-a8ed-a17e0100dbc8",
      "d747aff8-e49f-5875-a85f-89d4a1d25846",
      "e375f423-dfa4-54bf-9d56-c41215f4f72a",
      "ed671b4c-a04c-5545-ad0c-a73727761ce8",
    ]);
    expect(RECOVERED_AMPLIFIED_RECIPES_V1.map((recipe) => recipe.runtimeId).sort()).toEqual([
      "airshipCubic",
      "burningShipCubic",
      "burningShipQuartic",
      "cubicPerpendicularMandelbrot",
      "mandelbox",
      "multicorn5",
      "newtonCosh",
      "newtonExp",
      "quarticPerpendicularMandelbrot",
    ]);
    expect(
      RECOVERED_AMPLIFIED_RECIPES_V1.find((recipe) => recipe.runtimeId === "mandelbox")?.source,
    ).toContain("round((mandelboxScale * z + c) * 16) / 16");
    expect(
      RECOVERED_AMPLIFIED_RECIPES_V1.find((recipe) => recipe.runtimeId === "newtonExp")?.source,
    ).toContain("if real(z) > 20");
    for (const recipe of RECOVERED_AMPLIFIED_RECIPES_V1) {
      const result = await validateNativeRecipeV1(recipe);
      if (!result.ok) throw new Error(`${recipe.runtimeId}: ${result.reasonCode}`);
    }
  });

  it("keeps all 21 recovered recipes publication-held until the atomic gate", async () => {
    const { NATIVE_RECIPE_HOLDS_V1 } = await import(
      "@/engine/formulas/v1/native-recipes-b94-held"
    );
    expect(NATIVE_RECIPE_HOLDS_V1.length).toBe(21);
    const accepted = new Set(NATIVE_FORMULA_RECIPES_V1.map((r) => r.runtimeId));
    const classes = new Set<string>();
    for (const hold of NATIVE_RECIPE_HOLDS_V1) {
      expect(accepted.has(hold.recipe.runtimeId)).toBe(true);
      classes.add(hold.holdClass);
      expect(hold.evidence.length).toBeGreaterThan(0);
      const result = await validateNativeRecipeV1(hold.recipe);
      if (!result.ok)
        throw new Error(`${hold.recipe.runtimeId}: ${result.reasonCode}`);
    }
    expect([...classes].sort()).toEqual([
      "chaotic-amplification",
      "ill-conditioned-cancellation",
      "swiftshader-transcendental",
    ]);
    // Recovered technical recipes intentionally overlap publication holds.
    expect(
      new Set([
        ...NATIVE_FORMULA_RECIPES_V1.map((recipe) => recipe.formulaId),
        ...NATIVE_RECIPE_HOLDS_V1.map((hold) => hold.recipe.formulaId),
      ]).size,
    ).toBe(89);
  });
});

describe("native probe conversion", () => {
  it("records the escape index without duplicating the escaping point", () => {
    // z_3 escapes: the u_steps=3 draw returns z_3 unescaped (its pre-step
    // check never ran); the u_steps=4 draw returns the same z_3 with the
    // escape flag and iterations=3.
    const probes: NativeRecipeProbeV1[] = [
      { z: [0.5, 0.2], iterations: 1, escaped: false },
      { z: [0.55, 0.4], iterations: 2, escaped: false },
      { z: [1.2, 0.9], iterations: 3, escaped: false },
      { z: [1.2, 0.9], iterations: 3, escaped: true },
    ];
    const run = nativeRecipeProbesToOrbitRunV1(probes, [2, 2], 16);
    expect(run.escapedAt).toBe(3);
    expect(run.orbit).toEqual([
      [0.5, 0.2],
      [0.55, 0.4],
      [1.2, 0.9],
    ]);
    expect(run.event).toBeNull();
  });

  it("ignores draws after the escape and keeps a complete bounded orbit", () => {
    const bounded: NativeRecipeProbeV1[] = [
      { z: [0.5, 0.2], iterations: 1, escaped: false },
      { z: [0.55, 0.4], iterations: 2, escaped: false },
    ];
    const run = nativeRecipeProbesToOrbitRunV1(bounded, [0.25, 0.1], 16);
    expect(run.escapedAt).toBeNull();
    expect(run.orbit).toHaveLength(2);
  });

  it("observes a boundary escape from the budget+1 draw without a 17th point", () => {
    // Orbit converges exactly at the budgeted step 16: draws 1..16 produce
    // the points unescaped; draw 17 reports iterations=16 with the flag.
    const probes: NativeRecipeProbeV1[] = [];
    for (let step = 1; step <= 16; step++)
      probes.push({ z: [step, 0], iterations: step, escaped: false });
    probes.push({ z: [16, 0], iterations: 16, escaped: true });
    const run = nativeRecipeProbesToOrbitRunV1(probes, [2, 2], 16);
    expect(run.escapedAt).toBe(16);
    expect(run.orbit).toHaveLength(16);
  });

  it("drops the budget+1 point when no escape fires at the boundary", () => {
    const probes: NativeRecipeProbeV1[] = [];
    for (let step = 1; step <= 17; step++)
      probes.push({ z: [step, 0], iterations: step, escaped: false });
    const run = nativeRecipeProbesToOrbitRunV1(probes, [2, 2], 16);
    expect(run.escapedAt).toBeNull();
    expect(run.orbit).toHaveLength(16);
  });
});

describe("native recipe orbit comparison", () => {
  const baseRun: NativeRecipeOrbitRunV1 = {
    pixel: [0.25, 0.1],
    escapedAt: null,
    event: null,
    orbit: [
      [0.25, 0.1],
      [0.3025, 0.15],
    ],
  };

  it("accepts identical and tolerance-close runs", () => {
    expect(compareNativeRecipeOrbitsV1([baseRun], [baseRun]).ok).toBe(true);
    const close: NativeRecipeOrbitRunV1 = {
      ...baseRun,
      orbit: [
        [0.25 + 1e-6, 0.1],
        [0.3025, 0.15 - 1e-6],
      ],
    };
    const verdict = compareNativeRecipeOrbitsV1([baseRun], [close]);
    expect(verdict.ok).toBe(true);
    expect(verdict.maxRelativeDelta).toBeGreaterThan(0);
  });

  it("rejects every mismatch class with its stable reason code", () => {
    expect(compareNativeRecipeOrbitsV1([baseRun], []).reasonCode).toBe(
      "run-count-mismatch",
    );
    expect(
      compareNativeRecipeOrbitsV1([baseRun], [{ ...baseRun, pixel: [0.26, 0.1] }])
        .reasonCode,
    ).toBe("pixel-mismatch");
    expect(
      compareNativeRecipeOrbitsV1([baseRun], [{ ...baseRun, event: "nonFinite" }])
        .reasonCode,
    ).toBe("event-mismatch");
    expect(
      compareNativeRecipeOrbitsV1([baseRun], [{ ...baseRun, escapedAt: 2 }])
        .reasonCode,
    ).toBe("escape-index-mismatch");
    expect(
      compareNativeRecipeOrbitsV1(
        [baseRun],
        [{ ...baseRun, orbit: baseRun.orbit.slice(0, 1) }],
      ).reasonCode,
    ).toBe("orbit-length-mismatch");
    expect(
      compareNativeRecipeOrbitsV1(
        [baseRun],
        [{ ...baseRun, orbit: [[0.25, 0.1], [0.4, 0.15]] }],
      ).reasonCode,
    ).toBe("orbit-value-mismatch");
  });

  it("requires exact non-finite token agreement", () => {
    const nonFinite: NativeRecipeOrbitRunV1 = {
      ...baseRun,
      event: "nonFinite",
      orbit: [
        [0.25, 0.1],
        ["non-finite", "non-finite"],
      ],
    };
    expect(compareNativeRecipeOrbitsV1([nonFinite], [nonFinite]).ok).toBe(true);
    const mismatched: NativeRecipeOrbitRunV1 = {
      ...nonFinite,
      orbit: [
        [0.25, 0.1],
        [0, 0],
      ],
    };
    expect(
      compareNativeRecipeOrbitsV1([nonFinite], [mismatched]).reasonCode,
    ).toBe("orbit-value-mismatch");
  });
});
