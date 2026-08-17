import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  evaluateCleanRoomBehaviorPackageGateV2,
  evaluateSyntheticCleanRoomBehaviorPackageContractV2,
} from "@/engine/formulas/v1/clean-room-behavior-package-gate";
import {
  verifyCleanRoomBehaviorPackageGateV2,
  verifySyntheticCleanRoomBehaviorPackageContractV2,
} from "@/engine/formulas/v1/clean-room-behavior-package-gate-verifier";

const REVIEW_CODES = [
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
] as const;
const HASH = "a".repeat(64);

type TestReview = {
  formulaId: string;
  packageGeneration: number;
  reviewerId: string;
  reviewerRole: string;
  allowedInputSurface: string;
  reviewedBehaviorObjectSha256: string;
  decision: "declare-contract-satisfied" | "block";
  reasonCodes: string[];
  findingCodes: string[];
};
type TestSubmission = {
  formulaId: string;
  packageGeneration: number;
  behaviorPackage: Record<string, unknown>;
  reviewedBehaviorObjectSha256: string;
  contaminatedReview: TestReview | null;
  cleanReview: TestReview | null;
};

function formulaId(index: number): string {
  const suffix = index.toString(16).padStart(12, "0");
  return `00000000-0000-5000-8000-${suffix}`;
}

function evidenceRows() {
  return Array.from({ length: 452 }, (_, index) => ({
    formulaId: formulaId(index),
    rightsClass: index === 0 ? "A" : index <= 73 ? "B" : "C",
    sourceOracleStatus:
      index < 443
        ? "legacy-compatibility-orbit-oracle-available"
        : "waiver-probe-not-executable-oracle",
    rowProjectionHash: index.toString(16).padStart(64, "0"),
  }));
}

function receipt(schema: string, countKey: string, count = 1) {
  return { schema, contentSha256: HASH, [countKey]: count };
}

function behaviorEnvelope(index = 0): Record<string, unknown> {
  return {
    behaviorSchemaVersion: 1,
    exactInputKeySet: receipt(
      "clean-room-exact-input-key-set/v1",
      "entryCount",
      2,
    ),
    parameterGrammar: receipt(
      "clean-room-parameter-grammar/v1",
      "assertionCount",
    ),
    parameterDomainsAndDefaults: receipt(
      "clean-room-parameter-domains-defaults/v1",
      "assertionCount",
    ),
    functionBinding: receipt(
      "clean-room-function-binding/v1",
      "assertionCount",
    ),
    initialization: receipt("clean-room-initialization/v1", "assertionCount"),
    recurrence: receipt("clean-room-recurrence/v1", "assertionCount"),
    terminationProtocol: receipt(
      "clean-room-termination-protocol/v1",
      "assertionCount",
    ),
    zeroIterationContract: receipt(
      "clean-room-zero-iteration-contract/v1",
      "assertionCount",
    ),
    eventAndCounterContract: receipt(
      "clean-room-event-counter-contract/v1",
      "assertionCount",
    ),
    nonFiniteContract: receipt(
      "clean-room-non-finite-contract/v1",
      "assertionCount",
    ),
    resourceExhaustionContract: receipt(
      "clean-room-resource-exhaustion-contract/v1",
      "assertionCount",
    ),
    independentBehaviorAnchor: receipt(
      "clean-room-independent-behavior-anchor/v1",
      "assertionCount",
    ),
    comparisonContract: receipt(
      "clean-room-comparison-contract/v1",
      "assertionCount",
    ),
    templateBinding: receipt(
      "clean-room-template-binding/v1",
      "assertionCount",
    ),
    rowVariationBinding: receipt(
      "clean-room-row-variation-binding/v1",
      "assertionCount",
    ),
    fieldProvenance: receipt("clean-room-field-provenance/v1", "fieldCount"),
    executableOracle: {
      schema: "clean-room-executable-oracle/v1",
      contentSha256: HASH,
      status: index < 443 ? "executable" : "waiver-not-executable",
      caseCount: index < 443 ? 1 : 0,
    },
    negativeTests: receipt("clean-room-negative-tests/v1", "caseCount"),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function objectHash(value: TestSubmission): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        formulaId: value.formulaId,
        packageGeneration: value.packageGeneration,
        behaviorPackage: value.behaviorPackage,
      }),
    )
    .digest("hex");
}

