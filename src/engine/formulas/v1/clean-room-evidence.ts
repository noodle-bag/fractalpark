export const CLEAN_ROOM_EVIDENCE_VERSION_V1 =
  "formula-library-clean-room-evidence/1";

const EXPECTED_ROWS = 452;
const EXPECTED_CLASS_A = 1;
const EXPECTED_CLASS_B = 73;
const EXPECTED_CLASS_C = 378;
const EXPECTED_LEGACY_ORACLES = 443;
const EXPECTED_WAIVER_PROBES = 9;

const BLOCKERS = Object.freeze([
  "advancement-review-not-approved",
  "clean-behavior-spec-missing",
  "technical-missing-input",
  "final-parameter-schema-missing",
  "isolation-evidence-missing",
  "approved-executable-oracle-missing",
  "leakage-review-receipt-missing",
  "final-profile-preview-record-missing",
  "independent-admission-not-passed",
] as const);

export type CleanRoomBlockerV1 = (typeof BLOCKERS)[number];

type RightsClass = "A" | "B" | "C";
type SourceOracleStatus =
  | "legacy-compatibility-orbit-oracle-available"
  | "waiver-probe-not-executable-oracle";
type JsonRecord = Record<string, unknown>;

type CleanRoomWorkRowV1 = Readonly<{
  formulaId: string;
  rightsClass: RightsClass;
  sourceOracleStatus: SourceOracleStatus;
}>;

type CleanRoomLedgerRowV1 = Readonly<{
  formulaId: string;
}>;

export type CleanRoomEvidenceRowV1 = Readonly<{
  formulaId: string;
  sourceSet: "F588";
  rightsClass: RightsClass;
  rightsProvenanceClassificationBound: true;
  privateProvenanceEvidenceBound: true;
  sourceOracleStatus: SourceOracleStatus;
  sourceOracleEvidenceBound: true;
  workInputStatus: "blocked-missing-approved-nonreversible-behavior-spec";
  technicalStatus: "failed";
  technicalFailureReason: "missing-input";
  provisionalCandidate: false;
  admissionStatus: "blocked";
  blockers: readonly CleanRoomBlockerV1[];
}>;

export type CleanRoomEvidenceResultV1 = Readonly<{
  schema: "fractalpark-formula-library-clean-room-evidence/v1";
  deterministic: true;
  candidateReceiptsIssued: 0;
  publicCandidateAssemblyAllowed: false;
  publicPromotionAllowed: false;
  publicAssetsWritten: 0;
  summary: Readonly<{
    total: 452;
    f588: 452;
    rightsClassA: 1;
    rightsClassB: 73;
    rightsClassC: 378;
    rightsProvenanceClassificationBound: 452;
    privateProvenanceEvidenceBound: 452;
    sourceOracleEvidenceBound: 452;
    legacyCompatibilityOracleAvailable: 443;
    waiverProbeNotExecutableOracle: 9;
    workInputBlockedMissingApprovedNonreversibleBehaviorSpec: 452;
    technicalFailedMissingInput: 452;
    provisionalOverlap: 0;
    behaviorPackagesApproved: 0;
    isolatedImplementationInputs: 0;
    approvedExecutableOraclePackages: 0;
    contaminatedReviewApprovals: 0;
    cleanReviewApprovals: 0;
    strictReviewClosures: 0;
    leakageReviewReceipts: 0;
    implementationAuthorized: 0;
    candidateAdmitted: 0;
    candidateBlocked: 452;
    blockerCounts: readonly Readonly<{
      code: CleanRoomBlockerV1;
      count: 452;
    }>[];
  }>;
  rows: readonly CleanRoomEvidenceRowV1[];
}>;

function fail(code: string): never {
  throw new Error(code);
}

function readPlainRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<JsonRecord> | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      return null;
    }
    const actualKeys = Reflect.ownKeys(value);
    const sortedExpected = [...expectedKeys].sort();
    if (
      actualKeys.some((key) => typeof key !== "string") ||
      actualKeys.length !== sortedExpected.length ||
      (actualKeys as string[])
        .sort()
        .some((key, index) => key !== sortedExpected[index])
    ) {
      return null;
    }
    const copy: JsonRecord = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return null;
      }
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function readDenseArray(value: unknown): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== value.length + 1 ||
      ownKeys.some((key) => typeof key !== "string") ||
      !ownKeys.includes("length")
    ) {
      return null;
    }
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return null;
      }
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function readWorkRow(value: unknown): CleanRoomWorkRowV1 {
  const row = readPlainRecord(value, [
    "formulaId",
    "sourceSet",
    "rightsClass",
    "rightsEvidenceStatus",
    "privateProvenanceEvidenceBound",
    "sourceOracleStatus",
    "sourceOracleEvidenceBound",
    "implementationInputStatus",
    "workStartEligibility",
    "reviewStatus",
    "finalSchema",
  ]);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    row.sourceSet !== "F588" ||
    !["A", "B", "C"].includes(String(row.rightsClass)) ||
    row.rightsEvidenceStatus !== "frozen-per-record-classification" ||
    row.privateProvenanceEvidenceBound !== true ||
    ![
      "legacy-compatibility-orbit-oracle-available",
      "waiver-probe-not-executable-oracle",
    ].includes(String(row.sourceOracleStatus)) ||
    row.sourceOracleEvidenceBound !== true ||
    row.implementationInputStatus !==
      "blocked-missing-approved-nonreversible-behavior-spec" ||
    row.workStartEligibility !== "blocked-incomplete-package" ||
    row.reviewStatus !== "blocked-incomplete-package" ||
    row.finalSchema !== null
  ) {
    fail("clean-room-evidence-work-row-invalid");
  }
  return Object.freeze({
    formulaId: row.formulaId,
    rightsClass: row.rightsClass as RightsClass,
    sourceOracleStatus: row.sourceOracleStatus as SourceOracleStatus,
  });
}

function readLedgerRow(value: unknown): CleanRoomLedgerRowV1 {
  const row = readPlainRecord(value, [
    "formulaId",
    "sourceSet",
    "status",
    "failureStage",
    "reasonCode",
    "publicationEligible",
  ]);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    row.sourceSet !== "F588" ||
    row.status !== "failed" ||
    row.failureStage !== "input" ||
    row.reasonCode !== "missing-input" ||
    row.publicationEligible !== false
  ) {
    fail("clean-room-evidence-ledger-row-invalid");
  }
  return Object.freeze({ formulaId: row.formulaId });
}

function readProvisionalRow(value: unknown): Readonly<{ formulaId: string }> {
  const row = readPlainRecord(value, ["formulaId", "sourceSet"]);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    row.sourceSet !== "F588"
  ) {
    fail("clean-room-evidence-provisional-row-invalid");
  }
  return Object.freeze({ formulaId: row.formulaId });
}

/**
 * Builds a private-safe, fail-closed projection for the exact clean-room set.
 * It accepts only aggregate-safe status fields and never carries source,
 * reversible intermediates, behavior payloads, oracle payloads, or locators.
 */
