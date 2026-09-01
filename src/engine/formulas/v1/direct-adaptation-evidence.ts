export const DIRECT_ADAPTATION_EVIDENCE_VERSION_V1 =
  "formula-library-direct-adaptation-evidence/1";

const EXPECTED_ROWS = 225;
const EXPECTED_F588 = 136;
const EXPECTED_B94 = 89;
const EXPECTED_RUNNABLE = 20;
const EXPECTED_FAILED = 205;

type SourceSet = "F588" | "B94";
type RightsClass = "A" | "P";
type TechnicalStatus = "passed" | "failed";
type TechnicalFailureReason =
  | "v1-projection-unsupported"
  | "release-oracle-mismatch"
  | "webgl-cpu-mismatch";

export type DirectAdaptationBlockerV1 =
  | "advancement-review-not-approved"
  | "final-parameter-schema-missing"
  | "technical-v1-projection-unsupported"
  | "technical-release-oracle-mismatch"
  | "technical-webgl-cpu-mismatch"
  | "verified-final-profile-missing"
  | "verified-final-preview-missing"
  | "final-record-missing"
  | "independent-admission-not-passed";

export type DirectAdaptationEvidenceRowV1 = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  rightsClass: RightsClass;
  inputEvidenceKind: "approved-direct-source" | "project-owned-runtime-contract";
  inputEvidenceBound: true;
  technicalStatus: TechnicalStatus;
  technicalFailureReason: TechnicalFailureReason | null;
  provisionalCandidate: boolean;
  admissionStatus: "blocked";
  blockers: readonly DirectAdaptationBlockerV1[];
}>;

export type DirectAdaptationEvidenceResultV1 = Readonly<{
  schema: "fractalpark-formula-library-direct-adaptation-evidence/v1";
  deterministic: true;
  candidateReceiptsIssued: 0;
  publicCandidateAssemblyAllowed: false;
  publicPromotionAllowed: false;
  publicAssetsWritten: 0;
  summary: Readonly<{
    total: 225;
    f588: 136;
    b94: 89;
    inputEvidenceBound: 225;
    technicalRunnable: 20;
    technicalBlocked: 205;
    provisionalCandidates: 20;
    advancementReviewsApproved: 0;
    finalParameterSchemas: 0;
    verifiedFinalProfiles: 0;
    verifiedFinalPreviews: 0;
    finalRecords: 0;
    candidateAdmitted: 0;
    candidateBlocked: 225;
    technicalFailureCounts: Readonly<{
      v1ProjectionUnsupported: 174;
      releaseOracleMismatch: 15;
      webglCpuMismatch: 16;
    }>;
    blockerCounts: readonly Readonly<{
      code: DirectAdaptationBlockerV1;
      count: number;
    }>[];
  }>;
  rows: readonly DirectAdaptationEvidenceRowV1[];
}>;

type RecordValue = Record<string, unknown>;

type ParsedWorkRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  rightsClass: RightsClass;
  inputEvidenceKind: "approved-direct-source" | "project-owned-runtime-contract";
}>;

type ParsedRunnableRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  status: TechnicalStatus;
  failureReason: TechnicalFailureReason | null;
}>;

type ParsedProvisionalRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
}>;

const WORK_ROW_KEYS = Object.freeze([
  "formulaId",
  "sourceSet",
  "rightsClass",
  "rightsEvidenceStatus",
  "sourceVisibility",
  "implementationInputKind",
  "implementationInputStatus",
  "workStartEligibility",
  "reviewStatus",
  "parameterContractStatus",
  "profileCandidateStatus",
  "previewInputStatus",
]);
const RUNNABLE_ROW_KEYS = Object.freeze([
  "formulaId",
  "sourceSet",
  "status",
  "failureReason",
  "publicationEligible",
]);
const PROVISIONAL_ROW_KEYS = Object.freeze([
  "formulaId",
  "sourceSet",
  "status",
  "provisionalDefaultProfile",
  "verifiedDefaultProfile",
  "publicationEligible",
]);

function fail(code: string): never {
  throw new Error(code);
}

