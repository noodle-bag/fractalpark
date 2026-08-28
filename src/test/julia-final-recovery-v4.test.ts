/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
  verifyJuliaFinalRecoveryActivationHandoffV3,
} from "../engine/formulas/v1/julia-final-recovery-v4";
import { JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1 } from "../engine/formulas/v1/julia-mutable-state-adjudication-v1";

const root = process.cwd();
const resource = "resources/formula-library/v1";
const read = (name: string) =>
  JSON.parse(readFileSync(join(root, resource, name), "utf8"));
const inputs = () => ({
  baseline: read("julia-final-capability-census.v1.json"),
  predecessor: read("julia-pixel-final-capability-census.v3.json"),
  predecessorAudit: read("julia-pixel-final-recovery-audit.v2.json"),
  contract: read("julia-pixel-recovery-contract.v1.json"),
  adjudication: read("julia-mutable-state-adjudication.v1.json"),
  census: read("julia-pixel-final-capability-census.v4.json"),
  authority: read("julia-pixel-final-authority-manifest.v3.json"),
  handoff: read("julia-pixel-activation-handoff.v3.json"),
  audit: read("julia-pixel-final-recovery-audit.v3.json"),
});
const sourceContents = (authority: any) => Object.fromEntries(
  Object.keys(authority.sourceBindings).map((path) => [
    path,
    readFileSync(join(root, path), "utf8"),
  ]),
);
const consumer = (value: ReturnType<typeof inputs>) =>
  verifyJuliaFinalRecoveryActivationHandoffV3(
    value.handoff,
    value.census,
    value.authority,
    value.audit,
    value.baseline,
    value.predecessor,
    value.contract,
    value.predecessorAudit,
    value.adjudication,
    sourceContents(value.authority),
  );

