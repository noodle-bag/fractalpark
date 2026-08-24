import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RECIPES } from "@/engine/formulas/v1/native-recipes-b94-recovered-amplified";

const ROOT = process.cwd();
const EVIDENCE_DIR = join(
  ROOT,
  "resources/formula-library/v1/recovery-evidence/amplified-v1",
);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("B94 amplified recovery evidence", () => {
  it("verifies exact per-formula receipts and releases the 21/21 publication gate", () => {
    const verifier = spawnSync(
      join(ROOT, "node_modules/.bin/tsx"),
      ["scripts/generate-amplified-recovery-evidence.ts"],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
    );
    expect(verifier.status, verifier.stderr).toBe(0);
    expect(JSON.parse(verifier.stdout)).toMatchObject({
      ok: true,
      mode: "verify",
      rows: 9,
    });

    const manifest = readJson(join(EVIDENCE_DIR, "manifest.json"));
    expect(manifest).toMatchObject({
      schema: "fractalpark-b94-amplified-recovery-evidence/v1",
      publicationEligible: true,
      publicationDecisionMutation: false,
      gateProgress: {
        batchPassed: 9,
        aggregatePassed: 21,
        required: 21,
        publicationGateReleased: true,
      },
      priorBatchArtifact: {
        path: "resources/formula-library/v1/recovery-evidence/transcendental-v1/manifest.json",
        passed: 12,
      },
      dimensions: { width: 96, height: 60 },
      crossCheckArtifact: {
        result: {
          contract: { probePixels: 5, extraProbe: [0, 3.14159265] },
        },
      },
    });
    const rows = manifest.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(9);
    expect(rows.map((row) => row.formulaId).sort()).toEqual(
      RECIPES.map((recipe) => recipe.formulaId).sort(),
    );
    expect(new Set(rows.map((row) => row.failureClass))).toEqual(
      new Set(["chaotic-amplification", "ill-conditioned-cancellation"]),
    );
    for (const row of rows) {
      expect(row).toMatchObject({
        technicalStatus: "passed",
        publicationDecision: "publish",
      });
      const preview = row.preview as Record<string, unknown>;
      expect(preview).toMatchObject({ width: 96, height: 60 });
      expect(Number(preview.uniqueColors)).toBeGreaterThanOrEqual(2);
      expect(Number(preview.escapedPixels)).toBeGreaterThan(0);
      expect(Number(preview.interiorPixels)).toBeGreaterThan(0);
      expect(Number(preview.nonFinitePixels)).toBeLessThanOrEqual(115);
      expect(
        Number(preview.escapedPixels) +
          Number(preview.interiorPixels) +
          Number(preview.nonFinitePixels),
      ).toBe(96 * 60);
    }

    const files = readdirSync(EVIDENCE_DIR);
    expect(files.filter((file) => file.startsWith("receipt-"))).toHaveLength(9);
    expect(files.filter((file) => file.startsWith("preview-"))).toHaveLength(9);
  }, 30_000);

  it("publishes the exact 9-row recovery set in the public runtime", () => {
    const decisions = readJson(
      join(ROOT, "resources/formula-library/v1/publication-decisions.json"),
    );
    const decisionRows = decisions.rows as Array<Record<string, unknown>>;
    const exactFormulaIds = new Set<string>(RECIPES.map((recipe) => recipe.formulaId));
    const publishedRecoveryIds = new Set(
      decisionRows
        .filter(
          (row) =>
            row.rightsStatus === "project-owned" &&
            exactFormulaIds.has(String(row.formulaId)) &&
            row.publicationDecision === "publish" &&
            row.decisionReason === "publish-project-owned-recovery-gate-green",
        )
        .map((row) => String(row.formulaId)),
    );
    expect(publishedRecoveryIds.size).toBe(9);

    const runtime = readJson(
      join(ROOT, "public/formula-library/v1/runtime/published/index.json"),
    );
    const publicIds = new Set(
      (runtime.rows as Array<Record<string, unknown>>).map((row) => String(row.formulaId)),
    );
    for (const recipe of RECIPES) {
      expect(publishedRecoveryIds.has(recipe.formulaId)).toBe(true);
      expect(publicIds.has(recipe.formulaId)).toBe(true);
    }
    expect(runtime.rowCount).toBe(534);
  });
});
