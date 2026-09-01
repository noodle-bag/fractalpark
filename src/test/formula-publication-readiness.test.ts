import { describe, expect, it } from "vitest";

import { evaluatePublicationReadinessV1 } from "@/engine/formulas/v1/publication-readiness";

function formulaId(index: number): string {
  return `formula-${String(index).padStart(3, "0")}`;
}

function lane(index: number): "direct-adaptation" | "clean-room" {
  return index < 136 || index >= 588 ? "direct-adaptation" : "clean-room";
}

function sourceSet(index: number): "F588" | "B94" {
  return index < 588 ? "F588" : "B94";
}

function technicalFailureReason(index: number): string | null {
  if (index < 20) return null;
  if (index < 472) return "missing-input";
  if (index < 646) return "v1-projection-unsupported";
  if (index < 661) return "release-oracle-mismatch";
  return "webgl-cpu-mismatch";
}

function workRows() {
  return Array.from({ length: 677 }, (_, index) => {
    const currentLane = lane(index);
    const currentSourceSet = sourceSet(index);
    return {
      formulaId: formulaId(index),
      sourceSet: currentSourceSet,
      lane: currentLane,
      workStartEligibility: "blocked-incomplete-package",
      reviewStatus: "blocked-incomplete-package",
      implementationInputStatus:
        currentSourceSet === "B94"
          ? "ready-project-owned-runtime-contract"
          : currentLane === "direct-adaptation"
            ? "ready-direct-source"
            : "blocked-missing-approved-nonreversible-behavior-spec",
      parameterContractStatus:
        currentSourceSet === "B94"
          ? "ready-project-runtime-contract"
          : "structural-types-only-not-final-schema",
      profileCandidateStatus:
        currentSourceSet === "B94"
          ? "ready-legacy-runtime-candidate-unverified-for-v1"
          : "blocked-missing-formula-profile-candidate",
      previewInputStatus:
        currentSourceSet === "B94"
          ? "ready-legacy-runtime-candidate-unverified-for-v1"
          : "blocked-until-profile-candidate-exists",
    };
  });
}

function runnableRows() {
  return Array.from({ length: 677 }, (_, index) => ({
    formulaId: formulaId(index),
    sourceSet: sourceSet(index),
    status: index < 20 ? ("passed" as const) : ("failed" as const),
    failureReason: technicalFailureReason(index),
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

function receipt(index: number) {
  const currentLane = lane(index);
  return {
    formulaId: formulaId(index),
    sourceSet: sourceSet(index),
    lane: currentLane,
    status: "candidate-ready",
    implementationInputApproval:
      currentLane === "clean-room" ? "clean-room-approved" : "direct-approved",
    rightsFinalApproval: true,
    independentReviewApproval: true,
    finalParameterSchemaVerified: true,
    canonicalSourceVerified: true,
    sourceRoundTripVerified: true,
    semanticHashVerified: true,
    safetyEnvelopeVerified: true,
    cpuConformanceVerified: true,
    webglConformanceVerified: true,
    releaseOracleVerified: true,
    finalProfileVerified: true,
    finalPreviewVerified: true,
    finalRecordVerified: true,
    leakageReviewPassed: true,
    cleanRoomIsolationVerified: currentLane === "clean-room" ? true : null,
    evidenceBindingHash: String(index).padStart(64, "0"),
  };
}

function input(candidateReceipts: readonly unknown[] = []) {
  return {
    workRows: workRows(),
    runnableRows: runnableRows(),
    provisionalRows: provisionalRows(),
    candidateReceipts,
  };
}

describe("formula publication readiness v1", () => {
  it("reports the complete fail-closed blocker dossier", () => {
    const result = evaluatePublicationReadinessV1(input());
    expect(result.summary).toMatchObject({
      total: 677,
      candidateReady: 0,
      blocked: 677,
      direct: 225,
      cleanRoom: 452,
      runnable: 20,
      failed: 657,
      provisionalCandidates: 20,
      verifiedFinalProfiles: 0,
    });
    expect(Object.fromEntries(result.summary.blockerCounts.map(({ code, count }) => [code, count]))).toEqual({
      "advancement-review-not-approved": 677,
      "candidate-receipt-absent": 677,
      "clean-behavior-spec-not-approved": 452,
      "final-parameter-schema-missing": 677,
      "final-record-missing": 677,
      "technical-missing-input": 452,
      "technical-release-oracle-mismatch": 15,
      "technical-v1-projection-unsupported": 174,
      "technical-webgl-cpu-mismatch": 16,
      "verified-final-preview-missing": 677,
      "verified-final-profile-missing": 677,
    });
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
  });

  it("rejects even an exact receipt set until an external evidence verifier exists", () => {
    const receipts = Array.from({ length: 677 }, (_, index) => receipt(index));
    expect(() => evaluatePublicationReadinessV1(input(receipts))).toThrow(
      "readiness-candidate-receipts-not-supported",
    );
  });

  it("rejects a partial candidate set rather than promoting a subset", () => {
    expect(() => evaluatePublicationReadinessV1(input([receipt(0)]))).toThrow(
      "readiness-candidate-receipts-not-supported",
    );
  });

  it("rejects malformed private-field receipts before parsing them", () => {
    const receipts = Array.from({ length: 677 }, (_, index) => receipt(index));
    const contaminated = {
      ...receipts[300],
      evidence: { nested: { safeSourceLocator: "private" } },
    };
    receipts[300] = contaminated as (typeof receipts)[number];
    expect(() => evaluatePublicationReadinessV1(input(receipts))).toThrow(
      "readiness-candidate-receipts-not-supported",
    );
  });

  it("does not treat runnable or provisional technical states as final approval", () => {
    const result = evaluatePublicationReadinessV1(input());
    expect(result.rows.filter((row) => row.technicalStatus === "passed")).toHaveLength(20);
    expect(result.rows.filter((row) => row.provisionalCandidate)).toHaveLength(20);
    expect(result.rows.filter((row) => row.status === "candidate-ready")).toHaveLength(0);
    expect(result.rows.slice(0, 20).every((row) => row.blockers.includes("verified-final-profile-missing"))).toBe(true);
  });

  it("rejects a malformed receipt without inspecting its claimed gates", () => {
    const receipts = Array.from({ length: 677 }, (_, index) => receipt(index));
    receipts[42] = { ...receipts[42], webglConformanceVerified: false };
    expect(() => evaluatePublicationReadinessV1(input(receipts))).toThrow(
      "readiness-candidate-receipts-not-supported",
    );
  });

  it("is deterministic and rejects exact-set or technical-accounting drift", () => {
    expect(evaluatePublicationReadinessV1(input())).toEqual(
      evaluatePublicationReadinessV1(input()),
    );

    const duplicateWorkRows = workRows();
    duplicateWorkRows[676] = { ...duplicateWorkRows[675] };
    expect(() =>
      evaluatePublicationReadinessV1({
        ...input(),
        workRows: duplicateWorkRows,
      }),
    ).toThrow("readiness-exact-set-invalid");

    const tooManyPassed = runnableRows();
    tooManyPassed[20] = {
      ...tooManyPassed[20],
      status: "passed",
      failureReason: null,
    };
    expect(() =>
      evaluatePublicationReadinessV1({
        ...input(),
        runnableRows: tooManyPassed,
      }),
    ).toThrow("readiness-technical-accounting-invalid");
  });
});
