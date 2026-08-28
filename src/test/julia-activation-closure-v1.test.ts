/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1,
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  juliaActivationClosureContentHashV1,
  parseJuliaMaintainerAcknowledgmentV1,
  parseJuliaPixelActivationHandoffV4,
  parseJuliaPixelFinalAuthorityManifestV4,
  verifyJuliaActivationClosureV1,
} from "../engine/formulas/v1/julia-activation-closure-v1";
import { juliaFinalRecoveryV4ContentHash } from "../engine/formulas/v1/julia-final-recovery-v4";
import { sha256HexSyncV1 } from "../engine/formulas/v1/revisions";

const root = process.cwd();
const resource = "resources/formula-library/v1";
const read = (name: string) =>
  JSON.parse(readFileSync(join(root, resource, name), "utf8"));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const reseal = (value: any, hasher = juliaActivationClosureContentHashV1) => {
  value.contentHash = hasher(value);
  return value;
};
const contents = (paths: readonly string[]) => Object.fromEntries(
  paths.map((path) => [path, readFileSync(join(root, path), "utf8")]),
);
const inputs = () => ({
  baseline: read("julia-final-capability-census.v1.json"),
  predecessorCensus: read("julia-pixel-final-capability-census.v3.json"),
  predecessorAudit: read("julia-pixel-final-recovery-audit.v2.json"),
  contract: read("julia-pixel-recovery-contract.v1.json"),
  adjudication: read("julia-mutable-state-adjudication.v1.json"),
  census: read("julia-pixel-final-capability-census.v4.json"),
  predecessorAuthority: read("julia-pixel-final-authority-manifest.v3.json"),
  predecessorHandoff: read("julia-pixel-activation-handoff.v3.json"),
  finalAudit: read("julia-pixel-final-recovery-audit.v3.json"),
  acknowledgment: read("julia-pixel-maintainer-acknowledgment.v1.json"),
  successorAuthority: read("julia-pixel-final-authority-manifest.v4.json"),
  successorHandoff: read("julia-pixel-activation-handoff.v4.json"),
  predecessorSourceContents: contents(JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS),
  closureSourceContents: contents(JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1),
});

function verify(value = inputs()) {
  return verifyJuliaActivationClosureV1(value);
}

