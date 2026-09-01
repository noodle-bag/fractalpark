import { parseJuliaBindingContractV1, type JuliaBindingContractV1 } from "./julia-binding";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_PRE_GPU_RECOVERY_CENSUS_SCHEMA_V2 =
  "fractalpark-julia-pre-gpu-recovery-census/v2" as const;
export const JULIA_PIXEL_CANDIDATE_MANIFEST_SCHEMA_V1 =
  "fractalpark-julia-pixel-candidate-manifest/v1" as const;
export const JULIA_PRE_GPU_RECOVERY_ROW_COUNT_V2 = 534 as const;
export const JULIA_PRE_GPU_RECOVERY_QUEUE_COUNT_V2 = 236 as const;

export type JuliaPreGpuRecoveryStatusV2 =
  | "tier2-queue"
  | "blocked"
  | "held"
  | "unknown";
export type JuliaPreGpuRecoveryLaneV2 =
  | "existing-system-c"
  | "parameter-binding"
  | "source-split-direct"
  | "source-split-transitive"
  | "none";
export type JuliaPreGpuRecoveryRewriteClassV2 =
  | "E0-operational-equivalence"
  | null;

export interface JuliaPreGpuRecoveryRowV2 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly evaluatedSourceRevision: string | null;
  readonly evaluatedSemanticHash: string | null;
  readonly binding: JuliaBindingContractV1["binding"] | null;
  readonly bindingRevision: string | null;
  readonly supportLane: JuliaPreGpuRecoveryLaneV2;
  readonly rewriteClass: JuliaPreGpuRecoveryRewriteClassV2;
  readonly status: JuliaPreGpuRecoveryStatusV2;
  readonly reasonCodes: readonly string[];
  readonly tier0: "pass" | "fail" | "pending";
  readonly tier1: "pass" | "fail" | "pending";
  readonly candidateContentHash: string | null;
  readonly rowReceipt: string;
}

export interface JuliaPreGpuRecoveryCensusV2 {
  readonly schema: typeof JULIA_PRE_GPU_RECOVERY_CENSUS_SCHEMA_V2;
  readonly revision: 2;
  readonly stage: "pre-gpu-v2-closure";
  readonly authority: Readonly<{
    authorityState: "sealed";
    supersededBy: null;
    withdrawnBy: null;
  }>;
  readonly activationStatus: "inactive-evidence-only";
  readonly contractContentHash: string;
  readonly runtimeIndexCanonicalSha256: string;
  readonly parameterAuthorityContentHash: string;
  readonly recoveryCandidatesContentHash: string;
  readonly failureDiagnosisManifestContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 534;
  readonly statusCounts: Readonly<{
    tier2Queue: 236;
    blocked: 15;
    held: 167;
    unknown: 116;
  }>;
  readonly queueLaneCounts: Readonly<{
    existingSystemC: 74;
    parameterBinding: 7;
    sourceSplit: 155;
  }>;
  readonly blockedStageCounts: Readonly<{
    tier0: 9;
    tier1: 6;
  }>;
  readonly rows: readonly JuliaPreGpuRecoveryRowV2[];
  readonly contentHash: string;
}

export interface JuliaPixelCandidateManifestRowV1 {
  readonly formulaId: string;
  readonly rewriteClass: "E0-operational-equivalence";
  readonly candidateContentHash: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
}
export interface JuliaPixelCandidateManifestV1 {
  readonly schema: typeof JULIA_PIXEL_CANDIDATE_MANIFEST_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: Readonly<{
    authorityState: "sealed";
    supersededBy: null;
    withdrawnBy: null;
  }>;
  readonly contractContentHash: string;
  readonly rowCount: 236;
  readonly rows: readonly JuliaPixelCandidateManifestRowV1[];
  readonly waveId: string;
  readonly contentHash: string;
}

export type JuliaPreGpuRecoveryParseResultV2 =
  | { readonly ok: true; readonly value: JuliaPreGpuRecoveryCensusV2 }
  | { readonly ok: false; readonly code: "julia-pre-gpu-recovery-invalid" };
