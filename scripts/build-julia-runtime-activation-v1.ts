import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import finalCensusAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v4.json";
import authorityAsset from "../resources/formula-library/v1/julia-pixel-final-authority-manifest.v4.json";
import handoffAsset from "../resources/formula-library/v1/julia-pixel-activation-handoff.v4.json";
import skeletonAsset from "../resources/formula-library/v1/julia-capability-census.v1.json";
import runtimeIndexAsset from "../public/formula-library/v1/runtime/published/index.json";
import {
  JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1,
  parseJuliaPixelActivationHandoffV4,
  parseJuliaPixelFinalAuthorityManifestV4,
} from "../src/engine/formulas/v1/julia-activation-closure-v1";
import { parseJuliaPixelFinalCapabilityCensusV4 } from "../src/engine/formulas/v1/julia-final-recovery-v4";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-runtime-activation.v1.json",
);
const WRITE = process.argv.includes("--write");
const EXPECTED_ROW_COUNT = 534;
const EXPECTED_SUPPORTED_COUNT = 195;
const EXPECTED_DENIED_COUNT = 339;
const EXPECTED_RUNTIME_INDEX_SCHEMA =
  "fractalpark-published-formula-runtime-index/v1";
const EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5";
const EXPECTED_SKELETON_CONTENT_HASH =
  "e079815c5e8f865608dc6ec52121bbbe47857f2c2ecb9000080602ab5e54f197";
const EXPECTED_HANDOFF_CONTENT_HASH =
  "4ed14d2740fb840a62b623a0a37b2ae14b8f2e0f922f1905bbc0247e8c6a0e0c";
const EXPECTED_FINAL_CENSUS_CONTENT_HASH =
  "5303590a7dfb5b374a2028a5586e9cb8465913768423bc58e23f2bd99481e997";
const EXPECTED_AUTHORITY_MANIFEST_CONTENT_HASH =
  "b58d09dc1ea12dc9bef7a6f47cc6077c12657ad2b7a5b3e162088431c19c3c62";
const EXPECTED_SUPPORTED_SET_DIGEST =
  "e6b3eb7576cd9d752492b6e4f6e1017744d560ff1b3de1709c2ca3d29b669b96";
