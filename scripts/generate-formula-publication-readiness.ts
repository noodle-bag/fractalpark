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

import { evaluatePublicationReadinessV1 } from "../src/engine/formulas/v1/publication-readiness";

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
  "publication-readiness-v1",
]);
const OUTPUT_FILENAME = "manifest.json";
const SHA256 = /^[a-f0-9]{64}$/;
const FAILURE_REASONS = new Set([
  "missing-input",
  "v1-projection-unsupported",
  "release-oracle-mismatch",
  "webgl-cpu-mismatch",
]);
const PUBLIC_ERROR_CODES = new Set([
  "readiness-candidate-receipt-forbidden-field",
  "readiness-candidate-receipt-invalid",
  "readiness-candidate-receipts-not-supported",
  "readiness-exact-set-invalid",
  "readiness-frozen-hash-mismatch",
  "readiness-identity-binding-invalid",
  "readiness-input-invalid",
  "readiness-output-containment-failed",
  "readiness-output-permissions-invalid",
  "readiness-output-set-invalid",
  "readiness-output-symlink-rejected",
  "readiness-output-write-failed",
  "readiness-partial-candidate-rejected",
  "readiness-provisional-invalid",
  "readiness-provisional-row-invalid",
  "readiness-repository-binding",
  "readiness-runnable-row-invalid",
  "readiness-technical-accounting-invalid",
  "readiness-work-package-invalid",
  "readiness-work-row-invalid",
]);

type JsonRecord = Record<string, unknown>;
type RepositoryBinding = Readonly<{
  repositoryBaseCommit: string;
  repositoryIndexTree: string;
}>;

type ReadinessInputs = Readonly<{
  workRows: readonly unknown[];
  runnableRows: readonly unknown[];
  provisionalRows: readonly unknown[];
  candidateReceipts: readonly unknown[];
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
  return (
    Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Object.getOwnPropertySymbols(value).length === 0
  );
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
  invariant(isRecord(value), "readiness-input-invalid");
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

function readPrivateJson(path: string, code: string): unknown {
  try {
    return JSON.parse(readStableFile(path, code, true).toString("utf8")) as unknown;
  } catch {
    throw new Error(code);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path, "readiness-work-package-invalid");
  let markdown: string;
  try {
    markdown = readStableFile(
      path,
      "readiness-work-package-invalid",
      true,
    ).toString("utf8");
  } catch {
    throw new Error("readiness-work-package-invalid");
  }
  const marker = markdown.indexOf(WORK_PACKAGE_START);
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(
    marker >= 0 && start > marker && end > start,
    "readiness-work-package-invalid",
  );
  try {
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed), "readiness-work-package-invalid");
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "readiness-work-package-invalid"
    ) {
      throw error;
    }
    throw new Error("readiness-work-package-invalid");
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
  invariant(result.status === 0, "readiness-repository-binding");
  return result.stdout.trim();
}

function captureRepositoryBinding(repositoryRoot: string): RepositoryBinding {
  const repositoryMetadata = lstatSync(repositoryRoot);
  invariant(
    repositoryMetadata.isDirectory() &&
      !repositoryMetadata.isSymbolicLink() &&
      realpathSync(repositoryRoot) === resolve(repositoryRoot),
    "readiness-repository-binding",
  );
  const unstaged = spawnSync(
    "git",
    ["diff", "--quiet", "--no-ext-diff"],
    { cwd: repositoryRoot, stdio: "ignore" },
  );
  invariant(unstaged.status === 0, "readiness-repository-binding");
  const cachedCheck = spawnSync("git", ["diff", "--cached", "--check"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  invariant(cachedCheck.status === 0, "readiness-repository-binding");
  invariant(
    gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]) ===
      "",
    "readiness-repository-binding",
  );
  const repositoryBaseCommit = gitOutput(repositoryRoot, ["rev-parse", "HEAD"]);
  const repositoryIndexTree = gitOutput(repositoryRoot, ["write-tree"]);
  invariant(
    /^[a-f0-9]{40}$/.test(repositoryBaseCommit) &&
      /^[a-f0-9]{40}$/.test(repositoryIndexTree),
    "readiness-repository-binding",
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
    "readiness-repository-binding",
  );
}

