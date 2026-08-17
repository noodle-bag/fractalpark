import decisionAsset from "../../../../resources/formula-library/v1/publication-decisions.json";
import { isStandardFormulaIdV1 } from "./identity";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";
import {
  STANDARD_MANIFEST_INDEX_V1,
  type StandardManifestIndexV1,
} from "./standard-manifest";
import type { FormulaIdV1 } from "./types";

export const PUBLICATION_DECISIONS_SCHEMA_V1 =
  "fractalpark-formula-library-publication-decisions/v1";
export const PUBLICATION_DECISIONS_VERSION_V1 = 1;
export const PUBLICATION_DECISION_FORMULA_COUNT_V1 = 677;
export const IMPLEMENTATION_CANDIDATE_CEILING_V1 = 604;
export const GPL_FIXED_HOLD_REASON_V1 = "held-license-gpl-3.0-only";

/**
 * Byte SHA-256 of resources/formula-library/v1/standard-formula-ids.json.
 * The independent script verifier recomputes this from file bytes; the engine
 * pins the value so a swapped identity manifest cannot silently rebind rows.
 */
export const PUBLICATION_DECISION_IDENTITY_SHA256_V1 =
  "b98bbc2b954871b227acfd7c882443cbeb44870931ddb4714c9aed3ffcf33729";

export type FormulaRightsStatusV1 =
  | "project-owned"
  | "source-declared-public-domain-assumption"
  | "gpl-3.0-only"
  | "no-explicit-permission";

export type FormulaPublicationDecisionV1 = "publish" | "hold" | "exclude";

export type FormulaImplementationBasisV1 =
  | "project-owned"
  | "direct-adaptation"
  | "separated-independent-rewrite";

export type FormulaLeakageScanStatusV1 =
  | "not-applicable"
  | "pending"
  | "passed"
  | "failed";

export interface PublicationDecisionRowV1 {
  readonly formulaId: FormulaIdV1;
  readonly rightsStatus: FormulaRightsStatusV1;
  readonly publicationDecision: FormulaPublicationDecisionV1;
  readonly decisionReason: string;
  readonly implementationBasis: FormulaImplementationBasisV1 | null;
  readonly implementationBasisRecordedAt: string | null;
  readonly leakageScanStatus: FormulaLeakageScanStatusV1;
  readonly reviewedAt: string;
}

export interface PublicationDecisionLedgerV1 {
  readonly schema: typeof PUBLICATION_DECISIONS_SCHEMA_V1;
  readonly version: typeof PUBLICATION_DECISIONS_VERSION_V1;
  readonly decisionRevision: number;
  readonly rows: readonly PublicationDecisionRowV1[];
  readonly rightsStatusCounts: Readonly<Record<FormulaRightsStatusV1, number>>;
  readonly decisionCounts: Readonly<
    Record<FormulaPublicationDecisionV1, number>
  >;
  decisionFor(formulaId: unknown): PublicationDecisionRowV1 | undefined;
  publishedFormulaIds(): readonly FormulaIdV1[];
}

export type PublicationDecisionLedgerBuildResultV1 =
  | { readonly ok: true; readonly ledger: PublicationDecisionLedgerV1 }
  | { readonly ok: false; readonly code: "invalid-publication-decision-ledger" };

const RIGHTS_STATUSES = Object.freeze([
  "project-owned",
  "source-declared-public-domain-assumption",
  "gpl-3.0-only",
  "no-explicit-permission",
] as const satisfies readonly FormulaRightsStatusV1[]);

const DECISIONS = Object.freeze([
  "publish",
  "hold",
  "exclude",
] as const satisfies readonly FormulaPublicationDecisionV1[]);

const IMPLEMENTATION_BASES = Object.freeze([
  "project-owned",
  "direct-adaptation",
  "separated-independent-rewrite",
] as const satisfies readonly FormulaImplementationBasisV1[]);

const LEAKAGE_SCAN_STATUSES = Object.freeze([
  "not-applicable",
  "pending",
  "passed",
  "failed",
] as const satisfies readonly FormulaLeakageScanStatusV1[]);

const EXPECTED_RIGHTS_COUNTS = Object.freeze({
  "project-owned": 89,
  "source-declared-public-domain-assumption": 137,
  "gpl-3.0-only": 73,
  "no-explicit-permission": 378,
} satisfies Readonly<Record<FormulaRightsStatusV1, number>>);

const ROW_KEYS = Object.freeze([
  "formulaId",
  "rightsStatus",
  "publicationDecision",
  "decisionReason",
  "implementationBasis",
  "implementationBasisRecordedAt",
  "leakageScanStatus",
  "reviewedAt",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "version",
  "decisionRevision",
  "formulaCount",
  "identityBinding",
  "rightsStatusCounts",
  "decisionCounts",
  "rows",
  "contentHash",
]);

const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function record(value: unknown): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor?.enumerable && "value" in descriptor);
    });
  } catch {
    return false;
  }
}

function denseArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value)) return false;
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return false;
    }
    return Reflect.ownKeys(value).every(
      (key) =>
        key === "length" ||
        (typeof key === "string" &&
          /^(?:0|[1-9]\d*)$/.test(key) &&
          Number(key) < value.length),
    );
  } catch {
    return false;
  }
}

function exactKeys(
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

function isRightsStatus(value: unknown): value is FormulaRightsStatusV1 {
  return (
    typeof value === "string" &&
    (RIGHTS_STATUSES as readonly string[]).includes(value)
  );
}

function isDecision(value: unknown): value is FormulaPublicationDecisionV1 {
  return (
    typeof value === "string" && (DECISIONS as readonly string[]).includes(value)
  );
}

function isBasis(value: unknown): value is FormulaImplementationBasisV1 {
  return (
    typeof value === "string" &&
    (IMPLEMENTATION_BASES as readonly string[]).includes(value)
  );
}

function isScanStatus(value: unknown): value is FormulaLeakageScanStatusV1 {
  return (
    typeof value === "string" &&
    (LEAKAGE_SCAN_STATUSES as readonly string[]).includes(value)
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validates the frozen exact-677 publication decision ledger against the
 * Standard identity manifest. Validation is synchronous and fail-closed: it
 * ends with a load-time self-hash recomputation so any content drift,
 * including count-preserving row tampering that retains the frozen hash
 * field, is rejected. A ledger never authorizes implementation by itself:
 * `publish` rows additionally require a recorded basis, basis timestamp, and
 * a passed leakage scan, and all 73 `gpl-3.0-only` rows are fixed `hold`.
 */
export function createPublicationDecisionLedgerV1(
  input: unknown = decisionAsset,
  manifest: StandardManifestIndexV1 = STANDARD_MANIFEST_INDEX_V1,
): PublicationDecisionLedgerBuildResultV1 {
  const invalid = (): PublicationDecisionLedgerBuildResultV1 => ({
    ok: false,
    code: "invalid-publication-decision-ledger",
  });
  if (!record(input) || !exactKeys(input, TOP_LEVEL_KEYS)) return invalid();
  if (
    input.schema !== PUBLICATION_DECISIONS_SCHEMA_V1 ||
    input.version !== PUBLICATION_DECISIONS_VERSION_V1 ||
    !nonNegativeInteger(input.decisionRevision) ||
    input.decisionRevision < 1 ||
    input.formulaCount !== PUBLICATION_DECISION_FORMULA_COUNT_V1 ||
    typeof input.contentHash !== "string" ||
    !SHA256.test(input.contentHash)
  )
    return invalid();
  if (
    !record(input.identityBinding) ||
    !exactKeys(input.identityBinding, ["standardFormulaIdsSha256"]) ||
    input.identityBinding.standardFormulaIdsSha256 !==
      PUBLICATION_DECISION_IDENTITY_SHA256_V1
  )
    return invalid();
  if (
    !record(input.rightsStatusCounts) ||
    !exactKeys(input.rightsStatusCounts, RIGHTS_STATUSES) ||
    !record(input.decisionCounts) ||
    !exactKeys(input.decisionCounts, DECISIONS) ||
    !denseArray(input.rows) ||
    input.rows.length !== PUBLICATION_DECISION_FORMULA_COUNT_V1
  )
    return invalid();
  for (const status of RIGHTS_STATUSES)
    if (input.rightsStatusCounts[status] !== EXPECTED_RIGHTS_COUNTS[status])
      return invalid();
  for (const decision of DECISIONS)
    if (!nonNegativeInteger(input.decisionCounts[decision])) return invalid();
  const declaredPublish = input.decisionCounts.publish;
  const declaredHold = input.decisionCounts.hold;
  const declaredExclude = input.decisionCounts.exclude;
  if (
    !nonNegativeInteger(declaredPublish) ||
    !nonNegativeInteger(declaredHold) ||
    !nonNegativeInteger(declaredExclude)
  )
    return invalid();
  if (
    declaredPublish + declaredHold + declaredExclude !==
      PUBLICATION_DECISION_FORMULA_COUNT_V1 ||
    declaredPublish > IMPLEMENTATION_CANDIDATE_CEILING_V1
  )
    return invalid();

  const seen = new Set<FormulaIdV1>();
  const byId = new Map<FormulaIdV1, PublicationDecisionRowV1>();
  const rightsCounts: Record<FormulaRightsStatusV1, number> = {
    "project-owned": 0,
    "source-declared-public-domain-assumption": 0,
    "gpl-3.0-only": 0,
    "no-explicit-permission": 0,
  };
  const decisionCounts: Record<FormulaPublicationDecisionV1, number> = {
    publish: 0,
    hold: 0,
    exclude: 0,
  };
  const published: FormulaIdV1[] = [];

  for (let index = 0; index < input.rows.length; index++) {
    const raw = input.rows[index];
    if (!record(raw) || !exactKeys(raw, ROW_KEYS)) return invalid();
    if (
      !isStandardFormulaIdV1(raw.formulaId) ||
      !manifest.hasFormulaId(raw.formulaId) ||
      manifest.formulaIds[index] !== raw.formulaId ||
      seen.has(raw.formulaId)
    )
      return invalid();
    if (
      !isRightsStatus(raw.rightsStatus) ||
      !isDecision(raw.publicationDecision) ||
      typeof raw.decisionReason !== "string" ||
      raw.decisionReason.length === 0 ||
      !(raw.implementationBasis === null || isBasis(raw.implementationBasis)) ||
      !(
        raw.implementationBasisRecordedAt === null ||
        (typeof raw.implementationBasisRecordedAt === "string" &&
          ISO_DATE_TIME.test(raw.implementationBasisRecordedAt))
      ) ||
      !isScanStatus(raw.leakageScanStatus) ||
      typeof raw.reviewedAt !== "string" ||
      !ISO_DATE.test(raw.reviewedAt)
    )
      return invalid();
    if (raw.rightsStatus === "gpl-3.0-only") {
      if (
        raw.publicationDecision !== "hold" ||
        raw.decisionReason !== GPL_FIXED_HOLD_REASON_V1 ||
        raw.implementationBasis !== null ||
        raw.implementationBasisRecordedAt !== null ||
        raw.leakageScanStatus !== "not-applicable"
      )
        return invalid();
    } else if (raw.leakageScanStatus === "not-applicable") {
      return invalid();
    }
    if (
      raw.implementationBasis === null &&
      raw.implementationBasisRecordedAt !== null
    )
      return invalid();
    if (
      raw.implementationBasis !== null &&
      raw.implementationBasisRecordedAt === null
    )
      return invalid();
    if (raw.publicationDecision === "publish") {
      if (
        raw.implementationBasis === null ||
        raw.implementationBasisRecordedAt === null ||
        raw.leakageScanStatus !== "passed"
      )
        return invalid();
      published.push(raw.formulaId);
    }
    seen.add(raw.formulaId);
    rightsCounts[raw.rightsStatus]++;
    decisionCounts[raw.publicationDecision]++;
    byId.set(
      raw.formulaId,
      Object.freeze({
        formulaId: raw.formulaId,
        rightsStatus: raw.rightsStatus,
        publicationDecision: raw.publicationDecision,
        decisionReason: raw.decisionReason,
        implementationBasis: raw.implementationBasis,
        implementationBasisRecordedAt: raw.implementationBasisRecordedAt,
        leakageScanStatus: raw.leakageScanStatus,
        reviewedAt: raw.reviewedAt,
      }),
    );
  }

  for (const status of RIGHTS_STATUSES)
    if (rightsCounts[status] !== EXPECTED_RIGHTS_COUNTS[status])
      return invalid();
  if (
    decisionCounts.publish !== declaredPublish ||
    decisionCounts.hold !== declaredHold ||
    decisionCounts.exclude !== declaredExclude
  )
    return invalid();
  // Load-time self-hash: any content drift, including count-preserving row
  // tampering that retains the frozen hash field, is rejected here.
  try {
    if (recomputeContentHashV1(input) !== input.contentHash) return invalid();
  } catch {
    return invalid();
  }

  const rows = Object.freeze([...byId.values()].map((row) => row));
  const frozenPublished = Object.freeze(published);
  const ledger: PublicationDecisionLedgerV1 = Object.freeze({
    schema: PUBLICATION_DECISIONS_SCHEMA_V1,
    version: PUBLICATION_DECISIONS_VERSION_V1,
    decisionRevision: input.decisionRevision,
    rows,
    rightsStatusCounts: Object.freeze({ ...rightsCounts }),
    decisionCounts: Object.freeze({ ...decisionCounts }),
    decisionFor(formulaId: unknown) {
      return isStandardFormulaIdV1(formulaId) ? byId.get(formulaId) : undefined;
    },
    publishedFormulaIds() {
      return frozenPublished;
    },
  });
  return { ok: true, ledger };
}

/**
 * Node budget for hashing the frozen ledger: 677 rows with eight fields each
 * plus top-level structure, bounded well above the exact requirement.
 */
const LEDGER_CANONICAL_NODE_BUDGET_V1 = 8_192;

function recomputeContentHashV1(input: Record<string, unknown>): string {
  const unsigned: Record<string, unknown> = { ...input };
  delete unsigned.contentHash;
  return sha256HexSyncV1(
    canonicalJsonV1(unsigned, LEDGER_CANONICAL_NODE_BUDGET_V1),
  );
}

/**
 * Recomputes the ledger self-hash over the canonical projection with the
 * `contentHash` field removed. Returns false instead of throwing so callers
 * can treat a mismatch as data, not as an exception.
 */
export function verifyPublicationDecisionContentHashV1(
  input: unknown = decisionAsset,
): boolean {
  if (!record(input) || typeof input.contentHash !== "string") return false;
  try {
    return recomputeContentHashV1(input) === input.contentHash;
  } catch {
    return false;
  }
}

const built = createPublicationDecisionLedgerV1();
if (built.ok === false) throw new Error(built.code);

export const PUBLICATION_DECISION_LEDGER_V1 = built.ledger;
