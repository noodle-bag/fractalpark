import { describe, expect, it } from "vitest";

import { evaluateDirectAdaptationEvidenceV1 } from "@/engine/formulas/v1/direct-adaptation-evidence";

function formulaId(index: number): string {
  return `direct-${String(index).padStart(3, "0")}`;
}

function sourceSet(index: number): "F588" | "B94" {
  return index < 136 ? "F588" : "B94";
}

function failureReason(index: number): string | null {
  if (index < 20) return null;
  if (index < 105) return "v1-projection-unsupported";
  if (index < 120) return "release-oracle-mismatch";
  if (index < 136) return "webgl-cpu-mismatch";
  return "v1-projection-unsupported";
}

function workRows() {
  return Array.from({ length: 225 }, (_, index) => {
    const currentSourceSet = sourceSet(index);
    return {
      formulaId: formulaId(index),
      sourceSet: currentSourceSet,
      rightsClass: currentSourceSet === "F588" ? "A" : "P",
      rightsEvidenceStatus:
        currentSourceSet === "F588"
          ? "frozen-per-record-classification"
          : "project-owned-runtime-source",
      sourceVisibility:
        currentSourceSet === "F588"
          ? "source-visible-after-content-gate"
          : "source-visible",
      implementationInputKind:
        currentSourceSet === "F588"
          ? "approved-direct-source"
          : "project-owned-runtime-source-and-contract",
      implementationInputStatus:
        currentSourceSet === "F588"
          ? "ready-direct-source"
          : "ready-project-owned-runtime-contract",
      workStartEligibility: "blocked-incomplete-package",
      reviewStatus: "blocked-incomplete-package",
      parameterContractStatus:
        currentSourceSet === "F588"
          ? "structural-types-only-not-final-schema"
          : "ready-project-runtime-contract",
      profileCandidateStatus:
        currentSourceSet === "F588"
          ? "blocked-missing-formula-profile-candidate"
          : "ready-legacy-runtime-candidate-unverified-for-v1",
      previewInputStatus:
        currentSourceSet === "F588"
          ? "blocked-until-profile-candidate-exists"
          : "ready-legacy-runtime-candidate-unverified-for-v1",
    };
  });
}

function runnableRows() {
  return Array.from({ length: 225 }, (_, index) => ({
    formulaId: formulaId(index),
    sourceSet: sourceSet(index),
    status: index < 20 ? ("passed" as const) : ("failed" as const),
    failureReason: failureReason(index),
    publicationEligible: false,
  }));
}

function provisionalRows() {
  return Array.from({ length: 20 }, (_, index) => ({
    formulaId: formulaId(index),
    sourceSet: sourceSet(index),
    status: "presentable-candidate",
    provisionalDefaultProfile: true,
    verifiedDefaultProfile: false,
    publicationEligible: false,
  }));
}

function input() {
  return {
    workRows: workRows(),
    runnableRows: runnableRows(),
    provisionalRows: provisionalRows(),
  };
}

