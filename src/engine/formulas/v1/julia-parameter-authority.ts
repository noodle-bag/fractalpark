/** Immutable, evidence-only canonical Julia parameter-binding receipts. */
import { FRM_V1_UNARY_FUNCTION_NAMES } from "../../frm/frm-v1-stdlib";
import type { FormulaParameterSchemaV1 } from "./types";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_PARAMETER_AUTHORITY_SCHEMA_V1 =
  "fractalpark-julia-parameter-authority/v1" as const;
export type JuliaParameterAuthorityModeV1 =
  | "classic-julia"
  | "generalized-two-plane"
  | "undetermined";
export type JuliaParameterAuthorityDecisionV1 =
  | "canonical-authority-recovered"
  | "generalized-held"
  | "undetermined-unknown"
  | "multiple-held"
  | "no-passing-blocked";

type JuliaParameterAuthorityAttemptV1 =
  | Readonly<{
      slotName: string;
      status: "static-rejected";
      reasonCode: string;
    }>
  | Readonly<{
      slotName: string;
      status: "tier1-candidate" | "blocked";
      bindingRevision: string;
      contract: Readonly<{
        binding: Readonly<{ kind: "parameter"; slotName: string }>;
        modeClass: "classic-julia" | "generalized-two-plane" | "unsupported";
        supportLane: "parameter-binding";
        z0Role: "pixel-seed" | "parameter" | "zero" | "none";
        invariant: "parameter-plane-bit-identical" | "semantic-extension";
      }>;
      checks: Readonly<{
        parameterPlaneBitIdentical: boolean;
        deterministic: boolean;
        finiteEvidence: boolean;
        pixelSensitive: boolean;
        constantSensitive: boolean;
      }>;
      reasonCodes: readonly string[];
    }>;

export interface JuliaParameterAuthorityReceiptV1 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly baselineSemanticHash: string;
  readonly baselineParameterSchema: readonly FormulaParameterSchemaV1[];
  readonly candidateSourceRevision: string;
  readonly canonicalSourceDelta: "terminal-newline-only" | "other";
  readonly modeClass: JuliaParameterAuthorityModeV1;
  readonly rights: Readonly<{
    rightsStatus: string;
    publicationDecision: "publish";
  }>;
  readonly invariants: Readonly<{
    safetyEnvelopePass: true;
    irInvariant: true;
    semanticInvariant: true;
    parameterSchemaInvariant: true;
  }>;
  readonly slotResolution: Readonly<{
    status: "unique" | "multiple" | "no-passing";
    selectedSlotName?: string;
    passingSlotNames: readonly string[];
  }>;
  readonly attempts: readonly JuliaParameterAuthorityAttemptV1[];
  readonly authorityDecision: JuliaParameterAuthorityDecisionV1;
}

export interface JuliaParameterAuthorityAssetV1 {
  readonly schema: typeof JULIA_PARAMETER_AUTHORITY_SCHEMA_V1;
  readonly revision: 1;
  readonly evidenceClass: "source-binding-receipts-only";
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 175;
  readonly canonicalSourceDelta: Readonly<{
    "terminal-newline-only": 163;
    other: 12;
  }>;
  readonly authorityDecision: Readonly<
    Record<JuliaParameterAuthorityDecisionV1, number>
  >;
  readonly safetyEnvelopePass: 175;
  readonly irInvariant: 175;
  readonly semanticInvariant: 175;
  readonly parameterSchemaInvariant: 175;
  readonly rows: readonly JuliaParameterAuthorityReceiptV1[];
  readonly contentHash: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SOURCE_BINDING_KEYS = [
  "recoveryContractContentHash",
  "parameterBindingEvidenceContentHash",
  "pixelRoleCensusContentHash",
  "runtimeIndexCanonicalSha256",
  "publicationDecisionsContentHash",
] as const;
const DECISIONS = [
  "canonical-authority-recovered",
  "generalized-held",
  "undetermined-unknown",
  "multiple-held",
  "no-passing-blocked",
] as const;
const CLASSIC_BINDINGS = new Set([
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "fn1",
  "fn2",
  "fn3",
  "fn4",
]);
const FUNCTION_NAMES = new Set<string>(FRM_V1_UNARY_FUNCTION_NAMES);
const CLASSIFIER_REASONS = new Set([
  "binding-none-requires-independent-review",
  "binding-parameter-missing",
  "binding-parameter-not-complex",
  "binding-source-revision-invalid",
  "binding-not-live-in-loop",
  "julia-z0-role-ambiguous",
  "julia-binding-ir-invalid",
]);
const CPU_REASONS = new Set([
  "backend-failed",
  "static-classifier-failed",
  "invalid-probe-grid",
  "source-split-baseline-required",
  "source-split-baseline-invalid",
  "runtime-failed",
  "parameter-plane-drift",
  "nondeterministic",
  "non-finite-evidence",
  "pixel-insensitive",
  "constant-insensitive",
]);

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && "value" in descriptor);
  });
}

