import {
  parseJuliaBindingContractV1,
  type JuliaBindingContractV1,
} from "./julia-binding";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CANONICAL_NODE_BUDGET = 131_072;

export const JULIA_FINAL_CAPABILITY_CENSUS_SCHEMA_V1 =
  "fractalpark-julia-final-capability-census/v1" as const;
export const JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1 = 534 as const;
export const JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json",
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  "scripts/build-julia-final-capability-census.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-final-capability.ts",
  "src/engine/formulas/v1/julia-pre-gpu-capability.ts",
  "src/engine/formulas/v1/julia-renderer-evidence.ts",
  "src/engine/formulas/v1/revisions.ts",
  "tsconfig.json",
] as const);

export interface JuliaFinalCapabilityRowV1 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly evaluatedSourceRevision: string;
  readonly evaluatedSemanticHash: string;
  readonly status: "supported" | "unknown" | "blocked" | "not-applicable";
  readonly lane:
    "existing-system-c" | "parameter-binding" | "source-split" | "none";
  readonly modeClass:
    "classic-julia" | "generalized-two-plane" | "undetermined";
  readonly contract: JuliaBindingContractV1 | null;
  readonly bindingRevision: string | null;
  readonly profileDigest: string | null;
  readonly preGpuEvidenceContentHash: string;
  readonly tier2EvidenceContentHash: string | null;
  readonly tier3ScopeId: "fractalpark-julia-tier3-scope/v1";
  readonly technicalAuthor: "ellie";
  readonly independentReviewer: "codex-cli";
  readonly proofTiers: Readonly<{
    tier0: boolean;
    tier1: boolean;
    tier2: boolean;
    tier3PhysicalDevice: false;
  }>;
  readonly crossDeviceGuarantee: false;
  readonly activationEligible: boolean;
  readonly nextRequiredEvidence: string;
}

export interface JuliaFinalCapabilityCensusV1 {
  readonly schema: typeof JULIA_FINAL_CAPABILITY_CENSUS_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "final-verified-census";
  readonly activationStatus: "inactive-awaiting-29h";
  readonly liveCensusContentHash: string;
  readonly preGpuContentHash: string;
  readonly preGpuRowMapContentHash: string;
  readonly rendererEvidenceContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly tier3Scope: Readonly<{
    schema: "fractalpark-julia-tier3-scope/v1";
    status: "pending-physical-device-evidence";
    physicalDeviceSampleCount: 0;
    crossDeviceGuarantee: false;
  }>;
  readonly rowCount: typeof JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1;
  readonly statusCounts: Readonly<{
    supported: number;
    unknown: number;
    blocked: number;
    notApplicable: number;
  }>;
  readonly supportedCounts: Readonly<{
    classic: number;
    generalized: number;
    existingSystemC: number;
    parameterBinding: number;
    sourceSplit: number;
  }>;
  readonly rows: readonly JuliaFinalCapabilityRowV1[];
  readonly contentHash: string;
}

export type JuliaFinalCapabilityCensusParseResultV1 =
  | { readonly ok: true; readonly value: JuliaFinalCapabilityCensusV1 }
  | { readonly ok: false; readonly code: "julia-final-census-invalid" };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
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

