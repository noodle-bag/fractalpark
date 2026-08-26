import { describe, expect, it } from "vitest";

import { parseFrmLikeV1 } from "@/engine/frm/v1";
import {
  classifyJuliaBindingRolesV1,
  type JuliaSourceBindingV1,
} from "@/engine/formulas/v1/julia-binding";
import { runJuliaCpuHarnessV1 } from "@/engine/formulas/v1/julia-cpu-harness";
import { sha256HexSyncV1 } from "@/engine/formulas/v1/revisions";
import { proposeJuliaSourceSplitV1 } from "@/engine/formulas/v1/julia-source-split";

function source(init: string, loop: string): string {
  return `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Fixture {
  init:
${init}  loop:
${loop}  bailout:
    |z| <= 1000000
}
`;
}

function parsed(value: string) {
  const result = parseFrmLikeV1(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.ir;
}

function baselineBinding(value: string): JuliaSourceBindingV1 {
  return { source: value, sourceRevision: sha256HexSyncV1(value) };
}

function expectPassingProposal(
  baselineSource: string,
  expectedKind: "direct-pixel" | "pixel-alias" | "combined",
) {
  const baselineIr = parsed(baselineSource);
  const original = JSON.stringify(baselineIr);
  const proposal = proposeJuliaSourceSplitV1(baselineIr);
  expect(proposal).toMatchObject({
    ok: true,
    schema: "fractalpark-julia-source-split-proposal/v1",
    evidenceClass: "static-candidate-only",
    rewriteKind: expectedKind,
  });
  expect(JSON.stringify(baselineIr)).toBe(original);
  if (!proposal.ok) throw new Error(proposal.reasonCode);

  expect(Object.isFrozen(proposal)).toBe(true);
  expect(Object.isFrozen(proposal.ir)).toBe(true);
  expect(Object.isFrozen(proposal.aliasTargets)).toBe(true);
  expect(sha256HexSyncV1(proposal.source)).toBe(proposal.sourceRevision);
  const reparsed = parseFrmLikeV1(proposal.source);
  expect(reparsed.ok).toBe(true);
  if (!reparsed.ok) throw new Error(reparsed.reason);

  const binding = {
    kind: "source-split" as const,
    sourceRevision: proposal.sourceRevision,
  };
  const sourceBinding = {
    source: proposal.source,
    sourceRevision: proposal.sourceRevision,
  };
  expect(
    classifyJuliaBindingRolesV1(proposal.ir, binding, sourceBinding),
  ).toMatchObject({
    ok: true,
    contract: {
      binding,
      modeClass: "classic-julia",
      supportLane: "source-split",
      candidateKind: "source-split",
      z0Role: "pixel-seed",
    },
  });
  const harness = runJuliaCpuHarnessV1(proposal.ir, binding, {
    sourceBinding,
    parameterPlaneBaseline: baselineBinding(baselineSource),
  });
  expect(harness).toMatchObject({
    ok: true,
    value: {
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
  return proposal;
}

describe("Julia source-split proposal", () => {
  it("splits direct loop pixel use into seed and constant roles", () => {
    const proposal = expectPassingProposal(
      source("    z = 0\n", "    z = sqr(z) + pixel\n"),
      "direct-pixel",
    );
    expect(proposal).toMatchObject({
      directPixelReferenceCount: 1,
      aliasTargets: [],
    });
    if (proposal.ok)
      expect(proposal.ir.locals.map((local) => local.name)).toContain(
        "juliaOrbitConstant",
      );
  });

  it("splits a live complex pixel alias without inventing a direct replacement", () => {
    const proposal = expectPassingProposal(
      source(
        "    pointValue = pixel\n    z = 0\n",
        "    z = sqr(z) + pointValue\n",
      ),
      "pixel-alias",
    );
    expect(proposal).toMatchObject({
      directPixelReferenceCount: 0,
      aliasTargets: ["pointValue"],
    });
  });

  it.each([
    {
      label: "top-level assignment",
      init: "    pointValue = pixel\n    z = 0\n",
      loop:
        "    pointValue = pointValue + (0.1, 0)\n    z = sqr(z) + pointValue\n",
    },
    {
      label: "top-level component assignment",
      init: "    pointValue = pixel\n    z = 0\n",
      loop:
        "    real(pointValue) = real(pointValue) + 0.1\n    z = sqr(z) + pointValue\n",
    },
    {
      label: "nested assignment",
      init: "    pointValue = pixel\n    z = 0\n",
      loop:
        "    if real(z) > 0\n      pointValue = flip(pointValue)\n    endif\n    z = sqr(z) + pointValue\n",
    },
    {
      label: "nested component assignment",
      init: "    pointValue = pixel\n    z = 0\n",
      loop:
        "    if real(z) > 0\n      imag(pointValue) = imag(pointValue) + 0.1\n    endif\n    z = sqr(z) + pointValue\n",
    },
    {
      label: "direct pixel plus mutable alias",
      init: "    pointValue = pixel\n    z = 0\n",
      loop:
        "    pointValue = flip(pointValue)\n    z = sqr(z) + pointValue + pixel\n",
    },
    {
      label: "immutable and mutable aliases together",
      init:
        "    stableValue = pixel\n    mutableValue = pixel\n    z = 0\n",
      loop:
        "    mutableValue = flip(mutableValue)\n    z = sqr(z) + stableValue + mutableValue\n",
    },
  ])("fails closed for a mutable pixel alias: $label", ({ init, loop }) => {
    expect(
      proposeJuliaSourceSplitV1(parsed(source(init, loop))),
    ).toEqual({
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-mutable-pixel-alias",
    });
  });

  it("combines direct and alias role splits deterministically", () => {
    const baseline = source(
      "    pointValue = pixel\n    z = 0\n",
      "    z = sqr(z) + pointValue + pixel\n",
    );
    const first = expectPassingProposal(baseline, "combined");
    const second = proposeJuliaSourceSplitV1(parsed(baseline));
    expect(second).toEqual(first);
  });

  it("fails closed when no mechanical pixel constant role exists", () => {
    expect(
      proposeJuliaSourceSplitV1(
        parsed(source("    z = pixel\n", "    z = sqr(z) + (0.2, 0.3)\n")),
      ),
    ).toEqual({
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-no-mechanical-role",
    });
  });

  it("does not promote real-valued pixel aliases into orbit constants", () => {
    expect(
      proposeJuliaSourceSplitV1(
        parsed(
          source(
            "    scale = real(pixel)\n    z = 0\n",
            "    z = sqr(z) + scale\n",
          ),
        ),
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: "julia-source-split-no-mechanical-role",
    });
  });

  it("allocates a deterministic collision-free constant local", () => {
    const proposal = proposeJuliaSourceSplitV1(
      parsed(
        source(
          "    juliaOrbitConstant = (0, 0)\n    z = 0\n",
          "    z = sqr(z) + pixel\n",
        ),
      ),
    );
    expect(proposal.ok).toBe(true);
    if (proposal.ok)
      expect(proposal.ir.locals.map((local) => local.name)).toContain(
        "juliaOrbitConstant2",
      );
  });

  it("translates hostile or invalid IR into a typed failure", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile");
        },
      },
    );
    expect(
      proposeJuliaSourceSplitV1(
        hostile as Parameters<typeof proposeJuliaSourceSplitV1>[0],
      ),
    ).toEqual({
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-ir-invalid",
    });
  });
});
