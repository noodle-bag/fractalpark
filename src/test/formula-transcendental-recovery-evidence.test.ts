import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { RECIPES } from "@/engine/formulas/v1/native-recipes-b94-recovered-transcendental";

const ROOT = process.cwd();
const EVIDENCE_DIR = join(
  ROOT,
  "resources/formula-library/v1/recovery-evidence/transcendental-v1",
);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("B94 transcendental recovery evidence", () => {
  it("verifies exact per-formula receipts without publishing a partial set", () => {
    const verifier = spawnSync(
      join(ROOT, "node_modules/.bin/tsx"),
      ["scripts/generate-transcendental-recovery-evidence.ts"],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
    );
    expect(verifier.status, verifier.stderr).toBe(0);
    expect(JSON.parse(verifier.stdout)).toMatchObject({
      ok: true,
      mode: "verify",
      rows: 12,
    });

    const manifest = readJson(join(EVIDENCE_DIR, "manifest.json"));
    expect(manifest).toMatchObject({
      schema: "fractalpark-b94-transcendental-recovery-evidence/v1",
      publicationEligible: false,
      publicationDecisionMutation: false,
      gateProgress: { passed: 12, required: 21 },
      dimensions: { width: 96, height: 60 },
      crossCheckArtifact: {
        result: {
          contract: { probePixels: 5, extraProbe: [0, 0] },
        },
      },
    });
    const rows = manifest.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.formulaId).sort()).toEqual(
      RECIPES.map((recipe) => recipe.formulaId).sort(),
    );
    for (const row of rows) {
      expect(row).toMatchObject({
        technicalStatus: "passed",
        publicationDecision: "publish",
      });
      const preview = row.preview as Record<string, unknown>;
      expect(preview).toMatchObject({ width: 96, height: 60 });
      expect(Number(preview.uniqueColors)).toBeGreaterThanOrEqual(2);
      expect(Number(preview.nonFinitePixels)).toBeLessThanOrEqual(115);
      expect(
        Number(preview.escapedPixels) +
          Number(preview.interiorPixels) +
          Number(preview.nonFinitePixels),
      ).toBe(96 * 60);
    }

    const files = readdirSync(EVIDENCE_DIR);
    expect(files.filter((file) => file.startsWith("receipt-"))).toHaveLength(12);
    expect(files.filter((file) => file.startsWith("preview-"))).toHaveLength(12);
  }, 30_000);

  it("keeps the 12-row batch non-eligible while the aggregate set is public", () => {
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
    expect(publishedRecoveryIds.size).toBe(12);

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
