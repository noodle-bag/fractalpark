import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  JULIA_RUNTIME_ACTIVATION_AUTHORITY_MANIFEST_CONTENT_HASH_V1,
  JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1,
  JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1,
  JULIA_RUNTIME_ACTIVATION_FINAL_CENSUS_CONTENT_HASH_V1,
  JULIA_RUNTIME_ACTIVATION_HANDOFF_CONTENT_HASH_V1,
  JULIA_RUNTIME_ACTIVATION_MAX_BYTES_V1,
  JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1,
  JULIA_RUNTIME_ACTIVATION_SCHEMA_V1,
  JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
  JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1,
} from "../src/engine/formulas/v1/julia-runtime-activation-v1";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const PATHS = {
  projection: "resources/formula-library/v1/julia-runtime-activation.v1.json",
  census: "resources/formula-library/v1/julia-pixel-final-capability-census.v4.json",
  authority: "resources/formula-library/v1/julia-pixel-final-authority-manifest.v4.json",
  handoff: "resources/formula-library/v1/julia-pixel-activation-handoff.v4.json",
  skeleton: "resources/formula-library/v1/julia-capability-census.v1.json",
  runtime: "public/formula-library/v1/runtime/published/index.json",
} as const;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return (
    actual.every((key) => typeof key === "string") &&
    [...(actual as string[])].sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readAsset(relativePath: string): { bytes: Buffer; value: JsonRecord } {
  const absolute = join(ROOT, relativePath);
  const stat = lstatSync(absolute);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o644,
    `julia-runtime-activation-file-invalid:${relativePath}`,
  );
  const bytes = readFileSync(absolute);
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  invariant(record(value), `julia-runtime-activation-json-invalid:${relativePath}`);
  return { bytes, value };
}

function rows(value: JsonRecord, code: string): JsonRecord[] {
  invariant(Array.isArray(value.rows), code);
  for (let index = 0; index < value.rows.length; index += 1) {
    invariant(Object.prototype.hasOwnProperty.call(value.rows, index), code);
    invariant(record(value.rows[index]), code);
  }
  return value.rows as JsonRecord[];
}