describe("formula direct-adaptation evidence v1", () => {
  it("preserves the exact 225-row input and technical accounting", () => {
    const result = evaluateDirectAdaptationEvidenceV1(input());
    expect(result.summary).toMatchObject({
      total: 225,
      f588: 136,
      b94: 89,
      inputEvidenceBound: 225,
      technicalRunnable: 20,
      technicalBlocked: 205,
      provisionalCandidates: 20,
      advancementReviewsApproved: 0,
      finalParameterSchemas: 0,
      verifiedFinalProfiles: 0,
      verifiedFinalPreviews: 0,
      finalRecords: 0,
      candidateAdmitted: 0,
      candidateBlocked: 225,
      technicalFailureCounts: {
        v1ProjectionUnsupported: 174,
        releaseOracleMismatch: 15,
        webglCpuMismatch: 16,
      },
    });
    expect(result.rows).toHaveLength(225);
    expect(result.rows.filter((row) => row.sourceSet === "F588")).toHaveLength(136);
    expect(result.rows.filter((row) => row.sourceSet === "B94")).toHaveLength(89);
    expect(result.rows.filter((row) => row.technicalStatus === "passed")).toHaveLength(20);
    expect(result.rows.filter((row) => row.provisionalCandidate)).toHaveLength(20);
  });

  it("never promotes trusted inputs or technical candidates to final admission", () => {
    const result = evaluateDirectAdaptationEvidenceV1(input());
    expect(result.candidateReceiptsIssued).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
    expect(result.rows.every((row) => row.inputEvidenceBound)).toBe(true);
    expect(result.rows.every((row) => row.admissionStatus === "blocked")).toBe(true);
    expect(
      result.rows.every((row) =>
        row.blockers.includes("independent-admission-not-passed"),
      ),
    ).toBe(true);
    expect(
      result.rows.slice(0, 20).every((row) =>
        row.blockers.includes("verified-final-profile-missing"),
      ),
    ).toBe(true);
  });

  it("locks the blocker taxonomy including all 205 technical failures", () => {
    const result = evaluateDirectAdaptationEvidenceV1(input());
    expect(
      Object.fromEntries(
        result.summary.blockerCounts.map(({ code, count }) => [code, count]),
      ),
    ).toEqual({
      "advancement-review-not-approved": 225,
      "final-parameter-schema-missing": 225,
      "final-record-missing": 225,
      "independent-admission-not-passed": 225,
      "technical-release-oracle-mismatch": 15,
      "technical-v1-projection-unsupported": 174,
      "technical-webgl-cpu-mismatch": 16,
      "verified-final-preview-missing": 225,
      "verified-final-profile-missing": 225,
    });
  });

  it("rejects duplicate, reordered, extra, and missing rows", () => {
    const duplicate = workRows();
    duplicate[224] = { ...duplicate[223] };
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: duplicate }),
    ).toThrow("direct-evidence-exact-set-invalid");

    const reordered = runnableRows();
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), runnableRows: reordered }),
    ).toThrow("direct-evidence-exact-set-invalid");

    expect(() =>
      evaluateDirectAdaptationEvidenceV1({
        ...input(),
        workRows: [...workRows(), workRows()[0]],
      }),
    ).toThrow("direct-evidence-exact-set-invalid");

    expect(() =>
      evaluateDirectAdaptationEvidenceV1({
        ...input(),
        runnableRows: runnableRows().slice(0, -1),
      }),
    ).toThrow("direct-evidence-exact-set-invalid");
  });

  it("rejects lane/status drift and clean-room technical reasons", () => {
    const wrongRights = workRows();
    wrongRights[0] = { ...wrongRights[0], rightsClass: "P" };
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: wrongRights }),
    ).toThrow("direct-evidence-work-row-invalid");

    const missingInput = runnableRows();
    missingInput[20] = {
      ...missingInput[20],
      failureReason: "missing-input",
    };
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), runnableRows: missingInput }),
    ).toThrow("direct-evidence-runnable-row-invalid");
  });

  it("rejects provisional or technical false-green drift", () => {
    const promoted = provisionalRows();
    promoted[0] = { ...promoted[0], verifiedDefaultProfile: true };
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), provisionalRows: promoted }),
    ).toThrow("direct-evidence-provisional-row-invalid");

    const extraPass = runnableRows();
    extraPass[20] = {
      ...extraPass[20],
      status: "passed",
      failureReason: null,
    };
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), runnableRows: extraPass }),
    ).toThrow("direct-evidence-technical-accounting-invalid");
  });

  it("rejects inherited indices and accessor elements, and snapshots Proxy reads", () => {
    const inherited = workRows();
    const inheritedFirst = inherited[0];
    delete inherited[0];
    Object.defineProperty(inherited, "extra", {
      configurable: true,
      enumerable: true,
      value: true,
    });
    const inheritedPrototype = Object.create(Array.prototype) as unknown[];
    Object.defineProperty(inheritedPrototype, "0", {
      configurable: true,
      enumerable: true,
      value: inheritedFirst,
    });
    Object.setPrototypeOf(inherited, inheritedPrototype);
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: inherited }),
    ).toThrow("direct-evidence-input-invalid");

    const accessor = workRows();
    const accessorFirst = accessor[0];
    Object.defineProperty(accessor, "0", {
      configurable: true,
      enumerable: true,
      get: () => accessorFirst,
    });
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: accessor }),
    ).toThrow("direct-evidence-input-invalid");

    const original = workRows();
    const proxied = new Proxy(original, {
      get(target, property, receiver) {
        if (property === "0") return target[1];
        return Reflect.get(target, property, receiver);
      },
    });
    const result = evaluateDirectAdaptationEvidenceV1({
      ...input(),
      workRows: proxied,
    });
    expect(result.rows[0]?.formulaId).toBe(original[0]?.formulaId);
  });

  it("rejects row accessors and snapshots row Proxy fields", () => {
    const accessorRows = workRows();
    const accessorRow = { ...accessorRows[0] };
    let getterReads = 0;
    Object.defineProperty(accessorRow, "formulaId", {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        return formulaId(0);
      },
    });
    accessorRows[0] = accessorRow;
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: accessorRows }),
    ).toThrow("direct-evidence-work-row-invalid");
    expect(getterReads).toBe(0);

    const proxiedRows = workRows();
    const first = proxiedRows[0];
    proxiedRows[0] = new Proxy(first, {
      get(target, property, receiver) {
        if (property === "formulaId") return formulaId(1);
        return Reflect.get(target, property, receiver);
      },
    });
    const result = evaluateDirectAdaptationEvidenceV1({
      ...input(),
      workRows: proxiedRows,
    });
    expect(result.rows[0]?.formulaId).toBe(formulaId(0));
  });

  it("rejects non-enumerable unknown properties at every boundary", () => {
    const hiddenRowInput = input();
    Object.defineProperty(hiddenRowInput.workRows[0], "hidden", {
      configurable: true,
      enumerable: false,
      value: true,
    });
    expect(() => evaluateDirectAdaptationEvidenceV1(hiddenRowInput)).toThrow(
      "direct-evidence-work-row-invalid",
    );

    const hiddenArrayInput = input();
    Object.defineProperty(hiddenArrayInput.workRows, "hidden", {
      configurable: true,
      enumerable: false,
      value: true,
    });
    expect(() => evaluateDirectAdaptationEvidenceV1(hiddenArrayInput)).toThrow(
      "direct-evidence-input-invalid",
    );

    const hiddenOuterInput = input();
    Object.defineProperty(hiddenOuterInput, "hidden", {
      configurable: true,
      enumerable: false,
      value: true,
    });
    expect(() => evaluateDirectAdaptationEvidenceV1(hiddenOuterInput)).toThrow(
      "direct-evidence-input-invalid",
    );
  });

  it("is deterministic and rejects sparse or unknown-key input", () => {
    expect(evaluateDirectAdaptationEvidenceV1(input())).toEqual(
      evaluateDirectAdaptationEvidenceV1(input()),
    );

    const sparse = workRows();
    delete sparse[10];
    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), workRows: sparse }),
    ).toThrow("direct-evidence-input-invalid");

    expect(() =>
      evaluateDirectAdaptationEvidenceV1({ ...input(), unexpected: true }),
    ).toThrow("direct-evidence-input-invalid");
  });
});
