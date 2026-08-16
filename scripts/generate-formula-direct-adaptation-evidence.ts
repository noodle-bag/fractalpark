import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DIRECT_ADAPTATION_EVIDENCE_VERSION_V1,
  evaluateDirectAdaptationEvidenceV1,
} from "../src/engine/formulas/v1/direct-adaptation-evidence";

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const EXPECTED_LEDGER_HASH =
  "0c494e773a918051e1efc398999de6b5ab684ac96af8cad7be0c0c2156aea545";
const EXPECTED_PROVISIONAL_HASH =
  "66fb2b3ed825e8036c6d78c8b0ff0f008ca0a533046275ccff2e5c1524ad230f";
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const OUTPUT_COMPONENTS = Object.freeze([
  ".formula-library-private",
  "formula-library-v1",
  "direct-adaptation-evidence-v1",
]);
const OUTPUT_FILENAME = "manifest.json";
const SHA256 = /^[a-f0-9]{64}$/;
const PUBLIC_ERROR_CODES = new Set([
  "direct-evidence-exact-set-invalid",
  "direct-evidence-frozen-hash-mismatch",
  "direct-evidence-identity-binding-invalid",
  "direct-evidence-input-invalid",
  "direct-evidence-output-containment-failed",
  "direct-evidence-output-permissions-invalid",
  "direct-evidence-output-set-invalid",
  "direct-evidence-output-symlink-rejected",
  "direct-evidence-output-write-failed",
  "direct-evidence-provisional-invalid",
  "direct-evidence-provisional-row-invalid",
  "direct-evidence-repository-binding",
  "direct-evidence-runnable-row-invalid",
  "direct-evidence-technical-accounting-invalid",
  "direct-evidence-work-package-invalid",
  "direct-evidence-work-row-invalid",
]);

type JsonRecord = Record<string, unknown>;
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
type DirectEvidenceInputs = Readonly<{
  workRows: readonly unknown[];
  runnableRows: readonly unknown[];
  provisionalRows: readonly unknown[];
  inputHashes: InputHashes;
}>;

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
  invariant(isRecord(value), "direct-evidence-input-invalid");
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

function lstatIfPresent(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readStableFile(
  path: string,
  code: string,
  requirePrivateMode: boolean,
): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Error(code);
  }
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        (!requirePrivateMode || (opened.mode & 0o777) === 0o600),
      code,
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
      code,
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function readPrivateJson(path: string, code: string): JsonRecord {
  try {
    const parsed = JSON.parse(
      readStableFile(path, code, true).toString("utf8"),
    ) as unknown;
    invariant(isRecord(parsed), code);
    return parsed;
  } catch {
    throw new Error(code);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path, "direct-evidence-work-package-invalid");
  try {
    const markdown = readStableFile(
      path,
      "direct-evidence-work-package-invalid",
      true,
    ).toString("utf8");
    const marker = markdown.indexOf(WORK_PACKAGE_START);
    const start = markdown.indexOf("{", marker);
    const end = markdown.indexOf("```", start);
    invariant(
      marker >= 0 && start > marker && end > start,
      "direct-evidence-work-package-invalid",
    );
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed), "direct-evidence-work-package-invalid");
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "direct-evidence-work-package-invalid"
    ) {
      throw error;
    }
    throw new Error("direct-evidence-work-package-invalid");
  }
}

function assertSelfHash(
  value: JsonRecord,
  field: string,
  expected: string,
  code: string,
): void {
  invariant(value[field] === expected, code);
  const unhashed = { ...value };
  delete unhashed[field];
  invariant(sha256Canonical(unhashed) === expected, code);
}

function gitOutput(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  invariant(result.status === 0, "direct-evidence-repository-binding");
  return result.stdout.trim();
}

