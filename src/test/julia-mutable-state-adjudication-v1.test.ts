/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FrmV1UnaryFunctionName } from "../engine/frm/frm-v1-stdlib";
import { parseFrmLikeV1 } from "../engine/frm/v1";
import type { JuliaCpuComplexV1 } from "../engine/formulas/v1/julia-cpu-harness";
import {
  deriveJuliaMutableStateAdjudicationIdsV1,
  evaluateJuliaMutableStateSeparationV1,
  isJuliaMutableStateAdjudicationRelativePathV1,
  JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
  parseJuliaMutableStateAdjudicationV1,
} from "../engine/formulas/v1/julia-mutable-state-adjudication-v1";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";

const root = process.cwd();
const resource = "resources/formula-library/v1";
const published = "public/formula-library/v1/runtime/published";
const read = (path: string) =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const asset = () => read(`${resource}/julia-mutable-state-adjudication.v1.json`);
const authorities = () => ({
  auditV3: read(`${resource}/julia-pixel-final-recovery-audit.v2.json`),
  finalV3: read(`${resource}/julia-pixel-final-capability-census.v3.json`),
  roleV1: read(`${resource}/julia-pixel-role-census.v1.json`),
  sourceSplitV1: read(`${resource}/julia-source-split-evidence.v1.json`),
  preGpuV1: read(`${resource}/julia-pre-gpu-capability-census.v1.json`),
  rendererV1: read(`${resource}/julia-renderer-evidence.v1.json`),
  finalV1: read(`${resource}/julia-final-capability-census.v1.json`),
  publicationLedger: read(`${resource}/publication-decisions.json`),
});
const row = (value: any, formulaId: string) =>
  value.rows.find((entry: any) => entry.formulaId === formulaId);
const parameters = (
  value: any,
): Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName> =>
  Object.fromEntries(
    value.parameters.map((parameter: any) => [
      parameter.slotName,
      parameter.type === "complex"
        ? [parameter.default[0], parameter.default[1]]
        : parameter.default,
    ]),
  );

