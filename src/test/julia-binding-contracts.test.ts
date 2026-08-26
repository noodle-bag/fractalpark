import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFrmLikeV1 } from "@/engine/frm/v1";
import { sha256HexSyncV1 } from "@/engine/formulas/v1/revisions";
import {
  classifyJuliaBindingRolesV1,
  parseJuliaBindingContractV1,
} from "@/engine/formulas/v1/julia-binding";
import {
  exactJuliaCpuTraceSetsEqualV1,
  JULIA_CPU_HARNESS_CONSTANTS_V1,
  JULIA_CPU_HARNESS_DEPTHS_V1,
  JULIA_CPU_HARNESS_POINTS_V1,
  runJuliaCpuHarnessV1,
} from "@/engine/formulas/v1/julia-cpu-harness";

const ISMAND_DEMO_ID = "cf335fbe-f1d3-5335-a68b-738197760a06";
const ISMAND_DEMO_REVISION =
  "b3b079cbc4795b500469eaa68c264fdc7dd2375c0ccdefbae6dc4a8befc72f8d";
const ISMAND_DEMO_PATH = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published/definitions",
  `${ISMAND_DEMO_REVISION}.frm`,
);
const RUNTIME_INDEX_PATH = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published/index.json",
);

function parsed(source: string) {
  const result = parseFrmLikeV1(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.ir;
}

function source(
  init: string,
  loop: string,
  parameters = "    juliaConstant: complex = (0, 0) classic p1\n",
) {
  return `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Fixture {
  parameters:
${parameters}  init:
${init}  loop:
${loop}  bailout:
    |z| <= 1000000
}
`;
}

const SYSTEM_C_POSITIVE = source(
  "    if ismand\n      z = 0\n    else\n      z = pixel\n    endif\n",
  "    z = z * 0.5 + c * 0.1\n",
  "",
);
const FIXED_CONSTANT = source(
  "    if ismand\n      z = 0\n      orbitConstant = pixel\n    else\n      z = pixel\n      orbitConstant = (0.2, 0.3)\n    endif\n",
  "    z = sqr(z) + orbitConstant\n",
);
const READ_THEN_OVERWRITE = source(
  "    if ismand\n      z = 0\n      orbitConstant = pixel\n    else\n      z = pixel\n      orbitConstant = juliaConstant\n    endif\n",
  "    observed = orbitConstant\n    orbitConstant = (0.2, 0.3)\n    z = sqr(z) + orbitConstant\n",
);
const PIXEL_ONLY = source(
  "    if ismand\n      z = 0\n    else\n      z = pixel\n    endif\n",
  "    z = sqr(z) + pixel\n",
);
const ALGEBRAIC_CANCELLATION = source(
  "    if ismand\n      z = 0\n      orbitConstant = pixel\n    else\n      z = pixel\n      orbitConstant = juliaConstant\n    endif\n",
  "    z = (z + orbitConstant) - orbitConstant + pixel * 0.1\n",
);
const PIXEL_INSENSITIVE = source(
  "    if ismand\n      z = 0\n      orbitConstant = pixel\n    else\n      z = pixel\n      orbitConstant = juliaConstant\n    endif\n",
  "    z = orbitConstant * 0.5\n",
);
const NON_FINITE_DIFFERENCE = source(
  "    if ismand\n      z = 0\n      orbitConstant = pixel\n    else\n      z = pixel\n      orbitConstant = juliaConstant\n    endif\n",
  "    z = z / 0 + orbitConstant\n",
);
const PARAMETER_PLANE_NON_FINITE = source(
  "    if ismand\n      z = 0\n    else\n      z = pixel\n    endif\n",
  "    if ismand\n      z = z / 0\n    else\n      z = z * 0.5 + c * 0.1\n    endif\n",
  "",
);
const EVENT_ONLY_DIFFERENCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
EventOnly {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z + c * 0
  bailout:
    real(c) < 0
}
`;
const SOURCE_SPLIT_NEW = SYSTEM_C_POSITIVE.replace(
  "Fixture {",
  "; source-split revision\nFixture {",
);
describe("typed Julia binding contracts", () => {
  it("validates the frozen binding/mode/lane/z0 invariants", () => {
    const valid = parseJuliaBindingContractV1({
      binding: { kind: "parameter", slotName: "juliaConstant" },
      modeClass: "classic-julia",
      supportLane: "parameter-binding",
      z0Role: "pixel-seed",
      invariant: "parameter-plane-bit-identical",
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(Object.isFrozen(valid.value)).toBe(true);
      expect(Object.isFrozen(valid.value.binding)).toBe(true);
    }

    expect(
      parseJuliaBindingContractV1({
        binding: { kind: "parameter", slotName: "juliaConstant" },
        modeClass: "classic-julia",
        supportLane: "existing-system-c",
        z0Role: "pixel-seed",
        invariant: "parameter-plane-bit-identical",
      }).ok,
    ).toBe(false);
    expect(
      parseJuliaBindingContractV1({
        binding: { kind: "system-c" },
        modeClass: "classic-julia",
        supportLane: "existing-system-c",
        z0Role: "zero",
        invariant: "semantic-extension",
      }).ok,
    ).toBe(false);
    expect(
      parseJuliaBindingContractV1({
        binding: { kind: "none" },
        modeClass: "unsupported",
        supportLane: "none",
        z0Role: "none",
        invariant: "semantic-extension",
        unexpected: true,
      }).ok,
    ).toBe(false);
    expect(
      parseJuliaBindingContractV1({
        binding: { kind: "system-c" },
        modeClass: { toString: () => "classic-julia" },
        supportLane: "existing-system-c",
        z0Role: "pixel-seed",
        invariant: "semantic-extension",
      }).ok,
    ).toBe(false);
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile-proxy");
        },
      },
    );
    expect(parseJuliaBindingContractV1(hostile)).toEqual({
      ok: false,
      code: "julia-binding-contract-invalid",
    });
  });

  it("classifies the public ismand_demo rewrite as a parameter-binding classic candidate", () => {
    const classification = classifyJuliaBindingRolesV1(
      parsed(readFileSync(ISMAND_DEMO_PATH, "utf8")),
      { kind: "parameter", slotName: "juliaConstant" },
    );
    expect(classification).toEqual({
      ok: true,
      evidenceClass: "static-candidate-only",
      contract: {
        binding: { kind: "parameter", slotName: "juliaConstant" },
        modeClass: "classic-julia",
        supportLane: "parameter-binding",
        z0Role: "pixel-seed",
        invariant: "semantic-extension",
      },
      requiresCpuEvidence: true,
    });
    const runtime = JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")) as {
      rows: Array<{ formulaId: string; sourceRevision: string }>;
    };
    expect(
      runtime.rows.find((row) => row.formulaId === ISMAND_DEMO_ID)?.sourceRevision,
    ).toBe(ISMAND_DEMO_REVISION);
  });

  it("recognizes an explicit system-c candidate without family or formula-ID inference", () => {
    expect(
      classifyJuliaBindingRolesV1(parsed(SYSTEM_C_POSITIVE), { kind: "system-c" }),
    ).toMatchObject({
      ok: true,
      evidenceClass: "static-candidate-only",
      contract: {
        binding: { kind: "system-c" },
        modeClass: "classic-julia",
        supportLane: "existing-system-c",
        z0Role: "pixel-seed",
      },
    });
  });

  it.each([
    ["fixed constant", FIXED_CONSTANT],
    ["read then overwrite", READ_THEN_OVERWRITE],
    ["pixel only", PIXEL_ONLY],
  ])("fails closed for the %s static negative", (_name, fixture) => {
    expect(
      classifyJuliaBindingRolesV1(parsed(fixture), {
        kind: "parameter",
        slotName: "juliaConstant",
      }),
    ).toMatchObject({
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "binding-not-live-in-loop",
    });
  });

  it("rejects absent, non-complex, and unreviewed-none bindings", () => {
    const realParameter = source(
      "    z = pixel\n",
      "    z = z + juliaConstant\n",
      "    juliaConstant: real = 0 classic p1\n",
    );
    expect(
      classifyJuliaBindingRolesV1(parsed(realParameter), {
        kind: "parameter",
        slotName: "missing",
      }),
    ).toMatchObject({ ok: false, reasonCode: "binding-parameter-missing" });
    expect(
      classifyJuliaBindingRolesV1(parsed(realParameter), {
        kind: "parameter",
        slotName: "juliaConstant",
      }),
    ).toMatchObject({ ok: false, reasonCode: "binding-parameter-not-complex" });
    expect(
      classifyJuliaBindingRolesV1(parsed(realParameter), { kind: "none" }),
    ).toMatchObject({
      ok: false,
      reasonCode: "binding-none-requires-independent-review",
    });
  });
});

describe("Julia two-plane CPU candidate harness", () => {
  it("freezes the contracted 3 x 3 x 8 deterministic probe grid", () => {
    expect(JULIA_CPU_HARNESS_POINTS_V1).toHaveLength(3);
    expect(JULIA_CPU_HARNESS_CONSTANTS_V1).toHaveLength(3);
    expect(JULIA_CPU_HARNESS_DEPTHS_V1).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128,
    ]);
  });

  it("passes ismand_demo only as Tier-1 candidate evidence", () => {
    const result = runJuliaCpuHarnessV1(
      parsed(readFileSync(ISMAND_DEMO_PATH, "utf8")),
      { kind: "parameter", slotName: "juliaConstant" },
      { parameters: { threshold: [4, 0] } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.evidenceClass).toBe("tier1-candidate-only");
    expect(result.value.contract.invariant).toBe(
      "parameter-plane-bit-identical",
    );
    expect(result.value.parameterPlaneBaselineTraces).toHaveLength(72);
    expect(result.value.traces).toHaveLength(144);
    expect(result.value.checks).toEqual({
      parameterPlaneBitIdentical: true,
      deterministic: true,
      finiteEvidence: true,
      pixelSensitive: true,
      constantSensitive: true,
    });
    expect(result.value.candidatePass).toBe(true);
    expect(result.value.reasonCodes).toEqual([]);
  });

  it("passes a bounded system-c reference without activating product capability", () => {
    const result = runJuliaCpuHarnessV1(parsed(SYSTEM_C_POSITIVE), {
      kind: "system-c",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        evidenceClass: "tier1-candidate-only",
        candidatePass: true,
        checks: {
          parameterPlaneBitIdentical: true,
          deterministic: true,
          finiteEvidence: true,
          pixelSensitive: true,
          constantSensitive: true,
        },
      },
    });
  });

  it.each([
    ["algebraic cancellation", ALGEBRAIC_CANCELLATION, "constant-insensitive"],
    ["pixel overwrite", PIXEL_INSENSITIVE, "pixel-insensitive"],
    ["non-finite pseudo-difference", NON_FINITE_DIFFERENCE, "non-finite-evidence"],
  ])("rejects the %s dynamic negative", (_name, fixture, reason) => {
    const result = runJuliaCpuHarnessV1(parsed(fixture), {
      kind: "parameter",
      slotName: "juliaConstant",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidatePass).toBe(false);
    expect(result.value.reasonCodes).toContain(reason);
  });

  it("binds source-split IR and baseline to exact source bytes", () => {
    const sourceRevision = sha256HexSyncV1(SOURCE_SPLIT_NEW);
    const baselineRevision = sha256HexSyncV1(SYSTEM_C_POSITIVE);
    const ir = parsed(SOURCE_SPLIT_NEW);
    const binding = { kind: "source-split" as const, sourceRevision };
    const sourceBinding = { source: SOURCE_SPLIT_NEW, sourceRevision };
    const parameterPlaneBaseline = {
      source: SYSTEM_C_POSITIVE,
      sourceRevision: baselineRevision,
    };

    expect(classifyJuliaBindingRolesV1(ir, binding)).toMatchObject({
      ok: false,
      reasonCode: "binding-source-revision-invalid",
    });
    expect(
      classifyJuliaBindingRolesV1(ir, binding, {
        source: SOURCE_SPLIT_NEW,
        sourceRevision: baselineRevision,
      }),
    ).toMatchObject({
      ok: false,
      reasonCode: "binding-source-revision-invalid",
    });
    expect(classifyJuliaBindingRolesV1(ir, binding, sourceBinding)).toMatchObject({
      ok: true,
      contract: {
        supportLane: "source-split",
        candidateKind: "source-split",
      },
    });
    expect(
      runJuliaCpuHarnessV1(ir, binding, { sourceBinding }),
    ).toEqual({ ok: false, reasonCode: "source-split-baseline-required" });
    expect(
      runJuliaCpuHarnessV1(ir, binding, {
        sourceBinding,
        parameterPlaneBaseline: sourceBinding,
      }),
    ).toEqual({ ok: false, reasonCode: "source-split-baseline-invalid" });
    expect(
      runJuliaCpuHarnessV1(ir, binding, {
        sourceBinding,
        parameterPlaneBaseline,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        candidatePass: true,
        contract: { invariant: "parameter-plane-bit-identical" },
      },
    });
  });

  it("compares signed zero bit-exactly in evidence traces", () => {
    const trace = {
      pixel: [0, 0] as const,
      juliaC: [0, 0] as const,
      mode: "parameter-plane" as const,
      requestedDepth: 1,
      completedSteps: 1,
      event: "bounded" as const,
      orbit: [[-0, 0] as const],
    };
    expect(exactJuliaCpuTraceSetsEqualV1([trace], [trace])).toBe(true);
    expect(
      exactJuliaCpuTraceSetsEqualV1([trace], [
        { ...trace, orbit: [[0, 0] as const] },
      ]),
    ).toBe(false);
  });

  it("does not count bailout-event-only differences as constant sensitivity", () => {
    const result = runJuliaCpuHarnessV1(parsed(EVENT_ONLY_DIFFERENCE), {
      kind: "system-c",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        candidatePass: false,
        checks: { constantSensitive: false },
      },
    });
    if (result.ok)
      expect(result.value.reasonCodes).toContain("constant-insensitive");
  });

  it("rejects non-finite parameter-plane evidence even when Julia traces are finite", () => {
    const result = runJuliaCpuHarnessV1(parsed(PARAMETER_PLANE_NON_FINITE), {
      kind: "system-c",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        candidatePass: false,
        checks: { finiteEvidence: false },
        reasonCodes: ["non-finite-evidence"],
      },
    });
  });

  it("returns a typed failure when runtime parameter input drifts", () => {
    expect(
      runJuliaCpuHarnessV1(parsed(SYSTEM_C_POSITIVE), { kind: "system-c" }, {
        parameters: { unknownParameter: [0, 0] },
      }),
    ).toEqual({ ok: false, reasonCode: "runtime-failed" });
  });

  it("rejects underpowered or duplicate probe grids", () => {
    expect(
      runJuliaCpuHarnessV1(parsed(SYSTEM_C_POSITIVE), { kind: "system-c" }, {
        points: [[0, 0], [0, 0], [1, 0]],
      }),
    ).toEqual({ ok: false, reasonCode: "invalid-probe-grid" });
  });
});
