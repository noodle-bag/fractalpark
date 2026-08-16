import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const EXPECTED_LEDGER_HASH =
  "0c494e773a918051e1efc398999de6b5ab684ac96af8cad7be0c0c2156aea545";
const EXPECTED_PROVISIONAL_HASH =
  "66fb2b3ed825e8036c6d78c8b0ff0f008ca0a533046275ccff2e5c1524ad230f";
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const CONTROLLER_VERSION = "formula-library-direct-adaptation-evidence/1";
const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;
type SourceSet = "F588" | "B94";
type TechnicalFailureReason =
  | "v1-projection-unsupported"
  | "release-oracle-mismatch"
  | "webgl-cpu-mismatch";
type RepositoryBinding = Readonly<{
  repositoryBaseCommit: string;
  repositoryIndexTree: string;
}>;
type InputHashes = Readonly<{
  workPackage: string;
  runnableLedger: string;
  provisionalManifest: string;
  standardFormulaIds: string;
  legacyFormulaAliases: string;
}>;
type DirectWorkRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  rightsClass: "A" | "P";
  inputEvidenceKind: "approved-direct-source" | "project-owned-runtime-contract";
}>;
type DirectTechnicalRow = Readonly<{
  formulaId: string;
  sourceSet: SourceSet;
  technicalStatus: "passed" | "failed";
  technicalFailureReason: TechnicalFailureReason | null;
}>;