describe("julia final recovery v4", () => {
  it("parses the sealed v4 closure and remains review-pending", () => {
    const value = inputs();
    expect(parseJuliaPixelFinalCapabilityCensusV4(value.census).ok).toBe(true);
    expect(parseJuliaPixelFinalAuthorityManifestV3(value.authority).ok).toBe(true);
    expect(parseJuliaPixelActivationHandoffV3(value.handoff).ok).toBe(true);
    expect(parseJuliaFinalRecoveryAuditV3(value.audit).ok).toBe(true);
    expect(consumer(value)).toEqual({
      ok: false,
      code: "julia-final-recovery-v4-review-pending",
    });
    expect(value.handoff.maintainerAcknowledgmentReceiptDigest).toBeNull();
  });

  it("changes exactly nine rows and preserves all 525 non-target rows", () => {
    const value = inputs();
    const targetSet = new Set(JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1);
    let changed = 0;
    let unchanged = 0;
    for (let index = 0; index < value.predecessor.rows.length; index += 1) {
      const before = value.predecessor.rows[index];
      const after = value.census.rows[index];
      if (targetSet.has(before.formulaId)) {
        changed += 1;
        expect(after).not.toEqual(before);
        expect(after.finalStatus).toBe("supported");
        expect(after.modeClass).toBe("classic-julia");
        expect(after.supportLane).toBe("state-separated");
        expect(after.remediationLane).toBe("none");
        expect(after.roles).not.toContain("role:unresolved");
      } else {
        unchanged += 1;
        expect(after).toEqual(before);
      }
    }
    expect({ changed, unchanged }).toEqual({ changed: 9, unchanged: 525 });
    expect(value.audit.recoveredRegressionIds).toEqual(
      JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
    );
    expect(value.audit.cumulativeRecoveredRegressionIds).toHaveLength(16);
  });

  it("recomputes the final census without disturbing the remaining eleven", () => {
    const value = inputs();
    expect(value.audit.statusCounts).toEqual({
      supported: 195,
      held: 151,
      blocked: 72,
      unknown: 116,
      notApplicable: 0,
    });
    expect(value.audit.gainIds).toHaveLength(36);
    expect(value.audit.regressionIds).toHaveLength(11);
    const rows = new Map(
      value.census.rows.map((row: any) => [row.formulaId, row]),
    );
    const remaining = value.audit.regressionIds.map((id: string) => rows.get(id));
    const counts = (key: string) => Object.fromEntries(
      [...new Set(remaining.map((row: any) => row[key]))]
        .sort()
        .map((label) => [
          label,
          remaining.filter((row: any) => row[key] === label).length,
        ]),
    );
    expect(counts("modeClass")).toEqual({
      "classic-julia": 2,
      "generalized-two-plane": 8,
      undetermined: 1,
    });
    expect(counts("remediationLane")).toEqual({
      "identity-review": 9,
      "renderer-diagnosis": 2,
    });
    expect(counts("finalStatus")).toEqual({ blocked: 2, held: 9 });
  });

  it("rejects sealed asset and partition tampering", () => {
    const changes = [
      (value: any) => (value.census.revision = 3),
      (value: any) => (value.census.rows[0].finalStatus = "tampered"),
      (value: any) => (value.authority.inputAuthorityContentHashes.pop()),
      (value: any) => (value.handoff.handoffState = "activation-ready"),
      (value: any) => (value.handoff.maintainerAcknowledgmentReceiptDigest = "0".repeat(64)),
      (value: any) => (value.audit.statusCounts.supported = 194),
      (value: any) => (value.audit.recoveredRegressionIds.pop()),
      (value: any) => (value.audit.cumulativeRecoveredRegressionIds.pop()),
    ];
    for (const change of changes) {
      const value = inputs();
      change(value);
      const parsed = [
        parseJuliaPixelFinalCapabilityCensusV4(value.census),
        parseJuliaPixelFinalAuthorityManifestV3(value.authority),
        parseJuliaPixelActivationHandoffV3(value.handoff),
        parseJuliaFinalRecoveryAuditV3(value.audit),
      ];
      expect(parsed.some((result) => !result.ok)).toBe(true);
    }
  });

  it("consumer rejects non-target drift even with a recomputed census hash absent", () => {
    const value = inputs();
    const targetSet = new Set(JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1);
    const row = value.census.rows.find(
      (entry: any) => !targetSet.has(entry.formulaId),
    );
    row.remediationLane = "identity-review";
    expect(consumer(value).code).toBe("julia-final-recovery-v4-consumer-invalid");
  });

  it("consumer rejects stale exact source bindings", () => {
    const value = inputs();
    const contents = sourceContents(value.authority);
    const path = Object.keys(contents)[0];
    contents[path] += "\n";
    expect(
      verifyJuliaFinalRecoveryActivationHandoffV3(
        value.handoff,
        value.census,
        value.authority,
        value.audit,
        value.baseline,
        value.predecessor,
        value.contract,
        value.predecessorAudit,
        value.adjudication,
        contents,
      ).code,
    ).toBe("julia-final-recovery-v4-consumer-invalid");
  });

  it(
    "passes the independent exact-head verifier",
    () => {
      expect(() =>
        execFileSync(
          "npx",
          ["tsx", "scripts/verify-julia-final-recovery-v4.ts"],
          { cwd: root, stdio: "pipe", timeout: 120_000 },
        ),
      ).not.toThrow();
    },
    130_000,
  );

  it("keeps all predecessor v3 assets byte-unmodified", () => {
    expect(() =>
      execFileSync(
        "git",
        [
          "diff",
          "--quiet",
          "--",
          `${resource}/julia-pixel-final-capability-census.v3.json`,
          `${resource}/julia-pixel-final-authority-manifest.v2.json`,
          `${resource}/julia-pixel-activation-handoff.v2.json`,
          `${resource}/julia-pixel-final-recovery-audit.v2.json`,
          "src/engine/formulas/v1/julia-final-recovery-v3.ts",
        ],
        { cwd: root },
      ),
    ).not.toThrow();
  });
});
