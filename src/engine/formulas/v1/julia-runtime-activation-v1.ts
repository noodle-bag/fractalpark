import activationAsset from "../../../../resources/formula-library/v1/julia-runtime-activation.v1.json";

import type {
  PublishedFormulaProfileV1,
  PublishedFormulaRuntimeIndexRowV1,
} from "./published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ACTIVATION_CANONICAL_NODE_BUDGET_V1 = 16_384;
const RUNTIME_INDEX_CANONICAL_NODE_BUDGET_V1 = 131_072;

export const JULIA_RUNTIME_ACTIVATION_SCHEMA_V1 =
  "fractalpark-julia-runtime-activation/v1" as const;
export const JULIA_RUNTIME_ACTIVATION_REVISION_V1 = 1 as const;
export const JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1 = 195 as const;
export const JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1 = 339 as const;
export const JULIA_RUNTIME_ACTIVATION_MAX_BYTES_V1 = 40_000 as const;
export const JULIA_RUNTIME_ACTIVATION_HANDOFF_CONTENT_HASH_V1 =
  "4ed14d2740fb840a62b623a0a37b2ae14b8f2e0f922f1905bbc0247e8c6a0e0c" as const;
export const JULIA_RUNTIME_ACTIVATION_FINAL_CENSUS_CONTENT_HASH_V1 =
  "5303590a7dfb5b374a2028a5586e9cb8465913768423bc58e23f2bd99481e997" as const;
export const JULIA_RUNTIME_ACTIVATION_AUTHORITY_MANIFEST_CONTENT_HASH_V1 =
  "b58d09dc1ea12dc9bef7a6f47cc6077c12657ad2b7a5b3e162088431c19c3c62" as const;
export const JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5" as const;
export const JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1 =
  "e6b3eb7576cd9d752492b6e4f6e1017744d560ff1b3de1709c2ca3d29b669b96" as const;
export const JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1 =
  "8ae8ae6d4f24002ecf4e043eac3e48c03f8b043e47ea00dcc2abf2b2770d9b29" as const;

export interface JuliaRuntimeActivationRowV1 {
  readonly formulaId: string;
  readonly sourceRevision: string;
}

export interface JuliaRuntimeActivationV1 {
  readonly schema: typeof JULIA_RUNTIME_ACTIVATION_SCHEMA_V1;
  readonly revision: typeof JULIA_RUNTIME_ACTIVATION_REVISION_V1;
  readonly stage: "activation-projection";
  readonly handoffContentHash: string;
  readonly finalCensusContentHash: string;
  readonly authorityManifestContentHash: string;
  readonly runtimeIndexCanonicalSha256: string;
  readonly supportedCount: typeof JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1;
  readonly supportedSetDigest: string;
  readonly rows: readonly JuliaRuntimeActivationRowV1[];
  readonly contentHash: string;
}

export type JuliaRuntimeActivationParseResultV1 =
  | { readonly ok: true; readonly value: JuliaRuntimeActivationV1 }
  | { readonly ok: false; readonly code: "julia-runtime-activation-invalid" };

export type JuliaRuntimeCapabilityStatusV1 =
  | "supported"
  | "unsupported"
  | "stale"
  | "missing"
  | "authority-invalid";

export type JuliaRuntimeCapabilityReasonV1 =
  | "active"
  | "unsupported"
  | "stale"
  | "missing"
  | "non-canonical"
  | "authority-invalid";

export interface JuliaRuntimeCapabilityResolutionV1 {
  readonly status: JuliaRuntimeCapabilityStatusV1;
  readonly reason: JuliaRuntimeCapabilityReasonV1;
  readonly supportsEditing: boolean;
  readonly supportsRuntime: boolean;
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

function denseArray(value: unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
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

function invalid(): JuliaRuntimeActivationParseResultV1 {
  return { ok: false, code: "julia-runtime-activation-invalid" };
}

function parseJuliaRuntimeActivationUnsafeV1(
  value: unknown,
): JuliaRuntimeActivationParseResultV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
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
    ]) ||
    value.schema !== JULIA_RUNTIME_ACTIVATION_SCHEMA_V1 ||
    value.revision !== JULIA_RUNTIME_ACTIVATION_REVISION_V1 ||
    value.stage !== "activation-projection" ||
    value.handoffContentHash !== JULIA_RUNTIME_ACTIVATION_HANDOFF_CONTENT_HASH_V1 ||
    value.finalCensusContentHash !==
      JULIA_RUNTIME_ACTIVATION_FINAL_CENSUS_CONTENT_HASH_V1 ||
    value.authorityManifestContentHash !==
      JULIA_RUNTIME_ACTIVATION_AUTHORITY_MANIFEST_CONTENT_HASH_V1 ||
    value.runtimeIndexCanonicalSha256 !==
      JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1 ||
    value.supportedCount !== JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1 ||
    value.supportedSetDigest !==
      JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1 ||
    value.contentHash !== JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1 ||
    !denseArray(value.rows)
  )
    return invalid();

  const ids: string[] = [];
  const seen = new Set<string>();
  let previousId = "";
  for (const row of value.rows) {
    if (
      !record(row) ||
      !exactKeys(row, ["formulaId", "sourceRevision"]) ||
      typeof row.formulaId !== "string" ||
      !UUID_V5.test(row.formulaId) ||
      row.formulaId <= previousId ||
      seen.has(row.formulaId) ||
      typeof row.sourceRevision !== "string" ||
      !SHA256.test(row.sourceRevision)
    )
      return invalid();
    ids.push(row.formulaId);
    seen.add(row.formulaId);
    previousId = row.formulaId;
  }

  try {
    if (
      sha256HexSyncV1(canonicalJsonV1(ids, ACTIVATION_CANONICAL_NODE_BUDGET_V1)) !==
        JULIA_RUNTIME_ACTIVATION_SUPPORTED_SET_DIGEST_V1
    )
      return invalid();
    const content = {
      schema: value.schema,
      revision: value.revision,
      stage: value.stage,
      handoffContentHash: value.handoffContentHash,
      finalCensusContentHash: value.finalCensusContentHash,
      authorityManifestContentHash: value.authorityManifestContentHash,
      runtimeIndexCanonicalSha256: value.runtimeIndexCanonicalSha256,
      supportedCount: value.supportedCount,
      supportedSetDigest: value.supportedSetDigest,
      rows: value.rows,
    };
    if (
      sha256HexSyncV1(
        canonicalJsonV1(content, ACTIVATION_CANONICAL_NODE_BUDGET_V1),
      ) !== JULIA_RUNTIME_ACTIVATION_CONTENT_HASH_V1
    )
      return invalid();
  } catch {
    return invalid();
  }

  return {
    ok: true,
    value: immutableJson(value) as JuliaRuntimeActivationV1,
  };
}

