/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveJuliaClassicRegressionCorrectiveIdsV1,
  isJuliaClassicRegressionCorrectiveRelativePathV1,
  JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1,
  parseJuliaClassicRegressionCorrectiveV1,
} from "../engine/formulas/v1/julia-classic-regression-corrective-v1";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";

const root = process.cwd();
const read = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const asset = () =>
  read(
    "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
  );
const authorities = () => ({
  audit: read(
    "resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json",
  ),
  finalV2: read(
    "resources/formula-library/v1/julia-pixel-final-capability-census.v2.json",
  ),
  preGpuV2: read(
    "resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json",
  ),
  roleV1: read("resources/formula-library/v1/julia-pixel-role-census.v1.json"),
  finalV1: read(
    "resources/formula-library/v1/julia-final-capability-census.v1.json",
  ),
  sourceSplitV1: read(
    "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  ),
  rendererV1: read(
    "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  ),
  publicationLedger: read(
    "resources/formula-library/v1/publication-decisions.json",
  ),
});
const row = (authority: any, id: string) =>
  authority.rows.find((entry: any) => entry.formulaId === id);

describe("julia classic regression corrective v1", () => {
  it("parses the derived exact seven and remains pre-GPU only", () => {
    const parsed = parseJuliaClassicRegressionCorrectiveV1(asset());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rows.map((entry) => entry.formulaId)).toEqual(
        JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1,
      );
      expect(parsed.value.tier2).toBe("pending-not-run");
      expect(Object.isFrozen(parsed.value)).toBe(true);
    }
  });

  it("derives only the exact seven from all authority rows and sets", () => {
    expect(deriveJuliaClassicRegressionCorrectiveIdsV1(authorities())).toEqual(
      JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1,
    );
  });

  it("rejects independent derivation-input tampering", () => {
    const id = JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1[0];
    const changes = [
      (x: any) =>
        x.audit.regressionIds.splice(x.audit.regressionIds.indexOf(id), 1),
      (x: any) => (row(x.preGpuV2, id).reasonCodes[0] = "other"),
      (x: any) =>
        row(x.sourceSplitV1, id).tier1.reasonCodes.push("current-reason"),
      (x: any) => (row(x.sourceSplitV1, id).adjudication.reasonCode = "other"),
      (x: any) => (row(x.roleV1, id).modeClass = "undetermined"),
      (x: any) => row(x.roleV1, id).reasonCodes.push("role-reason"),
      (x: any) => (row(x.finalV2, id).finalStatus = "supported"),
      (x: any) => (row(x.finalV2, id).supportLane = "source-split"),
      (x: any) => (row(x.finalV2, id).remediationLane = "none"),
      (x: any) => (row(x.finalV1, id).status = "held"),
      (x: any) => (row(x.finalV1, id).lane = "none"),
      (x: any) => (row(x.sourceSplitV1, id).status = "held"),
      (x: any) => (row(x.sourceSplitV1, id).tier0.sourceBound = false),
      (x: any) => (row(x.sourceSplitV1, id).tier1.candidatePass = false),
      (x: any) =>
        (row(x.sourceSplitV1, id).isolation.candidateDefinitionPath =
          "escape.frm"),
      (x: any) =>
        (row(x.sourceSplitV1, id).identity.candidateSourceRevision = "0".repeat(
          64,
        )),
      (x: any) =>
        (row(x.sourceSplitV1, id).tier1.bindingRevision = "0".repeat(64)),
      (x: any) => (row(x.rendererV1, id).status = "failed"),
      (x: any) =>
        (row(x.rendererV1, id).evaluatedSourceRevision = "0".repeat(64)),
      (x: any) => (row(x.rendererV1, id).bindingRevision = "0".repeat(64)),
    ];
    for (const change of changes) {
      const input = authorities();
      change(input);
      expect(deriveJuliaClassicRegressionCorrectiveIdsV1(input)).not.toContain(
        id,
      );
    }
  });

  it("does not admit an extra same-reason authority row", () => {
    const input = authorities();
    input.preGpuV2.rows.push({
      ...row(input.preGpuV2, JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1[0]),
      formulaId: "11111111-1111-5111-8111-111111111111",
    });
    expect(deriveJuliaClassicRegressionCorrectiveIdsV1(input)).toEqual(
      JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1,
    );
  });

  it("rejects every receipt-bound recovery and E0 field", () => {
    const changes = [
      (x: any) => (x.recoveryContractContentHash = "0".repeat(64)),
      (x: any) => (x.rows[0].e0.operationalEquivalence = false),
      (x: any) => (x.rows[0].e0.analyzerRevision = "0".repeat(64)),
      (x: any) => (x.rows[0].e0.analysisContentHash = "0".repeat(64)),
      (x: any) => (x.rows[0].e0.changedRegionCount = -1),
      (x: any) => (x.rows[0].e0.reachableOrUnknownRegionCount = -1),
      (x: any) => (x.rows[0].e0.coveredRegionCount = -1),
      (x: any) => (x.rows[0].e0.uncoveredReachableOrUnknownRegionCount = 1),
      (x: any) => (x.rows[0].rowReceipt = "0".repeat(64)),
      (x: any) => (x.contentHash = "0".repeat(64)),
    ];
    for (const change of changes) {
      const input = asset();
      change(input);
      expect(parseJuliaClassicRegressionCorrectiveV1(input).ok).toBe(false);
    }
  });

  it("rejects target, path, source-binding, and status tampering", () => {
    const changes = [
      (x: any) => x.rows.pop(),
      (x: any) => (x.rows[0].candidatePath = "../escape.frm"),
      (x: any) => (x.rows[0].tier2 = "pass"),
      (x: any) =>
        (x.sourceBindings[Object.keys(x.sourceBindings)[0]] = "0".repeat(64)),
    ];
    for (const change of changes) {
      const input = asset();
      change(input);
      expect(parseJuliaClassicRegressionCorrectiveV1(input).ok).toBe(false);
    }
  });

  it("has a browser-safe path-shape guard while scripts retain lstat/nlink checks", () => {
    expect(
      isJuliaClassicRegressionCorrectiveRelativePathV1(
        "julia-source-split-candidates/definitions/a.frm",
      ),
    ).toBe(true);
    for (const path of [
      "../escape.frm",
      "/absolute.frm",
      "a//b.frm",
      "a\\b.frm",
      "a/./b.frm",
    ])
      expect(isJuliaClassicRegressionCorrectiveRelativePathV1(path)).toBe(
        false,
      );
  });

  it("pins the sealed v2 semantic rows across source rebinds", () => {
    const digest = (path: string, fields: readonly string[]) => {
      const rows = read(path).rows.map((row: Record<string, unknown>) =>
        Object.fromEntries(fields.map((field) => [field, row[field]])),
      );
      return sha256HexSyncV1(canonicalJsonV1(rows, 1_048_576));
    };
    expect(
      digest("resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json", [
        "formulaId", "evaluatedSourceRevision", "evaluatedSemanticHash",
        "bindingRevision", "supportLane", "rewriteClass", "status",
        "reasonCodes", "candidateContentHash",
      ]),
    ).toBe("60f78904c3d9eab2181077f3ec1478167570dd1dffa15ca2253d3d39e8b9e15f");
    expect(
      digest("resources/formula-library/v1/julia-renderer-evidence.v2.json", [
        "formulaId", "candidateContentHash", "evaluatedSourceRevision",
        "evaluatedSemanticHash", "bindingRevision", "supportLane",
        "profileDigest", "status", "reasonCode",
      ]),
    ).toBe("be17c2e0b6622f411b0ace2c7e17e4c1ea2fd34e1c9c9d14221a066b55129669");
    expect(
      digest("resources/formula-library/v1/julia-pixel-final-capability-census.v2.json", [
        "formulaId", "roles", "modeClass", "supportLane", "remediationLane",
        "rewriteClass", "finalStatus", "identityChangeProposalRef",
      ]),
    ).toBe("ef64339eb4b289c6a02a148d9779599f41e748b887cff57e87a2ce50effbe77c");
  });
});
