import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Independent accounting verifier for the frozen publication decision ledger.
 * It imports neither the generator nor the engine validator: every invariant
 * is recomputed from raw bytes — the committed public asset, the public
 * identity manifest, and the frozen private work-package handoff. A pass is
 * accounting evidence only; it never authorizes implementation or publication.
 */

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const SCHEMA = "fractalpark-formula-library-publication-decisions/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RIGHTS_STATUSES = [
  "project-owned",
  "source-declared-public-domain-assumption",
  "gpl-3.0-only",
  "no-explicit-permission",
] as const;
const DECISIONS = ["publish", "hold", "exclude"] as const;
const BASES = [
  "project-owned",
  "direct-adaptation",
  "separated-independent-rewrite",
] as const;
const SCAN_STATUSES = ["not-applicable", "pending", "passed", "failed"] as const;
const EXPECTED_RIGHTS_COUNTS: Readonly<Record<string, number>> = {
  "project-owned": 89,
  "source-declared-public-domain-assumption": 137,
  "gpl-3.0-only": 73,
  "no-explicit-permission": 378,
};
const CLASS_TO_RIGHTS_STATUS: Readonly<Record<string, string>> = {
  P: "project-owned",
  A: "source-declared-public-domain-assumption",
  B: "gpl-3.0-only",
  C: "no-explicit-permission",
};
const GPL_FIXED_HOLD_REASON = "held-license-gpl-3.0-only";
const TOP_LEVEL_KEYS = [
  "schema",
  "version",
  "decisionRevision",
  "formulaCount",
  "identityBinding",
  "rightsStatusCounts",
  "decisionCounts",
  "rows",
  "contentHash",
];
const ROW_KEYS = [
  "formulaId",
  "rightsStatus",
  "publicationDecision",
  "decisionReason",
  "implementationBasis",
  "implementationBasisRecordedAt",
  "leakageScanStatus",
  "reviewedAt",
];

type JsonRecord = Record<string, unknown>;

function fail(): never {
  throw new Error("verification-invalid");
}

function invariant(condition: unknown): asserts condition {
  if (!condition) fail();
}