function review(
  formula: string,
  side: "contaminated" | "clean",
  hash: string,
  decision: TestReview["decision"] = "declare-contract-satisfied",
): TestReview {
  return {
    formulaId: formula,
    packageGeneration: 1,
    reviewerId: `${side}-reviewer-fixture`,
    reviewerRole: `${side}-reviewer`,
    allowedInputSurface:
      side === "contaminated"
        ? "restricted-evidence-and-frozen-clean-envelope"
        : "frozen-clean-envelope-only",
    reviewedBehaviorObjectSha256: hash,
    decision,
    reasonCodes: decision === "block" ? ["incomplete-contract"] : [],
    findingCodes: [],
  };
}

function submission(
  index = 0,
  decision: TestReview["decision"] = "declare-contract-satisfied",
  suppliedHash?: string,
): TestSubmission {
  const value: TestSubmission = {
    formulaId: formulaId(index),
    packageGeneration: 1,
    behaviorPackage: behaviorEnvelope(index),
    reviewedBehaviorObjectSha256: "",
    contaminatedReview: null,
    cleanReview: null,
  };
  const hash = suppliedHash ?? objectHash(value);
  value.reviewedBehaviorObjectSha256 = hash;
  value.contaminatedReview = review(
    value.formulaId,
    "contaminated",
    hash,
    decision,
  );
  value.cleanReview = review(value.formulaId, "clean", hash, decision);
  return value;
}

function syntheticInput(submissions: readonly TestSubmission[] = []) {
  return { evidenceRows: evidenceRows(), submissionRows: [...submissions] };
}

