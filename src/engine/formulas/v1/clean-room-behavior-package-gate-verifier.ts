import { createHash } from "node:crypto";

const ERROR_CODE =
  "clean-room-behavior-package-independent-verification-invalid";
const RESULT_SCHEMA =
  "fractalpark-formula-library-clean-room-behavior-package-gate/v1";
const CONTROLLER_VERSION = "formula-library-clean-room-behavior-package-gate/1";
const FROZEN_EXACT_SET_BINDING_SHA256 =
  "cc2fdecb4dd210ebb0d55d212ea973d65fb2c443b687cd8f137c8b98a6402243";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const REVIEWER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
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
]);
const REVIEW_CODES = new Set([
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
const DIMENSIONS = Object.freeze({
  parameterGrammar: ["clean-room-parameter-grammar/v1", "assertionCount"],
  parameterDomainsAndDefaults: [
    "clean-room-parameter-domains-defaults/v1",
    "assertionCount",
  ],
  functionBinding: ["clean-room-function-binding/v1", "assertionCount"],
  initialization: ["clean-room-initialization/v1", "assertionCount"],
  recurrence: ["clean-room-recurrence/v1", "assertionCount"],
  terminationProtocol: [
    "clean-room-termination-protocol/v1",
    "assertionCount",
  ],
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
const BEHAVIOR_KEYS = Object.freeze([
  "behaviorSchemaVersion",
  "exactInputKeySet",
  ...Object.keys(DIMENSIONS),
  "executableOracle",
  "negativeTests",
]);
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
]);

type UnknownRecord = Record<string, unknown>;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

type Evidence = Readonly<{
  formulaId: string;
  rightsClass: "A" | "B" | "C";
  sourceOracleStatus:
    | "legacy-compatibility-orbit-oracle-available"
    | "waiver-probe-not-executable-oracle";
  rowProjectionHash: string;
}>;
type Review = Readonly<{
  reviewerId: string;
  reviewedBehaviorObjectSha256: string;
  decision: "declare-candidate-contract-satisfied" | "block";
  reasonCodes: readonly string[];
  findingCodes: readonly string[];
}>;
type Submission = Readonly<{
  formulaId: string;
  packageGeneration: number;
  behaviorPackage: Readonly<Record<string, JsonValue>>;
  reviewedBehaviorObjectSha256: string;
  contaminatedReview: Review | null;
  cleanReview: Review | null;
}>;

function fail(): never {
  throw new Error(ERROR_CODE);
}

function record(value: unknown, expectedKeys: readonly string[]): Readonly<UnknownRecord> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      fail();
    }
    const keys = Reflect.ownKeys(value);
    const expected = [...expectedKeys].sort();
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== "string") ||
      (keys as string[]).sort().some((key, index) => key !== expected[index])
    ) {
      fail();
    }
    const copy: UnknownRecord = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch (error) {
    if (error instanceof Error && error.message === ERROR_CODE) throw error;
    fail();
  }
}

function dense(value: unknown, maxLength: number): readonly unknown[] {
  try {
    if (
      !Array.isArray(value) ||
      value.length > maxLength ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      fail();
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1 ||
      keys.some((key) => typeof key !== "string") ||
      !keys.includes("length")
    ) {
      fail();
    }
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch (error) {
    if (error instanceof Error && error.message === ERROR_CODE) throw error;
    fail();
  }
}

function safeJson(
  value: unknown,
  depth = 0,
  state = { nodes: 0, characters: 0 },
): JsonValue {
  if (depth > 8 || state.nodes >= 50_000) fail();
  state.nodes += 1;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail();
    return value;
  }
  if (typeof value === "string") {
    state.characters += value.length;
    if (value.length > 65_536 || state.characters > 1_000_000) fail();
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(dense(value, 50_000).map((item) => safeJson(item, depth + 1, state)));
  }
  const source = value as object;
  if (Object.getPrototypeOf(source) !== Object.prototype) fail();
  const keys = Reflect.ownKeys(source);
  if (
    keys.length > 50_000 - state.nodes ||
    keys.some((key) =>
      typeof key !== "string" ||
      ["__proto__", "constructor", "prototype"].includes(key),
    )
  ) {
    fail();
  }
  const result: Record<string, JsonValue> = {};
  for (const key of (keys as string[]).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
    result[key] = safeJson(descriptor.value, depth + 1, state);
  }
  return Object.freeze(result);
}

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key]!)}`)
    .join(",")}}`;
}