function captureRepositoryBinding(repositoryRoot: string): RepositoryBinding {
  const metadata = lstatSync(repositoryRoot);
  invariant(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(repositoryRoot) === resolve(repositoryRoot),
    "direct-evidence-repository-binding",
  );
  invariant(
    spawnSync("git", ["diff", "--quiet", "--no-ext-diff"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
    "direct-evidence-repository-binding",
  );
  invariant(
    spawnSync("git", ["diff", "--cached", "--check"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
    "direct-evidence-repository-binding",
  );
  invariant(
    gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]) ===
      "",
    "direct-evidence-repository-binding",
  );
  const repositoryBaseCommit = gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const repositoryIndexTree = gitOutput(repositoryRoot, ["write-tree"]);
  invariant(
    /^[a-f0-9]{40}$/.test(repositoryBaseCommit) &&
      /^[a-f0-9]{40}$/.test(repositoryIndexTree),
    "direct-evidence-repository-binding",
  );
  return { repositoryBaseCommit, repositoryIndexTree };
}

function assertSameBinding(
  initial: RepositoryBinding,
  final: RepositoryBinding,
): void {
  invariant(
    initial.repositoryBaseCommit === final.repositoryBaseCommit &&
      initial.repositoryIndexTree === final.repositoryIndexTree,
    "direct-evidence-repository-binding",
  );
}

function projectWorkRows(
  repositoryRoot: string,
  workPackage: JsonRecord,
): Readonly<{
  workRows: readonly unknown[];
  standardFormulaIdsHash: string;
  legacyFormulaAliasesHash: string;
}> {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      isRecord(workPackage.sourceBindings),
    "direct-evidence-work-package-invalid",
  );
  const identitiesPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "standard-formula-ids.json",
  );
  const aliasesPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "legacy-formula-aliases.json",
  );
  const identitiesBytes = readStableFile(
    identitiesPath,
    "direct-evidence-identity-binding-invalid",
    false,
  );
  const aliasesBytes = readStableFile(
    aliasesPath,
    "direct-evidence-identity-binding-invalid",
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
    "direct-evidence-identity-binding-invalid",
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
    "direct-evidence-identity-binding-invalid",
  );

  const directRows: unknown[] = [];
  const directIds = new Set<string>();
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
      "direct-evidence-work-package-invalid",
    );
    if (rawRow.rights.lane !== "direct-adaptation") continue;
    invariant(
      !directIds.has(rawRow.formulaId) &&
        rawRow.inputAvailableForMigrationDraft === true &&
        rawRow.workStartEligibility === "blocked-incomplete-package" &&
        rawRow.review.status === "blocked-incomplete-package" &&
        rawRow.review.finalSourceRevision == null &&
        rawRow.review.finalSemanticHash == null &&
        rawRow.parameterContract.finalSchema == null &&
        rawRow.rights.canonicalLicenseTarget === "MIT" &&
        isDenseArray(rawRow.implementationInput.forbiddenForIsolatedImplementer) &&
        rawRow.implementationInput.forbiddenForIsolatedImplementer.length === 0,
      "direct-evidence-work-package-invalid",
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
        "direct-evidence-work-package-invalid",
      );
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
        "direct-evidence-work-package-invalid",
      );
    }
    directIds.add(rawRow.formulaId);
    directRows.push({
      formulaId: rawRow.formulaId,
      sourceSet: rawRow.sourceSet,
      rightsClass: rawRow.rights.class,
      rightsEvidenceStatus: rawRow.rights.rightsEvidenceStatus,
      sourceVisibility: rawRow.rights.sourceVisibility,
      implementationInputKind: rawRow.implementationInput.inputKind,
      implementationInputStatus: rawRow.implementationInput.status,
      workStartEligibility: rawRow.workStartEligibility,
      reviewStatus: rawRow.review.status,
      parameterContractStatus: rawRow.parameterContract.status,
      profileCandidateStatus: rawRow.defaultProfileCandidate.status,
      previewInputStatus: rawRow.previewInput.status,
    });
  }
  invariant(
    directRows.length === 225 && directIds.size === 225,
    "direct-evidence-exact-set-invalid",
  );
  return {
    workRows: directRows,
    standardFormulaIdsHash,
    legacyFormulaAliasesHash,
  };
}