function fail(): never {
  throw new Error("direct-evidence-verification-invalid");
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
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      return false;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== value.length + 1 ||
      ownKeys.some((key) => typeof key !== "string") ||
      !ownKeys.includes("length")
    ) {
      return false;
    }
    const ownStringKeys = new Set(ownKeys as string[]);
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      if (!ownStringKeys.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  invariant(isRecord(value));
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
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

function readPrivateJson(path: string): JsonRecord {
  try {
    const parsed = JSON.parse(readStableFile(path, true).toString("utf8")) as unknown;
    invariant(isRecord(parsed));
    return parsed;
  } catch {
    fail();
  }
}

function assertSelfHash(
  value: JsonRecord,
  field: string,
  expected: string,
): void {
  invariant(value[field] === expected);
  const unhashed = { ...value };
  delete unhashed[field];
  invariant(sha256Canonical(unhashed) === expected);
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

function gitOutput(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  invariant(result.status === 0);
  return result.stdout.trim();
}

function captureRepositoryBinding(repositoryRoot: string): RepositoryBinding {
  const metadata = lstatSync(repositoryRoot);
  invariant(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(repositoryRoot) === resolve(repositoryRoot),
  );
  invariant(
    spawnSync("git", ["diff", "--quiet", "--no-ext-diff"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
  );
  invariant(
    spawnSync("git", ["diff", "--cached", "--check"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
  );
  invariant(
    gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]) ===
      "",
  );
  const repositoryBaseCommit = gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const repositoryIndexTree = gitOutput(repositoryRoot, ["write-tree"]);
  invariant(
    /^[a-f0-9]{40}$/.test(repositoryBaseCommit) &&
      /^[a-f0-9]{40}$/.test(repositoryIndexTree),
  );
  return { repositoryBaseCommit, repositoryIndexTree };
}

function assertStoredBinding(
  repositoryRoot: string,
  stored: RepositoryBinding,
  current: RepositoryBinding,
): void {
  invariant(
    /^[a-f0-9]{40}$/.test(stored.repositoryBaseCommit) &&
      /^[a-f0-9]{40}$/.test(stored.repositoryIndexTree) &&
      stored.repositoryIndexTree === current.repositoryIndexTree,
  );
  invariant(
    spawnSync(
      "git",
      ["merge-base", "--is-ancestor", stored.repositoryBaseCommit, "HEAD"],
      { cwd: repositoryRoot, stdio: "ignore" },
    ).status === 0,
  );
  if (stored.repositoryBaseCommit !== current.repositoryBaseCommit) {
    invariant(
      gitOutput(repositoryRoot, ["rev-parse", "HEAD^{tree}"]) ===
        stored.repositoryIndexTree,
    );
  }
}

function recomputeWorkRows(
  repositoryRoot: string,
  workPackage: JsonRecord,
): Readonly<{
  rows: readonly DirectWorkRow[];
  standardFormulaIdsHash: string;
  legacyFormulaAliasesHash: string;
}> {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      isRecord(workPackage.sourceBindings),
  );
  const identitiesBytes = readStableFile(
    join(
      repositoryRoot,
      "resources",
      "formula-library",
      "v1",
      "standard-formula-ids.json",
    ),
    false,
  );
  const aliasesBytes = readStableFile(
    join(
      repositoryRoot,
      "resources",
      "formula-library",
      "v1",
      "legacy-formula-aliases.json",
    ),
    false,
  );
  const identities = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  const aliases = JSON.parse(aliasesBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(identities) &&
      identities.formulaCount === 677 &&
      isDenseArray(identities.formulas) &&
      identities.formulas.length === 677 &&
      isRecord(aliases) &&
      aliases.aliasCount === 797 &&
      isDenseArray(aliases.aliases) &&
      aliases.aliases.length === 797,
  );
  const standardFormulaIdsHash = sha256Bytes(identitiesBytes);
  const legacyFormulaAliasesHash = sha256Bytes(aliasesBytes);
  const standardBinding = workPackage.sourceBindings.standardFormulaIds;
  const aliasBinding = workPackage.sourceBindings.legacyFormulaAliases;
  invariant(
    isRecord(standardBinding) &&
      standardBinding.sha256 === standardFormulaIdsHash &&
      isRecord(aliasBinding) &&
      aliasBinding.sha256 === legacyFormulaAliasesHash,
  );

  const rows: DirectWorkRow[] = [];
  const ids = new Set<string>();
  for (const [index, rawRow] of workPackage.rows.entries()) {
    const identity = identities.formulas[index];
    invariant(
      isRecord(rawRow) &&
        isRecord(identity) &&
        typeof rawRow.formulaId === "string" &&
        rawRow.formulaId === identity.formulaId &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        isRecord(rawRow.rights) &&
        isRecord(rawRow.implementationInput) &&
        isRecord(rawRow.parameterContract) &&
        isRecord(rawRow.defaultProfileCandidate) &&
        isRecord(rawRow.previewInput) &&
        isRecord(rawRow.fixturesOrOracle) &&
        isRecord(rawRow.review),
    );
    if (rawRow.rights.lane !== "direct-adaptation") continue;
    invariant(
      !ids.has(rawRow.formulaId) &&
        rawRow.inputAvailableForMigrationDraft === true &&
        rawRow.workStartEligibility === "blocked-incomplete-package" &&
        rawRow.review.status === "blocked-incomplete-package" &&
        rawRow.review.finalSourceRevision == null &&
        rawRow.review.finalSemanticHash == null &&
        rawRow.parameterContract.finalSchema == null &&
        rawRow.rights.canonicalLicenseTarget === "MIT" &&
        isDenseArray(rawRow.implementationInput.forbiddenForIsolatedImplementer) &&
        rawRow.implementationInput.forbiddenForIsolatedImplementer.length === 0,
    );

    if (rawRow.sourceSet === "F588") {
      invariant(
        rawRow.rights.class === "A" &&
          rawRow.rights.rightsEvidenceStatus ===
            "frozen-per-record-classification" &&
          rawRow.rights.sourceVisibility ===
            "source-visible-after-content-gate" &&
          rawRow.implementationInput.status === "ready-direct-source" &&
          rawRow.implementationInput.inputKind === "approved-direct-source" &&
          typeof rawRow.implementationInput.safeSourceLocator === "string" &&
          rawRow.implementationInput.safeSourceLocator.length > 0 &&
          rawRow.implementationInput.runtimeId == null &&
          rawRow.parameterContract.status ===
            "structural-types-only-not-final-schema" &&
          rawRow.defaultProfileCandidate.status ===
            "blocked-missing-formula-profile-candidate" &&
          rawRow.previewInput.status ===
            "blocked-until-profile-candidate-exists" &&
          rawRow.fixturesOrOracle.fixturePayloadStatus ===
            "available-and-sha256-verified" &&
          rawRow.fixturesOrOracle.oracleStatus ===
            "legacy-compatibility-orbit-oracle-available" &&
          SHA256.test(String(rawRow.fixturesOrOracle.artifactSha256)) &&
          typeof rawRow.fixturesOrOracle.evidenceKey === "string" &&
          rawRow.fixturesOrOracle.evidenceKey.length > 0,
      );
      rows.push({
        formulaId: rawRow.formulaId,
        sourceSet: "F588",
        rightsClass: "A",
        inputEvidenceKind: "approved-direct-source",
      });
    } else {
      invariant(
        rawRow.rights.class === "P" &&
          rawRow.rights.rightsEvidenceStatus ===
            "project-owned-runtime-source" &&
          rawRow.rights.sourceVisibility === "source-visible" &&
          rawRow.implementationInput.status ===
            "ready-project-owned-runtime-contract" &&
          rawRow.implementationInput.inputKind ===
            "project-owned-runtime-source-and-contract" &&
          rawRow.implementationInput.safeSourceLocator == null &&
          typeof rawRow.implementationInput.runtimeId === "string" &&
          rawRow.implementationInput.runtimeId.length > 0 &&
          rawRow.implementationInput.behaviorSpecAuthor ===
            "FractalPark project" &&
          /^[a-f0-9]{40}$/.test(
            String(rawRow.implementationInput.behaviorSpecRevision),
          ) &&
          SHA256.test(
            String(rawRow.implementationInput.behaviorSpecSha256),
          ) &&
          rawRow.parameterContract.status ===
            "ready-project-runtime-contract" &&
          rawRow.defaultProfileCandidate.status ===
            "ready-legacy-runtime-candidate-unverified-for-v1" &&
          rawRow.previewInput.status ===
            "ready-legacy-runtime-candidate-unverified-for-v1" &&
          rawRow.fixturesOrOracle.oracleStatus ===
            "repository-revision-bound-runtime-oracle-available" &&
          SHA256.test(String(rawRow.fixturesOrOracle.runtimeSemanticSha256)),
      );
      rows.push({
        formulaId: rawRow.formulaId,
        sourceSet: "B94",
        rightsClass: "P",
        inputEvidenceKind: "project-owned-runtime-contract",
      });
    }
    ids.add(rawRow.formulaId);
  }
  invariant(
    rows.length === 225 &&
      ids.size === 225 &&
      rows.filter((row) => row.sourceSet === "F588").length === 136 &&
      rows.filter((row) => row.sourceSet === "B94").length === 89,
  );
  return { rows, standardFormulaIdsHash, legacyFormulaAliasesHash };
}

function recomputeTechnicalRows(
  ledger: JsonRecord,
  workRows: readonly DirectWorkRow[],
): readonly DirectTechnicalRow[] {
  invariant(
    ledger.schema === "fractalpark-formula-library-bulk-migration-ledger/v2" &&
      ledger.controllerVersion === "formula-library-bulk-migration/2" &&
      ledger.deterministic === true &&
      isRecord(ledger.summary) &&
      ledger.summary.total === 677 &&
      ledger.summary.passed === 20 &&
      ledger.summary.failed === 657 &&
      isDenseArray(ledger.rows) &&
      ledger.rows.length === 677,
  );
  const byId = new Map<string, JsonRecord>();
  for (const rawRow of ledger.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        !byId.has(rawRow.formulaId) &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        (rawRow.status === "passed" || rawRow.status === "failed") &&
        rawRow.publicationEligible === false,
    );
    byId.set(rawRow.formulaId, rawRow);
  }
  invariant(byId.size === 677);
  const rows = workRows.map((workRow): DirectTechnicalRow => {
    const rawRow = byId.get(workRow.formulaId);
    invariant(rawRow && rawRow.sourceSet === workRow.sourceSet);
    if (rawRow.status === "passed") {
      invariant(
        rawRow.sourceSet === "F588" &&
          SHA256.test(String(rawRow.sourceRevision)) &&
          SHA256.test(String(rawRow.semanticHash)) &&
          SHA256.test(String(rawRow.backendArtifactSha256)) &&
          isRecord(rawRow.releaseOracle) &&
          rawRow.releaseOracle.status === "passed" &&
          isRecord(rawRow.webgl) &&
          rawRow.webgl.compileLinkDraw === "passed" &&
          rawRow.webgl.deterministicDraw === "passed" &&
          rawRow.webgl.cpuParity === "passed",
      );
      return {
        formulaId: workRow.formulaId,
        sourceSet: workRow.sourceSet,
        technicalStatus: "passed",
        technicalFailureReason: null,
      };
    }
    const reason = rawRow.reasonCode;
    const expectedStage =
      reason === "v1-projection-unsupported"
        ? "v1-projection"
        : reason === "release-oracle-mismatch"
          ? "release-oracle"
          : reason === "webgl-cpu-mismatch"
            ? "webgl-compile-link-draw"
            : null;
    invariant(expectedStage !== null && rawRow.failureStage === expectedStage);
    return {
      formulaId: workRow.formulaId,
      sourceSet: workRow.sourceSet,
      technicalStatus: "failed",
      technicalFailureReason: reason as TechnicalFailureReason,
    };
  });
  const failureCounts = new Map<TechnicalFailureReason, number>();
  for (const row of rows) {
    if (row.technicalFailureReason !== null) {
      failureCounts.set(
        row.technicalFailureReason,
        (failureCounts.get(row.technicalFailureReason) ?? 0) + 1,
      );
    }
  }
  invariant(
    rows.filter((row) => row.technicalStatus === "passed").length === 20 &&
      rows.filter((row) => row.technicalStatus === "failed").length === 205 &&
      failureCounts.get("v1-projection-unsupported") === 174 &&
      failureCounts.get("release-oracle-mismatch") === 15 &&
      failureCounts.get("webgl-cpu-mismatch") === 16,
  );
  return rows;
}

function assertProvisionalFile(
  directory: string,
  filename: unknown,
  expectedHash: unknown,
): void {
  invariant(
    typeof filename === "string" &&
      /^[a-z0-9-]+\.png$/.test(filename) &&
      SHA256.test(String(expectedHash)),
  );
  const path = join(directory, filename);
  const bytes = readStableFile(path, true);
  invariant(
    realpathSync(path) === join(realpathSync(directory), filename) &&
      sha256Bytes(bytes) === expectedHash,
  );
}

function recomputeProvisionalIds(
  repositoryRoot: string,
  manifest: JsonRecord,
  technicalRows: readonly DirectTechnicalRow[],
): ReadonlySet<string> {
  const directory = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "provisional-assets-v1",
  );
  const directoryMetadata = lstatSync(directory);
  invariant(
    directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      (directoryMetadata.mode & 0o777) === 0o700 &&
      realpathSync(directory) ===
        join(
          realpathSync(repositoryRoot),
          ".formula-library-private",
          "formula-library-v1",
          "provisional-assets-v1",
        ),
  );
  invariant(
    manifest.schema === "fractalpark-formula-library-provisional-assets/v1" &&
      manifest.controllerVersion === "formula-library-provisional-assets/1" &&
      manifest.deterministic === true &&
      manifest.publicationEligible === false &&
      manifest.verifiedDefaultProfiles === 0 &&
      manifest.runnableLedgerContentHash === EXPECTED_LEDGER_HASH &&
      isRecord(manifest.summary) &&
      manifest.summary.accounted === 677 &&
      manifest.summary.runnableSelection === 20 &&
      manifest.summary.failedHeldFailClosed === 657 &&
      manifest.summary.presentableCandidates === 20 &&
      isDenseArray(manifest.rows) &&
      manifest.rows.length === 20 &&
      isRecord(manifest.contactSheet),
  );
  assertProvisionalFile(
    directory,
    manifest.contactSheet.file,
    manifest.contactSheet.pngSha256,
  );
  const technicalById = new Map(
    technicalRows.map((row) => [row.formulaId, row] as const),
  );
  const ids = new Set<string>();
  const expectedFiles = new Set(["manifest.json"]);
  for (const rawRow of manifest.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        !ids.has(rawRow.formulaId) &&
        rawRow.status === "presentable-candidate" &&
        rawRow.provisionalDefaultProfile === true &&
        rawRow.verifiedDefaultProfile === false &&
        rawRow.publicationEligible === false &&
        isRecord(rawRow.profile) &&
        rawRow.profile.formulaId === rawRow.formulaId &&
        isRecord(rawRow.preview),
    );
    const technical = technicalById.get(rawRow.formulaId);
    invariant(technical?.technicalStatus === "passed");
    assertProvisionalFile(
      directory,
      rawRow.preview.file,
      rawRow.preview.pngSha256,
    );
    expectedFiles.add(String(rawRow.preview.file));
    ids.add(rawRow.formulaId);
  }
  expectedFiles.add(String(manifest.contactSheet.file));
  invariant(
    ids.size === 20 &&
      readdirSync(directory).sort().join("\u0000") ===
        [...expectedFiles].sort().join("\u0000"),
  );
  return ids;
}