function hash(value: JsonValue): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function codeList(value: unknown): readonly string[] {
  const values = dense(value, 16);
  if (values.some((item) => typeof item !== "string" || !REVIEW_CODES.has(item))) {
    fail();
  }
  return Object.freeze(values as string[]);
}

function evidence(value: unknown): Evidence {
  const row = record(value, [
    "formulaId",
    "sourceSet",
    "rightsClass",
    "rightsProvenanceClassificationBound",
    "privateProvenanceEvidenceBound",
    "sourceOracleStatus",
    "sourceOracleEvidenceBound",
    "workInputStatus",
    "technicalStatus",
    "technicalFailureReason",
    "provisionalCandidate",
    "admissionStatus",
    "blockers",
    "rowProjectionHash",
  ]);
  const blockers = dense(row.blockers, BLOCKERS.length);
  if (
    typeof row.formulaId !== "string" ||
    !UUID.test(row.formulaId) ||
    row.sourceSet !== "F588" ||
    !["A", "B", "C"].includes(String(row.rightsClass)) ||
    row.rightsProvenanceClassificationBound !== true ||
    row.privateProvenanceEvidenceBound !== true ||
    ![
      "legacy-compatibility-orbit-oracle-available",
      "waiver-probe-not-executable-oracle",
    ].includes(String(row.sourceOracleStatus)) ||
    row.sourceOracleEvidenceBound !== true ||
    row.workInputStatus !== "blocked-missing-approved-nonreversible-behavior-spec" ||
    row.technicalStatus !== "failed" ||
    row.technicalFailureReason !== "missing-input" ||
    row.provisionalCandidate !== false ||
    row.admissionStatus !== "blocked" ||
    blockers.length !== BLOCKERS.length ||
    blockers.some((item, index) => item !== BLOCKERS[index]) ||
    typeof row.rowProjectionHash !== "string" ||
    !SHA256.test(row.rowProjectionHash)
  ) {
    fail();
  }
  return Object.freeze({
    formulaId: row.formulaId,
    rightsClass: row.rightsClass as "A" | "B" | "C",
    sourceOracleStatus: row.sourceOracleStatus as Evidence["sourceOracleStatus"],
    rowProjectionHash: row.rowProjectionHash,
  });
}

function digestReceipt(
  value: unknown,
  expectedSchema: string,
  countKey: string,
): Readonly<Record<string, JsonValue>> {
  const item = record(value, ["schema", "contentSha256", countKey]);
  if (
    item.schema !== expectedSchema ||
    typeof item.contentSha256 !== "string" ||
    !SHA256.test(item.contentSha256) ||
    typeof item[countKey] !== "number" ||
    !Number.isSafeInteger(item[countKey]) ||
    (item[countKey] as number) < 1 ||
    (item[countKey] as number) > 1_000_000
  ) {
    fail();
  }
  return Object.freeze({
    schema: expectedSchema,
    contentSha256: item.contentSha256,
    [countKey]: item[countKey] as number,
  });
}

function oracleReceipt(value: unknown): Readonly<Record<string, JsonValue>> {
  const item = record(value, ["schema", "contentSha256", "status", "caseCount"]);
  if (
    item.schema !== "clean-room-executable-oracle/v1" ||
    typeof item.contentSha256 !== "string" ||
    !SHA256.test(item.contentSha256) ||
    !["executable", "waiver-not-executable"].includes(String(item.status)) ||
    typeof item.caseCount !== "number" ||
    !Number.isSafeInteger(item.caseCount) ||
    Object.is(item.caseCount, -0) ||
    (item.status === "executable" &&
      (item.caseCount < 1 || item.caseCount > 1_000_000)) ||
    (item.status === "waiver-not-executable" && item.caseCount !== 0)
  ) {
    fail();
  }
  return Object.freeze({
    schema: item.schema,
    contentSha256: item.contentSha256,
    status: item.status,
    caseCount: item.caseCount,
  }) as Readonly<Record<string, JsonValue>>;
}

