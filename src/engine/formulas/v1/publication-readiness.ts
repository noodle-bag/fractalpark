export const PUBLICATION_READINESS_VERSION_V1 =
  "formula-library-publication-readiness/1";

const EXPECTED_ROWS = 677;
const EXPECTED_F588 = 588;
const EXPECTED_B94 = 89;
const EXPECTED_DIRECT = 225;
const EXPECTED_CLEAN_ROOM = 452;
const EXPECTED_RUNNABLE = 20;
const EXPECTED_FAILED = 657;

type SourceSet = "F588" | "B94";
type AdvancementLane = "direct-adaptation" | "clean-room";
type TechnicalStatus = "passed" | "failed";
type TechnicalFailureReason =
  | "missing-input"
  | "v1-projection-unsupported"
  | "release-oracle-mismatch"
  | "webgl-cpu-mismatch";

export type PublicationReadinessBlockerV1 =
  | "advancement-review-not-approved"
  | "clean-behavior-spec-not-approved"
  | "final-parameter-schema-missing"
  | "technical-missing-input"
  | "technical-v1-projection-unsupported"
  | "technical-release-oracle-mismatch"
  | "technical-webgl-cpu-mismatch"
  | "verified-final-profile-missing"
  | "verified-final-preview-missing"
  | "final-record-missing"
  | "candidate-receipt-absent";

export type PublicationReadinessRowV1 = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  lane: AdvancementLane;
  technicalStatus: TechnicalStatus;
  provisionalCandidate: boolean;
  status: "blocked" | "candidate-ready";
  blockers: readonly PublicationReadinessBlockerV1[];
}>;

export type PublicationReadinessResultV1 = Readonly<{
  schema: "fractalpark-formula-library-publication-readiness/v1";
  deterministic: true;
  publicCandidateAssemblyAllowed: false;
  publicPromotionAllowed: false;
  publicAssetsWritten: 0;
  summary: Readonly<{
    total: 677;
    candidateReady: number;
    blocked: number;
    direct: 225;
    cleanRoom: 452;
    runnable: 20;
    failed: 657;
    provisionalCandidates: 20;
    verifiedFinalProfiles: number;
    blockerCounts: readonly Readonly<{
      code: PublicationReadinessBlockerV1;
      count: number;
    }>[];
  }>;
  rows: readonly PublicationReadinessRowV1[];
}>;

type RecordValue = Record<string, unknown>;

type ParsedWorkRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  lane: AdvancementLane;
  implementationInputStatus: string;
  parameterContractStatus: string;
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
  "lane",
  "workStartEligibility",
  "reviewStatus",
  "implementationInputStatus",
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

function record(value: unknown): value is RecordValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function denseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}


function isSourceSet(value: unknown): value is SourceSet {
  return value === "F588" || value === "B94";
}

function isLane(value: unknown): value is AdvancementLane {
  return value === "direct-adaptation" || value === "clean-room";
}

function parseWorkRow(value: unknown): ParsedWorkRow {
  if (
    !record(value) ||
    !exactKeys(value, WORK_ROW_KEYS) ||
    typeof value.formulaId !== "string" ||
    value.formulaId.length === 0 ||
    !isSourceSet(value.sourceSet) ||
    !isLane(value.lane) ||
    value.workStartEligibility !== "blocked-incomplete-package" ||
    value.reviewStatus !== "blocked-incomplete-package" ||
    typeof value.implementationInputStatus !== "string" ||
    typeof value.parameterContractStatus !== "string" ||
    typeof value.profileCandidateStatus !== "string" ||
    typeof value.previewInputStatus !== "string"
  ) {
    fail("readiness-work-row-invalid");
  }
  if (
    value.sourceSet === "B94" &&
    (value.lane !== "direct-adaptation" ||
      value.implementationInputStatus !==
        "ready-project-owned-runtime-contract" ||
      value.parameterContractStatus !== "ready-project-runtime-contract" ||
      value.profileCandidateStatus !==
        "ready-legacy-runtime-candidate-unverified-for-v1" ||
      value.previewInputStatus !==
        "ready-legacy-runtime-candidate-unverified-for-v1")
  ) {
    fail("readiness-work-row-invalid");
  }
  if (
    value.lane === "clean-room" &&
    (value.sourceSet !== "F588" ||
      value.implementationInputStatus !==
        "blocked-missing-approved-nonreversible-behavior-spec")
  ) {
    fail("readiness-work-row-invalid");
  }
  if (
    value.sourceSet === "F588" &&
    value.lane === "direct-adaptation" &&
    value.implementationInputStatus !== "ready-direct-source"
  ) {
    fail("readiness-work-row-invalid");
  }
  return {
    formulaId: value.formulaId,
    sourceSet: value.sourceSet,
    lane: value.lane,
    implementationInputStatus: value.implementationInputStatus,
    parameterContractStatus: value.parameterContractStatus,
  };
}

