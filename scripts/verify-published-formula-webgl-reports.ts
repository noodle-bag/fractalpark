import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { PublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";

interface WebglReport {
  readonly ok: true;
  readonly rowCount: number;
  readonly fullRuntimeRowCount: number;
  readonly renderer: string;
  readonly formulaIds: readonly string[];
  readonly checks: {
    readonly fullFrameworkCompileLink: number;
    readonly candidateOrbitCpuGpuProbePairs: number;
  };
}

function filesUnder(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(join(path, entry.name)),
  );
}

function main(): void {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0)
    throw new Error("published-webgl-reports-input-missing");
  const reportFiles = inputs.flatMap(filesUnder).filter((path) => path.endsWith(".json"));
  if (reportFiles.length === 0)
    throw new Error("published-webgl-reports-missing");
  const index = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "public/formula-library/v1/runtime/published/index.json",
      ),
      "utf8",
    ),
  ) as PublishedFormulaRuntimeIndexV1;
  const expected = index.rows.map((row) => row.formulaId).sort();
  const seen: string[] = [];
  let linkCount = 0;
  let probePairCount = 0;
  for (const reportFile of reportFiles.sort()) {
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as WebglReport;
    if (
      report.ok !== true ||
      report.fullRuntimeRowCount !== index.rowCount ||
      !report.renderer.includes("SwiftShader") ||
      !Array.isArray(report.formulaIds) ||
      report.formulaIds.length !== report.rowCount ||
      report.checks.fullFrameworkCompileLink !== report.rowCount ||
      report.checks.candidateOrbitCpuGpuProbePairs !== report.rowCount * 2
    )
      throw new Error(`published-webgl-report-invalid:${reportFile}`);
    linkCount += report.checks.fullFrameworkCompileLink;
    probePairCount += report.checks.candidateOrbitCpuGpuProbePairs;
    seen.push(...report.formulaIds);
  }
  const sortedSeen = [...seen].sort();
  if (
    sortedSeen.length !== expected.length ||
    new Set(sortedSeen).size !== sortedSeen.length ||
    sortedSeen.some((formulaId, indexValue) => formulaId !== expected[indexValue])
  )
    throw new Error("published-webgl-report-coverage-invalid");
  const coverageSha256 = createHash("sha256")
    .update(sortedSeen.join("\n"))
    .digest("hex");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      reportCount: reportFiles.length,
      rowCount: sortedSeen.length,
      fullFrameworkCompileLink: linkCount,
      candidateOrbitCpuGpuProbePairs: probePairCount,
      coverageSha256,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "published-webgl-reports-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