function recomputeExpectedBody(
  repositoryRoot: string,
  binding: RepositoryBinding,
): JsonRecord {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
  );
  const workProjection = recomputeWorkRows(repositoryRoot, workPackage);
  const ledger = readPrivateJson(
    join(
      repositoryRoot,
      ".formula-library-private",
      "formula-library-v1",
      "bulk-migration-ledger.json",
    ),
  );
  assertSelfHash(ledger, "ledgerContentHash", EXPECTED_LEDGER_HASH);
  const technicalRows = recomputeTechnicalRows(ledger, workProjection.rows);
  const provisional = readPrivateJson(
    join(
      repositoryRoot,
      ".formula-library-private",
      "formula-library-v1",
      "provisional-assets-v1",
      "manifest.json",
    ),
  );
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
  );
  const provisionalIds = recomputeProvisionalIds(
    repositoryRoot,
    provisional,
    technicalRows,
  );
  const inputHashes: InputHashes = {
    workPackage: EXPECTED_WORK_PACKAGE_HASH,
    runnableLedger: EXPECTED_LEDGER_HASH,
    provisionalManifest: EXPECTED_PROVISIONAL_HASH,
    standardFormulaIds: workProjection.standardFormulaIdsHash,
    legacyFormulaAliases: workProjection.legacyFormulaAliasesHash,
  };

  const blockerCounts = new Map<string, number>();
  const rows = workProjection.rows.map((workRow, index) => {
    const technical = technicalRows[index]!;
    invariant(
      technical.formulaId === workRow.formulaId &&
        technical.sourceSet === workRow.sourceSet,
    );
    const blockers = [
      "advancement-review-not-approved",
      "final-parameter-schema-missing",
    ];
    if (technical.technicalFailureReason !== null) {
      blockers.push(`technical-${technical.technicalFailureReason}`);
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
    const row = {
      formulaId: workRow.formulaId,
      sourceSet: workRow.sourceSet,
      rightsClass: workRow.rightsClass,
      inputEvidenceKind: workRow.inputEvidenceKind,
      inputEvidenceBound: true,
      technicalStatus: technical.technicalStatus,
      technicalFailureReason: technical.technicalFailureReason,
      provisionalCandidate: provisionalIds.has(workRow.formulaId),
      admissionStatus: "blocked",
      blockers,
    };
    return {
      ...row,
      rowProjectionHash: sha256Canonical({ inputHashes, row }),
    };
  });
  const sortedBlockerCounts = [...blockerCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));

  return {
    schema: "fractalpark-formula-library-direct-adaptation-evidence/v1",
    controllerVersion: CONTROLLER_VERSION,
    deterministic: true,
    generationBinding: binding,
    inputHashes,
    candidateReceiptsIssued: 0,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: {
      total: 225,
      f588: 136,
      b94: 89,
      inputEvidenceBound: 225,
      technicalRunnable: 20,
      technicalBlocked: 205,
      provisionalCandidates: 20,
      advancementReviewsApproved: 0,
      finalParameterSchemas: 0,
      verifiedFinalProfiles: 0,
      verifiedFinalPreviews: 0,
      finalRecords: 0,
      candidateAdmitted: 0,
      candidateBlocked: 225,
      technicalFailureCounts: {
        v1ProjectionUnsupported: 174,
        releaseOracleMismatch: 15,
        webglCpuMismatch: 16,
      },
      blockerCounts: sortedBlockerCounts,
    },
    rows,
  };
}