describe("julia mutable-state adjudication v1", () => {
  it("parses the exact nine as inactive state-separated evidence", () => {
    const parsed = parseJuliaMutableStateAdjudicationV1(asset());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.rows.map((entry) => entry.formulaId)).toEqual(
      JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
    );
    expect(parsed.value.activationStatus).toBe("inactive-evidence-only");
    expect(parsed.value.tier2).toBe("reused-pass-exact-tuple");
    expect(parsed.value.summary).toEqual({
      directPixelCount: 5,
      pixelAliasCount: 4,
      parameterPlaneSnapshotComparisons: 9490,
      juliaSnapshotComparisons: 27238,
      candidateStateShapeComparisons: 216,
    });
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.rows[0].stateSeparation)).toBe(true);
  });

  it("derives only the exact nine from complete authority rows", () => {
    expect(deriveJuliaMutableStateAdjudicationIdsV1(authorities())).toEqual(
      JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
    );
  });

  it("fails closed when any independent derivation input drifts", () => {
    const formulaId = JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1[0];
    const changes = [
      (value: any) => value.auditV3.regressionIds.splice(
        value.auditV3.regressionIds.indexOf(formulaId),
        1,
      ),
      (value: any) => (row(value.finalV3, formulaId).finalStatus = "supported"),
      (value: any) => (row(value.finalV3, formulaId).remediationLane = "none"),
      (value: any) => (row(value.roleV1, formulaId).modeClass = "classic-julia"),
      (value: any) => (row(value.sourceSplitV1, formulaId).tier0.sourceBound = false),
      (value: any) => (row(value.preGpuV1, formulaId).bindingRevision = "0".repeat(64)),
      (value: any) => (row(value.rendererV1, formulaId).status = "failed"),
      (value: any) => (row(value.finalV1, formulaId).status = "held"),
      (value: any) =>
        (row(value.publicationLedger, formulaId).publicationDecision = "exclude"),
    ];
    for (const change of changes) {
      const value = authorities();
      change(value);
      expect(deriveJuliaMutableStateAdjudicationIdsV1(value)).not.toContain(
        formulaId,
      );
    }
  });

  it("rejects duplicate authority rows instead of last-write-wins", () => {
    const value = authorities();
    value.finalV3.rows.push({ ...value.finalV3.rows[0] });
    expect(deriveJuliaMutableStateAdjudicationIdsV1(value)).toEqual([]);
  });

  it("rejects receipt, evidence, identity, count, and status tampering", () => {
    const changes = [
      (value: any) => value.rows.pop(),
      (value: any) => (value.rows[0].candidatePath = "../escape.frm"),
      (value: any) => (value.rows[0].supportLane = "source-split-direct"),
      (value: any) =>
        (value.rows[0].stateSeparation.parameterPlaneBitIdentical = false),
      (value: any) =>
        (value.rows[0].stateSeparation.candidateStateShapeComparisons = 23),
      (value: any) => (value.rows[0].tier2 = "pass"),
      (value: any) => (value.rows[0].rendererTupleReceipt = "0".repeat(64)),
      (value: any) => (value.rows[0].rowReceipt = "0".repeat(64)),
      (value: any) =>
        (value.sourceBindings[Object.keys(value.sourceBindings)[0]] =
          "0".repeat(64)),
      (value: any) => (value.contentHash = "0".repeat(64)),
    ];
    for (const change of changes) {
      const value = asset();
      change(value);
      expect(parseJuliaMutableStateAdjudicationV1(value).ok).toBe(false);
    }
  });

  it("replays one real row and rejects a written frozen target", () => {
    const value = asset();
    const adjudicationRow = value.rows[0];
    const split = row(
      read(`${resource}/julia-source-split-evidence.v1.json`),
      adjudicationRow.formulaId,
    );
    const runtime = row(
      read(`${published}/index.json`),
      adjudicationRow.formulaId,
    );
    const candidate = parseFrmLikeV1(
      readFileSync(join(root, resource, adjudicationRow.candidatePath), "utf8"),
    );
    const baseline = parseFrmLikeV1(
      readFileSync(join(root, published, runtime.definitionPath), "utf8"),
    );
    expect(candidate.ok).toBe(true);
    expect(baseline.ok).toBe(true);
    if (!candidate.ok || !baseline.ok) return;
    const baselineLocals = new Set(
      baseline.ir.locals.map((local) => local.name),
    );
    const newLocals = candidate.ir.locals
      .map((local) => local.name)
      .filter((name) => !baselineLocals.has(name));
    const frozenTargets = split.rewrite.aliasTargets.length > 0
      ? split.rewrite.aliasTargets
      : newLocals;
    expect(
      evaluateJuliaMutableStateSeparationV1(
        baseline.ir,
        candidate.ir,
        frozenTargets,
        parameters(runtime),
      ).passed,
    ).toBe(true);
    expect(
      evaluateJuliaMutableStateSeparationV1(
        baseline.ir,
        candidate.ir,
        ["z"],
        parameters(runtime),
      ).passed,
    ).toBe(false);
  });

  it("has a browser-safe path guard while scripts add lstat/nlink checks", () => {
    expect(
      isJuliaMutableStateAdjudicationRelativePathV1(
        "julia-source-split-candidates/definitions/a.frm",
      ),
    ).toBe(true);
    for (const path of [
      "../escape.frm",
      "/absolute.frm",
      "a//b.frm",
      "a\\b.frm",
      "a/./b.frm",
    ]) expect(isJuliaMutableStateAdjudicationRelativePathV1(path)).toBe(false);
  });

  it(
    "passes the independent exact-head verifier",
    () => {
      expect(() =>
        execFileSync(
          "npx",
          ["tsx", "scripts/verify-julia-mutable-state-adjudication-v1.ts"],
          { cwd: root, stdio: "pipe", timeout: 120_000 },
        ),
      ).not.toThrow();
    },
    130_000,
  );

  it("pins every non-lineage predecessor row field across source rebinds", () => {
    const rows = read(`${resource}/julia-pixel-final-capability-census.v3.json`).rows.map(
      (row: Record<string, unknown>) => {
        const semanticRow = { ...row };
        delete semanticRow.receipts;
        return semanticRow;
      },
    );
    expect(sha256HexSyncV1(canonicalJsonV1(rows, 1_048_576))).toBe(
      "190cd6d0898102c145e7ef174bdcb9828efdabbd89acad0c13f2223bdeb7439f",
    );
  });
});
