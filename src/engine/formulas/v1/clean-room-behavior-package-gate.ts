import { createHash } from "node:crypto";

export const CLEAN_ROOM_BEHAVIOR_PACKAGE_GATE_VERSION_V2 =
  "formula-library-clean-room-behavior-package-gate/2";

const RESULT_SCHEMA =
  "fractalpark-formula-library-clean-room-behavior-package-gate/v2";
const FROZEN_EXACT_SET_BINDING_SHA256 =
  "afeb8ddde456b10426da0732bd13f906e30a73eff8239c284bf639d07e2a5713";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const REVIEWER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const EXPECTED_ROWS = 452;
const EXPECTED_CLASS_A = 1;
const EXPECTED_CLASS_B = 73;
const EXPECTED_CLASS_C = 378;
const EXPECTED_LEGACY_ORACLES = 443;
const EXPECTED_WAIVER_PROBES = 9;

const ALLOWED_REVIEW_CODES = new Set([
  "behavior-anchor-missing",
  "bounded-scope",
  "clean-anchor-checked",
  "clean-envelope-leakage",
  "comparison-contract-incomplete",
  "default-contract-incomplete",
  "incomplete-contract",
  "negative-tests-incomplete",
  "non-finite-contract-incomplete",
  "oracle-contract-incomplete",
  "parameter-domain-incomplete",
  "protected-content-detected",
  "resource-contract-incomplete",
  "shared-condition",
  "termination-contract-incomplete",
]);

const DIMENSION_SPECS = Object.freeze({
  parameterGrammar: ["clean-room-parameter-grammar/v1", "assertionCount"],
  parameterDomainsAndDefaults: [
    "clean-room-parameter-domains-defaults/v1",
    "assertionCount",
  ],
  functionBinding: ["clean-room-function-binding/v1", "assertionCount"],
  initialization: ["clean-room-initialization/v1", "assertionCount"],
  recurrence: ["clean-room-recurrence/v1", "assertionCount"],
  terminationProtocol: ["clean-room-termination-protocol/v1", "assertionCount"],
  zeroIterationContract: [
    "clean-room-zero-iteration-contract/v1",
    "assertionCount",
  ],
  eventAndCounterContract: [
    "clean-room-event-counter-contract/v1",
    "assertionCount",
  ],
  nonFiniteContract: ["clean-room-non-finite-contract/v1", "assertionCount"],
  resourceExhaustionContract: [
    "clean-room-resource-exhaustion-contract/v1",
    "assertionCount",
  ],
  independentBehaviorAnchor: [
    "clean-room-independent-behavior-anchor/v1",
    "assertionCount",
  ],
  comparisonContract: ["clean-room-comparison-contract/v1", "assertionCount"],
  templateBinding: ["clean-room-template-binding/v1", "assertionCount"],
  rowVariationBinding: [
    "clean-room-row-variation-binding/v1",
    "assertionCount",
  ],
  fieldProvenance: ["clean-room-field-provenance/v1", "fieldCount"],
} as const);

const BEHAVIOR_PACKAGE_KEYS = Object.freeze([
  "behaviorSchemaVersion",
  "exactInputKeySet",
  ...Object.keys(DIMENSION_SPECS),
  "executableOracle",
  "negativeTests",
] as const);

const REVIEW_KEYS = Object.freeze([
  "formulaId",
  "packageGeneration",
  "reviewerId",
  "reviewerRole",
  "allowedInputSurface",
  "reviewedBehaviorObjectSha256",
  "decision",
  "reasonCodes",
  "findingCodes",
] as const);

type JsonPrimitive = null | boolean | number | string;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
type JsonRecord = Record<string, unknown>;
type RightsClass = "A" | "B" | "C";
type SourceOracleStatus =
  | "legacy-compatibility-orbit-oracle-available"
  | "waiver-probe-not-executable-oracle";
type ReviewDecision = "declare-contract-satisfied" | "block";
type ReviewStatus = "missing" | "stale" | "blocked" | "declared-satisfied";
type SetCommitmentStatus = "bound" | "synthetic-unbound";

