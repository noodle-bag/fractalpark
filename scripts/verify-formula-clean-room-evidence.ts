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
  type Stats,
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
const CONTROLLER_VERSION = "formula-library-clean-room-evidence/1";
const SHA256 = /^[a-f0-9]{64}$/;
const BLOCKERS = Object.freeze([
  "advancement-review-not-approved",
  "clean-behavior-spec-missing",
  "technical-missing-input",
  "final-parameter-schema-missing",
  "isolation-evidence-missing",
  "approved-executable-oracle-missing",
  "leakage-review-receipt-missing",
  "final-profile-preview-record-missing",
  "independent-admission-not-passed",
]);

interface JsonRecord {
  [key: string]: unknown;
}

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

type SourceOracleStatus =
  | "legacy-compatibility-orbit-oracle-available"
  | "waiver-probe-not-executable-oracle";

type CleanWorkRow = Readonly<{
  formulaId: string;
  rightsClass: "A" | "B" | "C";
  sourceOracleStatus: SourceOracleStatus;
}>;

function fail(): never {
  throw new Error("clean-room-evidence-verification-invalid");
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
    const parsed = JSON.parse(
      readStableFile(path, true).toString("utf8"),
    ) as unknown;
    invariant(isRecord(parsed));
    return parsed;
  } catch {
    fail();
  }
}

type RetainedPrivateJson = Readonly<{
  bytes: Buffer;
  descriptor: number;
  opened: Stats;
  value: JsonRecord;
}>;

function openRetainedPrivateJson(path: string): RetainedPrivateJson {
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
        (opened.mode & 0o777) === 0o600,
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
        (current.mode & 0o777) === 0o600,
    );
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    invariant(isRecord(value));
    return { bytes, descriptor, opened, value };
  } catch {
    closeSync(descriptor);
    fail();
  }
}

function openAnchoredPrivateDirectory(
  repositoryRoot: string,
  components: readonly string[],
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
  } finally {
    if (currentDescriptor !== null) closeSync(currentDescriptor);
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
    invariant(realpathSync(path) === resolve(path));
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
  rows: readonly CleanWorkRow[];
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

  const rows: CleanWorkRow[] = [];
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
        isRecord(rawRow.privateProvenanceEvidence) &&
        isRecord(rawRow.implementationInput) &&
        isRecord(rawRow.parameterContract) &&
        isRecord(rawRow.defaultProfileCandidate) &&
        isRecord(rawRow.previewInput) &&
        isRecord(rawRow.fixturesOrOracle) &&
        isRecord(rawRow.review),
    );
    if (rawRow.rights.lane !== "clean-room") continue;
    invariant(
      !ids.has(rawRow.formulaId) &&
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
    );
    rows.push({
      formulaId: rawRow.formulaId,
      rightsClass: rawRow.rights.class as "A" | "B" | "C",
      sourceOracleStatus: rawRow.fixturesOrOracle
        .oracleStatus as SourceOracleStatus,
    });
    ids.add(rawRow.formulaId);
  }
  invariant(
    rows.length === 452 &&
      ids.size === 452 &&
      rows.filter((row) => row.rightsClass === "A").length === 1 &&
      rows.filter((row) => row.rightsClass === "B").length === 73 &&
      rows.filter((row) => row.rightsClass === "C").length === 378 &&
      rows.filter(
        (row) =>
          row.sourceOracleStatus ===
          "legacy-compatibility-orbit-oracle-available",
      ).length === 443 &&
      rows.filter(
        (row) =>
          row.sourceOracleStatus === "waiver-probe-not-executable-oracle",
      ).length === 9,
  );
  return { rows, standardFormulaIdsHash, legacyFormulaAliasesHash };
}