function isRecord(value: unknown): value is JsonRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    if (typeof value === "string") invariant(!hasLoneSurrogate(value));
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value));
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      invariant(!hasLoneSurrogate(key));
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    })
    .join(",")}}`;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readStableFile(path: string, requirePrivateMode: boolean): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail();
  }
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        (!requirePrivateMode || (opened.mode & 0o777) === 0o600),
    );
    const bytes = readFileSync(descriptor);
    const afterRead = fstatSync(descriptor);
    const current = lstatSync(path);
    invariant(
      afterRead.isFile() &&
        afterRead.dev === opened.dev &&
        afterRead.ino === opened.ino &&
        afterRead.nlink === 1 &&
        afterRead.size === opened.size &&
        afterRead.mtimeMs === opened.mtimeMs &&
        afterRead.ctimeMs === opened.ctimeMs &&
        current.isFile() &&
        !current.isSymbolicLink() &&
        current.dev === opened.dev &&
        current.ino === opened.ino &&
        current.nlink === 1 &&
        (!requirePrivateMode || (current.mode & 0o777) === 0o600),
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path);
  try {
    const markdown = readStableFile(path, true).toString("utf8");
    const marker = markdown.indexOf(WORK_PACKAGE_START);
    const start = markdown.indexOf("{", marker);
    const end = markdown.indexOf("```", start);
    invariant(marker >= 0 && start > marker && end > start);
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed));
    return parsed;
  } catch {
    fail();
  }
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function verifyPublicationDecisions(repositoryRoot: string): {
  published: number;
  held: number;
  excluded: number;
  gplHeld: number;
  contentHash: string;
  assetSha256: string;
} {
  const assetPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "publication-decisions.json",
  );
  const identityPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "standard-formula-ids.json",
  );
  const assetBytes = readStableFile(assetPath, false);
  const identityBytes = readStableFile(identityPath, false);
  const asset = JSON.parse(assetBytes.toString("utf8")) as unknown;
  const identities = JSON.parse(identityBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(asset) &&
      exactKeys(asset, TOP_LEVEL_KEYS) &&
      asset.schema === SCHEMA &&
      asset.version === 1 &&
      nonNegativeInteger(asset.decisionRevision) &&
      asset.decisionRevision >= 1 &&
      asset.formulaCount === 677 &&
      typeof asset.contentHash === "string" &&
      SHA256.test(asset.contentHash),
  );
  invariant(
    isRecord(asset.identityBinding) &&
      exactKeys(asset.identityBinding, ["standardFormulaIdsSha256"]) &&
      asset.identityBinding.standardFormulaIdsSha256 ===
        sha256Bytes(identityBytes),
  );
  invariant(
    isRecord(identities) &&
      identities.formulaCount === 677 &&
      isDenseArray(identities.formulas) &&
      identities.formulas.length === 677,
  );
  const identityIds = identities.formulas.map((row) => {
    invariant(isRecord(row) && typeof row.formulaId === "string");
    return row.formulaId;
  });
  const sortedIdentityIds = [...identityIds].sort();
  invariant(
    isRecord(asset.rightsStatusCounts) &&
      exactKeys(asset.rightsStatusCounts, RIGHTS_STATUSES) &&
      isRecord(asset.decisionCounts) &&
      exactKeys(asset.decisionCounts, DECISIONS) &&
      isDenseArray(asset.rows) &&
      asset.rows.length === 677,
  );

  const unsigned = { ...asset };
  delete unsigned.contentHash;
  invariant(sha256Bytes(canonicalJson(unsigned)) === asset.contentHash);

  const seen = new Set<string>();
  const rightsCounts = new Map<string, number>();
  const decisionCounts = new Map<string, number>();
  const statusById = new Map<string, string>();
  let gplHeld = 0;
  for (let index = 0; index < 677; index++) {
    const row = asset.rows[index];
    invariant(isRecord(row) && exactKeys(row, ROW_KEYS));
    const {
      formulaId,
      rightsStatus,
      publicationDecision,
      decisionReason,
      implementationBasis,
      implementationBasisRecordedAt,
      leakageScanStatus,
      reviewedAt,
    } = row;
    invariant(
      typeof formulaId === "string" &&
        UUID_V5.test(formulaId) &&
        !seen.has(formulaId) &&
        formulaId === sortedIdentityIds[index],
    );
    seen.add(formulaId);
    invariant(
      RIGHTS_STATUSES.includes(rightsStatus as (typeof RIGHTS_STATUSES)[number]) &&
        DECISIONS.includes(
          publicationDecision as (typeof DECISIONS)[number],
        ) &&
        typeof decisionReason === "string" &&
        decisionReason.length > 0 &&
        (implementationBasis === null ||
          BASES.includes(implementationBasis as (typeof BASES)[number])) &&
        (implementationBasisRecordedAt === null ||
          (typeof implementationBasisRecordedAt === "string" &&
            ISO_DATE_TIME.test(implementationBasisRecordedAt))) &&
        SCAN_STATUSES.includes(
          leakageScanStatus as (typeof SCAN_STATUSES)[number],
        ) &&
        typeof reviewedAt === "string" &&
        ISO_DATE.test(reviewedAt),
    );
    invariant(
      (implementationBasis === null) ===
        (implementationBasisRecordedAt === null),
    );
    if (rightsStatus === "gpl-3.0-only") {
      invariant(
        publicationDecision === "hold" &&
          decisionReason === GPL_FIXED_HOLD_REASON &&
          implementationBasis === null &&
          implementationBasisRecordedAt === null &&
          leakageScanStatus === "not-applicable",
      );
      gplHeld++;
    } else {
      invariant(leakageScanStatus !== "not-applicable");
    }
    if (publicationDecision === "publish") {
      invariant(
        implementationBasis !== null &&
          implementationBasisRecordedAt !== null &&
          leakageScanStatus === "passed",
      );
    }
    rightsCounts.set(
      String(rightsStatus),
      (rightsCounts.get(String(rightsStatus)) ?? 0) + 1,
    );
    decisionCounts.set(
      String(publicationDecision),
      (decisionCounts.get(String(publicationDecision)) ?? 0) + 1,
    );
    statusById.set(formulaId, String(rightsStatus));
  }
  invariant(seen.size === 677 && gplHeld === 73);
  for (const status of RIGHTS_STATUSES) {
    invariant(rightsCounts.get(status) === EXPECTED_RIGHTS_COUNTS[status]);
    invariant(asset.rightsStatusCounts[status] === rightsCounts.get(status));
  }
  const published = decisionCounts.get("publish") ?? 0;
  const held = decisionCounts.get("hold") ?? 0;
  const excluded = decisionCounts.get("exclude") ?? 0;
  invariant(published + held + excluded === 677 && published <= 604);
  invariant(
    asset.decisionCounts.publish === published &&
      asset.decisionCounts.hold === held &&
      asset.decisionCounts.exclude === excluded,
  );

  // Independent rights-source recomputation from the frozen private handoff.
  const workPackage = extractWorkPackage();
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      typeof workPackage.payloadContentHash === "string",
  );
  const unhashedHandoff = { ...workPackage };
  delete unhashedHandoff.payloadContentHash;
  invariant(
    workPackage.payloadContentHash === EXPECTED_WORK_PACKAGE_HASH &&
      sha256Bytes(canonicalJson(unhashedHandoff)) ===
        EXPECTED_WORK_PACKAGE_HASH,
  );
  const handoffSeen = new Set<string>();
  for (const rawRow of workPackage.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        isRecord(rawRow.rights) &&
        typeof rawRow.rights.class === "string" &&
        rawRow.rights.class in CLASS_TO_RIGHTS_STATUS &&
        !handoffSeen.has(rawRow.formulaId),
    );
    handoffSeen.add(rawRow.formulaId);
    invariant(
      statusById.get(rawRow.formulaId) ===
        CLASS_TO_RIGHTS_STATUS[rawRow.rights.class],
    );
  }
  invariant(handoffSeen.size === 677);

  return {
    published,
    held,
    excluded,
    gplHeld,
    contentHash: asset.contentHash,
    assetSha256: sha256Bytes(assetBytes),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = verifyPublicationDecisions(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        formulaCount: 677,
        published: result.published,
        held: result.held,
        excluded: result.excluded,
        gplHeld: result.gplHeld,
        contentHash: result.contentHash,
        assetSha256: result.assetSha256,
      })}\n`,
    );
  } catch {
    process.stderr.write("verification-invalid\n");
    process.exitCode = 1;
  }
}