function projectRunnableRows(
  ledger: JsonRecord,
  workRows: readonly unknown[],
): readonly unknown[] {
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
    "direct-evidence-input-invalid",
  );
  const ledgerById = new Map<string, JsonRecord>();
  for (const rawRow of ledger.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        !ledgerById.has(rawRow.formulaId) &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        (rawRow.status === "passed" || rawRow.status === "failed") &&
        rawRow.publicationEligible === false,
      "direct-evidence-input-invalid",
    );
    ledgerById.set(rawRow.formulaId, rawRow);
  }
  invariant(ledgerById.size === 677, "direct-evidence-input-invalid");

  return workRows.map((workRow) => {
    invariant(isRecord(workRow), "direct-evidence-input-invalid");
    const rawRow = ledgerById.get(String(workRow.formulaId));
    invariant(
      rawRow && rawRow.sourceSet === workRow.sourceSet,
      "direct-evidence-exact-set-invalid",
    );
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
        "direct-evidence-input-invalid",
      );
      return {
        formulaId: rawRow.formulaId,
        sourceSet: rawRow.sourceSet,
        status: "passed",
        failureReason: null,
        publicationEligible: false,
      };
    }
    const expectedStage =
      rawRow.reasonCode === "v1-projection-unsupported"
        ? "v1-projection"
        : rawRow.reasonCode === "release-oracle-mismatch"
          ? "release-oracle"
          : rawRow.reasonCode === "webgl-cpu-mismatch"
            ? "webgl-compile-link-draw"
            : null;
    invariant(
      expectedStage !== null && rawRow.failureStage === expectedStage,
      "direct-evidence-input-invalid",
    );
    return {
      formulaId: rawRow.formulaId,
      sourceSet: rawRow.sourceSet,
      status: "failed",
      failureReason: rawRow.reasonCode,
      publicationEligible: false,
    };
  });
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
    "direct-evidence-provisional-invalid",
  );
  const path = join(directory, filename);
  const bytes = readStableFile(
    path,
    "direct-evidence-provisional-invalid",
    true,
  );
  invariant(
    realpathSync(path) === join(realpathSync(directory), filename) &&
      sha256Bytes(bytes) === expectedHash,
    "direct-evidence-provisional-invalid",
  );
}

function projectProvisionalRows(
  directory: string,
  manifest: JsonRecord,
  runnableRows: readonly unknown[],
): readonly unknown[] {
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
    "direct-evidence-provisional-invalid",
  );
  assertProvisionalFile(
    directory,
    manifest.contactSheet.file,
    manifest.contactSheet.pngSha256,
  );
  const sourceSetById = new Map<string, "F588" | "B94">();
  for (const value of runnableRows) {
    invariant(isRecord(value), "direct-evidence-provisional-invalid");
    if (value.sourceSet === "F588" || value.sourceSet === "B94") {
      sourceSetById.set(String(value.formulaId), value.sourceSet);
    }
  }
  const expectedFiles = new Set(["manifest.json"]);
  const projected = manifest.rows.map((rawRow) => {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        rawRow.status === "presentable-candidate" &&
        rawRow.provisionalDefaultProfile === true &&
        rawRow.verifiedDefaultProfile === false &&
        rawRow.publicationEligible === false &&
        isRecord(rawRow.profile) &&
        rawRow.profile.formulaId === rawRow.formulaId &&
        isRecord(rawRow.preview),
      "direct-evidence-provisional-invalid",
    );
    assertProvisionalFile(
      directory,
      rawRow.preview.file,
      rawRow.preview.pngSha256,
    );
    expectedFiles.add(String(rawRow.preview.file));
    const projectedSourceSet = sourceSetById.get(rawRow.formulaId);
    invariant(projectedSourceSet, "direct-evidence-provisional-invalid");
    return {
      formulaId: rawRow.formulaId,
      sourceSet: projectedSourceSet,
      status: "presentable-candidate",
      provisionalDefaultProfile: true,
      verifiedDefaultProfile: false,
      publicationEligible: false,
    };
  });
  expectedFiles.add(String(manifest.contactSheet.file));
  invariant(
    readdirSync(directory).sort().join("\u0000") ===
      [...expectedFiles].sort().join("\u0000"),
    "direct-evidence-provisional-invalid",
  );
  return projected;
}

