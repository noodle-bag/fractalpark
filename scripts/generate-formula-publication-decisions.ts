import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Generates the frozen public publication-decision baseline from the frozen
 * private exact-677 migration work-package ledger. The output contains only
 * neutral formula IDs, rights status, decision fields, and aggregate counts;
 * it never carries private paths, source text, or reversible intermediates.
 * The script pins the frozen handoff's canonical content hash as a public
 * tamper-evident binding, consistent with the previously reviewed gate
 * scripts in this repository; a one-way digest exposes no private content.
 * This script records decisions; it does not authorize any implementation,
 * publication, or hosted write.
 */

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const EXPECTED_IDENTITY_SHA256 =
  "b98bbc2b954871b227acfd7c882443cbeb44870931ddb4714c9aed3ffcf33729";
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const SCHEMA = "fractalpark-formula-library-publication-decisions/v1";
const DECISION_REVISION = 1;
const REVIEWED_AT = "2026-08-17";
const ASSET_RELATIVE_PATH = join(
  "resources",
  "formula-library",
  "v1",
  "publication-decisions.json",
);

const CLASS_TO_RIGHTS_STATUS = Object.freeze({
  P: "project-owned",
  A: "source-declared-public-domain-assumption",
  B: "gpl-3.0-only",
  C: "no-explicit-permission",
} as const);

const BASELINE_REASONS = Object.freeze({
  P: "held-awaiting-project-owned-implementation-batch",
  A: "held-awaiting-pd-assumption-implementation-batch",
  B: "held-license-gpl-3.0-only",
  C: "held-awaiting-independent-rewrite",
} as const);

type RightsClass = keyof typeof CLASS_TO_RIGHTS_STATUS;
type JsonRecord = Record<string, unknown>;

const PUBLIC_ERROR_CODES = new Set([
  "decisions-asset-write-failed",
  "decisions-drift",
  "decisions-handoff-invalid",
  "decisions-identity-binding-invalid",
  "decisions-output-invalid",
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
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
    if (typeof value === "string")
      invariant(!hasLoneSurrogate(value), "decisions-output-invalid");
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  invariant(isRecord(value), "decisions-output-invalid");
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    )
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
    throw new Error("decisions-handoff-invalid");
  }
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        (!requirePrivateMode || (opened.mode & 0o777) === 0o600),
      "decisions-handoff-invalid",
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
      "decisions-handoff-invalid",
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path, "decisions-handoff-invalid");
  let markdown: string;
  try {
    markdown = readStableFile(path, true).toString("utf8");
  } catch {
    throw new Error("decisions-handoff-invalid");
  }
  const marker = markdown.indexOf(WORK_PACKAGE_START);
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(
    marker >= 0 && start > marker && end > start,
    "decisions-handoff-invalid",
  );
  try {
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed), "decisions-handoff-invalid");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "decisions-handoff-invalid")
      throw error;
    throw new Error("decisions-handoff-invalid");
  }
}

function assertSelfHash(
  value: JsonRecord,
  field: string,
  expected: string,
): void {
  invariant(value[field] === expected, "decisions-handoff-invalid");
  const unhashed = { ...value };
  delete unhashed[field];
  invariant(
    sha256Bytes(canonicalJson(unhashed)) === expected,
    "decisions-handoff-invalid",
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRightsClasses(
  repositoryRoot: string,
  workPackage: JsonRecord,
): ReadonlyMap<string, RightsClass> {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      isRecord(workPackage.sourceBindings) &&
      isRecord(workPackage.publicProjection) &&
      isDenseArray(workPackage.publicProjection.rows) &&
      workPackage.publicProjection.rows.length === 677,
    "decisions-handoff-invalid",
  );
  const identitiesPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "standard-formula-ids.json",
  );
  const identitiesBytes = readStableFile(identitiesPath, false);
  invariant(
    sha256Bytes(identitiesBytes) === EXPECTED_IDENTITY_SHA256,
    "decisions-identity-binding-invalid",
  );
  const identities = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(identities) &&
      identities.formulaCount === 677 &&
      isDenseArray(identities.formulas) &&
      identities.formulas.length === 677,
    "decisions-identity-binding-invalid",
  );
  const standardBinding = workPackage.sourceBindings.standardFormulaIds;
  invariant(
    isRecord(standardBinding) &&
      standardBinding.sha256 === EXPECTED_IDENTITY_SHA256,
    "decisions-identity-binding-invalid",
  );

  const classes = new Map<string, RightsClass>();
  for (let index = 0; index < 677; index++) {
    const row = workPackage.rows[index];
    const identityRow = identities.formulas[index];
    const projectionRow = workPackage.publicProjection.rows[index];
    invariant(
      isRecord(row) &&
        isRecord(identityRow) &&
        isRecord(projectionRow) &&
        isRecord(row.rights) &&
        typeof row.formulaId === "string" &&
        identityRow.formulaId === row.formulaId &&
        projectionRow.formulaId === row.formulaId &&
        projectionRow.rightsClass === row.rights.class &&
        (row.rights.class === "P" ||
          row.rights.class === "A" ||
          row.rights.class === "B" ||
          row.rights.class === "C") &&
        !classes.has(row.formulaId),
      "decisions-handoff-invalid",
    );
    classes.set(row.formulaId, row.rights.class as RightsClass);
  }
  return classes;
}