function dense(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    [...Array(value.length).keys()].every((index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      return Boolean(descriptor?.enumerable && "value" in descriptor);
    }) &&
    Reflect.ownKeys(value).every(
      (key) =>
        key === "length" ||
        (typeof key === "string" &&
          /^(?:0|[1-9]\d*)$/.test(key) &&
          Number(key) < value.length),
    )
  );
}

function keys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    Reflect.ownKeys(value).length === actual.length &&
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function finitePair(value: unknown): value is readonly [number, number] {
  return (
    dense(value) &&
    value.length === 2 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function parameter(value: unknown): value is FormulaParameterSchemaV1 {
  if (!record(value)) return false;
  const expectedKeys = [
    "name",
    "type",
    "default",
    ...(Object.hasOwn(value, "hardDomain") ? ["hardDomain"] : []),
    ...(Object.hasOwn(value, "classicBinding") ? ["classicBinding"] : []),
  ];
  if (
    !keys(value, expectedKeys) ||
    typeof value.name !== "string" ||
    !IDENTIFIER.test(value.name) ||
    !["real", "complex", "function"].includes(String(value.type)) ||
    (value.hardDomain !== undefined &&
      (!finitePair(value.hardDomain) || value.hardDomain[0] > value.hardDomain[1])) ||
    (value.classicBinding !== undefined &&
      (typeof value.classicBinding !== "string" ||
        !CLASSIC_BINDINGS.has(value.classicBinding)))
  )
    return false;
  if (value.type === "real")
    return typeof value.default === "number" && Number.isFinite(value.default);
  if (value.type === "complex") return finitePair(value.default);
  return (
    value.hardDomain === undefined &&
    typeof value.default === "string" &&
    FUNCTION_NAMES.has(value.default)
  );
}

function attempt(
  value: unknown,
): value is JuliaParameterAuthorityAttemptV1 {
  if (
    !record(value) ||
    typeof value.slotName !== "string" ||
    !IDENTIFIER.test(value.slotName)
  )
    return false;
  if (value.status === "static-rejected")
    return (
      keys(value, ["slotName", "status", "reasonCode"]) &&
      typeof value.reasonCode === "string" &&
      CLASSIFIER_REASONS.has(value.reasonCode)
    );
  if (
    !["tier1-candidate", "blocked"].includes(String(value.status)) ||
    !keys(value, [
      "slotName",
      "status",
      "bindingRevision",
      "contract",
      "checks",
      "reasonCodes",
    ]) ||
    typeof value.bindingRevision !== "string" ||
    !SHA256.test(value.bindingRevision) ||
    !record(value.contract) ||
    !keys(value.contract, [
      "binding",
      "modeClass",
      "supportLane",
      "z0Role",
      "invariant",
    ]) ||
    !record(value.contract.binding) ||
    !keys(value.contract.binding, ["kind", "slotName"]) ||
    value.contract.binding.kind !== "parameter" ||
    value.contract.binding.slotName !== value.slotName ||
    !["classic-julia", "generalized-two-plane", "unsupported"].includes(
      String(value.contract.modeClass),
    ) ||
    value.contract.supportLane !== "parameter-binding" ||
    !["pixel-seed", "parameter", "zero", "none"].includes(
      String(value.contract.z0Role),
    ) ||
    !["parameter-plane-bit-identical", "semantic-extension"].includes(
      String(value.contract.invariant),
    ) ||
    !record(value.checks) ||
    !keys(value.checks, [
      "parameterPlaneBitIdentical",
      "deterministic",
      "finiteEvidence",
      "pixelSensitive",
      "constantSensitive",
    ]) ||
    !Object.values(value.checks).every((entry) => typeof entry === "boolean") ||
    !dense(value.reasonCodes) ||
    !value.reasonCodes.every(
      (entry) => typeof entry === "string" && CPU_REASONS.has(entry),
    ) ||
    new Set(value.reasonCodes).size !== value.reasonCodes.length
  )
    return false;
  const checksPass = Object.values(value.checks).every((entry) => entry === true);
  const candidatePass = checksPass && value.reasonCodes.length === 0;
  return (
    value.contract.invariant ===
      (value.checks.parameterPlaneBitIdentical
        ? "parameter-plane-bit-identical"
        : "semantic-extension") &&
    value.status === (candidatePass ? "tier1-candidate" : "blocked")
  );
}

function freeze(value: unknown): unknown {
  if (dense(value)) return Object.freeze(value.map(freeze));
  if (record(value))
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, freeze(child)]),
      ),
    );
  return value;
}

