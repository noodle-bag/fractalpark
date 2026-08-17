import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCleanRoomBehaviorPackageGateV2 } from "@/engine/formulas/v1/clean-room-behavior-package-gate";
import { verifyCleanRoomBehaviorPackageGateV2 } from "@/engine/formulas/v1/clean-room-behavior-package-gate-verifier";

const PRIVATE_INTEGRATION_ENABLED =
  process.env.FRACTALPARK_FORMULA_PRIVATE_INTEGRATION === "1";
const describePrivate = PRIVATE_INTEGRATION_ENABLED ? describe : describe.skip;
const ROOT = process.cwd();
const PRIVATE_MANIFEST = resolve(
  ROOT,
  ".formula-library-private/formula-library-v1/clean-room-evidence-v1/manifest.json",
);

type EvidenceProjection = {
  formulaId: string;
  rightsClass: "A" | "B" | "C";
  sourceOracleStatus:
    | "legacy-compatibility-orbit-oracle-available"
    | "waiver-probe-not-executable-oracle";
  rowProjectionHash: string;
};

function exactInput(): {
  evidenceRows: EvidenceProjection[];
  submissionRows: [];
} {
  const manifest = JSON.parse(readFileSync(PRIVATE_MANIFEST, "utf8")) as {
    rows: readonly EvidenceProjection[];
  };
  return {
    evidenceRows: manifest.rows.map((row) => ({
      formulaId: row.formulaId,
      rightsClass: row.rightsClass,
      sourceOracleStatus: row.sourceOracleStatus,
      rowProjectionHash: row.rowProjectionHash,
    })),
    submissionRows: [],
  };
}

describePrivate("private clean-room behavior-package integration", () => {
  it("binds the frozen exact evidence set without granting publication authority", () => {
    const input = exactInput();
    const result = evaluateCleanRoomBehaviorPackageGateV2(input);

    expect(result.exactSetCommitmentStatus).toBe("bound");
    expect(result.summary).toEqual({
      total: 452,
      submissions: 0,
      missingSubmissions: 452,
      contaminatedReviewDeclarationsSatisfied: 0,
      cleanReviewDeclarationsSatisfied: 0,
      syntheticContractsSatisfied: 0,
    });
    expect(result.rows).toHaveLength(452);
    expect(
      result.rows.every(
        (row) =>
          row.contractClosure === "blocked" &&
          row.contractIssues.includes("behavior-package-missing") &&
          !row.contractIssues.includes("exact-set-commitment-unbound"),
      ),
    ).toBe(true);
    expect(verifyCleanRoomBehaviorPackageGateV2(input, result)).toEqual({
      total: 452,
      syntheticContractsSatisfied: 0,
    });
  });

  it("rejects rights metadata relabeling under frozen row hashes", () => {
    const input = exactInput();
    const first = input.evidenceRows[0]!;
    const differentIndex = input.evidenceRows.findIndex(
      (row) => row.rightsClass !== first.rightsClass,
    );
    expect(differentIndex).toBeGreaterThan(0);
    const second = input.evidenceRows[differentIndex]!;
    const firstRightsClass = first.rightsClass;
    first.rightsClass = second.rightsClass;
    second.rightsClass = firstRightsClass;

    expect(() => evaluateCleanRoomBehaviorPackageGateV2(input)).toThrow(
      "clean-room-behavior-package-exact-set-commitment-invalid",
    );
  });
});