function snapshotOwnDataRecord(
  value: unknown,
  expected: readonly string[],
): Readonly<RecordValue> | null {
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
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const actual = (ownKeys as string[]).sort();
    const sortedExpected = [...expected].sort();
    if (
      actual.length !== sortedExpected.length ||
      actual.some((key, index) => key !== sortedExpected[index])
    ) {
      return null;
    }
    const snapshot: RecordValue = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotDenseArray(value: unknown): readonly unknown[] | null {
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
    const ownStringKeys = new Set(ownKeys as string[]);
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      if (!ownStringKeys.has(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function isSourceSet(value: unknown): value is SourceSet {
  return value === "F588" || value === "B94";
}

function parseWorkRow(value: unknown): ParsedWorkRow {
  const row = snapshotOwnDataRecord(value, WORK_ROW_KEYS);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    !isSourceSet(row.sourceSet) ||
    row.workStartEligibility !== "blocked-incomplete-package" ||
    row.reviewStatus !== "blocked-incomplete-package"
  ) {
    fail("direct-evidence-work-row-invalid");
  }

  if (row.sourceSet === "F588") {
    if (
      row.rightsClass !== "A" ||
      row.rightsEvidenceStatus !== "frozen-per-record-classification" ||
      row.sourceVisibility !== "source-visible-after-content-gate" ||
      row.implementationInputKind !== "approved-direct-source" ||
      row.implementationInputStatus !== "ready-direct-source" ||
      row.parameterContractStatus !== "structural-types-only-not-final-schema" ||
      row.profileCandidateStatus !== "blocked-missing-formula-profile-candidate" ||
      row.previewInputStatus !== "blocked-until-profile-candidate-exists"
    ) {
      fail("direct-evidence-work-row-invalid");
    }
    return {
      formulaId: row.formulaId,
      sourceSet: row.sourceSet,
      rightsClass: "A",
      inputEvidenceKind: "approved-direct-source",
    };
  }

  if (
    row.rightsClass !== "P" ||
    row.rightsEvidenceStatus !== "project-owned-runtime-source" ||
    row.sourceVisibility !== "source-visible" ||
    row.implementationInputKind !== "project-owned-runtime-source-and-contract" ||
    row.implementationInputStatus !== "ready-project-owned-runtime-contract" ||
    row.parameterContractStatus !== "ready-project-runtime-contract" ||
    row.profileCandidateStatus !==
      "ready-legacy-runtime-candidate-unverified-for-v1" ||
    row.previewInputStatus !==
      "ready-legacy-runtime-candidate-unverified-for-v1"
  ) {
    fail("direct-evidence-work-row-invalid");
  }
  return {
    formulaId: row.formulaId,
    sourceSet: row.sourceSet,
    rightsClass: "P",
    inputEvidenceKind: "project-owned-runtime-contract",
  };
}

function isFailureReason(value: unknown): value is TechnicalFailureReason {
  return (
    value === "v1-projection-unsupported" ||
    value === "release-oracle-mismatch" ||
    value === "webgl-cpu-mismatch"
  );
}

function parseRunnableRow(value: unknown): ParsedRunnableRow {
  const row = snapshotOwnDataRecord(value, RUNNABLE_ROW_KEYS);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    !isSourceSet(row.sourceSet) ||
    (row.status !== "passed" && row.status !== "failed") ||
    row.publicationEligible !== false
  ) {
    fail("direct-evidence-runnable-row-invalid");
  }
  if (row.status === "passed") {
    if (row.failureReason !== null) {
      fail("direct-evidence-runnable-row-invalid");
    }
    return {
      formulaId: row.formulaId,
      sourceSet: row.sourceSet,
      status: "passed",
      failureReason: null,
    };
  }
  if (!isFailureReason(row.failureReason)) {
    fail("direct-evidence-runnable-row-invalid");
  }
  return {
    formulaId: row.formulaId,
    sourceSet: row.sourceSet,
    status: "failed",
    failureReason: row.failureReason,
  };
}

function parseProvisionalRow(value: unknown): ParsedProvisionalRow {
  const row = snapshotOwnDataRecord(value, PROVISIONAL_ROW_KEYS);
  if (
    !row ||
    typeof row.formulaId !== "string" ||
    row.formulaId.length === 0 ||
    !isSourceSet(row.sourceSet) ||
    row.status !== "presentable-candidate" ||
    row.provisionalDefaultProfile !== true ||
    row.verifiedDefaultProfile !== false ||
    row.publicationEligible !== false
  ) {
    fail("direct-evidence-provisional-row-invalid");
  }
  return { formulaId: row.formulaId, sourceSet: row.sourceSet };
}

function technicalBlocker(
  reason: TechnicalFailureReason,
): DirectAdaptationBlockerV1 {
  return `technical-${reason}`;
}

/**
 * Builds the exact-225 direct-adaptation evidence projection. This evaluator
 * records trusted input availability and technical state only. It cannot issue
 * candidate receipts, authorize public assembly, or treat provisional assets as
 * verified final evidence.
 */
export function evaluateDirectAdaptationEvidenceV1(
  input: unknown,
): DirectAdaptationEvidenceResultV1 {
  const inputRecord = snapshotOwnDataRecord(input, [
    "workRows",
    "runnableRows",
    "provisionalRows",
  ]);
  if (!inputRecord) {
    fail("direct-evidence-input-invalid");
  }
  const workInput = snapshotDenseArray(inputRecord.workRows);
  const runnableInput = snapshotDenseArray(inputRecord.runnableRows);
  const provisionalInput = snapshotDenseArray(inputRecord.provisionalRows);
  if (!workInput || !runnableInput || !provisionalInput) {
    fail("direct-evidence-input-invalid");
  }

  const workRows = workInput.map(parseWorkRow);
  const runnableRows = runnableInput.map(parseRunnableRow);
  const provisionalRows = provisionalInput.map(parseProvisionalRow);
  const workIds = new Set(workRows.map((row) => row.formulaId));
  const runnableIds = new Set(runnableRows.map((row) => row.formulaId));

  if (
    workRows.length !== EXPECTED_ROWS ||
    runnableRows.length !== EXPECTED_ROWS ||
    workIds.size !== EXPECTED_ROWS ||
    runnableIds.size !== EXPECTED_ROWS ||
    workRows.filter((row) => row.sourceSet === "F588").length !== EXPECTED_F588 ||
    workRows.filter((row) => row.sourceSet === "B94").length !== EXPECTED_B94 ||
    workRows.some(
      (row, index) =>
        runnableRows[index]?.formulaId !== row.formulaId ||
        runnableRows[index]?.sourceSet !== row.sourceSet,
    )
  ) {
    fail("direct-evidence-exact-set-invalid");
  }

  const passedIds = new Set(
    runnableRows.filter((row) => row.status === "passed").map((row) => row.formulaId),
  );
  const provisionalIds = new Set(provisionalRows.map((row) => row.formulaId));
  const reasonCounts = new Map<TechnicalFailureReason, number>();
  for (const row of runnableRows) {
    if (row.failureReason !== null) {
      reasonCounts.set(
        row.failureReason,
        (reasonCounts.get(row.failureReason) ?? 0) + 1,
      );
    }
  }
  if (
    passedIds.size !== EXPECTED_RUNNABLE ||
    runnableRows.filter((row) => row.status === "failed").length !== EXPECTED_FAILED ||
    provisionalRows.length !== EXPECTED_RUNNABLE ||
    provisionalIds.size !== EXPECTED_RUNNABLE ||
    reasonCounts.get("v1-projection-unsupported") !== 174 ||
    reasonCounts.get("release-oracle-mismatch") !== 15 ||
    reasonCounts.get("webgl-cpu-mismatch") !== 16 ||
    provisionalRows.some(
      (row) =>
        !passedIds.has(row.formulaId) ||
        !workIds.has(row.formulaId) ||
        runnableRows.find((candidate) => candidate.formulaId === row.formulaId)
          ?.sourceSet !== row.sourceSet,
    )
  ) {
    fail("direct-evidence-technical-accounting-invalid");
  }

  const blockerCounts = new Map<DirectAdaptationBlockerV1, number>();
  const rows = workRows.map((workRow, index): DirectAdaptationEvidenceRowV1 => {
    const runnableRow = runnableRows[index]!;
    const blockers: DirectAdaptationBlockerV1[] = [
      "advancement-review-not-approved",
      "final-parameter-schema-missing",
    ];
    if (runnableRow.failureReason !== null) {
      blockers.push(technicalBlocker(runnableRow.failureReason));
    }
    blockers.push(
      "verified-final-profile-missing",
      "verified-final-preview-missing",
      "final-record-missing",
      "independent-admission-not-passed",
    );
    for (const blocker of blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    return Object.freeze({
      formulaId: workRow.formulaId,
      sourceSet: workRow.sourceSet,
      rightsClass: workRow.rightsClass,
      inputEvidenceKind: workRow.inputEvidenceKind,
      inputEvidenceBound: true as const,
      technicalStatus: runnableRow.status,
      technicalFailureReason: runnableRow.failureReason,
      provisionalCandidate: provisionalIds.has(workRow.formulaId),
      admissionStatus: "blocked" as const,
      blockers: Object.freeze(blockers),
    });
  });

  const sortedBlockerCounts = [...blockerCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => Object.freeze({ code, count }));

  return Object.freeze({
    schema: "fractalpark-formula-library-direct-adaptation-evidence/v1",
    deterministic: true,
    candidateReceiptsIssued: 0,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: Object.freeze({
      total: EXPECTED_ROWS as 225,
      f588: EXPECTED_F588 as 136,
      b94: EXPECTED_B94 as 89,
      inputEvidenceBound: EXPECTED_ROWS as 225,
      technicalRunnable: EXPECTED_RUNNABLE as 20,
      technicalBlocked: EXPECTED_FAILED as 205,
      provisionalCandidates: EXPECTED_RUNNABLE as 20,
      advancementReviewsApproved: 0,
      finalParameterSchemas: 0,
      verifiedFinalProfiles: 0,
      verifiedFinalPreviews: 0,
      finalRecords: 0,
      candidateAdmitted: 0,
      candidateBlocked: EXPECTED_ROWS as 225,
      technicalFailureCounts: Object.freeze({
        v1ProjectionUnsupported: 174 as const,
        releaseOracleMismatch: 15 as const,
        webglCpuMismatch: 16 as const,
      }),
      blockerCounts: Object.freeze(sortedBlockerCounts),
    }),
    rows: Object.freeze(rows),
  });
}