function main(): void {
  const projectionAsset = readAsset(PATHS.projection);
  const census = readAsset(PATHS.census).value;
  const authority = readAsset(PATHS.authority).value;
  const handoff = readAsset(PATHS.handoff).value;
  const skeleton = readAsset(PATHS.skeleton).value;
  const runtime = readAsset(PATHS.runtime).value;
  const projection = projectionAsset.value;

  invariant(
    projectionAsset.bytes.length <= JULIA_RUNTIME_ACTIVATION_MAX_BYTES_V1,
    "julia-runtime-activation-byte-budget-exceeded",
  );
  invariant(
    exactKeys(projection, [
      "schema",
      "revision",
      "stage",
      "handoffContentHash",
      "finalCensusContentHash",
      "authorityManifestContentHash",
      "runtimeIndexCanonicalSha256",
      "supportedCount",
      "supportedSetDigest",
      "rows",
      "contentHash",
    ]) &&
      projection.schema === JULIA_RUNTIME_ACTIVATION_SCHEMA_V1 &&
      projection.revision === 1 &&
      projection.stage === "activation-projection" &&
      projection.handoffContentHash ===
        JULIA_RUNTIME_ACTIVATION_HANDOFF_CONTENT_HASH_V1 &&
      projection.finalCensusContentHash ===
        JULIA_RUNTIME_ACTIVATION_FINAL_CENSUS_CONTENT_HASH_V1 &&
      projection.authorityManifestContentHash ===
        JULIA_RUNTIME_ACTIVATION_AUTHORITY_MANIFEST_CONTENT_HASH_V1 &&
      projection.runtimeIndexCanonicalSha256 ===
        JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1 &&
      projection.supportedCount ===
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1 &&
      projection.supportedSetDigest ===
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1 &&
      projection.contentHash === JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1,
    "julia-runtime-activation-projection-binding-invalid",
  );

  const projectionRows = rows(
    projection,
    "julia-runtime-activation-projection-rows-invalid",
  );
  invariant(
    projectionRows.length === JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
    "julia-runtime-activation-projection-count-invalid",
  );
  const projectionIds: string[] = [];
  let previous = "";
  for (const row of projectionRows) {
    invariant(
      exactKeys(row, ["formulaId", "sourceRevision"]) &&
        typeof row.formulaId === "string" &&
        UUID_V5.test(row.formulaId) &&
        row.formulaId > previous &&
        typeof row.sourceRevision === "string" &&
        SHA256.test(row.sourceRevision),
      "julia-runtime-activation-projection-row-invalid",
    );
    projectionIds.push(row.formulaId);
    previous = row.formulaId;
  }
  invariant(
    new Set(projectionIds).size === projectionIds.length &&
      sha256(canonicalJsonV1(projectionIds, 16_384)) ===
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1,
    "julia-runtime-activation-projection-set-invalid",
  );
  const projectionContent = Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "contentHash"),
  );
  invariant(
    sha256(canonicalJsonV1(projectionContent, 16_384)) ===
      JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1,
    "julia-runtime-activation-projection-hash-invalid",
  );

  invariant(
    census.contentHash === JULIA_RUNTIME_ACTIVATION_FINAL_CENSUS_CONTENT_HASH_V1 &&
      authority.contentHash ===
        JULIA_RUNTIME_ACTIVATION_AUTHORITY_MANIFEST_CONTENT_HASH_V1 &&
      handoff.contentHash === JULIA_RUNTIME_ACTIVATION_HANDOFF_CONTENT_HASH_V1 &&
      authority.finalCensusContentHash === census.contentHash &&
      handoff.finalCensusContentHash === census.contentHash &&
      handoff.authorityManifestContentHash === authority.contentHash &&
      handoff.handoffState === "activation-eligible" &&
      handoff.supportedClassicRowCount ===
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1 &&
      handoff.supportedClassicRowSetDigest ===
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1,
    "julia-runtime-activation-sealed-chain-invalid",
  );

  const censusRows = rows(census, "julia-runtime-activation-census-rows-invalid");
  const statusCounts = new Map<string, number>();
  const supportedIds: string[] = [];
  for (const row of censusRows) {
    invariant(typeof row.formulaId === "string", "julia-runtime-activation-census-row-invalid");
    const status = String(row.finalStatus);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status === "supported") {
      invariant(
        row.modeClass === "classic-julia" &&
          record(row.evidence) &&
          Object.values(row.evidence).every(
            (value) => value === "pass" || value === "not-required",
          ),
        "julia-runtime-activation-census-supported-invalid",
      );
      supportedIds.push(row.formulaId);
    }
  }
  supportedIds.sort();
  invariant(
    censusRows.length === 534 &&
      statusCounts.get("supported") === 195 &&
      statusCounts.get("held") === 151 &&
      statusCounts.get("blocked") === 72 &&
      statusCounts.get("unknown") === 116 &&
      censusRows.length - supportedIds.length ===
        JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1 &&
      JSON.stringify(supportedIds) === JSON.stringify(projectionIds),
    "julia-runtime-activation-census-count-invalid",
  );

  const runtimeRows = rows(runtime, "julia-runtime-activation-runtime-rows-invalid");
  invariant(
    runtimeRows.length === 534 &&
      sha256(canonicalJsonV1(runtime, 131_072)) ===
        JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1,
    "julia-runtime-activation-runtime-index-invalid",
  );
  const runtimeById = new Map<string, string>();
  for (const row of runtimeRows) {
    invariant(
      typeof row.formulaId === "string" &&
        typeof row.sourceRevision === "string" &&
        !runtimeById.has(row.formulaId),
      "julia-runtime-activation-runtime-row-invalid",
    );
    runtimeById.set(row.formulaId, row.sourceRevision);
  }

  const skeletonRows = rows(
    skeleton,
    "julia-runtime-activation-skeleton-rows-invalid",
  );
  invariant(
    skeletonRows.length === 534 && runtimeById.size === 534,
    "julia-runtime-activation-full-set-invalid",
  );
  for (const row of skeletonRows) {
    invariant(
      typeof row.formulaId === "string" &&
        typeof row.sourceRevision === "string" &&
        row.status === "unknown" &&
        runtimeById.get(row.formulaId) === row.sourceRevision,
      "julia-runtime-activation-skeleton-runtime-drift",
    );
  }
  for (const row of projectionRows) {
    invariant(
      runtimeById.get(row.formulaId as string) === row.sourceRevision,
      "julia-runtime-activation-supported-revision-drift",
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      supportedCount: projectionRows.length,
      deniedCount: JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1,
      supportedSetDigest: JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1,
      contentHash: JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1,
      bytes: projectionAsset.bytes.length,
      runtimeIndexCanonicalSha256:
        JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1,
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
          : "verify-julia-runtime-activation-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
