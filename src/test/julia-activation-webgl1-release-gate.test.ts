import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import activationAsset from "../../resources/formula-library/v1/julia-runtime-activation.v1.json";
import mutableAsset from "../../resources/formula-library/v1/julia-mutable-state-adjudication.v1.json";
import rendererV1Asset from "../../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import rendererV2Asset from "../../resources/formula-library/v1/julia-renderer-evidence.v2.json";
import {
  transformWorker,
  validateReportRow,
  validateReusedTuple,
} from "../../scripts/verify-julia-activation-webgl1-release";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "verify-julia-activation-webgl1-release.ts");
const WORKFLOW = join(ROOT, ".github", "workflows", "julia-renderer-evidence.yml");

function run(...args: string[]) {
  return spawnSync(
    join(ROOT, "node_modules", ".bin", "tsx"),
    [SCRIPT, ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
}

describe("Julia activation WebGL1 release gate", () => {
  it("partitions all 195 activations without a browser", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      activationCount: 195,
      mainCount: 179,
      correctiveCount: 7,
      reusedEquivalentCount: 9,
    });
  });

  it("fails closed for an unknown lane and invalid range", () => {
    const lane = run("--lane=unknown");
    expect(lane.status).toBe(1);
    expect(lane.stderr).toContain("julia-activation-webgl1-release:lane-invalid");

    const range = run("--lane=main", "--start=179", "--limit=1");
    expect(range.status).toBe(1);
    expect(range.stderr).toContain("julia-activation-webgl1-release:start-out-of-range");

    const missingCandidate = run("--lane=main", "--start=0", "--limit=1");
    expect(missingCandidate.status).toBe(1);
    expect(missingCandidate.stderr).toContain(
      "julia-activation-webgl1-release:candidate-sha-invalid",
    );
  });

  it("binds every reused pass to the exact renderer and activation tuple", () => {
    const row = structuredClone(mutableAsset.rows[0]) as unknown as Record<string, unknown>;
    const baseline = rendererV1Asset.rows.find(
      (candidate) => candidate.formulaId === row.formulaId,
    ) as unknown as Record<string, unknown>;
    const activation = activationAsset.rows.find(
      (candidate) => candidate.formulaId === row.formulaId,
    ) as unknown as Record<string, unknown>;
    expect(() => validateReusedTuple(row, baseline, activation)).not.toThrow();
    row.candidateSemanticHash = "0".repeat(64);
    expect(() => validateReusedTuple(row, baseline, activation)).toThrow(
      "julia-activation-webgl1-release:reused-renderer-tuple",
    );
  });

  it("rejects passed labels without the bound renderer evidence", () => {
    const authority = rendererV2Asset.rows.find(
      (row) => row.status === "passed",
    ) as unknown as Record<string, unknown>;
    const row = {
      ...structuredClone(authority),
      observedImageDifferingPixels: authority.minimumImageDifferingPixels,
      observedMaximumRelativeError: 0,
    };
    expect(validateReportRow(row, String(authority.formulaId), authority)).toBe(0);
    row.rendererClass = "unverified";
    expect(() =>
      validateReportRow(row, String(authority.formulaId), authority),
    ).toThrow("julia-activation-webgl1-release:report-row-renderer-contract");
  });

  it("transforms both exact workers without writing repository source", () => {
    for (const relativePath of [
      "scripts/run-julia-tier2-webgl-worker-v2.ts",
      "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
    ]) {
      const transformed = transformWorker(
        readFileSync(join(ROOT, relativePath), "utf8"),
      );
      expect(transformed).toContain('getContext("webgl"');
      expect(transformed).not.toContain('getContext("webgl2"');
      expect(transformed).not.toContain("gl.RGBA32F");
    }
    expect(readFileSync(SCRIPT, "utf8")).not.toContain(
      ".tmp-julia-webgl1-",
    );
  });

  it("binds CI to exact 179 plus 7 report coverage", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    const mainCounts = [...workflow.matchAll(/lane: main, start: \d+, count: (\d+)/g)].map(
      (match) => Number(match[1]),
    );
    const correctiveCounts = [
      ...workflow.matchAll(/lane: corrective, start: \d+, count: (\d+)/g),
    ].map((match) => Number(match[1]));
    expect(mainCounts).toEqual([45, 45, 45, 44]);
    expect(mainCounts.reduce((sum, value) => sum + value, 0)).toBe(179);
    expect(correctiveCounts).toEqual([7]);
    expect(workflow).toContain("scripts/run-julia-tier2-webgl-worker-v2.ts");
    expect(workflow).toContain(
      "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
    );
    expect(workflow).toContain(
      "FRACTALPARK_RELEASE_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(
      workflow.match(/ref: \$\{\{ env\.FRACTALPARK_RELEASE_CANDIDATE_SHA \}\}/g),
    ).toHaveLength(2);
    expect(workflow).toContain("julia-activation-webgl1-coverage:");
    expect(workflow).toContain("--verify-report-dir=/tmp/julia-activation-webgl1-reports");
  });
});
