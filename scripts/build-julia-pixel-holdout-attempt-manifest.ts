import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import manifestAsset from "../resources/formula-library/v1/julia-pixel-candidate-manifest.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import {
  parseJuliaPixelCandidateManifestV1,
  parseJuliaPreGpuRecoveryCensusV2,
} from "../src/engine/formulas/v1/julia-pre-gpu-recovery-v2";

const ROOT = process.cwd();
const DEFAULT_PRIVATE_ROOT = join(
  ROOT,
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
);

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "holdout-attempt-manifest-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(record(value), "holdout-attempt-manifest-non-json");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPrivateJson(path: string): JsonRecord {
  const stat = lstatSync(path);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 0o777) === 0o600,
    "holdout-attempt-manifest-private-input-invalid",
  );
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), "holdout-attempt-manifest-private-json-invalid");
  return value;
}

function writeExclusive(path: string, artifact: JsonRecord): void {
  if (existsSync(path)) {
    const current = readPrivateJson(path);
    invariant(
      canonicalJson(current) === canonicalJson(artifact),
      "holdout-attempt-manifest-output-conflict",
    );
    return;
  }
  let descriptor: number | undefined;
  let created = false;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    fchmodSync(descriptor, 0o600);
    invariant(
      fstatSync(descriptor).nlink === 1,
      "holdout-attempt-manifest-output-hardlinked",
    );
    writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    if (record(error) && error.code === "EEXIST") {
      const current = readPrivateJson(path);
      invariant(
        canonicalJson(current) === canonicalJson(artifact),
        "holdout-attempt-manifest-output-conflict",
      );
      return;
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) {
      try {
        readPrivateJson(path);
      } catch (error) {
        unlinkSync(path);
        throw error;
      }
    }
  }
}

function main(): void {
  const privateArg = process.argv.find((argument) =>
    argument.startsWith("--private-root="),
  );
  const privateRoot = privateArg
    ? resolve(privateArg.slice("--private-root=".length))
    : DEFAULT_PRIVATE_ROOT;
  const rootStat = lstatSync(privateRoot);
  invariant(
    rootStat.isDirectory() &&
      !rootStat.isSymbolicLink() &&
      rootStat.uid === process.getuid?.() &&
      (rootStat.mode & 0o777) === 0o700,
    "holdout-attempt-manifest-private-root-invalid",
  );
  mkdirSync(join(privateRoot, "attempt-receipts"), {
    recursive: true,
    mode: 0o700,
  });
  const receiptStat = lstatSync(join(privateRoot, "attempt-receipts"));
  invariant(
    receiptStat.isDirectory() &&
      !receiptStat.isSymbolicLink() &&
      receiptStat.uid === process.getuid?.() &&
      (receiptStat.mode & 0o777) === 0o700,
    "holdout-attempt-manifest-receipt-root-invalid",
  );

  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  invariant(preGpu.ok, "holdout-attempt-manifest-pre-gpu-invalid");
  const manifest = parseJuliaPixelCandidateManifestV1(
    manifestAsset,
    preGpu.value,
  );
  invariant(manifest.ok, "holdout-attempt-manifest-candidate-invalid");
  const e1Rows = manifest.value.rows.filter(
    (row) => String(row.rewriteClass) === "E1-mathematical-identity",
  );
  invariant(
    e1Rows.length === 0 && manifest.value.rows.length === 236,
    "holdout-attempt-manifest-e1-set-invalid",
  );
  const frozenPath = join(
    privateRoot,
    `attempt-ledger.wave-${manifest.value.waveId}.json`,
  );
  const frozen = readPrivateJson(frozenPath);
  invariant(
    frozen.schema === "fractalpark-julia-pixel-holdout-attempt-ledger/v1" &&
      frozen.revision === 1 &&
      frozen.stage === "wave-frozen" &&
      frozen.waveId === manifest.value.waveId &&
      frozen.candidateManifestContentHash === manifest.value.contentHash &&
      Array.isArray(frozen.attempts) &&
      frozen.attempts.length === 0 &&
      typeof frozen.contentHash === "string",
    "holdout-attempt-manifest-frozen-wave-invalid",
  );
  const content: JsonRecord = {
    schema: "fractalpark-julia-pixel-holdout-attempt-manifest/v1",
    revision: 1,
    authority: {
      authorityState: "sealed",
      supersededBy: null,
      withdrawnBy: null,
    },
    waveId: manifest.value.waveId,
    candidateManifestContentHash: manifest.value.contentHash,
    rowCount: 0,
    rows: [],
  };
  const artifact: JsonRecord = {
    ...content,
    contentHash: sha(canonicalJson(content)),
  };
  const outputPath = join(
    privateRoot,
    `holdout-attempt-manifest.wave-${manifest.value.waveId}.json`,
  );
  if (process.argv.includes("--write")) writeExclusive(outputPath, artifact);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      write: process.argv.includes("--write"),
      waveId: manifest.value.waveId,
      e1CandidateCount: 0,
      attemptCount: 0,
      contentHash: artifact.contentHash,
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
          : "holdout-attempt-manifest-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