function assertSafeProjection(value: unknown): void {
  const serialized = canonicalJson(value).toLowerCase();
  for (const token of [
    "/home/",
    "sourcelocator",
    "safesourcelocator",
    "privatepath",
    "canonicalsource",
    "originalsource",
    "rawpayload",
    "runtimeid",
    "behaviorspec",
    "displayname",
    "typedlegacyaliases",
    "intermediaterepresentation",
  ]) {
    invariant(!serialized.includes(token));
  }
}

export function verifyDirectAdaptationEvidence(
  repositoryRoot: string,
): Readonly<{
  inputEvidenceBound: number;
  technicalRunnable: number;
  technicalBlocked: number;
  candidateAdmitted: number;
  manifestContentHash: string;
}> {
  const currentBinding = captureRepositoryBinding(repositoryRoot);
  const outputDirectory = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "direct-adaptation-evidence-v1",
  );
  const directoryMetadata = lstatSync(outputDirectory);
  invariant(
    directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      (directoryMetadata.mode & 0o777) === 0o700 &&
      realpathSync(outputDirectory) ===
        join(
          realpathSync(repositoryRoot),
          ".formula-library-private",
          "formula-library-v1",
          "direct-adaptation-evidence-v1",
        ) &&
      readdirSync(outputDirectory).join("\u0000") === "manifest.json",
  );
  const manifest = readPrivateJson(join(outputDirectory, "manifest.json"));
  invariant(
    manifest.schema ===
      "fractalpark-formula-library-direct-adaptation-evidence/v1" &&
      manifest.controllerVersion === CONTROLLER_VERSION &&
      manifest.deterministic === true &&
      typeof manifest.manifestContentHash === "string" &&
      SHA256.test(manifest.manifestContentHash),
  );
  invariant(isRecord(manifest.generationBinding));
  const storedBinding = manifest.generationBinding;
  invariant(
    typeof storedBinding.repositoryBaseCommit === "string" &&
      typeof storedBinding.repositoryIndexTree === "string",
  );
  const boundRepository: RepositoryBinding = {
    repositoryBaseCommit: storedBinding.repositoryBaseCommit,
    repositoryIndexTree: storedBinding.repositoryIndexTree,
  };
  assertStoredBinding(repositoryRoot, boundRepository, currentBinding);
  const manifestBody = { ...manifest };
  delete manifestBody.manifestContentHash;
  invariant(
    sha256Canonical(manifestBody) === manifest.manifestContentHash,
  );
  const expectedBody = recomputeExpectedBody(repositoryRoot, boundRepository);
  invariant(canonicalJson(manifestBody) === canonicalJson(expectedBody));
  assertSafeProjection(manifest);
  invariant(
    isRecord(manifest.summary) &&
      manifest.summary.total === 225 &&
      manifest.summary.inputEvidenceBound === 225 &&
      manifest.summary.technicalRunnable === 20 &&
      manifest.summary.technicalBlocked === 205 &&
      manifest.summary.candidateAdmitted === 0 &&
      manifest.summary.candidateBlocked === 225 &&
      manifest.candidateReceiptsIssued === 0 &&
      manifest.publicCandidateAssemblyAllowed === false &&
      manifest.publicPromotionAllowed === false &&
      manifest.publicAssetsWritten === 0,
  );
  invariant(
    canonicalJson(currentBinding) ===
      canonicalJson(captureRepositoryBinding(repositoryRoot)),
  );
  return {
    inputEvidenceBound: 225,
    technicalRunnable: 20,
    technicalBlocked: 205,
    candidateAdmitted: 0,
    manifestContentHash: manifest.manifestContentHash,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = verifyDirectAdaptationEvidence(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        inputEvidenceBound: result.inputEvidenceBound,
        technicalRunnable: result.technicalRunnable,
        technicalBlocked: result.technicalBlocked,
        candidateAdmitted: result.candidateAdmitted,
        candidateReceiptsIssued: 0,
        publicCandidateAssemblyAllowed: false,
        publicPromotionAllowed: false,
        publicAssetsWritten: 0,
        manifestContentHash: result.manifestContentHash,
      })}\n`,
    );
  } catch {
    process.stderr.write("direct-evidence-verification-invalid\n");
    process.exitCode = 1;
  }
}
