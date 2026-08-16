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
const CONTROLLER_VERSION = "formula-library-publication-readiness/1";
const SHA256 = /^[a-f0-9]{64}$/;
const FAILURE_REASONS = new Set([
  "missing-input",
  "v1-projection-unsupported",
  "release-oracle-mismatch",
  "webgl-cpu-mismatch",
]);

type JsonRecord = Record<string, unknown>;
type RepositoryBinding = Readonly<{
  repositoryBaseCommit: string;
  repositoryIndexTree: string;
}>;

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

function projectWorkRows(
  repositoryRoot: string,
  workPackage: JsonRecord,
): readonly unknown[] {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isRecord(workPackage.sourceBindings) &&
      isDenseArray(workPackage.rows),
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
  const identitiesBytes = readStableFile(identitiesPath, false);
  const aliasesBytes = readStableFile(aliasesPath, false);
  const identities = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  invariant(isRecord(identities) && identities.formulaCount === 677);
  const identityRows = identities.formulas;
  invariant(isDenseArray(identityRows));
  const standardBinding = workPackage.sourceBindings.standardFormulaIds;
  const aliasesBinding = workPackage.sourceBindings.legacyFormulaAliases;
  invariant(
    isRecord(standardBinding) &&
      standardBinding.sha256 === sha256Bytes(identitiesBytes) &&
      isRecord(aliasesBinding) &&
      aliasesBinding.sha256 === sha256Bytes(aliasesBytes),
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
  );
  return ledger.rows.map((rawRow) => {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        (rawRow.sourceSet === "F588" || rawRow.sourceSet === "B94") &&
        (rawRow.status === "passed" || rawRow.status === "failed") &&
        rawRow.publicationEligible === false,
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
  );
  const path = join(directory, filename);
  const bytes = readStableFile(path, true);
  invariant(
    realpathSync(path) === join(realpathSync(directory), filename) &&
      sha256Bytes(bytes) === expectedHash,
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
  );
  assertProvisionalFile(
    directory,
    manifest.contactSheet.file,
    manifest.contactSheet.pngSha256,
  );
  const sourceSetById = new Map<string, "F588" | "B94">();
  for (const runnableRow of runnableRows) {
    invariant(isRecord(runnableRow));
    if (runnableRow.sourceSet === "F588" || runnableRow.sourceSet === "B94") {
      sourceSetById.set(String(runnableRow.formulaId), runnableRow.sourceSet);
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
    );
    assertProvisionalFile(
      directory,
      rawRow.preview.file,
      rawRow.preview.pngSha256,
    );
    expectedFiles.add(String(rawRow.preview.file));
    const projectedSourceSet = sourceSetById.get(rawRow.formulaId);
    invariant(projectedSourceSet);
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
  );
  return projected;
}

function independentlyEvaluateCurrentReadiness(
  workRows: readonly unknown[],
  runnableRows: readonly unknown[],
  provisionalRows: readonly unknown[],
): JsonRecord {
  invariant(workRows.length === 677 && runnableRows.length === 677);
  const workIds = new Set<string>();
  const runnableIds = new Set<string>();
  const passedIds = new Set<string>();
  const provisionalIds = new Set<string>();
  const sourceSetCounts = new Map<string, number>();
  const laneCounts = new Map<string, number>();
  const technicalCounts = new Map<string, number>();

  for (let index = 0; index < 677; index += 1) {
    const workRow = workRows[index];
    const runnableRow = runnableRows[index];
    invariant(
      isRecord(workRow) &&
        isRecord(runnableRow) &&
        typeof workRow.formulaId === "string" &&
        runnableRow.formulaId === workRow.formulaId &&
        runnableRow.sourceSet === workRow.sourceSet &&
        (workRow.sourceSet === "F588" || workRow.sourceSet === "B94") &&
        (workRow.lane === "direct-adaptation" || workRow.lane === "clean-room") &&
        (runnableRow.status === "passed" || runnableRow.status === "failed") &&
        !workIds.has(workRow.formulaId) &&
        !runnableIds.has(workRow.formulaId),
    );
    workIds.add(workRow.formulaId);
    runnableIds.add(workRow.formulaId);
    sourceSetCounts.set(
      workRow.sourceSet,
      (sourceSetCounts.get(workRow.sourceSet) ?? 0) + 1,
    );
    laneCounts.set(
      workRow.lane,
      (laneCounts.get(workRow.lane) ?? 0) + 1,
    );
    if (runnableRow.status === "passed") {
      invariant(runnableRow.failureReason === null);
      passedIds.add(workRow.formulaId);
    } else {
      invariant(typeof runnableRow.failureReason === "string");
      technicalCounts.set(
        runnableRow.failureReason,
        (technicalCounts.get(runnableRow.failureReason) ?? 0) + 1,
      );
    }
  }
  invariant(
    sourceSetCounts.get("F588") === 588 &&
      sourceSetCounts.get("B94") === 89 &&
      laneCounts.get("direct-adaptation") === 225 &&
      laneCounts.get("clean-room") === 452 &&
      passedIds.size === 20 &&
      technicalCounts.get("missing-input") === 452 &&
      technicalCounts.get("v1-projection-unsupported") === 174 &&
      technicalCounts.get("release-oracle-mismatch") === 15 &&
      technicalCounts.get("webgl-cpu-mismatch") === 16 &&
      provisionalRows.length === 20,
  );
  for (const provisionalRow of provisionalRows) {
    invariant(
      isRecord(provisionalRow) &&
        typeof provisionalRow.formulaId === "string" &&
        passedIds.has(provisionalRow.formulaId) &&
        !provisionalIds.has(provisionalRow.formulaId),
    );
    provisionalIds.add(provisionalRow.formulaId);
  }

  const blockerCounts = new Map<string, number>();
  const rows = workRows.map((workRow, index) => {
    invariant(isRecord(workRow) && isRecord(runnableRows[index]));
    const runnableRow = runnableRows[index];
    const blockers = ["advancement-review-not-approved"];
    if (workRow.lane === "clean-room") {
      blockers.push("clean-behavior-spec-not-approved");
    }
    blockers.push("final-parameter-schema-missing");
    if (runnableRow.failureReason !== null) {
      blockers.push(`technical-${String(runnableRow.failureReason)}`);
    }
    blockers.push(
      "verified-final-profile-missing",
      "verified-final-preview-missing",
      "final-record-missing",
      "candidate-receipt-absent",
    );
    for (const blocker of blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    return {
      formulaId: workRow.formulaId,
      sourceSet: workRow.sourceSet,
      lane: workRow.lane,
      technicalStatus: runnableRow.status,
      provisionalCandidate: provisionalIds.has(String(workRow.formulaId)),
      status: "blocked",
      blockers,
    };
  });
  return {
    schema: "fractalpark-formula-library-publication-readiness/v1",
    deterministic: true,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: {
      total: 677,
      candidateReady: 0,
      blocked: 677,
      direct: 225,
      cleanRoom: 452,
      runnable: 20,
      failed: 657,
      provisionalCandidates: 20,
      verifiedFinalProfiles: 0,
      blockerCounts: [...blockerCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => ({ code, count })),
    },
    rows,
  };
}

function recomputeExpectedBody(
  repositoryRoot: string,
  generationBinding: RepositoryBinding,
): JsonRecord {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
  );
  const workRows = projectWorkRows(repositoryRoot, workPackage);

  const ledger = readPrivateJson(
    join(
      repositoryRoot,
      ".formula-library-private",
      "formula-library-v1",
      "bulk-migration-ledger.json",
    ),
  );
  assertSelfHash(ledger, "ledgerContentHash", EXPECTED_LEDGER_HASH);
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
  );
  const provisional = readPrivateJson(
    join(provisionalDirectory, "manifest.json"),
  );
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
  );
  const provisionalRows = projectProvisionalRows(
    provisionalDirectory,
    provisional,
    runnableRows,
  );
  const result = independentlyEvaluateCurrentReadiness(
    workRows,
    runnableRows,
    provisionalRows,
  );
  return {
    schema: result.schema,
    controllerVersion: CONTROLLER_VERSION,
    deterministic: true,
    generationBinding,
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
}