function readDirectEvidenceInputs(repositoryRoot: string): DirectEvidenceInputs {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
    "direct-evidence-frozen-hash-mismatch",
  );
  const workProjection = projectWorkRows(repositoryRoot, workPackage);

  const ledger = readPrivateJson(
    join(
      repositoryRoot,
      ".formula-library-private",
      "formula-library-v1",
      "bulk-migration-ledger.json",
    ),
    "direct-evidence-input-invalid",
  );
  assertSelfHash(
    ledger,
    "ledgerContentHash",
    EXPECTED_LEDGER_HASH,
    "direct-evidence-frozen-hash-mismatch",
  );
  const runnableRows = projectRunnableRows(ledger, workProjection.workRows);

  const provisionalDirectory = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "provisional-assets-v1",
  );
  const provisionalDirectoryMetadata = lstatSync(provisionalDirectory);
  invariant(
    provisionalDirectoryMetadata.isDirectory() &&
      !provisionalDirectoryMetadata.isSymbolicLink() &&
      (provisionalDirectoryMetadata.mode & 0o777) === 0o700 &&
      realpathSync(provisionalDirectory) ===
        join(
          realpathSync(repositoryRoot),
          ".formula-library-private",
          "formula-library-v1",
          "provisional-assets-v1",
        ),
    "direct-evidence-provisional-invalid",
  );
  const provisional = readPrivateJson(
    join(provisionalDirectory, "manifest.json"),
    "direct-evidence-provisional-invalid",
  );
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
    "direct-evidence-frozen-hash-mismatch",
  );
  const provisionalRows = projectProvisionalRows(
    provisionalDirectory,
    provisional,
    runnableRows,
  );

  return {
    workRows: workProjection.workRows,
    runnableRows,
    provisionalRows,
    inputHashes: {
      workPackage: EXPECTED_WORK_PACKAGE_HASH,
      runnableLedger: EXPECTED_LEDGER_HASH,
      provisionalManifest: EXPECTED_PROVISIONAL_HASH,
      standardFormulaIds: workProjection.standardFormulaIdsHash,
      legacyFormulaAliases: workProjection.legacyFormulaAliasesHash,
    },
  };
}

function securePrivateDirectory(path: string): void {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fchmodSync(descriptor, 0o700);
    const metadata = fstatSync(descriptor);
    invariant(
      metadata.isDirectory() && (metadata.mode & 0o777) === 0o700,
      "direct-evidence-output-permissions-invalid",
    );
  } finally {
    closeSync(descriptor);
  }
}

function ensurePrivateOutputDirectory(repositoryRoot: string): string {
  const realRepositoryRoot = realpathSync(repositoryRoot);
  let current = repositoryRoot;
  let expectedReal = realRepositoryRoot;
  for (const component of OUTPUT_COMPONENTS) {
    current = join(current, component);
    expectedReal = join(expectedReal, component);
    const metadata = lstatIfPresent(current);
    if (metadata === null) mkdirSync(current, { mode: 0o700 });
    else
      invariant(
        metadata.isDirectory() && !metadata.isSymbolicLink(),
        "direct-evidence-output-symlink-rejected",
      );
    securePrivateDirectory(current);
    invariant(
      realpathSync(current) === expectedReal,
      "direct-evidence-output-containment-failed",
    );
  }
  return current;
}

function assertDescriptorOutputSet(
  directoryDescriptor: number,
  allowMissing: boolean,
): void {
  const entries = readdirSync(`/proc/self/fd/${directoryDescriptor}`).sort();
  invariant(
    (allowMissing && entries.length === 0) ||
      (entries.length === 1 && entries[0] === OUTPUT_FILENAME),
    "direct-evidence-output-set-invalid",
  );
}