export function parseJuliaRuntimeActivationV1(
  value: unknown,
): JuliaRuntimeActivationParseResultV1 {
  try {
    return parseJuliaRuntimeActivationUnsafeV1(value);
  } catch {
    return invalid();
  }
}

const parsedActivation = parseJuliaRuntimeActivationV1(activationAsset);

export const JULIA_RUNTIME_ACTIVATION_V1 = parsedActivation.ok
  ? parsedActivation.value
  : null;

const ROW_BY_FORMULA_ID = new Map(
  JULIA_RUNTIME_ACTIVATION_V1?.rows.map((row) => [row.formulaId, row]) ?? [],
);

const AUTHORITY_INVALID = Object.freeze({
  status: "authority-invalid" as const,
  reason: "authority-invalid" as const,
  supportsEditing: false,
  supportsRuntime: false,
});

export function resolveJuliaRuntimeCapabilityV1(
  formulaId: unknown,
  sourceRevision: unknown,
): JuliaRuntimeCapabilityResolutionV1 {
  if (!JULIA_RUNTIME_ACTIVATION_V1) return AUTHORITY_INVALID;
  if (typeof formulaId !== "string")
    return Object.freeze({
      status: "missing",
      reason: "missing",
      supportsEditing: false,
      supportsRuntime: false,
    });
  const row = ROW_BY_FORMULA_ID.get(formulaId);
  if (!row)
    return Object.freeze({
      status: UUID_V5.test(formulaId) ? "unsupported" : "missing",
      reason: UUID_V5.test(formulaId) ? "unsupported" : "non-canonical",
      supportsEditing: false,
      supportsRuntime: false,
    });
  if (typeof sourceRevision !== "string" || sourceRevision !== row.sourceRevision)
    return Object.freeze({
      status: "stale",
      reason: "stale",
      supportsEditing: false,
      supportsRuntime: false,
    });
  return Object.freeze({
    status: "supported",
    reason: "active",
    supportsEditing: true,
    supportsRuntime: true,
  });
}

export function resolveActivatedPublishedFormulaDefaultProfileV1(
  row: PublishedFormulaRuntimeIndexRowV1,
): PublishedFormulaProfileV1 {
  const capability = resolveJuliaRuntimeCapabilityV1(
    row.formulaId,
    row.sourceRevision,
  );
  if (row.profile.mode !== "julia" || capability.supportsEditing)
    return row.profile;
  return Object.freeze({
    schema: row.profile.schema,
    quality: row.profile.quality,
    mode: "parameter-plane" as const,
    center: row.profile.center,
    zoom: row.profile.zoom,
    rotation: row.profile.rotation,
    iterations: row.profile.iterations,
    ...(row.profile.probe ? { probe: row.profile.probe } : {}),
  });
}

export function verifyJuliaRuntimeActivationSetV1(runtimeIndex: unknown): boolean {
  if (!JULIA_RUNTIME_ACTIVATION_V1 || !record(runtimeIndex)) return false;
  if (!Array.isArray(runtimeIndex.rows) || runtimeIndex.rows.length !== 534)
    return false;
  try {
    if (
      sha256HexSyncV1(
        canonicalJsonV1(runtimeIndex, RUNTIME_INDEX_CANONICAL_NODE_BUDGET_V1),
      ) !== JULIA_RUNTIME_ACTIVATION_RUNTIME_INDEX_CANONICAL_SHA256_V1
    )
      return false;
  } catch {
    return false;
  }
  const runtimeById = new Map<string, string>();
  for (const value of runtimeIndex.rows) {
    if (
      !record(value) ||
      typeof value.formulaId !== "string" ||
      typeof value.sourceRevision !== "string" ||
      runtimeById.has(value.formulaId)
    )
      return false;
    runtimeById.set(value.formulaId, value.sourceRevision);
  }
  return JULIA_RUNTIME_ACTIVATION_V1.rows.every(
    (row) => runtimeById.get(row.formulaId) === row.sourceRevision,
  );
}