function projectWorkRows(
  repositoryRoot: string,
  workPackage: JsonRecord,
): readonly unknown[] {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      isRecord(workPackage.sourceBindings),
    "readiness-work-package-invalid",
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
    "readiness-identity-binding-invalid",
    false,
  );
  const aliasesBytes = readStableFile(
    aliasesPath,
    "readiness-identity-binding-invalid",
    false,
  );
  const identities = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(identities) && identities.formulaCount === 677,
    "readiness-identity-binding-invalid",
  );
  const identityRows = identities.formulas;
  invariant(isDenseArray(identityRows), "readiness-identity-binding-invalid");
  const standardBinding = workPackage.sourceBindings.standardFormulaIds;
  const aliasBinding = workPackage.sourceBindings.legacyFormulaAliases;
  invariant(
    isRecord(standardBinding) &&
      standardBinding.sha256 === sha256Bytes(identitiesBytes) &&
      isRecord(aliasBinding) &&
      aliasBinding.sha256 === sha256Bytes(aliasesBytes),
    "readiness-identity-binding-invalid",
  );

  return workPackage.rows.map((rawRow, index) => {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        isRecord(rawRow.rights) &&
        isRecord(rawRow.implementationInput) &&
        isRecord(rawRow.parameterContract) &&
        isRecord(rawRow.defaultProfileCandidate) &&
        isRecord(rawRow.previewInput) &&
        isRecord(rawRow.review) &&
        isRecord(identityRows[index]) &&
        identityRows[index].formulaId === rawRow.formulaId,
      "readiness-work-package-invalid",
    );
    return {
      formulaId: rawRow.formulaId,
      sourceSet: rawRow.sourceSet,
      lane: rawRow.rights.lane,
      workStartEligibility: rawRow.workStartEligibility,
      reviewStatus: rawRow.review.status,
      implementationInputStatus: rawRow.implementationInput.status,
      parameterContractStatus: rawRow.parameterContract.status,
      profileCandidateStatus: rawRow.defaultProfileCandidate.status,
      previewInputStatus: rawRow.previewInput.status,
    };
  });
}

function projectRunnableRows(ledger: JsonRecord): readonly unknown[] {
  invariant(
    ledger.schema === "fractalpark-formula-library-bulk-migration-ledger/v2" &&
      ledger.controllerVersion === "formula-library-bulk-migration/2" &&
      ledger.deterministic === true &&
      isRecord(ledger.summary) &&
      ledger.summary.total === 677 &&
      ledger.summary.passed === 20 &&
      ledger.summary.failed === 657 &&
      isDenseArray(ledger.rows),
    "readiness-input-invalid",
  );
  return ledger.rows.map((rawRow) => {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        (rawRow.status === "passed" || rawRow.status === "failed") &&
        rawRow.publicationEligible === false,
      "readiness-input-invalid",
    );
    if (rawRow.status === "passed") {
      invariant(
        SHA256.test(String(rawRow.sourceRevision)) &&
          SHA256.test(String(rawRow.semanticHash)) &&
          SHA256.test(String(rawRow.backendArtifactSha256)) &&
          isRecord(rawRow.releaseOracle) &&
          rawRow.releaseOracle.status === "passed" &&
          isRecord(rawRow.webgl) &&
          rawRow.webgl.compileLinkDraw === "passed" &&
          rawRow.webgl.deterministicDraw === "passed" &&
          rawRow.webgl.cpuParity === "passed",
        "readiness-input-invalid",
      );
      return {
        formulaId: rawRow.formulaId,
        sourceSet: rawRow.sourceSet,
        status: "passed",
        failureReason: null,
        publicationEligible: false,
      };
    }
    invariant(
      typeof rawRow.failureStage === "string" &&
        FAILURE_REASONS.has(String(rawRow.reasonCode)),
      "readiness-input-invalid",
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
    "readiness-provisional-invalid",
  );
  const path = join(directory, filename);
  const bytes = readStableFile(path, "readiness-provisional-invalid", true);
  invariant(
    realpathSync(path) === join(realpathSync(directory), filename) &&
      sha256Bytes(bytes) === expectedHash,
    "readiness-provisional-invalid",
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
    "readiness-provisional-invalid",
  );
  assertProvisionalFile(
    directory,
    manifest.contactSheet.file,
    manifest.contactSheet.pngSha256,
  );
  const sourceSetById = new Map<string, "F588" | "B94">();
  for (const value of runnableRows) {
    invariant(isRecord(value), "readiness-provisional-invalid");
    if (value.sourceSet === "F588" || value.sourceSet === "B94") {
      sourceSetById.set(String(value.formulaId), value.sourceSet);
    }
  }
  const expectedFiles = new Set([OUTPUT_FILENAME]);
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
      "readiness-provisional-invalid",
    );
    assertProvisionalFile(
      directory,
      rawRow.preview.file,
      rawRow.preview.pngSha256,
    );
    expectedFiles.add(String(rawRow.preview.file));
    const projectedSourceSet = sourceSetById.get(rawRow.formulaId);
    invariant(projectedSourceSet, "readiness-provisional-invalid");
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
    "readiness-provisional-invalid",
  );
  return projected;
}

function readReadinessInputs(repositoryRoot: string): ReadinessInputs {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
    "readiness-frozen-hash-mismatch",
  );
  const workRows = projectWorkRows(repositoryRoot, workPackage);

  const ledgerPath = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "bulk-migration-ledger.json",
  );
  const ledger = readPrivateJson(ledgerPath, "readiness-input-invalid");
  invariant(isRecord(ledger), "readiness-input-invalid");
  assertSelfHash(
    ledger,
    "ledgerContentHash",
    EXPECTED_LEDGER_HASH,
    "readiness-frozen-hash-mismatch",
  );
  const runnableRows = projectRunnableRows(ledger);

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
    "readiness-provisional-invalid",
  );
  const provisionalPath = join(provisionalDirectory, "manifest.json");
  const provisional = readPrivateJson(
    provisionalPath,
    "readiness-provisional-invalid",
  );
  invariant(isRecord(provisional), "readiness-provisional-invalid");
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
    "readiness-frozen-hash-mismatch",
  );
  const provisionalRows = projectProvisionalRows(
    provisionalDirectory,
    provisional,
    runnableRows,
  );

  return {
    workRows,
    runnableRows,
    provisionalRows,
    candidateReceipts: [],
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
      "readiness-output-permissions-invalid",
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
        "readiness-output-symlink-rejected",
      );
    securePrivateDirectory(current);
    invariant(
      realpathSync(current) === expectedReal,
      "readiness-output-containment-failed",
    );
  }
  return current;
}