function behaviorEnvelope(value: unknown): Readonly<Record<string, JsonValue>> {
  const source = record(value, BEHAVIOR_KEYS);
  if (source.behaviorSchemaVersion !== 1) fail();
  const result: Record<string, JsonValue> = {
    behaviorSchemaVersion: 1,
    exactInputKeySet: digestReceipt(
      source.exactInputKeySet,
      "clean-room-exact-input-key-set/v1",
      "entryCount",
    ),
  };
  for (const [field, [schema, countKey]] of Object.entries(DIMENSIONS)) {
    result[field] = digestReceipt(source[field], schema, countKey);
  }
  result.executableOracle = oracleReceipt(source.executableOracle);
  result.negativeTests = digestReceipt(
    source.negativeTests,
    "clean-room-negative-tests/v1",
    "caseCount",
  );
  return Object.freeze(result);
}

function review(
  value: unknown,
  formulaId: string,
  generation: number,
  side: "contaminated" | "clean",
): Review | null {
  if (value === null) return null;
  const item = record(value, REVIEW_KEYS);
  const reasons = codeList(item.reasonCodes);
  const findings = codeList(item.findingCodes);
  const role = `${side}-reviewer`;
  const surface =
    side === "contaminated"
      ? "restricted-evidence-and-frozen-clean-envelope"
      : "frozen-clean-envelope-only";
  if (
    item.formulaId !== formulaId ||
    item.packageGeneration !== generation ||
    typeof item.reviewerId !== "string" ||
    !REVIEWER_ID.test(item.reviewerId) ||
    item.reviewerRole !== role ||
    item.allowedInputSurface !== surface ||
    typeof item.reviewedBehaviorObjectSha256 !== "string" ||
    !SHA256.test(item.reviewedBehaviorObjectSha256) ||
    !["declare-candidate-contract-satisfied", "block"].includes(
      String(item.decision),
    ) ||
    (item.decision === "block" && reasons.length === 0 && findings.length === 0)
  ) {
    fail();
  }
  return Object.freeze({
    reviewerId: item.reviewerId,
    reviewedBehaviorObjectSha256: item.reviewedBehaviorObjectSha256,
    decision: item.decision as Review["decision"],
    reasonCodes: reasons,
    findingCodes: findings,
  });
}

function submission(value: unknown): Submission {
  const item = record(value, [
    "formulaId",
    "packageGeneration",
    "behaviorPackage",
    "reviewedBehaviorObjectSha256",
    "contaminatedReview",
    "cleanReview",
  ]);
  if (
    typeof item.formulaId !== "string" ||
    !UUID.test(item.formulaId) ||
    typeof item.packageGeneration !== "number" ||
    !Number.isSafeInteger(item.packageGeneration) ||
    item.packageGeneration < 1 ||
    typeof item.reviewedBehaviorObjectSha256 !== "string" ||
    !SHA256.test(item.reviewedBehaviorObjectSha256)
  ) {
    fail();
  }
  const behaviorPackage = behaviorEnvelope(item.behaviorPackage);
  const objectHash = hash({
    formulaId: item.formulaId,
    packageGeneration: item.packageGeneration,
    behaviorPackage,
  });
  if (item.reviewedBehaviorObjectSha256 !== objectHash) fail();
  const contaminated = review(
    item.contaminatedReview,
    item.formulaId,
    item.packageGeneration,
    "contaminated",
  );
  const clean = review(
    item.cleanReview,
    item.formulaId,
    item.packageGeneration,
    "clean",
  );
  if (contaminated && clean && contaminated.reviewerId === clean.reviewerId) fail();
  return Object.freeze({
    formulaId: item.formulaId,
    packageGeneration: item.packageGeneration,
    behaviorPackage,
    reviewedBehaviorObjectSha256: objectHash,
    contaminatedReview: contaminated,
    cleanReview: clean,
  });
}