function parseRow(value: unknown): value is JuliaFinalCapabilityRowV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "evaluatedSourceRevision",
      "evaluatedSemanticHash",
      "status",
      "lane",
      "modeClass",
      "contract",
      "bindingRevision",
      "profileDigest",
      "preGpuEvidenceContentHash",
      "tier2EvidenceContentHash",
      "tier3ScopeId",
      "technicalAuthor",
      "independentReviewer",
      "proofTiers",
      "crossDeviceGuarantee",
      "activationEligible",
      "nextRequiredEvidence",
    ]) ||
    typeof value.formulaId !== "string" ||
    !UUID_V5.test(value.formulaId) ||
    typeof value.baselineSourceRevision !== "string" ||
    !SHA256.test(value.baselineSourceRevision) ||
    typeof value.evaluatedSourceRevision !== "string" ||
    !SHA256.test(value.evaluatedSourceRevision) ||
    typeof value.evaluatedSemanticHash !== "string" ||
    !SHA256.test(value.evaluatedSemanticHash) ||
    !["supported", "unknown", "blocked", "not-applicable"].includes(
      String(value.status),
    ) ||
    ![
      "existing-system-c",
      "parameter-binding",
      "source-split",
      "none",
    ].includes(String(value.lane)) ||
    !["classic-julia", "generalized-two-plane", "undetermined"].includes(
      String(value.modeClass),
    ) ||
    (value.contract !== null && !record(value.contract)) ||
    (value.bindingRevision !== null &&
      (typeof value.bindingRevision !== "string" ||
        !SHA256.test(value.bindingRevision))) ||
    (value.profileDigest !== null &&
      (typeof value.profileDigest !== "string" ||
        !SHA256.test(value.profileDigest))) ||
    typeof value.preGpuEvidenceContentHash !== "string" ||
    !SHA256.test(value.preGpuEvidenceContentHash) ||
    (value.tier2EvidenceContentHash !== null &&
      (typeof value.tier2EvidenceContentHash !== "string" ||
        !SHA256.test(value.tier2EvidenceContentHash))) ||
    value.tier3ScopeId !== "fractalpark-julia-tier3-scope/v1" ||
    value.technicalAuthor !== "ellie" ||
    value.independentReviewer !== "codex-cli" ||
    !record(value.proofTiers) ||
    !exactKeys(value.proofTiers, [
      "tier0",
      "tier1",
      "tier2",
      "tier3PhysicalDevice",
    ]) ||
    typeof value.proofTiers.tier0 !== "boolean" ||
    typeof value.proofTiers.tier1 !== "boolean" ||
    typeof value.proofTiers.tier2 !== "boolean" ||
    value.proofTiers.tier3PhysicalDevice !== false ||
    value.crossDeviceGuarantee !== false ||
    typeof value.activationEligible !== "boolean" ||
    typeof value.nextRequiredEvidence !== "string" ||
    value.nextRequiredEvidence.length === 0
  )
    return false;
  const contract =
    value.contract === null
      ? null
      : parseJuliaBindingContractV1(value.contract);
  if (
    (contract !== null && !contract.ok) ||
    (value.contract === null) !== (value.bindingRevision === null) ||
    (value.profileDigest === null) !==
      (value.tier2EvidenceContentHash === null) ||
    value.proofTiers.tier2 !== (value.status === "supported")
  )
    return false;
  if (contract?.ok) {
    if (
      contract.value.modeClass !== value.modeClass ||
      contract.value.supportLane !== value.lane ||
      "candidateKind" in contract.value ||
      (value.lane === "existing-system-c" &&
        contract.value.binding.kind !== "system-c") ||
      (value.lane === "source-split" &&
        (contract.value.binding.kind !== "source-split" ||
          contract.value.binding.sourceRevision !==
            value.evaluatedSourceRevision))
    )
      return false;
  } else if (!(
    (value.lane === "none" && value.modeClass === "undetermined") ||
    (value.status === "blocked" &&
      value.lane === "parameter-binding" &&
      value.modeClass === "undetermined")
  )) {
    return false;
  }
  if (value.status === "supported")
    return (
      value.modeClass === "classic-julia" &&
      value.contract !== null &&
      typeof value.bindingRevision === "string" &&
      typeof value.profileDigest === "string" &&
      typeof value.tier2EvidenceContentHash === "string" &&
      value.proofTiers.tier0 === true &&
      value.proofTiers.tier1 === true &&
      value.proofTiers.tier2 === true &&
      value.activationEligible === true
    );
  return value.activationEligible === false;
}

function countRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> {
  return (
    record(value) &&
    exactKeys(value, keys) &&
    keys.every(
      (key) =>
        typeof value[key] === "number" &&
        Number.isSafeInteger(value[key]) &&
        (value[key] as number) >= 0,
    )
  );
}