export function evaluateCleanRoomEvidenceV1(
  input: unknown,
): CleanRoomEvidenceResultV1 {
  const root = readPlainRecord(input, [
    "workRows",
    "ledgerRows",
    "provisionalRows",
  ]);
  if (!root) fail("clean-room-evidence-input-invalid");

  const rawWorkRows = readDenseArray(root.workRows);
  const rawLedgerRows = readDenseArray(root.ledgerRows);
  const rawProvisionalRows = readDenseArray(root.provisionalRows);
  if (!rawWorkRows || !rawLedgerRows || !rawProvisionalRows) {
    fail("clean-room-evidence-input-invalid");
  }

  const workRows = rawWorkRows.map(readWorkRow);
  const ledgerRows = rawLedgerRows.map(readLedgerRow);
  const provisionalRows = rawProvisionalRows.map(readProvisionalRow);
  const workIds = new Set(workRows.map((row) => row.formulaId));
  const ledgerIds = new Set(ledgerRows.map((row) => row.formulaId));
  const provisionalIds = new Set(provisionalRows.map((row) => row.formulaId));

  if (
    workRows.length !== EXPECTED_ROWS ||
    ledgerRows.length !== EXPECTED_ROWS ||
    workIds.size !== EXPECTED_ROWS ||
    ledgerIds.size !== EXPECTED_ROWS ||
    provisionalIds.size !== provisionalRows.length ||
    workRows.some((row, index) => ledgerRows[index]?.formulaId !== row.formulaId) ||
    provisionalRows.some((row) => workIds.has(row.formulaId)) ||
    workRows.filter((row) => row.rightsClass === "A").length !==
      EXPECTED_CLASS_A ||
    workRows.filter((row) => row.rightsClass === "B").length !==
      EXPECTED_CLASS_B ||
    workRows.filter((row) => row.rightsClass === "C").length !==
      EXPECTED_CLASS_C ||
    workRows.filter(
      (row) =>
        row.sourceOracleStatus ===
        "legacy-compatibility-orbit-oracle-available",
    ).length !== EXPECTED_LEGACY_ORACLES ||
    workRows.filter(
      (row) =>
        row.sourceOracleStatus === "waiver-probe-not-executable-oracle",
    ).length !== EXPECTED_WAIVER_PROBES
  ) {
    fail("clean-room-evidence-exact-set-invalid");
  }

  const blockers = Object.freeze([...BLOCKERS]);
  const rows = Object.freeze(
    workRows.map((row) =>
      Object.freeze({
        formulaId: row.formulaId,
        sourceSet: "F588" as const,
        rightsClass: row.rightsClass,
        rightsProvenanceClassificationBound: true as const,
        privateProvenanceEvidenceBound: true as const,
        sourceOracleStatus: row.sourceOracleStatus,
        sourceOracleEvidenceBound: true as const,
        workInputStatus:
          "blocked-missing-approved-nonreversible-behavior-spec" as const,
        technicalStatus: "failed" as const,
        technicalFailureReason: "missing-input" as const,
        provisionalCandidate: false as const,
        admissionStatus: "blocked" as const,
        blockers,
      }),
    ),
  );

  return Object.freeze({
    schema: "fractalpark-formula-library-clean-room-evidence/v1",
    deterministic: true,
    candidateReceiptsIssued: 0,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: Object.freeze({
      total: 452 as const,
      f588: 452 as const,
      rightsClassA: 1 as const,
      rightsClassB: 73 as const,
      rightsClassC: 378 as const,
      rightsProvenanceClassificationBound: 452 as const,
      privateProvenanceEvidenceBound: 452 as const,
      sourceOracleEvidenceBound: 452 as const,
      legacyCompatibilityOracleAvailable: 443 as const,
      waiverProbeNotExecutableOracle: 9 as const,
      workInputBlockedMissingApprovedNonreversibleBehaviorSpec: 452 as const,
      technicalFailedMissingInput: 452 as const,
      provisionalOverlap: 0 as const,
      behaviorPackagesApproved: 0 as const,
      isolatedImplementationInputs: 0 as const,
      approvedExecutableOraclePackages: 0 as const,
      contaminatedReviewApprovals: 0 as const,
      cleanReviewApprovals: 0 as const,
      strictReviewClosures: 0 as const,
      leakageReviewReceipts: 0 as const,
      implementationAuthorized: 0 as const,
      candidateAdmitted: 0 as const,
      candidateBlocked: 452 as const,
      blockerCounts: Object.freeze(
        BLOCKERS.map((code) => Object.freeze({ code, count: 452 as const })),
      ),
    }),
    rows,
  });
}