type EvidenceProjection = Readonly<{
  formulaId: string;
  rightsClass: RightsClass;
  sourceOracleStatus: SourceOracleStatus;
  rowProjectionHash: string;
}>;

type ReviewReceipt = Readonly<{
  reviewerId: string;
  reviewedBehaviorObjectSha256: string;
  decision: ReviewDecision;
  reasonCodes: readonly string[];
  findingCodes: readonly string[];
}>;

type SubmissionProjection = Readonly<{
  formulaId: string;
  packageGeneration: number;
  behaviorPackage: Readonly<Record<string, JsonValue>>;
  reviewedBehaviorObjectSha256: string;
  contaminatedReview: ReviewReceipt | null;
  cleanReview: ReviewReceipt | null;
}>;

export type CleanRoomBehaviorPackageGateResultV2 = Readonly<{
  schema: typeof RESULT_SCHEMA;
  controllerVersion: typeof CLEAN_ROOM_BEHAVIOR_PACKAGE_GATE_VERSION_V2;
  deterministic: true;
  exactSetBindingSha256: string;
  exactSetCommitmentStatus: SetCommitmentStatus;
  summary: Readonly<{
    total: 452;
    submissions: number;
    missingSubmissions: number;
    contaminatedReviewDeclarationsSatisfied: number;
    cleanReviewDeclarationsSatisfied: number;
    syntheticContractsSatisfied: number;
  }>;
  rows: readonly Readonly<{
    formulaId: string;
    evidenceRowProjectionHash: string;
    packageGeneration: number | null;
    reviewedBehaviorObjectSha256: string | null;
    submissionStatus: "missing" | "present";
    contaminatedReviewStatus: ReviewStatus;
    cleanReviewStatus: ReviewStatus;
    contractClosure: "blocked" | "synthetic-contract-satisfied";
    syntheticContractSatisfied: boolean;
    contentEvaluationStatus: "digest-only-not-content-reviewed";
    reviewIdentityStatus: "self-reported-not-verified";
    reviewRationale: readonly string[];
    contractIssues: readonly string[];
  }>[];
}>;

function fail(code: string): never {
  throw new Error(code);
}

function readPlainRecord(
  value: unknown,
  expectedKeys: readonly string[],
  code: string,
): Readonly<JsonRecord> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      fail(code);
    }
    const keys = Reflect.ownKeys(value);
    const expected = [...expectedKeys].sort();
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== "string") ||
      (keys as string[]).sort().some((key, index) => key !== expected[index])
    ) {
      fail(code);
    }
    const copy: JsonRecord = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(code);
      }
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    fail(code);
  }
}

function readDenseArray(
  value: unknown,
  code: string,
  maxLength: number,
): readonly unknown[] {
  try {
    if (
      !Array.isArray(value) ||
      value.length > maxLength ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      fail(code);
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1 ||
      keys.some((key) => typeof key !== "string") ||
      !keys.includes("length")
    ) {
      fail(code);
    }
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(code);
      }
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    fail(code);
  }
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`)
    .join(",")}}`;
}