function assertLedgerRows(
  ledger: JsonRecord,
  workRows: readonly CleanWorkRow[],
): void {
  invariant(
    ledger.schema ===
      "fractalpark-formula-library-bulk-migration-ledger/v2" &&
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
        rawRow.publicationEligible === false,
    );
    byId.set(rawRow.formulaId, rawRow);
  }
  invariant(byId.size === 677);
  for (const workRow of workRows) {
    const rawRow = byId.get(workRow.formulaId);
    invariant(
      rawRow &&
        rawRow.sourceSet === "F588" &&
        rawRow.status === "failed" &&
        rawRow.failureStage === "input" &&
        rawRow.reasonCode === "missing-input",
    );
  }
}

function assertNoProvisionalOverlap(
  repositoryRoot: string,
  manifest: JsonRecord,
  workRows: readonly CleanWorkRow[],
): void {
  const directory = openAnchoredPrivateDirectory(repositoryRoot, [
    ".formula-library-private",
    "formula-library-v1",
    "provisional-assets-v1",
  ]);
  try {
    invariant(fstatSync(directory).isDirectory());
  } finally {
    closeSync(directory);
  }
  invariant(
    manifest.schema === "fractalpark-formula-library-provisional-assets/v1" &&
      manifest.controllerVersion === "formula-library-provisional-assets/1" &&
      manifest.deterministic === true &&
      manifest.publicationEligible === false &&
      manifest.verifiedDefaultProfiles === 0 &&
      manifest.runnableLedgerContentHash === EXPECTED_LEDGER_HASH &&
      isRecord(manifest.summary) &&
      manifest.summary.accounted === 677 &&
      manifest.summary.presentableCandidates === 20 &&
      isDenseArray(manifest.rows) &&
      manifest.rows.length === 20,
  );
  const cleanIds = new Set(workRows.map((row) => row.formulaId));
  const provisionalIds = new Set<string>();
  for (const rawRow of manifest.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        !provisionalIds.has(rawRow.formulaId) &&
        !cleanIds.has(rawRow.formulaId),
    );
    provisionalIds.add(rawRow.formulaId);
  }
  invariant(provisionalIds.size === 20);
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
  const formulaLibraryDirectory = openAnchoredPrivateDirectory(
    repositoryRoot,
    [".formula-library-private", "formula-library-v1"],
  );
  let ledger: JsonRecord;
  try {
    ledger = readPrivateJson(
      join(
        `/proc/self/fd/${formulaLibraryDirectory}`,
        "bulk-migration-ledger.json",
      ),
    );
  } finally {
    closeSync(formulaLibraryDirectory);
  }
  assertSelfHash(ledger, "ledgerContentHash", EXPECTED_LEDGER_HASH);
  assertLedgerRows(ledger, workProjection.rows);

  const provisionalDirectory = openAnchoredPrivateDirectory(repositoryRoot, [
    ".formula-library-private",
    "formula-library-v1",
    "provisional-assets-v1",
  ]);
  let provisional: JsonRecord;
  try {
    provisional = readPrivateJson(
      join(`/proc/self/fd/${provisionalDirectory}`, "manifest.json"),
    );
  } finally {
    closeSync(provisionalDirectory);
  }
  assertSelfHash(
    provisional,
    "manifestContentHash",
    EXPECTED_PROVISIONAL_HASH,
  );
  assertNoProvisionalOverlap(repositoryRoot, provisional, workProjection.rows);

  const inputHashes: InputHashes = {
    workPackage: EXPECTED_WORK_PACKAGE_HASH,
    runnableLedger: EXPECTED_LEDGER_HASH,
    provisionalManifest: EXPECTED_PROVISIONAL_HASH,
    standardFormulaIds: workProjection.standardFormulaIdsHash,
    legacyFormulaAliases: workProjection.legacyFormulaAliasesHash,
  };
  const rows = workProjection.rows.map((workRow) => {
    const row = {
      formulaId: workRow.formulaId,
      sourceSet: "F588",
      rightsClass: workRow.rightsClass,
      rightsProvenanceClassificationBound: true,
      privateProvenanceEvidenceBound: true,
      sourceOracleStatus: workRow.sourceOracleStatus,
      sourceOracleEvidenceBound: true,
      workInputStatus:
        "blocked-missing-approved-nonreversible-behavior-spec",
      technicalStatus: "failed",
      technicalFailureReason: "missing-input",
      provisionalCandidate: false,
      admissionStatus: "blocked",
      blockers: BLOCKERS,
    };
    return {
      ...row,
      rowProjectionHash: sha256Canonical({ inputHashes, row }),
    };
  });

  return {
    schema: "fractalpark-formula-library-clean-room-evidence/v1",
    controllerVersion: CONTROLLER_VERSION,
    deterministic: true,
    generationBinding: binding,
    inputHashes,
    candidateReceiptsIssued: 0,
    publicCandidateAssemblyAllowed: false,
    publicPromotionAllowed: false,
    publicAssetsWritten: 0,
    summary: {
      total: 452,
      f588: 452,
      rightsClassA: 1,
      rightsClassB: 73,
      rightsClassC: 378,
      rightsProvenanceClassificationBound: 452,
      privateProvenanceEvidenceBound: 452,
      sourceOracleEvidenceBound: 452,
      legacyCompatibilityOracleAvailable: 443,
      waiverProbeNotExecutableOracle: 9,
      workInputBlockedMissingApprovedNonreversibleBehaviorSpec: 452,
      technicalFailedMissingInput: 452,
      provisionalOverlap: 0,
      behaviorPackagesApproved: 0,
      isolatedImplementationInputs: 0,
      approvedExecutableOraclePackages: 0,
      contaminatedReviewApprovals: 0,
      cleanReviewApprovals: 0,
      strictReviewClosures: 0,
      leakageReviewReceipts: 0,
      implementationAuthorized: 0,
      candidateAdmitted: 0,
      candidateBlocked: 452,
      blockerCounts: BLOCKERS.map((code) => ({ code, count: 452 })),
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
    "rawbehaviorspec",
    "behaviorpayload",
    "behaviorspeccontent",
    "displayname",
    "typedlegacyaliases",
    "ast",
    "intermediaterepresentation",
  ]) {
    invariant(!serialized.includes(token));
  }
}