export function writePrivateDirectAdaptationEvidenceManifest(
  repositoryRoot: string,
  content: string,
): string {
  try {
    const outputDirectory = ensurePrivateOutputDirectory(repositoryRoot);
    const expectedReal = join(
      realpathSync(repositoryRoot),
      ...OUTPUT_COMPONENTS,
    );
    const directoryDescriptor = openSync(
      outputDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const openedDirectory = fstatSync(directoryDescriptor);
      invariant(
        openedDirectory.isDirectory() &&
          openedDirectory.nlink >= 1 &&
          (openedDirectory.mode & 0o777) === 0o700 &&
          realpathSync(`/proc/self/fd/${directoryDescriptor}`) === expectedReal,
        "direct-evidence-output-containment-failed",
      );
      assertDescriptorOutputSet(directoryDescriptor, true);
      const descriptorPath = join(
        `/proc/self/fd/${directoryDescriptor}`,
        OUTPUT_FILENAME,
      );
      const existing = lstatIfPresent(descriptorPath);
      if (existing !== null) {
        invariant(
          existing.isFile() &&
            !existing.isSymbolicLink() &&
            existing.nlink === 1,
          "direct-evidence-output-containment-failed",
        );
      }
      const temporaryPath = join(
        `/proc/self/fd/${directoryDescriptor}`,
        `.manifest-${randomBytes(16).toString("hex")}.tmp`,
      );
      let temporaryExists = false;
      let fileDescriptor: number | null = null;
      try {
        fileDescriptor = openSync(
          temporaryPath,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        temporaryExists = true;
        const openedFile = fstatSync(fileDescriptor);
        invariant(
          openedFile.isFile() && openedFile.nlink === 1,
          "direct-evidence-output-containment-failed",
        );
        fchmodSync(fileDescriptor, 0o600);
        writeFileSync(fileDescriptor, content);
        fsyncSync(fileDescriptor);
        const finalFile = fstatSync(fileDescriptor);
        invariant(
          finalFile.isFile() &&
            finalFile.nlink === 1 &&
            (finalFile.mode & 0o777) === 0o600,
          "direct-evidence-output-permissions-invalid",
        );
        const currentTemporary = lstatSync(temporaryPath);
        invariant(
          currentTemporary.isFile() &&
            !currentTemporary.isSymbolicLink() &&
            currentTemporary.dev === finalFile.dev &&
            currentTemporary.ino === finalFile.ino &&
            currentTemporary.nlink === 1,
          "direct-evidence-output-containment-failed",
        );
        renameSync(temporaryPath, descriptorPath);
        temporaryExists = false;
        fsyncSync(directoryDescriptor);
        const installed = lstatSync(descriptorPath);
        invariant(
          installed.isFile() &&
            !installed.isSymbolicLink() &&
            installed.dev === finalFile.dev &&
            installed.ino === finalFile.ino &&
            installed.nlink === 1 &&
            (installed.mode & 0o777) === 0o600,
          "direct-evidence-output-containment-failed",
        );
        const installedDescriptor = openSync(
          descriptorPath,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const beforeRead = fstatSync(installedDescriptor);
          const installedBytes = readFileSync(installedDescriptor);
          const afterRead = fstatSync(installedDescriptor);
          const installedPath = lstatSync(descriptorPath);
          invariant(
            beforeRead.isFile() &&
              beforeRead.nlink === 1 &&
              (beforeRead.mode & 0o777) === 0o600 &&
              beforeRead.dev === finalFile.dev &&
              beforeRead.ino === finalFile.ino &&
              beforeRead.dev === afterRead.dev &&
              beforeRead.ino === afterRead.ino &&
              beforeRead.size === afterRead.size &&
              installedPath.isFile() &&
              !installedPath.isSymbolicLink() &&
              installedPath.dev === beforeRead.dev &&
              installedPath.ino === beforeRead.ino &&
              installedPath.nlink === 1 &&
              installedBytes.equals(Buffer.from(content, "utf8")),
            "direct-evidence-output-containment-failed",
          );
        } finally {
          closeSync(installedDescriptor);
        }
      } finally {
        if (fileDescriptor !== null) closeSync(fileDescriptor);
        if (temporaryExists) {
          try {
            unlinkSync(temporaryPath);
          } catch {
            // The primary error is sanitized by the outer boundary.
          }
        }
      }
      const currentDirectory = lstatSync(outputDirectory);
      invariant(
        currentDirectory.isDirectory() &&
          !currentDirectory.isSymbolicLink() &&
          currentDirectory.dev === openedDirectory.dev &&
          currentDirectory.ino === openedDirectory.ino &&
          realpathSync(outputDirectory) === expectedReal,
        "direct-evidence-output-containment-failed",
      );
      assertDescriptorOutputSet(directoryDescriptor, false);
    } finally {
      closeSync(directoryDescriptor);
    }
    return join(outputDirectory, OUTPUT_FILENAME);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("direct-evidence-output-")
    ) {
      throw error;
    }
    throw new Error("direct-evidence-output-write-failed");
  }
}

