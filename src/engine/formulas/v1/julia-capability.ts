import censusAsset from "../../../../resources/formula-library/v1/julia-capability-census.v1.json";

import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CENSUS_CANONICAL_NODE_BUDGET_V1 = 16_384;
const RUNTIME_INDEX_CANONICAL_NODE_BUDGET_V1 = 131_072;

export const JULIA_CAPABILITY_CENSUS_SCHEMA_V1 =
  "fractalpark-julia-capability-census/v1" as const;
export const JULIA_CAPABILITY_CENSUS_REVISION_V1 = 1 as const;
export const JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1 = 534 as const;
export const JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1 =
  "e079815c5e8f865608dc6ec52121bbbe47857f2c2ecb9000080602ab5e54f197" as const;
export const JULIA_CAPABILITY_RUNTIME_INDEX_CANONICAL_SHA256_V1 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5" as const;

export type JuliaCapabilityStatusV1 =
  | "supported"
  | "candidate"
  | "not-applicable"
  | "unknown"
  | "blocked";

export interface JuliaCapabilityCensusRowV1 {
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly status: JuliaCapabilityStatusV1;
}

export interface JuliaCapabilityCensusV1 {
  readonly schema: typeof JULIA_CAPABILITY_CENSUS_SCHEMA_V1;
  readonly revision: typeof JULIA_CAPABILITY_CENSUS_REVISION_V1;
  readonly stage: "skeleton";
  readonly runtimeIndexCanonicalSha256: string;
  readonly rowCount: typeof JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1;
  readonly rows: readonly JuliaCapabilityCensusRowV1[];
  readonly contentHash: string;
}

export type JuliaCapabilityCensusParseResultV1 =
  | { readonly ok: true; readonly value: JuliaCapabilityCensusV1 }
  | { readonly ok: false; readonly code: "julia-capability-census-invalid" };

export interface JuliaCapabilityResolutionV1 {
  readonly status: JuliaCapabilityStatusV1 | "missing" | "stale";
  readonly supportsEditing: boolean;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => typeof key === "string") &&
    [...(keys as string[])].sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function immutableJson(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableJson));
  if (record(value)) {
    const clone: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) clone[key] = immutableJson(child);
    return Object.freeze(clone);
  }
  return value;
}

export function parseJuliaCapabilityCensusV1(
  value: unknown,
): JuliaCapabilityCensusParseResultV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "schema",
      "revision",
      "stage",
      "runtimeIndexCanonicalSha256",
      "rowCount",
      "rows",
      "contentHash",
    ]) ||
    value.schema !== JULIA_CAPABILITY_CENSUS_SCHEMA_V1 ||
    value.revision !== JULIA_CAPABILITY_CENSUS_REVISION_V1 ||
    value.stage !== "skeleton" ||
    value.runtimeIndexCanonicalSha256 !==
      JULIA_CAPABILITY_RUNTIME_INDEX_CANONICAL_SHA256_V1 ||
    value.rowCount !== JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
    value.contentHash !== JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1
  )
    return { ok: false, code: "julia-capability-census-invalid" };

  const seen = new Set<string>();
  let previousId = "";
  for (const row of value.rows) {
    if (
      !record(row) ||
      !exactKeys(row, ["formulaId", "sourceRevision", "status"]) ||
      typeof row.formulaId !== "string" ||
      !UUID_V5.test(row.formulaId) ||
      row.formulaId <= previousId ||
      seen.has(row.formulaId) ||
      typeof row.sourceRevision !== "string" ||
      !SHA256.test(row.sourceRevision) ||
      row.status !== "unknown"
    )
      return { ok: false, code: "julia-capability-census-invalid" };
    seen.add(row.formulaId);
    previousId = row.formulaId;
  }

  const content = {
    schema: value.schema,
    revision: value.revision,
    stage: value.stage,
    runtimeIndexCanonicalSha256: value.runtimeIndexCanonicalSha256,
    rowCount: value.rowCount,
    rows: value.rows,
  };
  try {
    if (
      sha256HexSyncV1(
        canonicalJsonV1(content, CENSUS_CANONICAL_NODE_BUDGET_V1),
      ) !== JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1
    )
      return { ok: false, code: "julia-capability-census-invalid" };
  } catch {
    return { ok: false, code: "julia-capability-census-invalid" };
  }

  return {
    ok: true,
    value: immutableJson(value) as JuliaCapabilityCensusV1,
  };
}

const parsedCensus = parseJuliaCapabilityCensusV1(censusAsset);
if (!parsedCensus.ok) throw new Error(parsedCensus.code);

export const JULIA_CAPABILITY_CENSUS_V1 = parsedCensus.value;

const ROW_BY_FORMULA_ID = new Map(
  JULIA_CAPABILITY_CENSUS_V1.rows.map((row) => [row.formulaId, row]),
);

export function resolveJuliaCapabilityV1(
  formulaId: unknown,
  sourceRevision: unknown,
): JuliaCapabilityResolutionV1 {
  if (typeof formulaId !== "string")
    return Object.freeze({ status: "missing", supportsEditing: false });
  const row = ROW_BY_FORMULA_ID.get(formulaId);
  if (!row) return Object.freeze({ status: "missing", supportsEditing: false });
  if (typeof sourceRevision !== "string" || sourceRevision !== row.sourceRevision)
    return Object.freeze({ status: "stale", supportsEditing: false });
  return Object.freeze({
    status: row.status,
    supportsEditing: row.status === "supported",
  });
}

export function verifyJuliaCapabilityCensusSetV1(
  runtimeIndex: unknown,
): boolean {
  if (!record(runtimeIndex) || !Array.isArray(runtimeIndex.rows)) return false;
  try {
    if (
      sha256HexSyncV1(
        canonicalJsonV1(
          runtimeIndex,
          RUNTIME_INDEX_CANONICAL_NODE_BUDGET_V1,
        ),
      ) !== JULIA_CAPABILITY_RUNTIME_INDEX_CANONICAL_SHA256_V1
    )
      return false;
  } catch {
    return false;
  }
  if (runtimeIndex.rows.length !== JULIA_CAPABILITY_CENSUS_V1.rows.length)
    return false;
  return runtimeIndex.rows.every((value, index) => {
    if (!record(value)) return false;
    const row = JULIA_CAPABILITY_CENSUS_V1.rows[index];
    return (
      value.formulaId === row?.formulaId &&
      value.sourceRevision === row.sourceRevision
    );
  });
}
