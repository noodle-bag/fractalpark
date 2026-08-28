import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_CLASSIC_REGRESSION_CORRECTIVE_SCHEMA_V1 =
  "fractalpark-julia-classic-regression-corrective/v1" as const;
export const JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1 = Object.freeze([
  "015c5d9d-b9b1-5155-afa7-10a3f48c194a",
  "09cecc65-3da9-543a-a1dd-7963f5e2f830",
  "81701548-4c1a-5038-a7e2-27ee265b0abc",
  "89e6c1c2-5105-50b7-b7e2-e1f03e4fe8e1",
  "9923991c-19b5-5559-8250-5eb04726f4bd",
  "cefe7738-0e8a-547f-ac85-ac3db2529907",
  "f7a06a52-361c-598f-bf99-5e55a0047f1f",
] as const);
export const JULIA_CLASSIC_REGRESSION_CORRECTIVE_RECOVERY_CONTRACT_CONTENT_HASH_V1 =
  "4b60e659e9fc621f80525e0b2c7e6b9d2b3432acd0d64cdba898939a8ee1d91e" as const;
export const JULIA_CLASSIC_REGRESSION_CORRECTIVE_ANALYZER_REVISION_V1 =
  "0f48838ff8db6184ca26470d3ff7c27717cfcf82891d7aebc300f3a52d582d9b" as const;

type RecordValue = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  return (
    Reflect.ownKeys(value).every((key) => typeof key === "string") &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

function frozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen)) as T;
  if (record(value))
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, frozen(child)]),
      ),
    ) as T;
  return value;
}

function rowMap(authority: unknown): Map<string, RecordValue> {
  if (!record(authority) || !Array.isArray(authority.rows)) return new Map();
  return new Map(
    authority.rows.flatMap((row) =>
      record(row) && typeof row.formulaId === "string"
        ? [[row.formulaId, row]]
        : [],
    ),
  );
}

/** Browser-safe structural path guard. Filesystem callers additionally lstat/nlink. */
export function isJuliaClassicRegressionCorrectiveRelativePathV1(
  path: unknown,
): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

export interface JuliaClassicRegressionCorrectiveAuthoritiesV1 {
  readonly audit: unknown;
  readonly finalV2: unknown;
  readonly preGpuV2: unknown;
  readonly roleV1: unknown;
  readonly finalV1: unknown;
  readonly sourceSplitV1: unknown;
  readonly rendererV1: unknown;
  readonly publicationLedger: unknown;
}

/**
 * Derives the candidate set from the complete authority sets. This function is
 * deliberately pure so browser consumers can audit the exact selection rule.
 */
export function deriveJuliaClassicRegressionCorrectiveIdsV1(
  authorities: JuliaClassicRegressionCorrectiveAuthoritiesV1,
): readonly string[] {
  if (
    !record(authorities.audit) ||
    !Array.isArray(authorities.audit.regressionIds)
  )
    return [];
  const finalV2 = rowMap(authorities.finalV2);
  const preGpuV2 = rowMap(authorities.preGpuV2);
  const roleV1 = rowMap(authorities.roleV1);
  const finalV1 = rowMap(authorities.finalV1);
  const sourceSplitV1 = rowMap(authorities.sourceSplitV1);
  const rendererV1 = rowMap(authorities.rendererV1);
  const ledger = rowMap(authorities.publicationLedger);
  const ids = new Set<string>();
  for (const id of authorities.audit.regressionIds) {
    if (typeof id !== "string" || !UUID_V5.test(id)) continue;
    const current = sourceSplitV1.get(id);
    const pre = preGpuV2.get(id);
    const role = roleV1.get(id);
    const finalV2Row = finalV2.get(id);
    const baseline = finalV1.get(id);
    const renderer = rendererV1.get(id);
    const decision = ledger.get(id);
    const reason = pre?.reasonCodes;
    const currentReasons =
      current?.tier1 && record(current.tier1)
        ? current.tier1.reasonCodes
        : undefined;
    const currentAdjudication =
      current?.adjudication && record(current.adjudication)
        ? current.adjudication
        : undefined;
    const candidateRevision =
      current?.identity && record(current.identity)
        ? current.identity.candidateSourceRevision
        : undefined;
    const candidateSemanticHash =
      current?.identity && record(current.identity)
        ? current.identity.candidateSemanticHash
        : undefined;
    const bindingRevision =
      current?.tier1 && record(current.tier1)
        ? current.tier1.bindingRevision
        : undefined;
    const candidatePath =
      current?.isolation && record(current.isolation)
        ? current.isolation.candidateDefinitionPath
        : undefined;
    const rights = current?.rights;
    if (
      pre?.status === "held" &&
      pre.supportLane === "none" &&
      Array.isArray(reason) &&
      reason.length === 1 &&
      [
        "constant-role-outside-recurrence",
        "constant-definition-not-unique",
      ].includes(reason[0] as string) &&
      Array.isArray(currentReasons) &&
      currentReasons.length === 0 &&
      currentAdjudication?.status === "candidate-only" &&
      currentAdjudication.reasonCode === "source-split-tier0-tier1-passed" &&
      role?.modeClass === "classic-julia" &&
      Array.isArray(role.reasonCodes) &&
      role.reasonCodes.length === 0 &&
      finalV2Row?.finalStatus === "held" &&
      finalV2Row.supportLane === "none" &&
      finalV2Row.remediationLane === "canonical-rebind" &&
      baseline?.status === "supported" &&
      baseline.lane === "source-split" &&
      current?.status === "candidate-only" &&
      typeof candidatePath === "string" &&
      isJuliaClassicRegressionCorrectiveRelativePathV1(candidatePath) &&
      candidatePath ===
        `julia-source-split-candidates/definitions/${candidateRevision}.frm` &&
      record(current.tier0) &&
      current.tier0.sourceBound === true &&
      current.tier0.rightsBound === true &&
      current.tier0.safetyEnvelope === true &&
      record(current.tier1) &&
      current.tier1.candidatePass === true &&
      typeof candidateRevision === "string" &&
      typeof candidateSemanticHash === "string" &&
      typeof bindingRevision === "string" &&
      renderer?.status === "passed" &&
      renderer.evaluatedSourceRevision === candidateRevision &&
      renderer.evaluatedSemanticHash === candidateSemanticHash &&
      renderer.bindingRevision === bindingRevision &&
      baseline.evaluatedSourceRevision === candidateRevision &&
      baseline.evaluatedSemanticHash === candidateSemanticHash &&
      baseline.bindingRevision === bindingRevision &&
      record(rights) &&
      record(decision) &&
      decision.publicationDecision === "publish" &&
      decision.leakageScanStatus === "passed" &&
      rights.publicationDecision === decision.publicationDecision &&
      rights.leakageScanStatus === decision.leakageScanStatus &&
      rights.rightsStatus === decision.rightsStatus
    )
      ids.add(id);
  }
  return Object.freeze([...ids].sort());
}

