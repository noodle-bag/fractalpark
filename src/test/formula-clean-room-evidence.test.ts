import { describe, expect, it } from "vitest";

import { evaluateCleanRoomEvidenceV1 } from "@/engine/formulas/v1/clean-room-evidence";

function formulaId(index: number): string {
  return `clean-${String(index).padStart(3, "0")}`;
}

function cleanRoomInput() {
  const workRows = Array.from({ length: 452 }, (_, index) => ({
    formulaId: formulaId(index),
    sourceSet: "F588",
    rightsClass: index === 0 ? "A" : index < 74 ? "B" : "C",
    rightsEvidenceStatus: "frozen-per-record-classification",
    privateProvenanceEvidenceBound: true,
    sourceOracleStatus:
      index < 9
        ? "waiver-probe-not-executable-oracle"
        : "legacy-compatibility-orbit-oracle-available",
    sourceOracleEvidenceBound: true,
    implementationInputStatus:
      "blocked-missing-approved-nonreversible-behavior-spec",
    workStartEligibility: "blocked-incomplete-package",
    reviewStatus: "blocked-incomplete-package",
    finalSchema: null,
  }));
  return {
    workRows,
    ledgerRows: workRows.map(({ formulaId: id }) => ({
      formulaId: id,
      sourceSet: "F588",
      status: "failed",
      failureStage: "input",
      reasonCode: "missing-input",
      publicationEligible: false,
    })),
    provisionalRows: [] as Array<{ formulaId: string; sourceSet: string }>,
  };
}

describe("formula clean-room evidence v1", () => {
  it("locks the exact fail-closed 452-row truth contract", () => {
    const result = evaluateCleanRoomEvidenceV1(cleanRoomInput());
    expect(result.summary).toMatchObject({
      total: 452,
      f588: 452,
      rightsClassA: 1,
      rightsClassB: 73,
      rightsClassC: 378,
      rightsProvenanceClassificationBound: 452,
      privateProvenanceEvidenceBound: 452,
      sourceOracleEvidenceBound: 452,
      legacyCompatibilityOracleAvailable: 443,
      waiverProbeNotExecutableOracle: 9,
      technicalFailedMissingInput: 452,
      provisionalOverlap: 0,
      behaviorPackagesApproved: 0,
      isolatedImplementationInputs: 0,
      approvedExecutableOraclePackages: 0,
      leakageReviewReceipts: 0,
      implementationAuthorized: 0,
      candidateAdmitted: 0,
      candidateBlocked: 452,
    });
    expect(result.rows).toHaveLength(452);
    expect(
      result.rows.every(
        (row) => row.blockers.length === 9 && row.admissionStatus === "blocked",
      ),
    ).toBe(true);
    expect(result.candidateReceiptsIssued).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
  });

  it("projects only aggregate-safe provenance and oracle status", () => {
    const result = evaluateCleanRoomEvidenceV1(cleanRoomInput());
    expect(result.rows[0]).toMatchObject({
      rightsProvenanceClassificationBound: true,
      privateProvenanceEvidenceBound: true,
      sourceOracleEvidenceBound: true,
      sourceOracleStatus: "waiver-probe-not-executable-oracle",
      workInputStatus:
        "blocked-missing-approved-nonreversible-behavior-spec",
      technicalFailureReason: "missing-input",
      provisionalCandidate: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /sourceLocator|originalSource|rawPayload|behaviorPayload|canonicalSource/,
    );
  });

  it("rejects work and ledger ordering drift", () => {
    const input = cleanRoomInput();
    [input.ledgerRows[0], input.ledgerRows[1]] = [
      input.ledgerRows[1]!,
      input.ledgerRows[0]!,
    ];
    expect(() => evaluateCleanRoomEvidenceV1(input)).toThrow(
      "clean-room-evidence-exact-set-invalid",
    );
  });

  it("rejects duplicate identities", () => {
    const input = cleanRoomInput();
    input.workRows[1]!.formulaId = input.workRows[0]!.formulaId;
    expect(() => evaluateCleanRoomEvidenceV1(input)).toThrow(
      "clean-room-evidence-exact-set-invalid",
    );
  });

  it("rejects technical or rights drift", () => {
    const technical = cleanRoomInput();
    technical.ledgerRows[0]!.reasonCode = "release-oracle-mismatch";
    expect(() => evaluateCleanRoomEvidenceV1(technical)).toThrow(
      "clean-room-evidence-ledger-row-invalid",
    );

    const rights = cleanRoomInput();
    rights.workRows[0]!.rightsClass = "C";
    expect(() => evaluateCleanRoomEvidenceV1(rights)).toThrow(
      "clean-room-evidence-exact-set-invalid",
    );
  });

  it("rejects oracle accounting drift", () => {
    const input = cleanRoomInput();
    input.workRows[9]!.sourceOracleStatus =
      "waiver-probe-not-executable-oracle";
    expect(() => evaluateCleanRoomEvidenceV1(input)).toThrow(
      "clean-room-evidence-exact-set-invalid",
    );
  });

  it("rejects any provisional overlap with the clean set", () => {
    const input = cleanRoomInput();
    input.provisionalRows.push({ formulaId: formulaId(0), sourceSet: "F588" });
    expect(() => evaluateCleanRoomEvidenceV1(input)).toThrow(
      "clean-room-evidence-exact-set-invalid",
    );
  });

  it("rejects sparse arrays and hidden array properties", () => {
    const sparse = cleanRoomInput();
    delete sparse.workRows[1];
    expect(() => evaluateCleanRoomEvidenceV1(sparse)).toThrow(
      "clean-room-evidence-input-invalid",
    );

    const hidden = cleanRoomInput();
    Object.defineProperty(hidden.workRows, "hidden", { value: true });
    expect(() => evaluateCleanRoomEvidenceV1(hidden)).toThrow(
      "clean-room-evidence-input-invalid",
    );
  });

  it("rejects accessors, unexpected keys, and symbol keys", () => {
    const accessor = cleanRoomInput();
    Object.defineProperty(accessor.workRows[0], "formulaId", {
      enumerable: true,
      get: () => formulaId(0),
    });
    expect(() => evaluateCleanRoomEvidenceV1(accessor)).toThrow(
      "clean-room-evidence-work-row-invalid",
    );

    const unexpected = cleanRoomInput();
    Object.assign(unexpected.workRows[0]!, { originalSource: "forbidden" });
    expect(() => evaluateCleanRoomEvidenceV1(unexpected)).toThrow(
      "clean-room-evidence-work-row-invalid",
    );

    const symbol = cleanRoomInput();
    Object.defineProperty(symbol.workRows[0], Symbol("hidden"), { value: true });
    expect(() => evaluateCleanRoomEvidenceV1(symbol)).toThrow(
      "clean-room-evidence-work-row-invalid",
    );
  });

  it("sanitizes hostile proxies and freezes the result", () => {
    const proxied = new Proxy(cleanRoomInput(), {
      getOwnPropertyDescriptor() {
        throw new Error("trap");
      },
    });
    expect(() => evaluateCleanRoomEvidenceV1(proxied)).toThrow(
      "clean-room-evidence-input-invalid",
    );

    const result = evaluateCleanRoomEvidenceV1(cleanRoomInput());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(Object.isFrozen(result.rows[0]!.blockers)).toBe(true);
  });
});