function assertSafeManifestProjection(value: unknown): void {
  const serialized = canonicalJson(value).toLowerCase();
  const forbidden = [
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
    "ast",
    "intermediaterepresentation",
  ];
  invariant(
    forbidden.every((token) => !serialized.includes(token)),
    "direct-evidence-input-invalid",
  );
}

export function generateDirectAdaptationEvidence(
  repositoryRoot: string,
): Readonly<{
  inputEvidenceBound: number;
  technicalRunnable: number;
  technicalBlocked: number;
  candidateAdmitted: number;
  manifestContentHash: string;
}> {
  const initialBinding = captureRepositoryBinding(repositoryRoot);
  const inputs = readDirectEvidenceInputs(repositoryRoot);
  const result = evaluateDirectAdaptationEvidenceV1({
    workRows: inputs.workRows,
    runnableRows: inputs.runnableRows,
    provisionalRows: inputs.provisionalRows,
  });
  const rows = result.rows.map((row) => ({
    ...row,
    rowProjectionHash: sha256Canonical({
      inputHashes: inputs.inputHashes,
      row,
    }),
  }));
  const body = {
    schema: result.schema,
    controllerVersion: DIRECT_ADAPTATION_EVIDENCE_VERSION_V1,
    deterministic: true,
    generationBinding: initialBinding,
    inputHashes: inputs.inputHashes,
    candidateReceiptsIssued: result.candidateReceiptsIssued,
    publicCandidateAssemblyAllowed: result.publicCandidateAssemblyAllowed,
    publicPromotionAllowed: result.publicPromotionAllowed,
    publicAssetsWritten: result.publicAssetsWritten,
    summary: result.summary,
    rows,
  };
  assertSafeManifestProjection(body);
  const manifest = {
    ...body,
    manifestContentHash: sha256Canonical(body),
  };
  assertSameBinding(
    initialBinding,
    captureRepositoryBinding(repositoryRoot),
  );
  writePrivateDirectAdaptationEvidenceManifest(
    repositoryRoot,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  assertSameBinding(
    initialBinding,
    captureRepositoryBinding(repositoryRoot),
  );
  return {
    inputEvidenceBound: result.summary.inputEvidenceBound,
    technicalRunnable: result.summary.technicalRunnable,
    technicalBlocked: result.summary.technicalBlocked,
    candidateAdmitted: result.summary.candidateAdmitted,
    manifestContentHash: manifest.manifestContentHash,
  };
}

export function sanitizeDirectAdaptationEvidenceError(error: unknown): string {
  return error instanceof Error && PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "direct-evidence-controller-internal-error";
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    invariant(
      process.argv.includes("--write"),
      "direct-evidence-output-write-failed",
    );
    const result = generateDirectAdaptationEvidence(process.cwd());
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
  } catch (error) {
    process.stderr.write(`${sanitizeDirectAdaptationEvidenceError(error)}\n`);
    process.exitCode = 1;
  }
}