function sha256Canonical(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function readStringList(value: unknown, code: string): readonly string[] {
  const values = readDenseArray(value, code, 16);
  if (
    values.some(
      (item) => typeof item !== "string" || !ALLOWED_REVIEW_CODES.has(item),
    )
  ) {
    fail(code);
  }
  return Object.freeze(values as string[]);
}

function readEvidenceRow(value: unknown): EvidenceProjection {
  const row = readPlainRecord(
    value,
    ["formulaId", "rightsClass", "sourceOracleStatus", "rowProjectionHash"],
    "clean-room-behavior-package-evidence-row-invalid",
  );
  if (
    typeof row.formulaId !== "string" ||
    !UUID.test(row.formulaId) ||
    !["A", "B", "C"].includes(String(row.rightsClass)) ||
    ![
      "legacy-compatibility-orbit-oracle-available",
      "waiver-probe-not-executable-oracle",
    ].includes(String(row.sourceOracleStatus)) ||
    typeof row.rowProjectionHash !== "string" ||
    !SHA256.test(row.rowProjectionHash)
  ) {
    fail("clean-room-behavior-package-evidence-row-invalid");
  }
  return Object.freeze({
    formulaId: row.formulaId,
    rightsClass: row.rightsClass as RightsClass,
    sourceOracleStatus: row.sourceOracleStatus as SourceOracleStatus,
    rowProjectionHash: row.rowProjectionHash,
  });
}

function readDigestReceipt(
  value: unknown,
  schema: string,
  countKey: string,
): Readonly<Record<string, JsonValue>> {
  const receipt = readPlainRecord(
    value,
    ["schema", "contentSha256", countKey],
    "clean-room-behavior-package-dimension-invalid",
  );
  if (
    receipt.schema !== schema ||
    typeof receipt.contentSha256 !== "string" ||
    !SHA256.test(receipt.contentSha256) ||
    typeof receipt[countKey] !== "number" ||
    !Number.isSafeInteger(receipt[countKey]) ||
    (receipt[countKey] as number) < 1 ||
    (receipt[countKey] as number) > 1_000_000
  ) {
    fail("clean-room-behavior-package-dimension-invalid");
  }
  return Object.freeze({
    schema,
    contentSha256: receipt.contentSha256,
    [countKey]: receipt[countKey] as number,
  });
}

function readOracleReceipt(
  value: unknown,
): Readonly<Record<string, JsonValue>> {
  const receipt = readPlainRecord(
    value,
    ["schema", "contentSha256", "status", "caseCount"],
    "clean-room-behavior-package-dimension-invalid",
  );
  if (
    receipt.schema !== "clean-room-executable-oracle/v1" ||
    typeof receipt.contentSha256 !== "string" ||
    !SHA256.test(receipt.contentSha256) ||
    !["executable", "waiver-not-executable"].includes(String(receipt.status)) ||
    typeof receipt.caseCount !== "number" ||
    !Number.isSafeInteger(receipt.caseCount) ||
    Object.is(receipt.caseCount, -0) ||
    (receipt.status === "executable" &&
      (receipt.caseCount < 1 || receipt.caseCount > 1_000_000)) ||
    (receipt.status === "waiver-not-executable" && receipt.caseCount !== 0)
  ) {
    fail("clean-room-behavior-package-dimension-invalid");
  }
  return Object.freeze({
    schema: receipt.schema,
    contentSha256: receipt.contentSha256,
    status: receipt.status,
    caseCount: receipt.caseCount,
  }) as Readonly<Record<string, JsonValue>>;
}

function readBehaviorPackage(
  value: unknown,
): Readonly<Record<string, JsonValue>> {
  const source = readPlainRecord(
    value,
    BEHAVIOR_PACKAGE_KEYS,
    "clean-room-behavior-package-input-invalid",
  );
  if (source.behaviorSchemaVersion !== 1) {
    fail("clean-room-behavior-package-dimension-invalid");
  }
  const result: Record<string, JsonValue> = {
    behaviorSchemaVersion: 1,
    exactInputKeySet: readDigestReceipt(
      source.exactInputKeySet,
      "clean-room-exact-input-key-set/v1",
      "entryCount",
    ),
  };
  for (const [field, [schema, countKey]] of Object.entries(DIMENSION_SPECS)) {
    result[field] = readDigestReceipt(source[field], schema, countKey);
  }
  result.executableOracle = readOracleReceipt(source.executableOracle);
  result.negativeTests = readDigestReceipt(
    source.negativeTests,
    "clean-room-negative-tests/v1",
    "caseCount",
  );
  return Object.freeze(result);
}

function reviewedObjectHash(
  formulaId: string,
  packageGeneration: number,
  behaviorPackage: Readonly<Record<string, JsonValue>>,
): string {
  return sha256Canonical({
    formulaId,
    packageGeneration,
    behaviorPackage,
  });
}

function readReview(
  value: unknown,
  formulaId: string,
  packageGeneration: number,
  side: "contaminated" | "clean",
): ReviewReceipt | null {
  if (value === null) return null;
  const review = readPlainRecord(
    value,
    REVIEW_KEYS,
    "clean-room-behavior-package-review-invalid",
  );
  const reasonCodes = readStringList(
    review.reasonCodes,
    "clean-room-behavior-package-review-invalid",
  );
  const findingCodes = readStringList(
    review.findingCodes,
    "clean-room-behavior-package-review-invalid",
  );
  const expectedRole = `${side}-reviewer`;
  const expectedSurface =
    side === "contaminated"
      ? "restricted-evidence-and-frozen-clean-envelope"
      : "frozen-clean-envelope-only";
  if (
    review.formulaId !== formulaId ||
    review.packageGeneration !== packageGeneration ||
    typeof review.reviewerId !== "string" ||
    !REVIEWER_ID.test(review.reviewerId) ||
    review.reviewerRole !== expectedRole ||
    review.allowedInputSurface !== expectedSurface ||
    typeof review.reviewedBehaviorObjectSha256 !== "string" ||
    !SHA256.test(review.reviewedBehaviorObjectSha256) ||
    !["declare-contract-satisfied", "block"].includes(
      String(review.decision),
    ) ||
    (review.decision === "block" &&
      reasonCodes.length === 0 &&
      findingCodes.length === 0)
  ) {
    fail("clean-room-behavior-package-review-invalid");
  }
  return Object.freeze({
    reviewerId: review.reviewerId,
    reviewedBehaviorObjectSha256: review.reviewedBehaviorObjectSha256,
    decision: review.decision as ReviewDecision,
    reasonCodes,
    findingCodes,
  });
}

function readSubmission(value: unknown): SubmissionProjection {
  const submission = readPlainRecord(
    value,
    [
      "formulaId",
      "packageGeneration",
      "behaviorPackage",
      "reviewedBehaviorObjectSha256",
      "contaminatedReview",
      "cleanReview",
    ],
    "clean-room-behavior-package-submission-invalid",
  );
  if (
    typeof submission.formulaId !== "string" ||
    !UUID.test(submission.formulaId) ||
    typeof submission.packageGeneration !== "number" ||
    !Number.isSafeInteger(submission.packageGeneration) ||
    submission.packageGeneration < 1 ||
    typeof submission.reviewedBehaviorObjectSha256 !== "string" ||
    !SHA256.test(submission.reviewedBehaviorObjectSha256)
  ) {
    fail("clean-room-behavior-package-submission-invalid");
  }
  const behaviorPackage = readBehaviorPackage(submission.behaviorPackage);
  const recomputedHash = reviewedObjectHash(
    submission.formulaId,
    submission.packageGeneration,
    behaviorPackage,
  );
  if (submission.reviewedBehaviorObjectSha256 !== recomputedHash) {
    fail("clean-room-behavior-package-object-hash-invalid");
  }
  const contaminatedReview = readReview(
    submission.contaminatedReview,
    submission.formulaId,
    submission.packageGeneration,
    "contaminated",
  );
  const cleanReview = readReview(
    submission.cleanReview,
    submission.formulaId,
    submission.packageGeneration,
    "clean",
  );
  if (
    contaminatedReview &&
    cleanReview &&
    contaminatedReview.reviewerId === cleanReview.reviewerId
  ) {
    fail("clean-room-behavior-package-review-role-conflict");
  }
  return Object.freeze({
    formulaId: submission.formulaId,
    packageGeneration: submission.packageGeneration,
    behaviorPackage,
    reviewedBehaviorObjectSha256: recomputedHash,
    contaminatedReview,
    cleanReview,
  });
}

function reviewStatus(
  review: ReviewReceipt | null,
  expectedHash: string,
): ReviewStatus {
  if (!review) return "missing";
  if (review.reviewedBehaviorObjectSha256 !== expectedHash) return "stale";
  return review.decision === "declare-contract-satisfied"
    ? "declared-satisfied"
    : "blocked";
}

function reviewRationale(
  ...reviews: readonly (ReviewReceipt | null)[]
): readonly string[] {
  return Object.freeze(
    reviews
      .flatMap((review) => [
        ...(review?.reasonCodes ?? []),
        ...(review?.findingCodes ?? []),
      ])
      .filter((reason, index, all) => all.indexOf(reason) === index)
      .sort(),
  );
}

function exactSetBinding(rows: readonly EvidenceProjection[]): string {
  return sha256Canonical(
    rows.map((row) => ({
      formulaId: row.formulaId,
      rightsClass: row.rightsClass,
      sourceOracleStatus: row.sourceOracleStatus,
      rowProjectionHash: row.rowProjectionHash,
    })),
  );
}

function evaluateCore(
  input: unknown,
  requireFrozenCommitment: boolean,
): CleanRoomBehaviorPackageGateResultV2 {
  const root = readPlainRecord(
    input,
    ["evidenceRows", "submissionRows"],
    "clean-room-behavior-package-input-invalid",
  );
  const evidenceRows = readDenseArray(
    root.evidenceRows,
    "clean-room-behavior-package-input-invalid",
    EXPECTED_ROWS,
  ).map(readEvidenceRow);
  const submissionRows = readDenseArray(
    root.submissionRows,
    "clean-room-behavior-package-input-invalid",
    EXPECTED_ROWS,
  ).map(readSubmission);
  const evidenceIds = new Set(evidenceRows.map((row) => row.formulaId));
  const submissionIds = new Set(submissionRows.map((row) => row.formulaId));
  if (
    evidenceRows.length !== EXPECTED_ROWS ||
    evidenceIds.size !== EXPECTED_ROWS ||
    submissionIds.size !== submissionRows.length ||
    submissionRows.some((row) => !evidenceIds.has(row.formulaId)) ||
    evidenceRows.filter((row) => row.rightsClass === "A").length !==
      EXPECTED_CLASS_A ||
    evidenceRows.filter((row) => row.rightsClass === "B").length !==
      EXPECTED_CLASS_B ||
    evidenceRows.filter((row) => row.rightsClass === "C").length !==
      EXPECTED_CLASS_C ||
    evidenceRows.filter(
      (row) =>
        row.sourceOracleStatus ===
        "legacy-compatibility-orbit-oracle-available",
    ).length !== EXPECTED_LEGACY_ORACLES ||
    evidenceRows.filter(
      (row) => row.sourceOracleStatus === "waiver-probe-not-executable-oracle",
    ).length !== EXPECTED_WAIVER_PROBES
  ) {
    fail("clean-room-behavior-package-exact-set-invalid");
  }
  const binding = exactSetBinding(evidenceRows);
  const commitmentStatus: SetCommitmentStatus =
    binding === FROZEN_EXACT_SET_BINDING_SHA256 ? "bound" : "synthetic-unbound";
  if (requireFrozenCommitment && commitmentStatus !== "bound") {
    fail("clean-room-behavior-package-exact-set-commitment-invalid");
  }

  const submissions = new Map(
    submissionRows.map((row) => [row.formulaId, row] as const),
  );
  const rows = Object.freeze(
    evidenceRows.map((evidence) => {
      const submission = submissions.get(evidence.formulaId);
      if (!submission) {
        return Object.freeze({
          formulaId: evidence.formulaId,
          evidenceRowProjectionHash: evidence.rowProjectionHash,
          packageGeneration: null,
          reviewedBehaviorObjectSha256: null,
          submissionStatus: "missing" as const,
          contaminatedReviewStatus: "missing" as const,
          cleanReviewStatus: "missing" as const,
          contractClosure: "blocked" as const,
          syntheticContractSatisfied: false,
          contentEvaluationStatus: "digest-only-not-content-reviewed" as const,
          reviewIdentityStatus: "self-reported-not-verified" as const,
          reviewRationale: Object.freeze([]) as readonly string[],
          contractIssues: Object.freeze([
            "behavior-package-missing",
            "contaminated-review-missing",
            "clean-review-missing",
            ...(commitmentStatus === "bound"
              ? []
              : ["exact-set-commitment-unbound"]),
          ]),
        });
      }
      const oracle = submission.behaviorPackage.executableOracle as JsonObject;
      const expectedOracleStatus =
        evidence.sourceOracleStatus ===
        "legacy-compatibility-orbit-oracle-available"
          ? "executable"
          : "waiver-not-executable";
      if (oracle.status !== expectedOracleStatus) {
        fail("clean-room-behavior-package-oracle-binding-invalid");
      }
      const contaminatedStatus = reviewStatus(
        submission.contaminatedReview,
        submission.reviewedBehaviorObjectSha256,
      );
      const cleanStatus = reviewStatus(
        submission.cleanReview,
        submission.reviewedBehaviorObjectSha256,
      );
      const syntheticSatisfied =
        contaminatedStatus === "declared-satisfied" &&
        cleanStatus === "declared-satisfied";
      const reasons = reviewRationale(
        submission.contaminatedReview,
        submission.cleanReview,
      );
      const contractIssues = [
        contaminatedStatus === "missing" ? "contaminated-review-missing" : null,
        contaminatedStatus === "stale"
          ? "contaminated-review-stale-object-hash"
          : null,
        contaminatedStatus === "blocked" ? "contaminated-review-blocked" : null,
        cleanStatus === "missing" ? "clean-review-missing" : null,
        cleanStatus === "stale" ? "clean-review-stale-object-hash" : null,
        cleanStatus === "blocked" ? "clean-review-blocked" : null,
        commitmentStatus === "bound" ? null : "exact-set-commitment-unbound",
      ].filter((reason): reason is string => reason !== null);
      return Object.freeze({
        formulaId: evidence.formulaId,
        evidenceRowProjectionHash: evidence.rowProjectionHash,
        packageGeneration: submission.packageGeneration,
        reviewedBehaviorObjectSha256: submission.reviewedBehaviorObjectSha256,
        submissionStatus: "present" as const,
        contaminatedReviewStatus: contaminatedStatus,
        cleanReviewStatus: cleanStatus,
        contractClosure: syntheticSatisfied
          ? ("synthetic-contract-satisfied" as const)
          : ("blocked" as const),
        syntheticContractSatisfied: syntheticSatisfied,
        contentEvaluationStatus: "digest-only-not-content-reviewed" as const,
        reviewIdentityStatus: "self-reported-not-verified" as const,
        reviewRationale: reasons,
        contractIssues: Object.freeze(contractIssues),
      });
    }),
  );

  return Object.freeze({
    schema: RESULT_SCHEMA,
    controllerVersion: CLEAN_ROOM_BEHAVIOR_PACKAGE_GATE_VERSION_V2,
    deterministic: true as const,
    exactSetBindingSha256: binding,
    exactSetCommitmentStatus: commitmentStatus,
    summary: Object.freeze({
      total: 452 as const,
      submissions: submissionRows.length,
      missingSubmissions: EXPECTED_ROWS - submissionRows.length,
      contaminatedReviewDeclarationsSatisfied: rows.filter(
        (row) => row.contaminatedReviewStatus === "declared-satisfied",
      ).length,
      cleanReviewDeclarationsSatisfied: rows.filter(
        (row) => row.cleanReviewStatus === "declared-satisfied",
      ).length,
      syntheticContractsSatisfied: rows.filter(
        (row) => row.syntheticContractSatisfied,
      ).length,
    }),
    rows,
  });
}

/** Synthetic contract exercise only. It never binds the frozen exact set. */
export function evaluateSyntheticCleanRoomBehaviorPackageContractV2(
  input: unknown,
): CleanRoomBehaviorPackageGateResultV2 {
  return evaluateCore(input, false);
}

/** Exact QA gate. The ordered evidence-set binding must match the frozen commitment. */
export function evaluateCleanRoomBehaviorPackageGateV2(
  input: unknown,
): CleanRoomBehaviorPackageGateResultV2 {
  return evaluateCore(input, true);
}