/** Pure mechanical disposition. It never treats invariants as authorization. */
export function decideJuliaParameterAuthorityV1(
  modeClass: JuliaParameterAuthorityModeV1,
  passingSlotNames: readonly string[],
): JuliaParameterAuthorityDecisionV1 {
  if (passingSlotNames.length > 1) return "multiple-held";
  if (passingSlotNames.length === 0) return "no-passing-blocked";
  return modeClass === "classic-julia"
    ? "canonical-authority-recovered"
    : modeClass === "generalized-two-plane"
      ? "generalized-held"
      : "undetermined-unknown";
}

/** Strictly parses a sealed evidence asset; production checks remain verifier work. */
export function parseJuliaParameterAuthorityAssetV1(
  value: unknown,
):
  | { readonly ok: true; readonly value: JuliaParameterAuthorityAssetV1 }
  | { readonly ok: false; readonly code: "asset-invalid" } {
  const invalid = () =>
    ({ ok: false as const, code: "asset-invalid" as const });
  try {
    if (
      !record(value) ||
      !keys(value, [
        "schema",
        "revision",
        "evidenceClass",
        "sourceBindings",
        "rowCount",
        "canonicalSourceDelta",
        "authorityDecision",
        "safetyEnvelopePass",
        "irInvariant",
        "semanticInvariant",
        "parameterSchemaInvariant",
        "rows",
        "contentHash",
      ]) ||
      value.schema !== JULIA_PARAMETER_AUTHORITY_SCHEMA_V1 ||
      value.revision !== 1 ||
      value.evidenceClass !== "source-binding-receipts-only" ||
      value.rowCount !== 175 ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash) ||
      !record(value.sourceBindings) ||
      !keys(value.sourceBindings, SOURCE_BINDING_KEYS) ||
      !Object.values(value.sourceBindings).every(
        (entry) => typeof entry === "string" && SHA256.test(entry),
      ) ||
      !record(value.canonicalSourceDelta) ||
      !keys(value.canonicalSourceDelta, ["terminal-newline-only", "other"]) ||
      value.canonicalSourceDelta["terminal-newline-only"] !== 163 ||
      value.canonicalSourceDelta.other !== 12 ||
      !record(value.authorityDecision) ||
      !keys(value.authorityDecision, DECISIONS) ||
      value.authorityDecision["canonical-authority-recovered"] !== 43 ||
      value.authorityDecision["generalized-held"] !== 3 ||
      value.authorityDecision["undetermined-unknown"] !== 116 ||
      value.authorityDecision["multiple-held"] !== 4 ||
      value.authorityDecision["no-passing-blocked"] !== 9 ||
      value.safetyEnvelopePass !== 175 ||
      value.irInvariant !== 175 ||
      value.semanticInvariant !== 175 ||
      value.parameterSchemaInvariant !== 175 ||
      !dense(value.rows) ||
      value.rows.length !== 175
    )
      return invalid();

    const seen = new Set<string>();
    const decisions: Record<string, number> = {};
    const deltas: Record<string, number> = {};
    let previousFormulaId = "";
    for (const raw of value.rows) {
      if (
        !record(raw) ||
        !keys(raw, [
          "formulaId",
          "baselineSourceRevision",
          "baselineSemanticHash",
          "baselineParameterSchema",
          "candidateSourceRevision",
          "canonicalSourceDelta",
          "modeClass",
          "rights",
          "invariants",
          "slotResolution",
          "attempts",
          "authorityDecision",
        ]) ||
        typeof raw.formulaId !== "string" ||
        !UUID.test(raw.formulaId) ||
        seen.has(raw.formulaId) ||
        raw.formulaId <= previousFormulaId ||
        typeof raw.baselineSourceRevision !== "string" ||
        !SHA256.test(raw.baselineSourceRevision) ||
        typeof raw.baselineSemanticHash !== "string" ||
        !SHA256.test(raw.baselineSemanticHash) ||
        typeof raw.candidateSourceRevision !== "string" ||
        !SHA256.test(raw.candidateSourceRevision) ||
        !dense(raw.baselineParameterSchema) ||
        !raw.baselineParameterSchema.every(parameter) ||
        new Set(raw.baselineParameterSchema.map((entry) => entry.name)).size !==
          raw.baselineParameterSchema.length ||
        !["terminal-newline-only", "other"].includes(
          String(raw.canonicalSourceDelta),
        ) ||
        !["classic-julia", "generalized-two-plane", "undetermined"].includes(
          String(raw.modeClass),
        ) ||
        !record(raw.rights) ||
        !keys(raw.rights, ["rightsStatus", "publicationDecision"]) ||
        typeof raw.rights.rightsStatus !== "string" ||
        raw.rights.rightsStatus.length === 0 ||
        raw.rights.publicationDecision !== "publish" ||
        !record(raw.invariants) ||
        !keys(raw.invariants, [
          "safetyEnvelopePass",
          "irInvariant",
          "semanticInvariant",
          "parameterSchemaInvariant",
        ]) ||
        !Object.values(raw.invariants).every((entry) => entry === true) ||
        !record(raw.slotResolution) ||
        !dense(raw.slotResolution.passingSlotNames) ||
        !raw.slotResolution.passingSlotNames.every(
          (entry) => typeof entry === "string" && IDENTIFIER.test(entry),
        ) ||
        new Set(raw.slotResolution.passingSlotNames).size !==
          raw.slotResolution.passingSlotNames.length ||
        !dense(raw.attempts) ||
        !raw.attempts.every(attempt) ||
        !DECISIONS.includes(
          raw.authorityDecision as JuliaParameterAuthorityDecisionV1,
        )
      )
        return invalid();

      const complexSlotNames = raw.baselineParameterSchema
        .filter((entry) => entry.type === "complex")
        .map((entry) => entry.name);
      const attemptSlotNames = raw.attempts.map((entry) => entry.slotName);
      const derivedPassingSlotNames = raw.attempts
        .filter((entry) => entry.status === "tier1-candidate")
        .map((entry) => entry.slotName);
      const passingSlotNames = raw.slotResolution
        .passingSlotNames as readonly string[];
      if (
        complexSlotNames.length !== attemptSlotNames.length ||
        complexSlotNames.some(
          (slotName, index) => slotName !== attemptSlotNames[index],
        ) ||
        passingSlotNames.length !== derivedPassingSlotNames.length ||
        passingSlotNames.some(
          (slotName, index) => slotName !== derivedPassingSlotNames[index],
        )
      )
        return invalid();

      const expectedStatus =
        passingSlotNames.length === 1
          ? "unique"
          : passingSlotNames.length > 1
            ? "multiple"
            : "no-passing";
      if (
        raw.slotResolution.status !== expectedStatus ||
        (expectedStatus === "unique"
          ? !keys(raw.slotResolution, [
              "status",
              "selectedSlotName",
              "passingSlotNames",
            ]) || raw.slotResolution.selectedSlotName !== passingSlotNames[0]
          : !keys(raw.slotResolution, ["status", "passingSlotNames"])) ||
        raw.authorityDecision !==
          decideJuliaParameterAuthorityV1(
            raw.modeClass as JuliaParameterAuthorityModeV1,
            passingSlotNames,
          )
      )
        return invalid();

      previousFormulaId = raw.formulaId;
      seen.add(raw.formulaId);
      decisions[String(raw.authorityDecision)] =
        (decisions[String(raw.authorityDecision)] ?? 0) + 1;
      deltas[String(raw.canonicalSourceDelta)] =
        (deltas[String(raw.canonicalSourceDelta)] ?? 0) + 1;
    }
    if (
      value.authorityDecision["canonical-authority-recovered"] !==
        (decisions["canonical-authority-recovered"] ?? 0) ||
      value.authorityDecision["generalized-held"] !==
        (decisions["generalized-held"] ?? 0) ||
      value.authorityDecision["undetermined-unknown"] !==
        (decisions["undetermined-unknown"] ?? 0) ||
      value.authorityDecision["multiple-held"] !==
        (decisions["multiple-held"] ?? 0) ||
      value.authorityDecision["no-passing-blocked"] !==
        (decisions["no-passing-blocked"] ?? 0) ||
      value.canonicalSourceDelta["terminal-newline-only"] !==
        (deltas["terminal-newline-only"] ?? 0) ||
      value.canonicalSourceDelta.other !== (deltas.other ?? 0)
    )
      return invalid();

    const unsigned = { ...value };
    delete unsigned.contentHash;
    if (
      sha256HexSyncV1(canonicalJsonV1(unsigned, 10_000_000)) !==
      value.contentHash
    )
      return invalid();
    return {
      ok: true,
      value: freeze(value) as JuliaParameterAuthorityAssetV1,
    };
  } catch {
    return invalid();
  }
}