function baselineRow(formulaId: string, rightsClass: RightsClass): JsonRecord {
  return {
    formulaId,
    rightsStatus: CLASS_TO_RIGHTS_STATUS[rightsClass],
    publicationDecision: "hold",
    decisionReason: BASELINE_REASONS[rightsClass],
    implementationBasis: null,
    implementationBasisRecordedAt: null,
    leakageScanStatus: rightsClass === "B" ? "not-applicable" : "pending",
    reviewedAt: REVIEWED_AT,
  };
}

export function buildPublicationDecisionAsset(
  repositoryRoot: string,
  workPackage: JsonRecord,
): JsonRecord {
  const classes = projectRightsClasses(repositoryRoot, workPackage);
  const rows = [...classes.entries()]
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([formulaId, rightsClass]) => baselineRow(formulaId, rightsClass));
  const rightsStatusCounts: JsonRecord = {
    "project-owned": 0,
    "source-declared-public-domain-assumption": 0,
    "gpl-3.0-only": 0,
    "no-explicit-permission": 0,
  };
  for (const row of rows) {
    const status = row.rightsStatus;
    invariant(
      typeof status === "string" && status in rightsStatusCounts,
      "decisions-output-invalid",
    );
    rightsStatusCounts[status] = (rightsStatusCounts[status] as number) + 1;
  }
  invariant(
    rightsStatusCounts["project-owned"] === 89 &&
      rightsStatusCounts["source-declared-public-domain-assumption"] === 137 &&
      rightsStatusCounts["gpl-3.0-only"] === 73 &&
      rightsStatusCounts["no-explicit-permission"] === 378,
    "decisions-output-invalid",
  );
  const unsigned: JsonRecord = {
    schema: SCHEMA,
    version: 1,
    decisionRevision: DECISION_REVISION,
    formulaCount: 677,
    identityBinding: { standardFormulaIdsSha256: EXPECTED_IDENTITY_SHA256 },
    rightsStatusCounts,
    decisionCounts: { publish: 0, hold: 677, exclude: 0 },
    rows,
  };
  return { ...unsigned, contentHash: sha256Bytes(canonicalJson(unsigned)) };
}

function writePublicAsset(path: string, serialized: string): void {
  const directory = dirname(path);
  const directoryMetadata = lstatSync(directory);
  invariant(
    directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      realpathSync(directory) === resolve(directory),
    "decisions-asset-write-failed",
  );
  const existing = lstatSync(path, { throwIfNoEntry: false });
  invariant(
    existing == null || (existing.isFile() && !existing.isSymbolicLink()),
    "decisions-asset-write-failed",
  );
  // Pin the parent directory by file descriptor so a post-check directory
  // replacement is detected instead of silently redirecting the write.
  let directoryDescriptor: number;
  try {
    directoryDescriptor = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new Error("decisions-asset-write-failed");
  }
  try {
    const openedDirectory = fstatSync(directoryDescriptor);
    const temporary = join(
      directory,
      `.publication-decisions.${process.pid}.tmp`,
    );
    let descriptor: number;
    try {
      descriptor = openSync(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o644,
      );
    } catch {
      throw new Error("decisions-asset-write-failed");
    }
    try {
      writeSync(descriptor, serialized);
      fsyncSync(descriptor);
      fchmodSync(descriptor, 0o644);
    } finally {
      closeSync(descriptor);
    }
    try {
      renameSync(temporary, path);
    } catch (error) {
      unlinkSync(temporary);
      throw error;
    }
    const currentDirectory = fstatSync(directoryDescriptor);
    const directoryAfter = lstatSync(directory);
    invariant(
      currentDirectory.dev === openedDirectory.dev &&
        currentDirectory.ino === openedDirectory.ino &&
        directoryAfter.isDirectory() &&
        !directoryAfter.isSymbolicLink() &&
        directoryAfter.dev === openedDirectory.dev &&
        directoryAfter.ino === openedDirectory.ino,
      "decisions-asset-write-failed",
    );
  } finally {
    closeSync(directoryDescriptor);
  }
  const written = readStableFile(path, false);
  invariant(
    written.toString("utf8") === serialized,
    "decisions-asset-write-failed",
  );
}

export function generatePublicationDecisions(
  repositoryRoot: string,
  write: boolean,
): { contentHash: string; assetSha256: string; drift: boolean } {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
  );
  const asset = buildPublicationDecisionAsset(repositoryRoot, workPackage);
  const serialized = `${JSON.stringify(asset, null, 2)}\n`;
  const assetPath = join(repositoryRoot, ASSET_RELATIVE_PATH);
  const current = lstatSync(assetPath, { throwIfNoEntry: false });
  const currentBytes =
    current == null
      ? null
      : readStableFile(assetPath, false).toString("utf8");
  const drift = currentBytes !== serialized;
  if (write) {
    writePublicAsset(assetPath, serialized);
  } else {
    invariant(!drift, "decisions-drift");
  }
  return {
    contentHash: String(asset.contentHash),
    assetSha256: sha256Bytes(serialized),
    drift,
  };
}

export function sanitizePublicationDecisionError(error: unknown): string {
  return error instanceof Error && PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "decisions-controller-internal-error";
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const write = process.argv.includes("--write");
    const result = generatePublicationDecisions(process.cwd(), write);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: write ? "write" : "check",
        formulaCount: 677,
        published: 0,
        held: 677,
        excluded: 0,
        gplHeld: 73,
        contentHash: result.contentHash,
        assetSha256: result.assetSha256,
        drift: result.drift,
        publicAssetsWritten: 0,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${sanitizePublicationDecisionError(error)}\n`);
    process.exitCode = 1;
  }
}
