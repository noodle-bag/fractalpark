import { describe, expect, it } from "vitest";

import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import { parseFrmLikeV1 } from "@/engine/frm/v1";
import { classicDialectGuardsForV1 } from "@/engine/formulas/v1/classic-dialect-guards";

function sourceFor(
  loop: string,
  guardsDirective = "",
  bailout = "|z| < 100",
): string {
  return `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
${guardsDirective}Guarded {
  init:
    z = pixel
  loop:
${loop}
  bailout:
    ${bailout}
}`;
}

function backendFor(source: string) {
  const parsed = parseFrmLikeV1(source);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.reason);
  const compiled = compileFrmLikeV1Backend(parsed.ir);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(compiled.reason);
  return compiled.backend;
}

function stepOnce(
  backend: ReturnType<typeof backendFor>,
  pixel: readonly [number, number],
) {
  const state = backend.cpu.createState({
    pixel: { re: pixel[0], im: pixel[1] },
    c: { re: pixel[0], im: pixel[1] },
    maxit: 8,
    ismand: true,
  });
  backend.cpu.init(state);
  backend.cpu.step(state);
  return state;
}

describe("classic dialect guards (declared per row only)", () => {
  it("zero-division maps an exact-zero complex divisor to (0, 0) without an event", () => {
    const guarded = backendFor(
      sourceFor("    z = 1 / (z * z)", "; @classic-guards: zero-division\n"),
    );
    const state = stepOnce(guarded, [0, 0]);
    expect(state.terminated).toBeUndefined();
    expect(state.values.z).toEqual({ re: 0, im: 0 });

    const plain = backendFor(sourceFor("    z = 1 / (z * z)"));
    const plainState = stepOnce(plain, [0, 0]);
    expect(plainState.terminated).toBe("nonFinite");
  });

  it("zero-division flushes a range-overflowed divisor to (0, 0)", () => {
    // The divisor (2e20, 0) is finite in f32 but its squared magnitude
    // overflows; the classic GPU surface flushes the finite quotient to
    // zero (x / Inf === 0).
    const guarded = backendFor(
      sourceFor("    z = 1 / z", "; @classic-guards: zero-division\n"),
    );
    const state = stepOnce(guarded, [2e20, 0]);
    expect(state.terminated).toBeUndefined();
    expect(state.values.z).toEqual({ re: 0, im: 0 });

    const plain = backendFor(sourceFor("    z = 1 / z"));
    expect(stepOnce(plain, [2e20, 0]).terminated).toBe("nonFinite");
  });

  it("floored-log evaluates log(0) as (log(1e-20), 0) without an event", () => {
    const guarded = backendFor(
      sourceFor("    z = log(z)", "; @classic-guards: floored-log\n"),
    );
    const state = stepOnce(guarded, [0, 0]);
    expect(state.terminated).toBeUndefined();
    expect(state.values.z.re).toBeCloseTo(Math.log(1e-20), 4);
    expect(state.values.z.im).toBe(0);

    const plain = backendFor(sourceFor("    z = log(z)"));
    expect(stepOnce(plain, [0, 0]).terminated).toBe("nonFinite");
  });

  it("hyperbolic-clamp keeps sinh of a large real input finite", () => {
    // Mirror richard6: the clamped hyperbolic sits inside an outer sin, so
    // the statement result returns to O(1) and LastSqr stays finite.
    const guarded = backendFor(
      sourceFor(
        "    z = sin(sinh(z)) + pixel",
        "; @classic-guards: hyperbolic-clamp\n",
      ),
    );
    const state = stepOnce(guarded, [200, 0]);
    expect(state.terminated).toBeUndefined();
    expect(Number.isFinite(state.values.z.re)).toBe(true);
    // The guard's contract is bounded finiteness, not f64 equality: the f32
    // quantization of the clamped sinh (~2.8e34) decorrelates sin() from the
    // classic f64 value, so only |sin| <= 1 can be asserted.
    expect(Math.abs(state.values.z.re - 200)).toBeLessThanOrEqual(1);

    const plain = backendFor(sourceFor("    z = sin(sinh(z)) + pixel"));
    expect(stepOnce(plain, [200, 0]).terminated).toBe("nonFinite");
  });

  it("floored-log keeps log-composed inverses finite on both surfaces", () => {
    // atanh(1) hits log(0) inside the composite; the guarded CPU floors it,
    // and the generated GLSL must route every log-composed inverse through
    // the guarded variant (Codex review: unguarded prelude composites
    // diverged from the CPU here).
    const guarded = backendFor(
      sourceFor("    z = atanh(z)", "; @classic-guards: floored-log\n"),
    );
    const state = stepOnce(guarded, [1, 0]);
    expect(state.terminated).toBeUndefined();
    expect(Number.isFinite(state.values.z.re)).toBe(true);

    expect(guarded.glsl.declarations).toContain("frmV1AtanhGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1AsinGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1AcosGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1AtanGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1AsinhGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1AcoshGuarded");
    expect(guarded.glsl.loop).toContain("frmV1AtanhGuarded(");

    const plain = backendFor(sourceFor("    z = atanh(z)"));
    expect(stepOnce(plain, [1, 0]).terminated).toBe("nonFinite");
  });

  it("emits guarded GLSL helpers only when guards are declared", () => {
    const guarded = backendFor(
      sourceFor(
        "    z = sinh(1 / (z * z)) + log(z)",
        "; @classic-guards: zero-division, floored-log, hyperbolic-clamp\n",
      ),
    );
    expect(guarded.glsl.declarations).toContain("frmV1DivGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1LogGuarded");
    expect(guarded.glsl.declarations).toContain("frmV1SinhGuarded");
    expect(guarded.glsl.loop).toContain("frmV1DivGuarded(");
    expect(guarded.glsl.loop).toContain("frmV1LogGuarded(");
    expect(guarded.glsl.loop).toContain("frmV1SinhGuarded(");

    const plain = backendFor(
      sourceFor("    z = sinh(1 / (z * z)) + log(z)"),
    );
    expect(plain.glsl.declarations).not.toContain("Guarded");
    expect(plain.glsl.loop).not.toContain("frmV1DivGuarded(");
  });

  it("round-trips the classic-guards directive through canonical source", async () => {
    const source = sourceFor(
      "    z = log(z)",
      "; @classic-guards: floored-log\n",
    );
    const parsed = parseFrmLikeV1(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ir.classicGuards).toEqual(["floored-log"]);

    // The directive must survive canonicalization and reparse, and it must
    // be part of the semantic hash — otherwise guarded and unguarded rows
    // would collide in the ledger.
    const { canonicalizeFrmLikeV1, hashFrmLikeV1, validateFrmLikeV1Ir } =
      await import("@/engine/frm/v1");
    const canonical = canonicalizeFrmLikeV1(parsed.ir);
    expect(canonical).toContain("; @classic-guards: floored-log");
    const reparsed = parseFrmLikeV1(canonical);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.ir.classicGuards).toEqual(["floored-log"]);
    const validated = validateFrmLikeV1Ir(parsed.ir);
    expect(validated.ok).toBe(true);
    if (validated.ok)
      expect(validated.ir.classicGuards).toEqual(["floored-log"]);

    const guardedHash = await hashFrmLikeV1(canonical, reparsed.ir);
    const plainSource = sourceFor("    z = log(z)");
    const plainParsed = parseFrmLikeV1(plainSource);
    expect(plainParsed.ok).toBe(true);
    if (!plainParsed.ok) return;
    const plainHash = await hashFrmLikeV1(
      canonicalizeFrmLikeV1(plainParsed.ir),
      plainParsed.ir,
    );
    expect(guardedHash.semanticHash).not.toBe(plainHash.semanticHash);
    expect(plainParsed.ir.classicGuards).toBeUndefined();
  });

  it("routes fn-slot dispatch tables through guarded GLSL functions", () => {
    const source = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log
GuardedDispatch {
  parameters:
    transform: function = log
  init:
    z = pixel
  loop:
    z = transform(z)
  bailout:
    |z| < 100
}`;
    const guarded = backendFor(source);
    expect(guarded.glsl.declarations).toContain("frmV1Dispatch_transform");
    expect(guarded.glsl.declarations).toMatch(
      /if \(u_frm_transform == \d+\) return frmV1LogGuarded\(value\);/,
    );
    expect(guarded.glsl.declarations).not.toMatch(
      /if \(u_frm_transform == \d+\) return frmV1Log\(value\);/,
    );

    const plain = backendFor(source.replace("; @classic-guards: floored-log\n", ""));
    expect(plain.glsl.declarations).toMatch(
      /if \(u_frm_transform == \d+\) return frmV1Log\(value\);/,
    );
  });

  it("rejects unknown or duplicate guard names", () => {
    expect(
      parseFrmLikeV1(
        sourceFor("    z = log(z)", "; @classic-guards: no-such-guard\n"),
      ).ok,
    ).toBe(false);
    expect(
      parseFrmLikeV1(
        sourceFor(
          "    z = log(z)",
          "; @classic-guards: floored-log, floored-log\n",
        ),
      ).ok,
    ).toBe(false);
  });

  it("declares exactly the nine diagnosed rows in the guard manifest", () => {
    expect(classicDialectGuardsForV1("")).toBeUndefined();
    const manifest = Object.entries({
      "97e2fc76-3590-5119-8b38-d8cc43f18d74": ["floored-log"],
      "f978281a-4cea-5545-a9c6-7ca68ca084f0": ["floored-log"],
      "7ce8c07c-0ba6-560c-9316-9aa2439997b3": ["zero-division"],
      "300db23f-8a8a-59d7-b4f1-bc77757286c6": ["zero-division"],
      "d30d2e42-cdc2-5a2a-b9e5-cb167617180a": ["zero-division", "hyperbolic-clamp"],
      "93724077-ebed-5039-956b-7a66910a40d2": ["zero-division", "hyperbolic-clamp"],
      "b8c9d4a5-5b89-5ea7-af30-addd315fd806": ["zero-division", "hyperbolic-clamp"],
      "66f1c52e-0d3a-576b-bc3c-75f65786bff5": ["zero-division", "hyperbolic-clamp"],
      "df663e75-a1ab-5eb2-a710-d0e9b466fa9c": ["hyperbolic-clamp"],
    });
    expect(manifest).toHaveLength(9);
    for (const [formulaId, guards] of manifest) {
      expect(classicDialectGuardsForV1(formulaId)).toEqual(guards);
    }
  });
});