function assertOutputSet(directory: string, allowMissing: boolean): void {
  const entries = readdirSync(directory).sort();
  invariant(
    (allowMissing && entries.length === 0) ||
      (entries.length === 1 && entries[0] === OUTPUT_FILENAME),
    "readiness-output-set-invalid",
  );
}

export function writePrivateReadinessManifest(
  repositoryRoot: string,
  content: string,
): string {
  try {
    const outputDirectory = ensurePrivateOutputDirectory(repositoryRoot);
    const expectedReal = join(
      realpathSync(repositoryRoot),
      ...OUTPUT_COMPONENTS,
    );
    assertOutputSet(outputDirectory, true);
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
        "readiness-output-containment-failed",
      );
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
          "readiness-output-containment-failed",
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
          "readiness-output-containment-failed",
        );
        fchmodSync(fileDescriptor, 0o600);
        writeFileSync(fileDescriptor, content);
        fsyncSync(fileDescriptor);
        const finalFile = fstatSync(fileDescriptor);
        invariant(
          finalFile.isFile() &&
            finalFile.nlink === 1 &&
            (finalFile.mode & 0o777) === 0o600,
          "readiness-output-permissions-invalid",
        );
        const currentTemporary = lstatSync(temporaryPath);
        invariant(
          currentTemporary.isFile() &&
            !currentTemporary.isSymbolicLink() &&
            currentTemporary.dev === finalFile.dev &&
            currentTemporary.ino === finalFile.ino &&
            currentTemporary.nlink === 1,
          "readiness-output-containment-failed",
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
          "readiness-output-containment-failed",
        );
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
        "readiness-output-containment-failed",
      );
    } finally {
      closeSync(directoryDescriptor);
    }
    assertOutputSet(outputDirectory, false);
    return join(outputDirectory, OUTPUT_FILENAME);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("readiness-output-")
    ) {
      throw error;
    }
    throw new Error("readiness-output-write-failed");
  }
}

function assertSafeManifestProjection(value: unknown): void {
  const serialized = canonicalJson(value).toLowerCase();
  const forbidden = [
    "/home/",
    "sourcelocator",
    "safesourcelocator",
    "canonicalsource",
    "originalsource",
    "rawpayload",
    "privatepath",
    "implementationinput",
  ];
  invariant(
    forbidden.every((token) => !serialized.includes(token)),
    "readiness-input-invalid",
  );
}

export function generatePublicationReadiness(repositoryRoot: string): Readonly<{
  candidateReady: number;
  blocked: number;
  manifestContentHash: string;
}> {
  const initialBinding = captureRepositoryBinding(repositoryRoot);
  const result = evaluatePublicationReadinessV1(
    readReadinessInputs(repositoryRoot),
  );
  const body = {
    schema: result.schema,
    controllerVersion: PUBLICATION_READINESS_CONTROLLER_VERSION,
    deterministic: true,
    generationBinding: initialBinding,
    inputHashes: {
      workPackage: EXPECTED_WORK_PACKAGE_HASH,
      runnableLedger: EXPECTED_LEDGER_HASH,
      provisionalManifest: EXPECTED_PROVISIONAL_HASH,
    },
    publicCandidateAssemblyAllowed: result.publicCandidateAssemblyAllowed,
    publicPromotionAllowed: result.publicPromotionAllowed,
    publicAssetsWritten: result.publicAssetsWritten,
    summary: result.summary,
    rows: result.rows,
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
  writePrivateReadinessManifest(
    repositoryRoot,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  assertSameBinding(
    initialBinding,
    captureRepositoryBinding(repositoryRoot),
  );
  return {
    candidateReady: result.summary.candidateReady,
    blocked: result.summary.blocked,
    manifestContentHash: manifest.manifestContentHash,
  };
}

export const PUBLICATION_READINESS_CONTROLLER_VERSION =
  "formula-library-publication-readiness/1";

export function sanitizePublicationReadinessError(error: unknown): string {
  return error instanceof Error && PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "readiness-controller-internal-error";
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    invariant(process.argv.includes("--write"), "readiness-output-write-failed");
    const result = generatePublicationReadiness(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        candidateReady: result.candidateReady,
        blocked: result.blocked,
        publicCandidateAssemblyAllowed: false,
        publicPromotionAllowed: false,
        publicAssetsWritten: 0,
        manifestContentHash: result.manifestContentHash,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${sanitizePublicationReadinessError(error)}\n`);
    process.exitCode = 1;
  }
}