export function parseJuliaFinalCapabilityCensusV1(
  value: unknown,
): JuliaFinalCapabilityCensusParseResultV1 {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "stage",
        "activationStatus",
        "liveCensusContentHash",
        "preGpuContentHash",
        "preGpuRowMapContentHash",
        "rendererEvidenceContentHash",
        "sourceBindings",
        "tier3Scope",
        "rowCount",
        "statusCounts",
        "supportedCounts",
        "rows",
        "contentHash",
      ]) ||
      value.schema !== JULIA_FINAL_CAPABILITY_CENSUS_SCHEMA_V1 ||
      value.revision !== 1 ||
      value.stage !== "final-verified-census" ||
      value.activationStatus !== "inactive-awaiting-29h" ||
      ![
        value.liveCensusContentHash,
        value.preGpuContentHash,
        value.preGpuRowMapContentHash,
        value.rendererEvidenceContentHash,
      ].every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
      !record(value.sourceBindings) ||
      !exactKeys(
        value.sourceBindings,
        JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1,
      ) ||
      !Object.values(value.sourceBindings).every(
        (entry) => typeof entry === "string" && SHA256.test(entry),
      ) ||
      value.rowCount !== JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
      !countRecord(value.statusCounts, [
        "supported",
        "unknown",
        "blocked",
        "notApplicable",
      ]) ||
      !countRecord(value.supportedCounts, [
        "classic",
        "generalized",
        "existingSystemC",
        "parameterBinding",
        "sourceSplit",
      ]) ||
      !Array.isArray(value.rows) ||
      value.rows.length !== JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
      !value.rows.every(parseRow) ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash)
    )
      return { ok: false, code: "julia-final-census-invalid" };
    const tier3 = value.tier3Scope;
    if (
      !record(tier3) ||
      !exactKeys(tier3, [
        "schema",
        "status",
        "physicalDeviceSampleCount",
        "crossDeviceGuarantee",
      ]) ||
      tier3.schema !== "fractalpark-julia-tier3-scope/v1" ||
      tier3.status !== "pending-physical-device-evidence" ||
      tier3.physicalDeviceSampleCount !== 0 ||
      tier3.crossDeviceGuarantee !== false
    )
      return { ok: false, code: "julia-final-census-invalid" };
    const rows = value.rows as unknown as JuliaFinalCapabilityRowV1[];
    const sorted = [...rows].sort((left, right) =>
      left.formulaId.localeCompare(right.formulaId),
    );
    if (
      rows.some((row, index) => row.formulaId !== sorted[index]?.formulaId) ||
      new Set(rows.map((row) => row.formulaId)).size !== rows.length ||
      rows.some(
        (row) =>
          row.preGpuEvidenceContentHash !== value.preGpuContentHash ||
          (row.tier2EvidenceContentHash !== null &&
            row.tier2EvidenceContentHash !== value.rendererEvidenceContentHash),
      )
    )
      return { ok: false, code: "julia-final-census-invalid" };
    const statusCounts = value.statusCounts as Record<string, number>;
    const supportedCounts = value.supportedCounts as Record<string, number>;
    const supported = rows.filter((row) => row.status === "supported");
    if (
      statusCounts.supported !== supported.length ||
      statusCounts.unknown !==
        rows.filter((row) => row.status === "unknown").length ||
      statusCounts.blocked !==
        rows.filter((row) => row.status === "blocked").length ||
      statusCounts.notApplicable !==
        rows.filter((row) => row.status === "not-applicable").length ||
      Object.values(statusCounts).reduce((sum, count) => sum + count, 0) !==
        rows.length ||
      supportedCounts.classic !==
        supported.filter((row) => row.modeClass === "classic-julia").length ||
      supportedCounts.generalized !==
        supported.filter((row) => row.modeClass === "generalized-two-plane")
          .length ||
      supportedCounts.existingSystemC !==
        supported.filter((row) => row.lane === "existing-system-c").length ||
      supportedCounts.parameterBinding !==
        supported.filter((row) => row.lane === "parameter-binding").length ||
      supportedCounts.sourceSplit !==
        supported.filter((row) => row.lane === "source-split").length
    )
      return { ok: false, code: "julia-final-census-invalid" };
    const content = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    );
    if (
      value.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      return { ok: false, code: "julia-final-census-invalid" };
    return {
      ok: true,
      value: Object.freeze(value) as unknown as JuliaFinalCapabilityCensusV1,
    };
  } catch {
    return { ok: false, code: "julia-final-census-invalid" };
  }
}