export type JuliaPixelCandidateManifestParseResultV1 =
  | { readonly ok: true; readonly value: JuliaPixelCandidateManifestV1 }
  | { readonly ok: false; readonly code: "julia-pixel-candidate-manifest-invalid" };

type JsonRecord = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}
function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key): key is string => typeof key === "string") &&
    [...keys].sort().join("\u0000") === [...expected].sort().join("\u0000")
  );
}
function dense(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return true;
}
function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    const output: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) output[key] = immutable(child);
    return Object.freeze(output) as T;
  }
  return value;
}
function sealedAuthority(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, ["authorityState", "supersededBy", "withdrawnBy"]) &&
    value.authorityState === "sealed" &&
    value.supersededBy === null &&
    value.withdrawnBy === null
  );
}
function countRecord(
  value: unknown,
  expected: Readonly<Record<string, number>>,
): boolean {
  return (
    record(value) &&
    exactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, count]) => value[key] === count)
  );
}
function stringArray(value: unknown): value is readonly string[] {
  return (
    dense(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length
  );
}

function parseRow(value: unknown): value is JuliaPreGpuRecoveryRowV2 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "evaluatedSourceRevision",
      "evaluatedSemanticHash",
      "binding",
      "bindingRevision",
      "supportLane",
      "rewriteClass",
      "status",
      "reasonCodes",
      "tier0",
      "tier1",
      "candidateContentHash",
      "rowReceipt",
    ]) ||
    typeof value.formulaId !== "string" ||
    !UUID_V5.test(value.formulaId) ||
    typeof value.baselineSourceRevision !== "string" ||
    !SHA256.test(value.baselineSourceRevision) ||
    !stringArray(value.reasonCodes) ||
    typeof value.rowReceipt !== "string" ||
    !SHA256.test(value.rowReceipt) ||
    !["tier2-queue", "blocked", "held", "unknown"].includes(
      String(value.status),
    ) ||
    ![
      "existing-system-c",
      "parameter-binding",
      "source-split-direct",
      "source-split-transitive",
      "none",
    ].includes(String(value.supportLane)) ||
    (value.rewriteClass !== null &&
      value.rewriteClass !== "E0-operational-equivalence") ||
    !["pass", "fail", "pending"].includes(String(value.tier0)) ||
    !["pass", "fail", "pending"].includes(String(value.tier1))
  )
    return false;
  const hasCandidate = value.evaluatedSourceRevision !== null;
  if (
    hasCandidate !== (value.evaluatedSemanticHash !== null) ||
    hasCandidate !== (value.binding !== null) ||
    hasCandidate !== (value.bindingRevision !== null) ||
    hasCandidate !== (value.rewriteClass !== null) ||
    hasCandidate !== (value.candidateContentHash !== null)
  )
    return false;
  if (hasCandidate) {
    if (
      typeof value.evaluatedSourceRevision !== "string" ||
      !SHA256.test(value.evaluatedSourceRevision) ||
      typeof value.evaluatedSemanticHash !== "string" ||
      !SHA256.test(value.evaluatedSemanticHash) ||
      typeof value.bindingRevision !== "string" ||
      !SHA256.test(value.bindingRevision) ||
      typeof value.candidateContentHash !== "string" ||
      !SHA256.test(value.candidateContentHash)
    )
      return false;
    const parsed = parseJuliaBindingContractV1({
      binding: value.binding,
      modeClass: "classic-julia",
      supportLane:
        value.supportLane === "existing-system-c"
          ? "existing-system-c"
          : value.supportLane === "parameter-binding"
            ? "parameter-binding"
            : "source-split",
      z0Role: "pixel-seed",
      invariant: "parameter-plane-bit-identical",
    });
    if (!parsed.ok) return false;
  } else if (value.supportLane !== "none") return false;
  if (value.status === "tier2-queue")
    return (
      hasCandidate &&
      value.tier0 === "pass" &&
      value.tier1 === "pass" &&
      value.reasonCodes.length === 0
    );
  if (value.status === "blocked")
    return value.tier0 === "fail"
      ? !hasCandidate &&
          value.tier1 === "pending" &&
          value.reasonCodes.length > 0
      : hasCandidate &&
          value.tier0 === "pass" &&
          value.tier1 === "fail" &&
          value.reasonCodes.length > 0;
  return (
    !hasCandidate &&
    value.tier0 === "pending" &&
    value.tier1 === "pending" &&
    value.reasonCodes.length > 0
  );
}