export interface JuliaClassicRegressionCorrectiveRowV1 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly baselineSemanticHash: string;
  readonly candidatePath: string;
  readonly candidateSourceRevision: string;
  readonly candidateSemanticHash: string;
  readonly binding: Readonly<{ kind: "source-split"; sourceRevision: string }>;
  readonly legacyBindingRevision: string;
  readonly correctiveBindingRevision: string;
  readonly supportLane: "source-split-direct" | "source-split-transitive";
  readonly reasonCode:
    "constant-role-outside-recurrence" | "constant-definition-not-unique";
  readonly e0: Readonly<{
    operationalEquivalence: true;
    analyzerRevision: string;
    analysisContentHash: string;
    changedRegionCount: number;
    reachableOrUnknownRegionCount: number;
    coveredRegionCount: number;
    uncoveredReachableOrUnknownRegionCount: 0;
  }>;
  readonly tier0: "pass";
  readonly tier1: "pass";
  readonly tier2: "pending-not-run";
  readonly rowReceipt: string;
}

export interface JuliaClassicRegressionCorrectiveV1 {
  readonly schema: typeof JULIA_CLASSIC_REGRESSION_CORRECTIVE_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "pre-gpu-corrective-evidence-only";
  readonly activationStatus: "inactive-evidence-only";
  readonly tier2: "pending-not-run";
  readonly recoveryContractContentHash: string;
  readonly finalV2ContentHash: string;
  readonly finalV2WholeFileSha256: string;
  readonly finalV2AuditContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 7;
  readonly rows: readonly JuliaClassicRegressionCorrectiveRowV1[];
  readonly contentHash: string;
}

export function juliaClassicRegressionCorrectiveRowReceiptV1(
  row: Omit<JuliaClassicRegressionCorrectiveRowV1, "rowReceipt">,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({ domain: "fractalpark/7e-i/row/v1", row }),
  );
}

export function juliaClassicRegressionCorrectiveContentHashV1(
  asset: Omit<JuliaClassicRegressionCorrectiveV1, "contentHash">,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({ domain: "fractalpark/7e-i/asset/v1", asset }),
  );
}