type VerifiedOutputDirectory = Readonly<{
  descriptor: number;
  manifestPath: string;
  outputDirectory: string;
  expectedReal: string;
}>;

function openVerifiedOutputDirectory(
  repositoryRoot: string,
): VerifiedOutputDirectory {
  const components = [
    ".formula-library-private",
    "formula-library-v1",
    "clean-room-evidence-v1",
  ] as const;
  const realRepositoryRoot = realpathSync(repositoryRoot);
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
        );
      } catch (error) {
        closeSync(childDescriptor);
        throw error;
      }
      closeSync(currentDescriptor);
      currentDescriptor = childDescriptor;
    }
    invariant(
      readdirSync(`/proc/self/fd/${currentDescriptor}`).join("\u0000") ===
        "manifest.json",
    );
    const result = {
      descriptor: currentDescriptor,
      manifestPath: join(
        `/proc/self/fd/${currentDescriptor}`,
        "manifest.json",
      ),
      outputDirectory: join(repositoryRoot, ...components),
      expectedReal,
    };
    currentDescriptor = null;
    return result;
  } finally {
    if (currentDescriptor !== null) closeSync(currentDescriptor);
  }
}

export function verifyCleanRoomEvidence(
  repositoryRoot: string,
  afterManifestOpenForTest?: () => void,
  beforeFinalPathCheckForTest?: () => void,
): Readonly<{
  rightsProvenanceClassificationBound: number;
  privateProvenanceEvidenceBound: number;
  sourceOracleEvidenceBound: number;
  technicalFailedMissingInput: number;
  implementationAuthorized: number;
  candidateAdmitted: number;
  manifestContentHash: string;
}> {
  const currentBinding = captureRepositoryBinding(repositoryRoot);
  const outputDirectory = openVerifiedOutputDirectory(repositoryRoot);
  let manifestHandle: RetainedPrivateJson | null = null;
  let finalPublicDirectoryDescriptor: number | null = null;
  try {
    manifestHandle = openRetainedPrivateJson(outputDirectory.manifestPath);
    const retainedManifest = manifestHandle;
    afterManifestOpenForTest?.();
    const manifest = retainedManifest.value;
    invariant(
      manifest.schema ===
        "fractalpark-formula-library-clean-room-evidence/v1" &&
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
        manifest.summary.total === 452 &&
        manifest.summary.rightsProvenanceClassificationBound === 452 &&
        manifest.summary.privateProvenanceEvidenceBound === 452 &&
        manifest.summary.sourceOracleEvidenceBound === 452 &&
        manifest.summary.technicalFailedMissingInput === 452 &&
        manifest.summary.implementationAuthorized === 0 &&
        manifest.summary.candidateAdmitted === 0 &&
        manifest.summary.candidateBlocked === 452 &&
        manifest.candidateReceiptsIssued === 0 &&
        manifest.publicCandidateAssemblyAllowed === false &&
        manifest.publicPromotionAllowed === false &&
        manifest.publicAssetsWritten === 0,
    );
    invariant(
      canonicalJson(currentBinding) ===
        canonicalJson(captureRepositoryBinding(repositoryRoot)),
    );
    const finalManifest = fstatSync(retainedManifest.descriptor);
    const finalManifestBytes = readFileSync(
      `/proc/self/fd/${retainedManifest.descriptor}`,
    );
    const openedOutputDirectory = fstatSync(outputDirectory.descriptor);
    beforeFinalPathCheckForTest?.();
    finalPublicDirectoryDescriptor = openSync(
      outputDirectory.outputDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const finalPublicOutputDirectory = fstatSync(
      finalPublicDirectoryDescriptor,
    );
    const finalPublicOutputDirectoryReal = realpathSync(
      `/proc/self/fd/${finalPublicDirectoryDescriptor}`,
    );
    const finalPublicOutputEntries = readdirSync(
      `/proc/self/fd/${finalPublicDirectoryDescriptor}`,
    );
    const currentManifest = lstatSync(
      join(`/proc/self/fd/${finalPublicDirectoryDescriptor}`, "manifest.json"),
    );
    invariant(
      finalManifest.isFile() &&
        finalManifest.dev === retainedManifest.opened.dev &&
        finalManifest.ino === retainedManifest.opened.ino &&
        finalManifest.nlink === 1 &&
        finalManifest.size === retainedManifest.opened.size &&
        finalManifest.mtimeMs === retainedManifest.opened.mtimeMs &&
        finalManifest.ctimeMs === retainedManifest.opened.ctimeMs &&
        finalManifestBytes.equals(retainedManifest.bytes) &&
        finalPublicOutputDirectory.isDirectory() &&
        finalPublicOutputDirectory.dev === openedOutputDirectory.dev &&
        finalPublicOutputDirectory.ino === openedOutputDirectory.ino &&
        (finalPublicOutputDirectory.mode & 0o777) === 0o700 &&
        finalPublicOutputDirectoryReal === outputDirectory.expectedReal &&
        finalPublicOutputEntries.join("\u0000") === "manifest.json" &&
        currentManifest.isFile() &&
        !currentManifest.isSymbolicLink() &&
        currentManifest.dev === retainedManifest.opened.dev &&
        currentManifest.ino === retainedManifest.opened.ino &&
        currentManifest.nlink === 1 &&
        (currentManifest.mode & 0o777) === 0o600,
    );
    return {
      rightsProvenanceClassificationBound: 452,
      privateProvenanceEvidenceBound: 452,
      sourceOracleEvidenceBound: 452,
      technicalFailedMissingInput: 452,
      implementationAuthorized: 0,
      candidateAdmitted: 0,
      manifestContentHash: manifest.manifestContentHash,
    };
  } finally {
    if (finalPublicDirectoryDescriptor !== null) {
      closeSync(finalPublicDirectoryDescriptor);
    }
    if (manifestHandle !== null) closeSync(manifestHandle.descriptor);
    closeSync(outputDirectory.descriptor);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = verifyCleanRoomEvidence(process.cwd());
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
  } catch {
    process.stderr.write("clean-room-evidence-verification-invalid\n");
    process.exitCode = 1;
  }
}