const SEALED = Object.freeze({
  authorityState: "sealed",
  supersededBy: null,
  withdrawnBy: null,
});

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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
  const census = parseJuliaPixelFinalCapabilityCensusV4(finalCensusAsset);
  const authority = parseJuliaPixelFinalAuthorityManifestV4(authorityAsset);
  const handoff = parseJuliaPixelActivationHandoffV4(handoffAsset);
  invariant(census.ok, "julia-runtime-activation-final-census-invalid");
  invariant(authority.ok, "julia-runtime-activation-authority-invalid");
  invariant(handoff.ok, "julia-runtime-activation-handoff-invalid");
  invariant(
    record(runtimeIndexAsset) &&
      runtimeIndexAsset.schema === EXPECTED_RUNTIME_INDEX_SCHEMA &&
      runtimeIndexAsset.rowCount === EXPECTED_ROW_COUNT &&
      Array.isArray(runtimeIndexAsset.rows) &&
      runtimeIndexAsset.rows.length === EXPECTED_ROW_COUNT &&
      sha256(canonicalJsonV1(runtimeIndexAsset, 131_072)) ===
        EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256,
    "julia-runtime-activation-runtime-index-invalid",
  );
  invariant(
    record(skeletonAsset) &&
      skeletonAsset.rowCount === EXPECTED_ROW_COUNT &&
      skeletonAsset.contentHash === EXPECTED_SKELETON_CONTENT_HASH &&
      skeletonAsset.runtimeIndexCanonicalSha256 ===
        EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256 &&
      Array.isArray(skeletonAsset.rows) &&
      skeletonAsset.rows.length === EXPECTED_ROW_COUNT,
    "julia-runtime-activation-predecessor-set-invalid",
  );
  const runtimeRows = runtimeIndexAsset.rows as readonly JsonRecord[];
  const skeletonRows = skeletonAsset.rows as readonly JsonRecord[];
  invariant(
    runtimeRows.every(
      (row, index) =>
        record(row) &&
        record(skeletonRows[index]) &&
        row.formulaId === skeletonRows[index]!.formulaId &&
        row.sourceRevision === skeletonRows[index]!.sourceRevision &&
        skeletonRows[index]!.status === "unknown",
    ),
    "julia-runtime-activation-predecessor-runtime-drift",
  );

  invariant(
    census.value.contentHash === EXPECTED_FINAL_CENSUS_CONTENT_HASH &&
      authority.value.contentHash === EXPECTED_AUTHORITY_MANIFEST_CONTENT_HASH &&
      handoff.value.contentHash === EXPECTED_HANDOFF_CONTENT_HASH &&
      authority.value.finalCensusContentHash === census.value.contentHash &&
      handoff.value.finalCensusContentHash === census.value.contentHash &&
      handoff.value.authorityManifestContentHash === authority.value.contentHash &&
      handoff.value.consumerRowPredicate ===
        JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1 &&
      JSON.stringify(census.value.authority) === JSON.stringify(SEALED) &&
      JSON.stringify(authority.value.authority) === JSON.stringify(SEALED) &&
      JSON.stringify(handoff.value.authority) === JSON.stringify(SEALED) &&
      handoff.value.handoffState === "activation-eligible",
    "julia-runtime-activation-sealed-chain-invalid",
  );

  const censusRows = census.value.rows as unknown as readonly JsonRecord[];
  const censusIds = censusRows.map((row) => row.formulaId);
  const runtimeIds = runtimeRows.map((row) => row.formulaId);
  invariant(
    censusRows.length === EXPECTED_ROW_COUNT &&
      runtimeIds.length === EXPECTED_ROW_COUNT &&
      JSON.stringify([...censusIds].sort()) === JSON.stringify([...runtimeIds].sort()),
    "julia-runtime-activation-exact-set-invalid",
  );

  const statusCounts = new Map<string, number>();
  for (const row of censusRows) {
    const status = String(row.finalStatus);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    invariant(
      record(row.authority) &&
        row.authority.authorityState === "sealed" &&
        row.authority.supersededBy === null &&
        row.authority.withdrawnBy === null,
      "julia-runtime-activation-row-authority-invalid",
    );
  }
  invariant(
    statusCounts.get("supported") === EXPECTED_SUPPORTED_COUNT &&
      statusCounts.get("held") === 151 &&
      statusCounts.get("blocked") === 72 &&
      statusCounts.get("unknown") === 116 &&
      censusRows.length - EXPECTED_SUPPORTED_COUNT === EXPECTED_DENIED_COUNT,
    "julia-runtime-activation-status-count-invalid",
  );

  const supportedIds = censusRows
    .filter((row) => row.finalStatus === "supported")
    .map((row) => {
      invariant(
        row.modeClass === "classic-julia" &&
          record(row.evidence) &&
          Object.values(row.evidence).every(
            (value) => value === "pass" || value === "not-required",
          ),
        "julia-runtime-activation-supported-predicate-invalid",
      );
      return String(row.formulaId);
    })
    .sort();
  const supportedSetDigest = sha256(canonicalJsonV1(supportedIds, 16_384));
  invariant(
    supportedIds.length === EXPECTED_SUPPORTED_COUNT &&
      supportedSetDigest === EXPECTED_SUPPORTED_SET_DIGEST &&
      handoff.value.supportedClassicRowCount === supportedIds.length &&
      handoff.value.supportedClassicRowSetDigest === supportedSetDigest,
    "julia-runtime-activation-supported-set-invalid",
  );

  const runtimeById = new Map(
    runtimeRows.map((row) => [row.formulaId, row]),
  );
  const rows = supportedIds.map((formulaId) => {
    const row = runtimeById.get(formulaId);
    invariant(
      record(row) && typeof row.sourceRevision === "string",
      "julia-runtime-activation-runtime-row-missing",
    );
    return {
      formulaId,
      sourceRevision: row.sourceRevision,
    };
  });

  const content = {
    schema: "fractalpark-julia-runtime-activation/v1",
    revision: 1,
    stage: "activation-projection",
    handoffContentHash: handoff.value.contentHash,
    finalCensusContentHash: census.value.contentHash,
    authorityManifestContentHash: authority.value.contentHash,
    runtimeIndexCanonicalSha256:
      EXPECTED_RUNTIME_INDEX_CANONICAL_SHA256,
    supportedCount: rows.length,
    supportedSetDigest,
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
      output: relative(ROOT, OUTPUT_PATH),
      supportedCount: rows.length,
      deniedCount: EXPECTED_DENIED_COUNT,
      supportedSetDigest,
      contentHash,
      bytes: Buffer.byteLength(bytes),
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
      code:
        error instanceof Error
          ? error.message
          : "julia-runtime-activation-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