function isTechnicalFailureReason(
  value: unknown,
): value is TechnicalFailureReason {
  return (
    value === "missing-input" ||
    value === "v1-projection-unsupported" ||
    value === "release-oracle-mismatch" ||
    value === "webgl-cpu-mismatch"
  );
}

function parseRunnableRow(value: unknown): ParsedRunnableRow {
  if (
    !record(value) ||
    !exactKeys(value, RUNNABLE_ROW_KEYS) ||
    typeof value.formulaId !== "string" ||
    value.formulaId.length === 0 ||
    !isSourceSet(value.sourceSet) ||
    (value.status !== "passed" && value.status !== "failed") ||
    value.publicationEligible !== false
  ) {
    fail("readiness-runnable-row-invalid");
  }
  const failureReason = value.failureReason;
  if (
    (value.status === "passed" && failureReason !== null) ||
    (value.status === "failed" && !isTechnicalFailureReason(failureReason))
  ) {
    fail("readiness-runnable-row-invalid");
  }
  return {
    formulaId: value.formulaId,
    sourceSet: value.sourceSet,
    status: value.status,
    failureReason:
      value.status === "passed"
        ? null
        : isTechnicalFailureReason(failureReason)
          ? failureReason
          : fail("readiness-runnable-row-invalid"),
  };
}

function parseProvisionalRow(value: unknown): ParsedProvisionalRow {
  if (
    !record(value) ||
    !exactKeys(value, PROVISIONAL_ROW_KEYS) ||
    typeof value.formulaId !== "string" ||
    value.formulaId.length === 0 ||
    !isSourceSet(value.sourceSet) ||
    value.status !== "presentable-candidate" ||
    value.provisionalDefaultProfile !== true ||
    value.verifiedDefaultProfile !== false ||
    value.publicationEligible !== false
  ) {
    fail("readiness-provisional-row-invalid");
  }
  return { formulaId: value.formulaId, sourceSet: value.sourceSet };
}


function technicalBlocker(
  reason: TechnicalFailureReason,
): PublicationReadinessBlockerV1 {
  return `technical-${reason}`;
}

function assertExactSet(
  workRows: readonly ParsedWorkRow[],
  runnableRows: readonly ParsedRunnableRow[],
): void {
  if (
    workRows.length !== EXPECTED_ROWS ||
    runnableRows.length !== EXPECTED_ROWS ||
    new Set(workRows.map((row) => row.formulaId)).size !== EXPECTED_ROWS ||
    new Set(runnableRows.map((row) => row.formulaId)).size !== EXPECTED_ROWS ||
    workRows.filter((row) => row.sourceSet === "F588").length !== EXPECTED_F588 ||
    workRows.filter((row) => row.sourceSet === "B94").length !== EXPECTED_B94 ||
    workRows.filter((row) => row.lane === "direct-adaptation").length !==
      EXPECTED_DIRECT ||
    workRows.filter((row) => row.lane === "clean-room").length !==
      EXPECTED_CLEAN_ROOM ||
    workRows.some(
      (row, index) =>
        runnableRows[index]?.formulaId !== row.formulaId ||
        runnableRows[index]?.sourceSet !== row.sourceSet,
    )
  ) {
    fail("readiness-exact-set-invalid");
  }
}

/**
 * Evaluates the frozen exact-677 readiness set without Node APIs or public
 * output effects. A complete receipt set only authorizes separate candidate
 * assembly; this module never authorizes publication or writes public assets.
 */