export function juliaPreGpuCandidateContentHashV2(
  row: Omit<JuliaPreGpuRecoveryRowV2, "candidateContentHash" | "rowReceipt">,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1(
      {
        formulaId: row.formulaId,
        baselineSourceRevision: row.baselineSourceRevision,
        evaluatedSourceRevision: row.evaluatedSourceRevision,
        evaluatedSemanticHash: row.evaluatedSemanticHash,
        binding: row.binding,
        bindingRevision: row.bindingRevision,
        supportLane: row.supportLane,
        rewriteClass: row.rewriteClass,
        status: row.status,
        reasonCodes: row.reasonCodes,
        tier0: row.tier0,
        tier1: row.tier1,
      },
      16_384,
    ),
  );
}

export function juliaPreGpuRowReceiptV2(
  row: Omit<JuliaPreGpuRecoveryRowV2, "rowReceipt">,
): string {
  return sha256HexSyncV1(canonicalJsonV1(row, 16_384));
}

export function parseJuliaPreGpuRecoveryCensusV2(
  input: unknown,
): JuliaPreGpuRecoveryParseResultV2 {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "stage",
        "authority",
        "activationStatus",
        "contractContentHash",
        "runtimeIndexCanonicalSha256",
        "parameterAuthorityContentHash",
        "recoveryCandidatesContentHash",
        "failureDiagnosisManifestContentHash",
        "sourceBindings",
        "rowCount",
        "statusCounts",
        "queueLaneCounts",
        "blockedStageCounts",
        "rows",
        "contentHash",
      ]) ||
      input.schema !== JULIA_PRE_GPU_RECOVERY_CENSUS_SCHEMA_V2 ||
      input.revision !== 2 ||
      input.stage !== "pre-gpu-v2-closure" ||
      !sealedAuthority(input.authority) ||
      input.activationStatus !== "inactive-evidence-only" ||
      typeof input.contractContentHash !== "string" ||
      !SHA256.test(input.contractContentHash) ||
      typeof input.runtimeIndexCanonicalSha256 !== "string" ||
      !SHA256.test(input.runtimeIndexCanonicalSha256) ||
      typeof input.parameterAuthorityContentHash !== "string" ||
      !SHA256.test(input.parameterAuthorityContentHash) ||
      typeof input.recoveryCandidatesContentHash !== "string" ||
      !SHA256.test(input.recoveryCandidatesContentHash) ||
      typeof input.failureDiagnosisManifestContentHash !== "string" ||
      !SHA256.test(input.failureDiagnosisManifestContentHash) ||
      !record(input.sourceBindings) ||
      Object.keys(input.sourceBindings).length === 0 ||
      Object.values(input.sourceBindings).some(
        (value) => typeof value !== "string" || !SHA256.test(value),
      ) ||
      input.rowCount !== 534 ||
      !countRecord(input.statusCounts, {
        tier2Queue: 236,
        blocked: 15,
        held: 167,
        unknown: 116,
      }) ||
      !countRecord(input.queueLaneCounts, {
        existingSystemC: 74,
        parameterBinding: 7,
        sourceSplit: 155,
      }) ||
      !countRecord(input.blockedStageCounts, { tier0: 9, tier1: 6 }) ||
      !dense(input.rows) ||
      input.rows.length !== 534 ||
      !input.rows.every(parseRow) ||
      typeof input.contentHash !== "string" ||
      !SHA256.test(input.contentHash)
    )
      throw new Error("shape");
    const rows = input.rows as unknown as JuliaPreGpuRecoveryRowV2[];
    if (
      rows.some((row, index) => {
        const { rowReceipt, ...withoutReceipt } = row;
        const { candidateContentHash, ...candidateEvidence } = withoutReceipt;
        return (
          rowReceipt !== juliaPreGpuRowReceiptV2(withoutReceipt) ||
          (candidateContentHash !== null &&
            candidateContentHash !==
              juliaPreGpuCandidateContentHashV2(candidateEvidence)) ||
          (index > 0 && rows[index - 1]!.formulaId >= row.formulaId)
        );
      }) ||
      new Set(rows.map((row) => row.formulaId)).size !== 534
    )
      throw new Error("rows");
    const content = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "contentHash"),
    );
    if (
      input.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, 1_048_576))
    )
      throw new Error("hash");
    return {
      ok: true,
      value: immutable(input) as unknown as JuliaPreGpuRecoveryCensusV2,
    };
  } catch {
    return { ok: false, code: "julia-pre-gpu-recovery-invalid" };
  }
}