export function parseJuliaClassicRegressionCorrectiveV1(
  input: unknown,
):
  | { ok: true; value: JuliaClassicRegressionCorrectiveV1 }
  | { ok: false; code: "julia-classic-regression-corrective-invalid" } {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "stage",
        "activationStatus",
        "tier2",
        "recoveryContractContentHash",
        "finalV2ContentHash",
        "finalV2WholeFileSha256",
        "finalV2AuditContentHash",
        "sourceBindings",
        "rowCount",
        "rows",
        "contentHash",
      ]) ||
      input.schema !== JULIA_CLASSIC_REGRESSION_CORRECTIVE_SCHEMA_V1 ||
      input.revision !== 1 ||
      input.stage !== "pre-gpu-corrective-evidence-only" ||
      input.activationStatus !== "inactive-evidence-only" ||
      input.tier2 !== "pending-not-run" ||
      input.rowCount !== 7 ||
      input.recoveryContractContentHash !==
        JULIA_CLASSIC_REGRESSION_CORRECTIVE_RECOVERY_CONTRACT_CONTENT_HASH_V1 ||
      ![
        input.recoveryContractContentHash,
        input.finalV2ContentHash,
        input.finalV2WholeFileSha256,
        input.finalV2AuditContentHash,
        input.contentHash,
      ].every((value) => typeof value === "string" && SHA256.test(value)) ||
      !record(input.sourceBindings) ||
      Object.keys(input.sourceBindings).length === 0 ||
      !Object.entries(input.sourceBindings).every(
        ([path, value]) =>
          isJuliaClassicRegressionCorrectiveRelativePathV1(path) &&
          typeof value === "string" &&
          SHA256.test(value),
      ) ||
      !Array.isArray(input.rows) ||
      input.rows.length !== 7
    )
      throw Error();
    let previous = "";
    for (const value of input.rows) {
      if (
        !record(value) ||
        !exactKeys(value, [
          "formulaId",
          "baselineSourceRevision",
          "baselineSemanticHash",
          "candidatePath",
          "candidateSourceRevision",
          "candidateSemanticHash",
          "binding",
          "legacyBindingRevision",
          "correctiveBindingRevision",
          "supportLane",
          "reasonCode",
          "e0",
          "tier0",
          "tier1",
          "tier2",
          "rowReceipt",
        ]) ||
        typeof value.formulaId !== "string" ||
        !UUID_V5.test(value.formulaId) ||
        value.formulaId <= previous ||
        !JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1.includes(
          value.formulaId as never,
        ) ||
        ![
          value.baselineSourceRevision,
          value.baselineSemanticHash,
          value.candidateSourceRevision,
          value.candidateSemanticHash,
          value.legacyBindingRevision,
          value.correctiveBindingRevision,
          value.rowReceipt,
        ].every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
        !isJuliaClassicRegressionCorrectiveRelativePathV1(
          value.candidatePath,
        ) ||
        !value.candidatePath.startsWith(
          "julia-source-split-candidates/definitions/",
        ) ||
        !record(value.binding) ||
        !exactKeys(value.binding, ["kind", "sourceRevision"]) ||
        value.binding.kind !== "source-split" ||
        value.binding.sourceRevision !== value.candidateSourceRevision ||
        !["source-split-direct", "source-split-transitive"].includes(
          String(value.supportLane),
        ) ||
        ![
          "constant-role-outside-recurrence",
          "constant-definition-not-unique",
        ].includes(String(value.reasonCode)) ||
        !record(value.e0) ||
        !exactKeys(value.e0, [
          "operationalEquivalence",
          "analyzerRevision",
          "analysisContentHash",
          "changedRegionCount",
          "reachableOrUnknownRegionCount",
          "coveredRegionCount",
          "uncoveredReachableOrUnknownRegionCount",
        ]) ||
        value.e0.operationalEquivalence !== true ||
        value.e0.analyzerRevision !==
          JULIA_CLASSIC_REGRESSION_CORRECTIVE_ANALYZER_REVISION_V1 ||
        ![value.e0.analyzerRevision, value.e0.analysisContentHash].every(
          (entry) => typeof entry === "string" && SHA256.test(entry),
        ) ||
        ![
          value.e0.changedRegionCount,
          value.e0.reachableOrUnknownRegionCount,
          value.e0.coveredRegionCount,
        ].every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0) ||
        value.e0.uncoveredReachableOrUnknownRegionCount !== 0 ||
        value.e0.coveredRegionCount !==
          value.e0.reachableOrUnknownRegionCount ||
        Number(value.e0.changedRegionCount) <
          Number(value.e0.coveredRegionCount) ||
        value.tier0 !== "pass" ||
        value.tier1 !== "pass" ||
        value.tier2 !== "pending-not-run"
      )
        throw Error();
      const { rowReceipt, ...withoutReceipt } =
        value as unknown as JuliaClassicRegressionCorrectiveRowV1;
      if (
        juliaClassicRegressionCorrectiveRowReceiptV1(withoutReceipt) !==
        rowReceipt
      )
        throw Error();
      previous = value.formulaId;
    }
    if (previous !== JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1[6])
      throw Error();
    const { contentHash, ...withoutContentHash } =
      input as unknown as JuliaClassicRegressionCorrectiveV1;
    if (
      juliaClassicRegressionCorrectiveContentHashV1(withoutContentHash) !==
      contentHash
    )
      throw Error();
    return {
      ok: true,
      value: frozen(
        input as unknown as JuliaClassicRegressionCorrectiveV1,
      ),
    };
  } catch {
    return { ok: false, code: "julia-classic-regression-corrective-invalid" };
  }
}