describe("julia activation closure v1", () => {
  it("binds the explicit maintainer acknowledgment to an activation-eligible handoff", () => {
    const value = inputs();
    expect(parseJuliaMaintainerAcknowledgmentV1(value.acknowledgment).ok).toBe(true);
    expect(parseJuliaPixelFinalAuthorityManifestV4(value.successorAuthority).ok).toBe(true);
    expect(parseJuliaPixelActivationHandoffV4(value.successorHandoff).ok).toBe(true);
    expect(verify(value)).toEqual({
      ok: true,
      value: {
        handoffState: "activation-eligible",
        finalCensusContentHash: value.census.contentHash,
        supportedClassicRowSetDigest: value.successorHandoff.supportedClassicRowSetDigest,
        supportedClassicRowCount: 195,
        regressionSetDigest: value.successorHandoff.regressionSetDigest,
        regressionCount: 11,
        maintainerAcknowledgmentReceiptDigest: value.acknowledgment.contentHash,
      },
    });
    expect(value.predecessorHandoff).toMatchObject({
      handoffState: "review-pending",
      maintainerAcknowledgmentReceiptDigest: null,
    });
  });

  it("keeps all exact-eleven residual rows visible and unchanged", () => {
    const value = inputs();
    const ids = value.finalAudit.regressionIds;
    const rows = new Map(value.census.rows.map((row: any) => [row.formulaId, row]));
    const residuals = ids.map((id: string) => rows.get(id));
    expect(ids).toHaveLength(11);
    expect(value.acknowledgment.acceptedResidualRows).toEqual(
      residuals.map((row: any) => ({
        formulaId: row.formulaId,
        modeClass: row.modeClass,
        finalStatus: row.finalStatus,
        remediationLane: row.remediationLane,
      })),
    );
    expect(residuals.filter((row: any) => row.modeClass === "generalized-two-plane"))
      .toHaveLength(8);
    expect(residuals.filter((row: any) => row.modeClass === "undetermined"))
      .toHaveLength(1);
    expect(residuals.filter((row: any) => row.remediationLane === "renderer-diagnosis"))
      .toHaveLength(2);
    expect(residuals.filter((row: any) => row.finalStatus === "held")).toHaveLength(9);
    expect(residuals.filter((row: any) => row.finalStatus === "blocked")).toHaveLength(2);
    expect(value.finalAudit.statusCounts).toEqual({
      supported: 195,
      held: 151,
      blocked: 72,
      unknown: 116,
      notApplicable: 0,
    });
  });

  it("rejects forged or scope-mutated acknowledgment receipts", () => {
    const mutations = [
      (value: any) => (value.actorId = "not-the-maintainer"),
      (value: any) => (value.acceptedResidualRows[0].finalStatus = "blocked"),
      (value: any) => value.scope.allows.pop(),
      (value: any) => (value.residualDispositionResponse = "recover later"),
      (value: any) => (value.maintainerResponse = "approved"),
      (value: any) => (value.trustModel.cryptographicSignature = "provided"),
    ];
    for (const mutate of mutations) {
      const receipt = clone(inputs().acknowledgment);
      mutate(receipt);
      reseal(receipt);
      expect(parseJuliaMaintainerAcknowledgmentV1(receipt).ok).toBe(false);
    }
  });

  it("rejects sparse acknowledgment and authority arrays", () => {
    const acknowledgment = clone(inputs().acknowledgment);
    const sparseResiduals = [...acknowledgment.acceptedResidualRows];
    delete sparseResiduals[5];
    acknowledgment.acceptedResidualRows = sparseResiduals;
    expect(parseJuliaMaintainerAcknowledgmentV1(acknowledgment).ok).toBe(false);

    const authority = clone(inputs().successorAuthority);
    const sparseHashes = [...authority.inputAuthorityContentHashes];
    delete sparseHashes[2];
    authority.inputAuthorityContentHashes = sparseHashes;
    expect(parseJuliaPixelFinalAuthorityManifestV4(authority).ok).toBe(false);
  });

  it("rejects successor authority and handoff tampering after resealing", () => {
    const cases = [
      (value: ReturnType<typeof inputs>) => {
        value.successorAuthority.inputAuthorityContentHashes.pop();
        reseal(value.successorAuthority);
      },
      (value: ReturnType<typeof inputs>) => {
        value.successorHandoff.handoffState = "review-pending";
        reseal(value.successorHandoff);
      },
      (value: ReturnType<typeof inputs>) => {
        value.successorHandoff.maintainerAcknowledgmentReceiptDigest = "0".repeat(64);
        reseal(value.successorHandoff);
      },
      (value: ReturnType<typeof inputs>) => {
        value.census.rows[0].finalStatus = "held";
        reseal(value.census, juliaFinalRecoveryV4ContentHash);
      },
    ];
    for (const mutate of cases) {
      const value = inputs();
      mutate(value);
      expect(verify(value)).toEqual({
        ok: false,
        code: "julia-activation-closure-consumer-invalid",
      });
    }
  });

  it("rejects stale closure source bindings", () => {
    const value = inputs();
    const path = JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1[0];
    value.closureSourceContents[path] += "\n";
    expect(verify(value).ok).toBe(false);
  });

  it(
    "passes the independent exact-head verifier",
    () => {
      expect(() =>
        execFileSync(
          "npx",
          ["tsx", "scripts/verify-julia-activation-closure-v1.ts"],
          { cwd: root, stdio: "pipe", timeout: 120_000 },
        ),
      ).not.toThrow();
    },
    130_000,
  );

  it("pins all protected predecessor bytes to fixed SHA-256 values", () => {
    const expected = {
      "resources/formula-library/v1/julia-pixel-final-capability-census.v4.json":
        "b66df89bbdd5b1d0a6ed53ff5c1cb023d38ce03fec6dce80c5a2ba673eaaa52a",
      "resources/formula-library/v1/julia-pixel-final-authority-manifest.v3.json":
        "e1b3fde7677a359d8159ae9dc2ed494ea238397dc604dc14f5ae248ad4a35930",
      "resources/formula-library/v1/julia-pixel-activation-handoff.v3.json":
        "ac4d4b788fccba92f1b0904f52dd1f2c1acb18163a3881a86281532b3b5edc15",
      "resources/formula-library/v1/julia-pixel-final-recovery-audit.v3.json":
        "5c5f0b8679708b75f54313f2cef495e8e3807201a5b21682bf605b8f74c38296",
      "src/engine/formulas/v1/julia-final-recovery-v4.ts":
        "e93a570b806bb9316b56d1fd734dcb9344af75ae23d4f6536276e015e6da7f4f",
    };
    for (const [path, digest] of Object.entries(expected)) {
      expect(sha256HexSyncV1(readFileSync(join(root, path), "utf8"))).toBe(digest);
    }
  });
});