function assertSafeProjection(value: unknown): void {
  const serialized = canonicalJson(value).toLowerCase();
  for (const token of [
    "/home/",
    "sourcelocator",
    "safesourcelocator",
    "canonicalsource",
    "originalsource",
    "rawpayload",
    "privatepath",
    "implementationinput",
  ]) {
    invariant(!serialized.includes(token));
  }
}

export function verifyPublicationReadiness(repositoryRoot: string): Readonly<{
  candidateReady: number;
  blocked: number;
  manifestContentHash: string;
}> {
  const currentBinding = captureRepositoryBinding(repositoryRoot);
  const outputDirectory = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "publication-readiness-v1",
  );
  const directoryMetadata = lstatSync(outputDirectory);
  invariant(
    directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      (directoryMetadata.mode & 0o777) === 0o700 &&
      realpathSync(outputDirectory) ===
        join(realpathSync(repositoryRoot), ".formula-library-private", "formula-library-v1", "publication-readiness-v1") &&
      readdirSync(outputDirectory).join("\u0000") === "manifest.json",
  );
  const manifest = readPrivateJson(join(outputDirectory, "manifest.json"));
  invariant(
    manifest.schema === "fractalpark-formula-library-publication-readiness/v1" &&
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
      manifest.summary.candidateReady === 0 &&
      manifest.summary.blocked === 677 &&
      manifest.publicCandidateAssemblyAllowed === false &&
      manifest.publicPromotionAllowed === false &&
      manifest.publicAssetsWritten === 0,
  );
  invariant(
    canonicalJson(currentBinding) ===
      canonicalJson(captureRepositoryBinding(repositoryRoot)),
  );
  return {
    candidateReady: 0,
    blocked: 677,
    manifestContentHash: manifest.manifestContentHash,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = verifyPublicationReadiness(process.cwd());
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
  } catch {
    process.stderr.write("verification-invalid\n");
    process.exitCode = 1;
  }
}