describe("clean-room behavior-package gate", () => {
  it("keeps the public synthetic zero state explicitly unbound", () => {
    const input = syntheticInput();
    const result = evaluateSyntheticCleanRoomBehaviorPackageContractV2(input);

    expect(result.exactSetCommitmentStatus).toBe("synthetic-unbound");
    expect(result.summary).toEqual({
      total: 452,
      submissions: 0,
      missingSubmissions: 452,
      contaminatedReviewDeclarationsSatisfied: 0,
      cleanReviewDeclarationsSatisfied: 0,
      syntheticContractsSatisfied: 0,
    });
    expect(result.rows).toHaveLength(452);
    expect(
      result.rows.every((row) =>
        row.contractIssues.includes("exact-set-commitment-unbound"),
      ),
    ).toBe(true);
    expect(
      verifySyntheticCleanRoomBehaviorPackageContractV2(input, result),
    ).toEqual({ total: 452, syntheticContractsSatisfied: 0 });
  });

  it("rejects a fabricated 452-row set at the exact commitment boundary", () => {
    const input = syntheticInput();
    expect(() => evaluateCleanRoomBehaviorPackageGateV2(input)).toThrow(
      "clean-room-behavior-package-exact-set-commitment-invalid",
    );
    expect(() =>
      verifyCleanRoomBehaviorPackageGateV2(
        input,
        evaluateSyntheticCleanRoomBehaviorPackageContractV2(input),
      ),
    ).toThrow("clean-room-behavior-package-independent-verification-invalid");
  });

  it("keeps both implementations aligned for all 452 typed envelopes", () => {
    const submissions = Array.from({ length: 452 }, (_, index) => {
      const value = submission(index);
      if (!value.contaminatedReview || !value.cleanReview) {
        throw new Error("test-review-missing");
      }
      value.contaminatedReview.reasonCodes = [...REVIEW_CODES];
      value.contaminatedReview.findingCodes = [...REVIEW_CODES];
      value.cleanReview.reasonCodes = [...REVIEW_CODES];
      value.cleanReview.findingCodes = [...REVIEW_CODES];
      return value;
    });
    const input = syntheticInput(submissions);
    const result = evaluateSyntheticCleanRoomBehaviorPackageContractV2(input);

    expect(result.summary).toMatchObject({
      submissions: 452,
      missingSubmissions: 0,
      syntheticContractsSatisfied: 452,
    });
    expect(
      verifySyntheticCleanRoomBehaviorPackageContractV2(input, result),
    ).toEqual({ total: 452, syntheticContractsSatisfied: 452 });
  });

  it("preserves only the mechanical allowlisted code union", () => {
    const candidate = submission();
    if (!candidate.contaminatedReview || !candidate.cleanReview) {
      throw new Error("test-review-missing");
    }
    candidate.contaminatedReview.reasonCodes = ["bounded-scope"];
    candidate.contaminatedReview.findingCodes = ["shared-condition"];
    candidate.cleanReview.reasonCodes = ["clean-anchor-checked"];
    candidate.cleanReview.findingCodes = ["shared-condition"];
    const input = syntheticInput([candidate]);
    const result = evaluateSyntheticCleanRoomBehaviorPackageContractV2(input);

    expect(result.rows[0]).toMatchObject({
      contractClosure: "synthetic-contract-satisfied",
      syntheticContractSatisfied: true,
      contentEvaluationStatus: "digest-only-not-content-reviewed",
      reviewIdentityStatus: "self-reported-not-verified",
      reviewRationale: [
        "bounded-scope",
        "clean-anchor-checked",
        "shared-condition",
      ],
    });
  });

  it("blocks one-sided, rejected, and stale declarations", () => {
    const oneSided = submission();
    oneSided.cleanReview = null;
    const rejected = submission(1, "block");
    const stale = submission(2);
    if (!stale.cleanReview) throw new Error("test-review-missing");
    stale.cleanReview.reviewedBehaviorObjectSha256 = "b".repeat(64);

    const result = evaluateSyntheticCleanRoomBehaviorPackageContractV2(
      syntheticInput([oneSided, rejected, stale]),
    );
    expect(result.rows[0]?.cleanReviewStatus).toBe("missing");
    expect(result.rows[1]?.contractClosure).toBe("blocked");
    expect(result.rows[2]?.cleanReviewStatus).toBe("stale");
    expect(result.summary.syntheticContractsSatisfied).toBe(0);
  });

  it("rejects incomplete dimensions and oracle/evidence mismatch", () => {
    const incomplete = submission();
    (incomplete.behaviorPackage.parameterGrammar as Record<string, unknown>)[
      "assertionCount"
    ] = 0;
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([incomplete]),
      ),
    ).toThrow("clean-room-behavior-package-dimension-invalid");

    const mismatch = submission();
    mismatch.behaviorPackage.executableOracle = {
      schema: "clean-room-executable-oracle/v1",
      contentSha256: HASH,
      status: "waiver-not-executable",
      caseCount: 0,
    };
    const mismatchHash = objectHash(mismatch);
    mismatch.reviewedBehaviorObjectSha256 = mismatchHash;
    if (!mismatch.contaminatedReview || !mismatch.cleanReview) {
      throw new Error("test-review-missing");
    }
    mismatch.contaminatedReview.reviewedBehaviorObjectSha256 = mismatchHash;
    mismatch.cleanReview.reviewedBehaviorObjectSha256 = mismatchHash;
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([mismatch]),
      ),
    ).toThrow("clean-room-behavior-package-oracle-binding-invalid");

    const negativeZero = submission(443);
    (
      negativeZero.behaviorPackage.executableOracle as Record<string, unknown>
    ).caseCount = -0;
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([negativeZero]),
      ),
    ).toThrow("clean-room-behavior-package-dimension-invalid");
  });

  it("rejects object-hash substitution, role overlap, and free review text", () => {
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([submission(0, undefined, "b".repeat(64))]),
      ),
    ).toThrow("clean-room-behavior-package-object-hash-invalid");

    const overlap = submission();
    if (!overlap.contaminatedReview || !overlap.cleanReview) {
      throw new Error("test-review-missing");
    }
    overlap.cleanReview.reviewerId = overlap.contaminatedReview.reviewerId;
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([overlap]),
      ),
    ).toThrow("clean-room-behavior-package-review-role-conflict");

    const leaky = submission();
    if (!leaky.cleanReview) throw new Error("test-review-missing");
    leaky.cleanReview.findingCodes = ["private source fragment"];
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([leaky]),
      ),
    ).toThrow("clean-room-behavior-package-review-invalid");
  });

  it("rejects hostile shapes and independently detects output tampering", () => {
    const accessor = submission();
    Object.defineProperty(accessor.behaviorPackage, "recurrence", {
      enumerable: true,
      get: () => receipt("clean-room-recurrence/v1", "assertionCount"),
    });
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([accessor]),
      ),
    ).toThrow("clean-room-behavior-package-input-invalid");

    const prototypeKey = submission();
    Object.defineProperty(prototypeKey.behaviorPackage, "__proto__", {
      value: { hidden: true },
      enumerable: true,
    });
    expect(() =>
      evaluateSyntheticCleanRoomBehaviorPackageContractV2(
        syntheticInput([prototypeKey]),
      ),
    ).toThrow("clean-room-behavior-package-input-invalid");

    const input = syntheticInput([submission()]);
    const result = evaluateSyntheticCleanRoomBehaviorPackageContractV2(input);
    const tampered = structuredClone(result) as unknown as {
      summary: { syntheticContractsSatisfied: number };
    };
    tampered.summary.syntheticContractsSatisfied = 2;
    expect(() =>
      verifySyntheticCleanRoomBehaviorPackageContractV2(input, tampered),
    ).toThrow("clean-room-behavior-package-independent-verification-invalid");
  });
});