export function evaluatePublicationReadinessV1(
  input: unknown,
): PublicationReadinessResultV1 {
  if (
    !record(input) ||
    !exactKeys(input, [
      "workRows",
      "runnableRows",
      "provisionalRows",
      "candidateReceipts",
    ]) ||
    !denseArray(input.workRows) ||
    !denseArray(input.runnableRows) ||
    !denseArray(input.provisionalRows) ||
    !denseArray(input.candidateReceipts)
  ) {
    fail("readiness-input-invalid");
  }

  if (input.candidateReceipts.length !== 0) {
    fail("readiness-candidate-receipts-not-supported");
  }

  const workRows = input.workRows.map(parseWorkRow);
  const runnableRows = input.runnableRows.map(parseRunnableRow);
  const provisionalRows = input.provisionalRows.map(parseProvisionalRow);
  assertExactSet(workRows, runnableRows);

  const passedIds = new Set(
    runnableRows.filter((row) => row.status === "passed").map((row) => row.formulaId),
  );
  const provisionalIds = new Set(provisionalRows.map((row) => row.formulaId));
  const failureReasonCounts = new Map<TechnicalFailureReason, number>();
  for (const row of runnableRows) {
    if (row.failureReason !== null) {
      failureReasonCounts.set(
        row.failureReason,
        (failureReasonCounts.get(row.failureReason) ?? 0) + 1,
      );
    }
  }
  if (
    passedIds.size !== EXPECTED_RUNNABLE ||
    runnableRows.filter((row) => row.status === "failed").length !== EXPECTED_FAILED ||
    provisionalRows.length !== EXPECTED_RUNNABLE ||
    provisionalIds.size !== EXPECTED_RUNNABLE ||
    failureReasonCounts.get("missing-input") !== 452 ||
    failureReasonCounts.get("v1-projection-unsupported") !== 174 ||
    failureReasonCounts.get("release-oracle-mismatch") !== 15 ||
    failureReasonCounts.get("webgl-cpu-mismatch") !== 16 ||
    provisionalRows.some(
      (row) =>
        !passedIds.has(row.formulaId) ||
        runnableRows.find((candidate) => candidate.formulaId === row.formulaId)
          ?.sourceSet !== row.sourceSet,
    )
  ) {
    fail("readiness-technical-accounting-invalid");
  }


  const completeReceiptSet = false;
  const blockerCounts = new Map<PublicationReadinessBlockerV1, number>();
  const rows = workRows.map((workRow, index): PublicationReadinessRowV1 => {
    const runnableRow = runnableRows[index]!;
    const blockers: PublicationReadinessBlockerV1[] = [];
    if (!completeReceiptSet) {
      blockers.push("advancement-review-not-approved");
      if (workRow.lane === "clean-room") {
        blockers.push("clean-behavior-spec-not-approved");
      }
      if (
        workRow.parameterContractStatus !== "final-parameter-schema-verified"
      ) {
        blockers.push("final-parameter-schema-missing");
      }
      if (runnableRow.failureReason !== null) {
        blockers.push(technicalBlocker(runnableRow.failureReason));
      }
      blockers.push(
        "verified-final-profile-missing",
        "verified-final-preview-missing",
        "final-record-missing",
        "candidate-receipt-absent",
      );
    }
    for (const blocker of blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    return Object.freeze({
      formulaId: workRow.formulaId,
      sourceSet: workRow.sourceSet,
      lane: workRow.lane,
      technicalStatus: runnableRow.status,
      provisionalCandidate: provisionalIds.has(workRow.formulaId),
      status: completeReceiptSet ? "candidate-ready" : "blocked",
      blockers: Object.freeze(blockers),
    });
  });

  const sortedBlockerCounts = [...blockerCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => Object.freeze({ code, count }));
  const candidateReady = completeReceiptSet ? EXPECTED_ROWS : 0;

  return Object.freeze({
    schema: "fractalpark-formula-library-publication-readiness/v1",
    deterministic: true,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: Object.freeze({
      total: EXPECTED_ROWS as 677,
      candidateReady,
      blocked: EXPECTED_ROWS - candidateReady,
      direct: EXPECTED_DIRECT as 225,
      cleanRoom: EXPECTED_CLEAN_ROOM as 452,
      runnable: EXPECTED_RUNNABLE as 20,
      failed: EXPECTED_FAILED as 657,
      provisionalCandidates: EXPECTED_RUNNABLE as 20,
      verifiedFinalProfiles: 0,
      blockerCounts: Object.freeze(sortedBlockerCounts),
    }),
    rows: Object.freeze(rows),
  });
}
