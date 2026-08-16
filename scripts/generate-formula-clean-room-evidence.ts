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
  CLEAN_ROOM_EVIDENCE_VERSION_V1,
  evaluateCleanRoomEvidenceV1,
} from "../src/engine/formulas/v1/clean-room-evidence";

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
  "clean-room-evidence-v1",
]);
const OUTPUT_FILENAME = "manifest.json";
const SHA256 = /^[a-f0-9]{64}$/;
const PUBLIC_ERROR_CODES = new Set([
  "clean-room-evidence-exact-set-invalid",
  "clean-room-evidence-frozen-hash-mismatch",
  "clean-room-evidence-identity-binding-invalid",
  "clean-room-evidence-input-invalid",
  "clean-room-evidence-ledger-row-invalid",
  "clean-room-evidence-output-containment-failed",
  "clean-room-evidence-output-permissions-invalid",
  "clean-room-evidence-output-set-invalid",
  "clean-room-evidence-output-symlink-rejected",
  "clean-room-evidence-output-write-failed",
  "clean-room-evidence-provisional-invalid",
  "clean-room-evidence-provisional-row-invalid",
  "clean-room-evidence-repository-binding",
  "clean-room-evidence-runnable-row-invalid",
  "clean-room-evidence-technical-accounting-invalid",
  "clean-room-evidence-work-package-invalid",
  "clean-room-evidence-work-row-invalid",
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
type CleanRoomEvidenceInputs = Readonly<{
  workRows: readonly unknown[];
  ledgerRows: readonly unknown[];
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
  invariant(isRecord(value), "clean-room-evidence-input-invalid");
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

function openAnchoredPrivateDirectory(
  repositoryRoot: string,
  components: readonly string[],
  code: string,
): number {
  let currentDescriptor: number | null = null;
  try {
    const realRepositoryRoot = realpathSync(repositoryRoot);
    let expectedReal = realRepositoryRoot;
    currentDescriptor = openSync(
      repositoryRoot,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    invariant(
      fstatSync(currentDescriptor).isDirectory() &&
        realpathSync(`/proc/self/fd/${currentDescriptor}`) === realRepositoryRoot,
      code,
    );
    for (const component of components) {
      const descriptorChildPath = join(
        `/proc/self/fd/${currentDescriptor}`,
        component,
      );
      const pathMetadata = lstatSync(descriptorChildPath);
      invariant(
        pathMetadata.isDirectory() &&
          !pathMetadata.isSymbolicLink() &&
          (pathMetadata.mode & 0o777) === 0o700,
        code,
      );
      const childDescriptor = openSync(
        descriptorChildPath,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        const childDirectory = fstatSync(childDescriptor);
        expectedReal = join(expectedReal, component);
        invariant(
          childDirectory.isDirectory() &&
            (childDirectory.mode & 0o777) === 0o700 &&
            realpathSync(`/proc/self/fd/${childDescriptor}`) === expectedReal,
          code,
        );
      } catch (error) {
        closeSync(childDescriptor);
        throw error;
      }
      closeSync(currentDescriptor);
      currentDescriptor = childDescriptor;
    }
    const result = currentDescriptor;
    currentDescriptor = null;
    return result;
  } catch {
    throw new Error(code);
  } finally {
    if (currentDescriptor !== null) closeSync(currentDescriptor);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path, "clean-room-evidence-work-package-invalid");
  try {
    invariant(
      realpathSync(path) === resolve(path),
      "clean-room-evidence-work-package-invalid",
    );
    const markdown = readStableFile(
      path,
      "clean-room-evidence-work-package-invalid",
      true,
    ).toString("utf8");
    const marker = markdown.indexOf(WORK_PACKAGE_START);
    const start = markdown.indexOf("{", marker);
    const end = markdown.indexOf("```", start);
    invariant(
      marker >= 0 && start > marker && end > start,
      "clean-room-evidence-work-package-invalid",
    );
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed), "clean-room-evidence-work-package-invalid");
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "clean-room-evidence-work-package-invalid"
    ) {
      throw error;
    }
    throw new Error("clean-room-evidence-work-package-invalid");
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
  invariant(result.status === 0, "clean-room-evidence-repository-binding");
  return result.stdout.trim();
}

function captureRepositoryBinding(repositoryRoot: string): RepositoryBinding {
  const metadata = lstatSync(repositoryRoot);
  invariant(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(repositoryRoot) === resolve(repositoryRoot),
    "clean-room-evidence-repository-binding",
  );
  invariant(
    spawnSync("git", ["diff", "--quiet", "--no-ext-diff"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
    "clean-room-evidence-repository-binding",
  );
  invariant(
    spawnSync("git", ["diff", "--cached", "--check"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0,
    "clean-room-evidence-repository-binding",
  );
  invariant(
    gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]) ===
      "",
    "clean-room-evidence-repository-binding",
  );
  const repositoryBaseCommit = gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const repositoryIndexTree = gitOutput(repositoryRoot, ["write-tree"]);
  invariant(
    /^[a-f0-9]{40}$/.test(repositoryBaseCommit) &&
      /^[a-f0-9]{40}$/.test(repositoryIndexTree),
    "clean-room-evidence-repository-binding",
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
    "clean-room-evidence-repository-binding",
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
    "clean-room-evidence-work-package-invalid",
  );
  const identitiesBytes = readStableFile(
    join(
      repositoryRoot,
      "resources",
      "formula-library",
      "v1",
      "standard-formula-ids.json",
    ),
    "clean-room-evidence-identity-binding-invalid",
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
    "clean-room-evidence-identity-binding-invalid",
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
    "clean-room-evidence-identity-binding-invalid",
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
    "clean-room-evidence-identity-binding-invalid",
  );

  const cleanRows: unknown[] = [];
  const cleanIds = new Set<string>();
  for (const [index, rawRow] of workPackage.rows.entries()) {
    const identity = identities.formulas[index];
    invariant(
      isRecord(rawRow) &&
        isRecord(identity) &&
        typeof rawRow.formulaId === "string" &&
        rawRow.formulaId === identity.formulaId &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        isRecord(rawRow.rights) &&
        isRecord(rawRow.privateProvenanceEvidence) &&
        isRecord(rawRow.implementationInput) &&
        isRecord(rawRow.parameterContract) &&
        isRecord(rawRow.defaultProfileCandidate) &&
        isRecord(rawRow.previewInput) &&
        isRecord(rawRow.fixturesOrOracle) &&
        isRecord(rawRow.review),
      "clean-room-evidence-work-package-invalid",
    );
    if (rawRow.rights.lane !== "clean-room") continue;
    invariant(
      !cleanIds.has(rawRow.formulaId) &&
        rawRow.sourceSet === "F588" &&
        ["A", "B", "C"].includes(String(rawRow.rights.class)) &&
        rawRow.rights.rightsEvidenceStatus ===
          "frozen-per-record-classification" &&
        rawRow.rights.sourceVisibility === "isolated-controller-only" &&
        rawRow.rights.canonicalLicenseTarget === "MIT" &&
        typeof rawRow.privateProvenanceEvidence.sourceLocator === "string" &&
        rawRow.privateProvenanceEvidence.sourceLocator.length > 0 &&
        SHA256.test(
          String(rawRow.privateProvenanceEvidence.semanticSha256),
        ) &&
        isRecord(rawRow.privateProvenanceEvidence.handoffEvidence) &&
        rawRow.implementationInput.status ===
          "blocked-missing-approved-nonreversible-behavior-spec" &&
        rawRow.implementationInput.inputKind ===
          "clean-room-math-behavior-spec" &&
        rawRow.implementationInput.safeSourceLocator == null &&
        rawRow.implementationInput.behaviorSpecAuthor == null &&
        rawRow.implementationInput.behaviorSpecRevision == null &&
        rawRow.implementationInput.behaviorSpecSha256 == null &&
        isDenseArray(
          rawRow.implementationInput.forbiddenForIsolatedImplementer,
        ) &&
        rawRow.implementationInput.forbiddenForIsolatedImplementer.length === 6 &&
        rawRow.inputAvailableForMigrationDraft === false &&
        rawRow.workStartEligibility === "blocked-incomplete-package" &&
        rawRow.parameterContract.status ===
          "structural-types-only-not-final-schema" &&
        rawRow.parameterContract.finalSchema == null &&
        rawRow.defaultProfileCandidate.status ===
          "blocked-missing-formula-profile-candidate" &&
        rawRow.previewInput.status ===
          "blocked-until-profile-candidate-exists" &&
        rawRow.fixturesOrOracle.fixturePayloadStatus ===
          "available-and-sha256-verified" &&
        [
          "legacy-compatibility-orbit-oracle-available",
          "waiver-probe-not-executable-oracle",
        ].includes(String(rawRow.fixturesOrOracle.oracleStatus)) &&
        SHA256.test(String(rawRow.fixturesOrOracle.artifactSha256)) &&
        typeof rawRow.fixturesOrOracle.evidenceKey === "string" &&
        rawRow.fixturesOrOracle.evidenceKey.length > 0 &&
        rawRow.review.status === "blocked-incomplete-package" &&
        rawRow.review.independentReviewer == null &&
        rawRow.review.isolatedImplementer == null &&
        rawRow.review.finalSourceRevision == null &&
        rawRow.review.finalSemanticHash == null,
      "clean-room-evidence-work-package-invalid",
    );
    cleanIds.add(rawRow.formulaId);
    cleanRows.push({
      formulaId: rawRow.formulaId,
      sourceSet: "F588",
      rightsClass: rawRow.rights.class,
      rightsEvidenceStatus: rawRow.rights.rightsEvidenceStatus,
      privateProvenanceEvidenceBound: true,
      sourceOracleStatus: rawRow.fixturesOrOracle.oracleStatus,
      sourceOracleEvidenceBound: true,
      implementationInputStatus: rawRow.implementationInput.status,
      workStartEligibility: rawRow.workStartEligibility,
      reviewStatus: rawRow.review.status,
      finalSchema: null,
    });
  }
  invariant(
    cleanRows.length === 452 && cleanIds.size === 452,
    "clean-room-evidence-exact-set-invalid",
  );
  return {
    workRows: cleanRows,
    standardFormulaIdsHash,
    legacyFormulaAliasesHash,
  };
}

function projectLedgerRows(
  ledger: JsonRecord,
  workRows: readonly unknown[],
): readonly unknown[] {
  invariant(
    ledger.schema ===
      "fractalpark-formula-library-bulk-migration-ledger/v2" &&
      ledger.controllerVersion === "formula-library-bulk-migration/2" &&
      ledger.deterministic === true &&
      isDenseArray(ledger.rows) &&
      ledger.rows.length === 677,
    "clean-room-evidence-input-invalid",
  );
  const ledgerById = new Map<string, JsonRecord>();
  for (const rawRow of ledger.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        !ledgerById.has(rawRow.formulaId),
      "clean-room-evidence-input-invalid",
    );
    ledgerById.set(rawRow.formulaId, rawRow);
  }
  return workRows.map((workRow) => {
    invariant(isRecord(workRow), "clean-room-evidence-input-invalid");
    const row = ledgerById.get(String(workRow.formulaId));
    invariant(
      row &&
        row.sourceSet === "F588" &&
        row.status === "failed" &&
        row.failureStage === "input" &&
        row.reasonCode === "missing-input" &&
        row.publicationEligible === false,
      "clean-room-evidence-exact-set-invalid",
    );
    return {
      formulaId: row.formulaId,
      sourceSet: "F588",
      status: "failed",
      failureStage: "input",
      reasonCode: "missing-input",
      publicationEligible: false,
    };
  });
}

function projectProvisionalRows(
  manifest: JsonRecord,
  workRows: readonly unknown[],
): readonly unknown[] {
  invariant(
    manifest.schema === "fractalpark-formula-library-provisional-assets/v1" &&
      manifest.publicationEligible === false &&
      isDenseArray(manifest.rows) &&
      manifest.rows.length === 20,
    "clean-room-evidence-provisional-invalid",
  );
  const cleanIds = new Set(
    workRows.map((row) => {
      invariant(isRecord(row), "clean-room-evidence-input-invalid");
      return String(row.formulaId);
    }),
  );
  const provisionalIds = new Set<string>();
  for (const row of manifest.rows) {
    invariant(
      isRecord(row) &&
        typeof row.formulaId === "string" &&
        !provisionalIds.has(row.formulaId) &&
        !cleanIds.has(row.formulaId),
      "clean-room-evidence-provisional-invalid",
    );
    provisionalIds.add(row.formulaId);
  }
  return [];
}

function readCleanRoomEvidenceInputs(
  repositoryRoot: string,
): CleanRoomEvidenceInputs {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
    "clean-room-evidence-frozen-hash-mismatch",
  );
  const workProjection = projectWorkRows(repositoryRoot, workPackage);

  const formulaLibraryDirectory = openAnchoredPrivateDirectory(
    repositoryRoot,
    [".formula-library-private", "formula-library-v1"],
    "clean-room-evidence-input-invalid",
  );
  let ledger: JsonRecord;
  try {
    ledger = readPrivateJson(
      join(
        `/proc/self/fd/${formulaLibraryDirectory}`,
        "bulk-migration-ledger.json",
      ),
      "clean-room-evidence-input-invalid",
    );
  } finally {
    closeSync(formulaLibraryDirectory);
  }
  assertSelfHash(
    ledger,
    "ledgerContentHash",
    EXPECTED_LEDGER_HASH,
    "clean-room-evidence-frozen-hash-mismatch",
  );
  const ledgerRows = projectLedgerRows(ledger, workProjection.workRows);

  const provisionalDirectory = openAnchoredPrivateDirectory(
    repositoryRoot,
    [
      ".formula-library-private",
      "formula-library-v1",
      "provisional-assets-v1",
    ],
    "clean-room-evidence-provisional-invalid",
  );
  let provisional: JsonRecord;
  try {
    provisional = readPrivateJson(
      join(`/proc/self/fd/${provisionalDirectory}`, "manifest.json"),
      "clean-room-evidence-provisional-invalid",
    );
  } finally {
    closeSync(provisionalDirectory);
  }
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
    "clean-room-evidence-frozen-hash-mismatch",
  );
  const provisionalRows = projectProvisionalRows(provisional, workProjection.workRows);

  return {
    workRows: workProjection.workRows,
    ledgerRows,
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

type PrivateDirectoryHandle = Readonly<{
  descriptor: number;
  outputDirectory: string;
  expectedReal: string;
}>;

function openPrivateOutputDirectory(
  repositoryRoot: string,
): PrivateDirectoryHandle {
  const realRepositoryRoot = realpathSync(repositoryRoot);
  let currentPath = repositoryRoot;
  let expectedReal = realRepositoryRoot;
  let currentDescriptor: number | null = openSync(
    repositoryRoot,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const repositoryDirectory = fstatSync(currentDescriptor);
    invariant(
      repositoryDirectory.isDirectory() &&
        realpathSync(`/proc/self/fd/${currentDescriptor}`) === realRepositoryRoot,
      "clean-room-evidence-output-containment-failed",
    );
    for (const component of OUTPUT_COMPONENTS) {
      const descriptorChildPath = join(
        `/proc/self/fd/${currentDescriptor}`,
        component,
      );
      const metadata = lstatIfPresent(descriptorChildPath);
      if (metadata === null) {
        mkdirSync(descriptorChildPath, { mode: 0o700 });
      } else {
        invariant(
          metadata.isDirectory() && !metadata.isSymbolicLink(),
          "clean-room-evidence-output-symlink-rejected",
        );
      }
      const childDescriptor = openSync(
        descriptorChildPath,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        fchmodSync(childDescriptor, 0o700);
        const childDirectory = fstatSync(childDescriptor);
        expectedReal = join(expectedReal, component);
        invariant(
          childDirectory.isDirectory() &&
            (childDirectory.mode & 0o777) === 0o700 &&
            realpathSync(`/proc/self/fd/${childDescriptor}`) === expectedReal,
          "clean-room-evidence-output-containment-failed",
        );
      } catch (error) {
        closeSync(childDescriptor);
        throw error;
      }
      closeSync(currentDescriptor);
      currentDescriptor = childDescriptor;
      currentPath = join(currentPath, component);
    }
    const result = {
      descriptor: currentDescriptor,
      outputDirectory: currentPath,
      expectedReal,
    };
    currentDescriptor = null;
    return result;
  } finally {
    if (currentDescriptor !== null) closeSync(currentDescriptor);
  }
}

function assertDescriptorOutputSet(
  directoryDescriptor: number,
  allowMissing: boolean,
): void {
  const entries = readdirSync(`/proc/self/fd/${directoryDescriptor}`).sort();
  invariant(
    (allowMissing && entries.length === 0) ||
      (entries.length === 1 && entries[0] === OUTPUT_FILENAME),
    "clean-room-evidence-output-set-invalid",
  );
}

export function writePrivateCleanRoomEvidenceManifest(
  repositoryRoot: string,
  content: string,
  afterDirectoryOpenForTest?: () => void,
): string {
  try {
    const directoryHandle = openPrivateOutputDirectory(repositoryRoot);
    const {
      descriptor: directoryDescriptor,
      outputDirectory,
      expectedReal,
    } = directoryHandle;
    try {
      afterDirectoryOpenForTest?.();
      const openedDirectory = fstatSync(directoryDescriptor);
      invariant(
        openedDirectory.isDirectory() &&
          openedDirectory.nlink >= 1 &&
          (openedDirectory.mode & 0o777) === 0o700 &&
          realpathSync(`/proc/self/fd/${directoryDescriptor}`) === expectedReal,
        "clean-room-evidence-output-containment-failed",
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
          "clean-room-evidence-output-containment-failed",
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
          "clean-room-evidence-output-containment-failed",
        );
        fchmodSync(fileDescriptor, 0o600);
        writeFileSync(fileDescriptor, content);
        fsyncSync(fileDescriptor);
        const finalFile = fstatSync(fileDescriptor);
        invariant(
          finalFile.isFile() &&
            finalFile.nlink === 1 &&
            (finalFile.mode & 0o777) === 0o600,
          "clean-room-evidence-output-permissions-invalid",
        );
        const currentTemporary = lstatSync(temporaryPath);
        invariant(
          currentTemporary.isFile() &&
            !currentTemporary.isSymbolicLink() &&
            currentTemporary.dev === finalFile.dev &&
            currentTemporary.ino === finalFile.ino &&
            currentTemporary.nlink === 1,
          "clean-room-evidence-output-containment-failed",
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
          "clean-room-evidence-output-containment-failed",
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
            "clean-room-evidence-output-containment-failed",
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
        "clean-room-evidence-output-containment-failed",
      );
      assertDescriptorOutputSet(directoryDescriptor, false);
    } finally {
      closeSync(directoryDescriptor);
    }
    return join(outputDirectory, OUTPUT_FILENAME);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("clean-room-evidence-output-")
    ) {
      throw error;
    }
    throw new Error("clean-room-evidence-output-write-failed");
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
    "rawbehaviorspec",
    "behaviorpayload",
    "behaviorspeccontent",
    "displayname",
    "typedlegacyaliases",
    "ast",
    "intermediaterepresentation",
  ];
  invariant(
    forbidden.every((token) => !serialized.includes(token)),
    "clean-room-evidence-input-invalid",
  );
}

export function generateCleanRoomEvidence(
  repositoryRoot: string,
): Readonly<{
  rightsProvenanceClassificationBound: number;
  privateProvenanceEvidenceBound: number;
  sourceOracleEvidenceBound: number;
  technicalFailedMissingInput: number;
  implementationAuthorized: number;
  candidateAdmitted: number;
  manifestContentHash: string;
}> {
  const initialBinding = captureRepositoryBinding(repositoryRoot);
  const inputs = readCleanRoomEvidenceInputs(repositoryRoot);
  const result = evaluateCleanRoomEvidenceV1({
    workRows: inputs.workRows,
    ledgerRows: inputs.ledgerRows,
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
    controllerVersion: CLEAN_ROOM_EVIDENCE_VERSION_V1,
    deterministic: true,
    generationBinding: initialBinding,
    inputHashes: inputs.inputHashes,
    candidateReceiptsIssued: 0,
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
  writePrivateCleanRoomEvidenceManifest(
    repositoryRoot,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  assertSameBinding(
    initialBinding,
    captureRepositoryBinding(repositoryRoot),
  );
  return {
    rightsProvenanceClassificationBound:
      result.summary.rightsProvenanceClassificationBound,
    privateProvenanceEvidenceBound:
      result.summary.privateProvenanceEvidenceBound,
    sourceOracleEvidenceBound: result.summary.sourceOracleEvidenceBound,
    technicalFailedMissingInput: result.summary.technicalFailedMissingInput,
    implementationAuthorized: result.summary.implementationAuthorized,
    candidateAdmitted: result.summary.candidateAdmitted,
    manifestContentHash: manifest.manifestContentHash,
  };
}

export function sanitizeCleanRoomEvidenceError(error: unknown): string {
  return error instanceof Error && PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "clean-room-evidence-controller-internal-error";
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    invariant(
      process.argv.includes("--write"),
      "clean-room-evidence-output-write-failed",
    );
    const result = generateCleanRoomEvidence(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        rightsProvenanceClassificationBound:
          result.rightsProvenanceClassificationBound,
        privateProvenanceEvidenceBound: result.privateProvenanceEvidenceBound,
        sourceOracleEvidenceBound: result.sourceOracleEvidenceBound,
        technicalFailedMissingInput: result.technicalFailedMissingInput,
        implementationAuthorized: result.implementationAuthorized,
        candidateAdmitted: result.candidateAdmitted,
        candidateReceiptsIssued: 0,
        publicCandidateAssemblyAllowed: false,
        publicPromotionAllowed: false,
        publicAssetsWritten: 0,
        manifestContentHash: result.manifestContentHash,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${sanitizeCleanRoomEvidenceError(error)}\n`);
    process.exitCode = 1;
  }
}