export function parseJuliaPixelCandidateManifestV1(
  input: unknown,
  preGpu: JuliaPreGpuRecoveryCensusV2,
): JuliaPixelCandidateManifestParseResultV1 {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "authority",
        "contractContentHash",
        "rowCount",
        "rows",
        "waveId",
        "contentHash",
      ]) ||
      input.schema !== JULIA_PIXEL_CANDIDATE_MANIFEST_SCHEMA_V1 ||
      input.revision !== 1 ||
      !sealedAuthority(input.authority) ||
      input.contractContentHash !== preGpu.contractContentHash ||
      input.rowCount !== 236 ||
      !dense(input.rows) ||
      input.rows.length !== 236 ||
      typeof input.waveId !== "string" ||
      !SHA256.test(input.waveId) ||
      input.contentHash !== input.waveId
    )
      throw new Error("shape");
    const queue = new Map(
      preGpu.rows
        .filter((row) => row.status === "tier2-queue")
        .map((row) => [row.formulaId, row]),
    );
    if (queue.size !== 236) throw new Error("queue");
    const rows = input.rows as unknown[];
    let previousFormulaId = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (
        !record(row) ||
        !exactKeys(row, [
          "formulaId",
          "rewriteClass",
          "candidateContentHash",
          "sourceRevision",
          "semanticHash",
        ]) ||
        typeof row.formulaId !== "string" ||
        !UUID_V5.test(row.formulaId) ||
        row.rewriteClass !== "E0-operational-equivalence" ||
        typeof row.candidateContentHash !== "string" ||
        !SHA256.test(row.candidateContentHash) ||
        typeof row.sourceRevision !== "string" ||
        !SHA256.test(row.sourceRevision) ||
        typeof row.semanticHash !== "string" ||
        !SHA256.test(row.semanticHash) ||
        (index > 0 && previousFormulaId >= row.formulaId)
      )
        throw new Error("row");
      const candidate = queue.get(row.formulaId);
      if (
        !candidate ||
        candidate.candidateContentHash !== row.candidateContentHash ||
        candidate.evaluatedSourceRevision !== row.sourceRevision ||
        candidate.evaluatedSemanticHash !== row.semanticHash
      )
        throw new Error("binding");
      previousFormulaId = row.formulaId;
    }
    const base = {
      schema: input.schema,
      revision: input.revision,
      authority: input.authority,
      contractContentHash: input.contractContentHash,
      rowCount: input.rowCount,
      rows: input.rows,
    };
    if (
      sha256HexSyncV1(canonicalJsonV1(base, 1_048_576)) !== input.waveId
    )
      throw new Error("wave");
    return {
      ok: true,
      value: immutable(input) as unknown as JuliaPixelCandidateManifestV1,
    };
  } catch {
    return { ok: false, code: "julia-pixel-candidate-manifest-invalid" };
  }
}
