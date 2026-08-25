import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-capability-census.v1.json",
);
const WRITE = process.argv.includes("--write");
const EXPECTED_RUNTIME_SCHEMA =
  "fractalpark-published-formula-runtime-index/v1";
const EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5";
const EXPECTED_ROW_COUNT = 534;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeAtomic(path: string, bytes: string): void {
  const temp = `${path}.tmp-${process.pid}`;
  rmSync(temp, { force: true });
  writeFileSync(temp, bytes, { mode: 0o644, flag: "wx" });
  chmodSync(temp, 0o644);
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function main(): void {
  const runtime = readJson(RUNTIME_INDEX_PATH);
  invariant(record(runtime), "julia-census-runtime-index-invalid");
  invariant(
    runtime.schema === EXPECTED_RUNTIME_SCHEMA &&
      runtime.rowCount === EXPECTED_ROW_COUNT &&
      Array.isArray(runtime.rows) &&
      runtime.rows.length === EXPECTED_ROW_COUNT,
    "julia-census-runtime-index-invalid",
  );
  const runtimeCanonicalSha256 = sha256(canonicalJsonV1(runtime, 131_072));
  invariant(
    runtimeCanonicalSha256 === EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256,
    "julia-census-runtime-index-drift",
  );

  const seen = new Set<string>();
  const rows = runtime.rows.map((value) => {
    invariant(record(value), "julia-census-runtime-row-invalid");
    invariant(
      typeof value.formulaId === "string" &&
        UUID_V5.test(value.formulaId) &&
        !seen.has(value.formulaId) &&
        typeof value.sourceRevision === "string" &&
        SHA256.test(value.sourceRevision),
      "julia-census-runtime-row-invalid",
    );
    seen.add(value.formulaId);
    return {
      formulaId: value.formulaId,
      sourceRevision: value.sourceRevision,
      status: "unknown" as const,
    };
  });
  invariant(
    rows.every(
      (row, index) =>
        index === 0 || rows[index - 1]!.formulaId < row.formulaId,
    ),
    "julia-census-runtime-order-invalid",
  );

  const content = {
    schema: "fractalpark-julia-capability-census/v1",
    revision: 1,
    stage: "skeleton",
    runtimeIndexCanonicalSha256: runtimeCanonicalSha256,
    rowCount: rows.length,
    rows,
  };
  const contentHash = sha256(canonicalJsonV1(content, 16_384));
  const document = { ...content, contentHash };
  const bytes = json(document);

  if (WRITE) writeAtomic(OUTPUT_PATH, bytes);
  const current = (() => {
    try {
      const stat = lstatSync(OUTPUT_PATH);
      return (
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.nlink === 1 &&
        (stat.mode & 0o777) === 0o644 &&
        readFileSync(OUTPUT_PATH, "utf8") === bytes
      );
    } catch {
      return false;
    }
  })();
  process.stdout.write(
    `${JSON.stringify({
      ok: current,
      write: WRITE,
      drift: !current,
      output: OUTPUT_PATH.slice(dirname(ROOT).length + 1),
      rowCount: rows.length,
      runtimeIndexCanonicalSha256: runtimeCanonicalSha256,
      contentHash,
    })}\n`,
  );
  if (!current) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "julia-census-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