function status(item: Review | null, expectedHash: string): string {
  if (!item) return "missing";
  if (item.reviewedBehaviorObjectSha256 !== expectedHash) return "stale";
  return item.decision === "declare-candidate-contract-satisfied"
    ? "declared-satisfied"
    : "blocked";
}

function unionCodes(...items: readonly (Review | null)[]): readonly string[] {
  return Object.freeze(
    items
      .flatMap((item) => [
        ...(item?.reasonCodes ?? []),
        ...(item?.findingCodes ?? []),
      ])
      .filter((code, index, all) => all.indexOf(code) === index)
      .sort(),
  );
}

function verifyInternal(
  input: unknown,
  output: unknown,
  requireAuthority: boolean,
): Readonly<{ total: 452; syntheticCandidateContractsSatisfied: number }> {
  const root = record(input, ["evidenceRows", "submissionRows"]);
  const evidenceRows = dense(root.evidenceRows, 452).map(evidence);
  const submissions = dense(root.submissionRows, 452).map(submission);
  const evidenceIds = new Set(evidenceRows.map((row) => row.formulaId));
  const submissionIds = new Set(submissions.map((row) => row.formulaId));
  if (
    evidenceRows.length !== 452 ||
    evidenceIds.size !== 452 ||
    submissionIds.size !== submissions.length ||
    submissions.some((row) => !evidenceIds.has(row.formulaId)) ||
    evidenceRows.filter((row) => row.rightsClass === "A").length !== 1 ||
    evidenceRows.filter((row) => row.rightsClass === "B").length !== 73 ||
    evidenceRows.filter((row) => row.rightsClass === "C").length !== 378 ||
    evidenceRows.filter(
      (row) =>
        row.sourceOracleStatus ===
        "legacy-compatibility-orbit-oracle-available",
    ).length !== 443 ||
    evidenceRows.filter(
      (row) => row.sourceOracleStatus === "waiver-probe-not-executable-oracle",
    ).length !== 9
  ) {
    fail();
  }
  const setBinding = hash(
    evidenceRows.map((row) => ({
      formulaId: row.formulaId,
      rowProjectionHash: row.rowProjectionHash,
    })),
  );
  const authorityStatus =
    setBinding === FROZEN_EXACT_SET_BINDING_SHA256 ? "bound" : "synthetic-unbound";
  if (requireAuthority && authorityStatus !== "bound") fail();

  const byId = new Map(submissions.map((item) => [item.formulaId, item] as const));
  const rows = evidenceRows.map((evidenceRow) => {
    const item = byId.get(evidenceRow.formulaId);
    if (!item) {
      return {
        formulaId: evidenceRow.formulaId,
        evidenceRowProjectionHash: evidenceRow.rowProjectionHash,
        packageGeneration: null,
        reviewedBehaviorObjectSha256: null,
        submissionStatus: "missing",
        contaminatedReviewStatus: "missing",
        cleanReviewStatus: "missing",
        strictCandidateClosure: "blocked",
        syntheticCandidateContractSatisfied: false,
        behaviorPackageCandidateApproved: false,
        behaviorPackageAdmitted: false,
        behaviorPackageContentAttestationStatus: "digest-only-unverified",
        roleAttestationStatus: "unverified-synthetic",
        reviewRationale: [],
        implementationAuthorized: false,
        blockReasons: [
          "behavior-package-missing",
          "contaminated-review-missing",
          "clean-review-missing",
          ...(authorityStatus === "bound" ? [] : ["exact-set-authority-unbound"]),
          "behavior-package-content-attestation-not-in-scope",
          "behavior-package-admission-not-in-scope",
          "implementation-authorization-not-in-scope",
        ],
      };
    }
    const oracle = item.behaviorPackage.executableOracle as JsonObject;
    const expectedOracle =
      evidenceRow.sourceOracleStatus ===
      "legacy-compatibility-orbit-oracle-available"
        ? "executable"
        : "waiver-not-executable";
    if (oracle.status !== expectedOracle) fail();
    const contaminatedStatus = status(
      item.contaminatedReview,
      item.reviewedBehaviorObjectSha256,
    );
    const cleanStatus = status(item.cleanReview, item.reviewedBehaviorObjectSha256);
    const satisfied =
      contaminatedStatus === "declared-satisfied" &&
      cleanStatus === "declared-satisfied";
    return {
      formulaId: evidenceRow.formulaId,
      evidenceRowProjectionHash: evidenceRow.rowProjectionHash,
      packageGeneration: item.packageGeneration,
      reviewedBehaviorObjectSha256: item.reviewedBehaviorObjectSha256,
      submissionStatus: "present",
      contaminatedReviewStatus: contaminatedStatus,
      cleanReviewStatus: cleanStatus,
      strictCandidateClosure: satisfied ? "synthetic-contract-satisfied" : "blocked",
      syntheticCandidateContractSatisfied: satisfied,
      behaviorPackageCandidateApproved: false,
      behaviorPackageAdmitted: false,
      behaviorPackageContentAttestationStatus: "digest-only-unverified",
      roleAttestationStatus: "unverified-synthetic",
      reviewRationale: unionCodes(item.contaminatedReview, item.cleanReview),
      implementationAuthorized: false,
      blockReasons: [
        contaminatedStatus === "missing" ? "contaminated-review-missing" : null,
        contaminatedStatus === "stale"
          ? "contaminated-review-stale-object-hash"
          : null,
        contaminatedStatus === "blocked" ? "contaminated-review-blocked" : null,
        cleanStatus === "missing" ? "clean-review-missing" : null,
        cleanStatus === "stale" ? "clean-review-stale-object-hash" : null,
        cleanStatus === "blocked" ? "clean-review-blocked" : null,
        authorityStatus === "bound" ? null : "exact-set-authority-unbound",
        "behavior-package-content-attestation-not-in-scope",
        "behavior-package-admission-not-in-scope",
        "implementation-authorization-not-in-scope",
      ].filter((reason): reason is string => reason !== null),
    };
  });
  const syntheticCandidateContractsSatisfied = rows.filter(
    (row) => row.syntheticCandidateContractSatisfied,
  ).length;
  const expected: JsonValue = {
    schema: RESULT_SCHEMA,
    controllerVersion: CONTROLLER_VERSION,
    deterministic: true,
    exactSetBindingSha256: setBinding,
    exactSetAuthorityStatus: authorityStatus,
    summary: {
      total: 452,
      submissions: submissions.length,
      missingSubmissions: 452 - submissions.length,
      contaminatedReviewDeclarationsSatisfied: rows.filter(
        (row) => row.contaminatedReviewStatus === "declared-satisfied",
      ).length,
      cleanReviewDeclarationsSatisfied: rows.filter(
        (row) => row.cleanReviewStatus === "declared-satisfied",
      ).length,
      syntheticCandidateContractsSatisfied,
      behaviorPackageCandidatesApproved: 0,
      behaviorPackagesAdmitted: 0,
      behaviorPackagesBlocked: 452,
      implementationAuthorized: 0,
    },
    rows,
    candidateAdmissions: 0,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    implementationProjectionsWritten: 0,
    canonicalSourcesWritten: 0,
    profilesWritten: 0,
    previewsWritten: 0,
    publicAssetsWritten: 0,
  };
  if (canonical(safeJson(output)) !== canonical(expected)) fail();
  return Object.freeze({
    total: 452 as const,
    syntheticCandidateContractsSatisfied,
  });
}

export function verifySyntheticCleanRoomBehaviorPackageContractV1(
  input: unknown,
  output: unknown,
): Readonly<{ total: 452; syntheticCandidateContractsSatisfied: number }> {
  try {
    return verifyInternal(input, output, false);
  } catch {
    fail();
  }
}

export function verifyCleanRoomBehaviorPackageGateV1(
  input: unknown,
  output: unknown,
): Readonly<{ total: 452; syntheticCandidateContractsSatisfied: number }> {
  try {
    return verifyInternal(input, output, true);
  } catch {
    fail();
  }
}
