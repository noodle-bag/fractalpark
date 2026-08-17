import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";

import { chromium } from "@playwright/test";

import { compileClassicFrmEntry } from "../src/engine/frm/compile";
import { scanFrmEntries } from "../src/engine/frm/scanner";
import {
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "../src/engine/frm/v1";
import {
  compileFrmLikeV1Backend,
  type FrmLikeV1Backend,
} from "../src/engine/frm/v1-backend";
import {
  projectClassicAstToFrmLikeV1,
  runFormulaLibraryCpuSmoke,
  runFormulaLibraryOracle,
  selectClassicMigrationEntry,
  type FormulaLibraryBulkFailureStage,
  type FormulaLibraryBulkReasonCode,
  type FormulaLibraryCpuSmokeSnapshot,
} from "../src/engine/formulas/v1/bulk-migration";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaRevisionV1,
} from "../src/engine/formulas/v1";
import {
  composeProvisionalContactSheetV1,
  renderProvisionalPreviewV1,
} from "../src/engine/formulas/v1/provisional-preview";
import {
  PROVISIONAL_FAMILY_SAFE_FALLBACKS_V1,
  PROVISIONAL_PROFILE_POLICY_V1,
  projectProvisionalProfileV1,
  type ProvisionalBoundsCandidatesV1,
} from "../src/engine/formulas/v1/provisional-profile";

const CONTROLLER_VERSION = "formula-library-bulk-migration/2";
const EXPECTED_ROWS = 677;
const EXPECTED_CORPUS_FILES = 2196;
const EXPECTED_CORPUS_SHA256 =
  "ae81a9248e16d96bbbcfd949f0169f750db31b8b6cc0a3f822bd713160e0601e";
const EXPECTED_CORPUS_PATH_SNAPSHOT_SHA256 =
  "0772c31746aefa3d9e26fcc82a564334cccfb92aef8483f75ba64cd1dd229a0b";
const EXPECTED_RIGHTS_PROTOCOL_SHA256 =
  "f537fc71512cd3ffcc0a24deb436009d50d267afd21e4b09d8fa569805b1a1ea";
const EXPECTED_WORK_PACKAGE_SHA256 =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const EXPECTED_RUNNABLE_LEDGER_SHA256 =
  "0c494e773a918051e1efc398999de6b5ab684ac96af8cad7be0c0c2156aea545";
const EXPECTED_RUNNABLE_ROWS = 20;
const PROVISIONAL_CONTROLLER_VERSION = "formula-library-provisional-assets/1";
const PRIVATE_OUTPUT_COMPONENTS = [
  ".formula-library-private",
  "formula-library-v1",
] as const;
const PRIVATE_OUTPUT_FILENAME = "bulk-migration-ledger.json";
const PRIVATE_PRESENTABLE_COMPONENTS = [
  ...PRIVATE_OUTPUT_COMPONENTS,
  "provisional-assets-v1",
] as const;
const PRIVATE_PRESENTABLE_MANIFEST = "manifest.json";
const PRIVATE_PRESENTABLE_CONTACT_SHEET = "contact-sheet.png";
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const PUBLIC_CONTROLLER_ERROR_CODES = new Set([
  "alias-binding-mismatch",
  "alias-row-mismatch",
  "census-row-count-mismatch",
  "controller-internal-error",
  "corpus-env-missing",
  "corpus-entry-kind-invalid",
  "corpus-file-count-mismatch",
  "corpus-path-snapshot-mismatch",
  "corpus-permissions-too-broad",
  "corpus-snapshot-mismatch",
  "corpus-symlink-rejected",
  "corpus-unavailable",
  "handoff-env-missing",
  "identity-binding-mismatch",
  "identity-count-mismatch",
  "identity-order-mismatch",
  "identity-source-set-mismatch",
  "oracle-artifact-invalid",
  "oracle-artifact-unavailable",
  "oracle-binding-conflict",
  "oracle-env-missing",
  "oracle-hash-mismatch",
  "oracle-name-invalid",
  "oracle-row-duplicate",
  "oracle-row-status-mismatch",
  "private-input-kind-mismatch",
  "private-input-permissions-too-broad",
  "private-input-symlink-rejected",
  "private-input-unavailable",
  "private-output-containment-failed",
  "private-output-permissions-invalid",
  "private-output-root-invalid",
  "private-output-symlink-rejected",
  "private-output-write-failed",
  "provisional-assets-input-invalid",
  "provisional-assets-ledger-mismatch",
  "provisional-assets-render-failed",
  "provisional-assets-revalidation-failed",
  "repository-binding-unavailable",
  "repository-revision-not-ancestor",
  "repository-scope-mismatch",
  "repository-scope-query-failed",
  "rights-contract-mismatch",
  "rights-protocol-binding-mismatch",
  "row-oracle-binding-missing",
  "row-oracle-evidence-missing",
  "work-package-content-hash-mismatch",
  "work-package-frozen-hash-mismatch",
  "work-package-identity-duplicate",
  "work-package-invalid",
  "work-package-json-missing",
  "work-package-marker-missing",
  "work-package-row-count-mismatch",
  "work-package-schema-mismatch",
  "work-package-source-set-count-mismatch",
  "work-package-status-mismatch",
  "work-package-unavailable",
  "write-flag-required",
]);

export function sanitizeControllerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return PUBLIC_CONTROLLER_ERROR_CODES.has(message)
    ? message
    : "controller-internal-error";
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface TypedAlias {
  readonly kind: string;
  readonly value: string;
  readonly formulaId: string;
}

export interface WorkRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly primaryFamily?: string;
  readonly typedLegacyAliases: readonly TypedAlias[];
  readonly rights: {
    readonly class: "A" | "B" | "C" | "P";
    readonly lane: "direct-adaptation" | "clean-room";
    readonly canonicalLicenseTarget: string;
    readonly rightsEvidenceStatus: string;
    readonly sourceVisibility: string;
  };
  readonly implementationInput: {
    readonly status: string;
    readonly inputKind: string;
    readonly safeSourceLocator?: string | null;
    readonly runtimeId?: string;
    readonly behaviorSpecAuthor?: string | null;
    readonly behaviorSpecRevision?: string | null;
    readonly behaviorSpecSha256?: string | null;
    readonly forbiddenForIsolatedImplementer: readonly string[];
  };
  readonly workStartEligibility: string;
  readonly review: {
    readonly status: string;
  };
  readonly fixturesOrOracle: {
    readonly artifact?: string;
    readonly artifactSha256?: string;
    readonly evidenceKey?: string;
  };
  readonly defaultProfileCandidate?: {
    readonly status?: string;
    readonly candidate?: unknown;
    readonly explicitLegacyDefaultProfile?: boolean;
    readonly verification?: string;
  };
  readonly previewInput?: {
    readonly status?: string;
    readonly candidate?: unknown;
    readonly verification?: string;
  };
}

interface WorkPackage {
  readonly schema: string;
  readonly status: string;
  readonly payloadContentHash: string;
  readonly sourceBindings: {
    readonly standardFormulaIds: { readonly sha256: string };
    readonly legacyFormulaAliases: { readonly sha256: string };
    readonly rightsProtocol: { readonly sha256: string };
    readonly repositoryRevision: string;
  };
  readonly rows: readonly WorkRow[];
}

interface IdentityManifest {
  readonly formulaCount: number;
  readonly formulas: readonly {
    readonly formulaId: string;
  }[];
}

interface AliasManifest {
  readonly aliases: readonly TypedAlias[];
}

interface CorpusFile {
  readonly path: string;
  readonly relativePath: string;
  readonly relativeLower: string;
}

export interface ExpectedOracleRun {
  readonly pixel: readonly [number, number];
  readonly escapedAt: number | null;
  readonly orbit?: readonly (readonly [number, number])[];
  readonly rounds?: number;
}

export interface ExpectedOracleRow {
  readonly maxIterations: number;
  readonly runs: readonly ExpectedOracleRun[];
}

interface OracleArtifactPayload {
  readonly maxIter: number;
  readonly rows?: readonly {
    readonly name: string;
    readonly status: string;
    readonly pixels: readonly ExpectedOracleRun[];
  }[];
  readonly outcomes?: readonly {
    readonly name: string;
    readonly via: string;
    readonly orbits: readonly ExpectedOracleRun[];
  }[];
}

export interface PreflightContext {
  readonly workPackage: WorkPackage;
  readonly corpusFiles: readonly CorpusFile[];
  readonly corpusRoot: string;
  readonly oracleRows: ReadonlyMap<string, ExpectedOracleRow>;
  readonly inputHashes: {
    readonly workPackage: string;
    readonly corpusSnapshot: string;
    readonly corpusPathSnapshot: string;
    readonly rightsProtocol: string;
    readonly standardFormulaIds: string;
    readonly legacyFormulaAliases: string;
    readonly repositoryRevision: string;
    readonly oracleArtifacts: Readonly<Record<string, string>>;
  };
}

export interface PassedRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly status: "passed";
  readonly publicationEligible: false;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly backendArtifactSha256: string;
  readonly cpu: FormulaLibraryCpuSmokeSnapshot;
  readonly releaseOracle: {
    readonly status: "passed";
    readonly runs: number;
  };
  readonly webgl: {
    readonly compileLinkDraw: "passed";
    readonly deterministicDraw: "passed";
    readonly cpuParity: "passed";
    readonly oracleRuns: number;
    readonly orbitPoints: number;
  };
}

interface FailedRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly status: "failed";
  readonly publicationEligible: false;
  readonly failureStage: FormulaLibraryBulkFailureStage;
  readonly reasonCode: FormulaLibraryBulkReasonCode;
}

type CensusRow = PassedRow | FailedRow;

export interface GpuRun {
  readonly pixel: readonly [number, number];
  readonly expectedOrbit: readonly (readonly [number, number])[];
}

export interface GpuCase {
  readonly formulaId: string;
  readonly declarations: string;
  readonly init: string;
  readonly loop: string;
  readonly continuePredicate: string;
  readonly eventFlag: string;
  readonly maxIterations: number;
  readonly runs: readonly GpuRun[];
  readonly parameters: readonly {
    readonly name: string;
    readonly type: "real" | "complex" | "function";
    readonly value: number | readonly [number, number] | string;
  }[];
  readonly functionOptions: readonly string[];
}

export interface PendingPass {
  readonly row: WorkRow;
  readonly definition: FormulaDefinitionV1;
  readonly backend: FrmLikeV1Backend;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly backendArtifactSha256: string;
  readonly cpu: FormulaLibraryCpuSmokeSnapshot;
  readonly oracleRuns: number;
  readonly gpuCase: GpuCase;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(",")}}`;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function parseJsonFile<T>(path: string, failureCode: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(failureCode);
  }
}

function extractWorkPackage(path: string): WorkPackage {
  let markdown: string;
  try {
    markdown = readFileSync(path, "utf8");
  } catch {
    throw new Error("work-package-unavailable");
  }
  const marker = markdown.indexOf(WORK_PACKAGE_START);
  invariant(marker >= 0, "work-package-marker-missing");
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(start >= 0 && end > start, "work-package-json-missing");
  try {
    return JSON.parse(markdown.slice(start, end)) as WorkPackage;
  } catch {
    throw new Error("work-package-invalid");
  }
}

export function assertPrivateMode(path: string, kind: "file" | "directory"): void {
  let metadata: Stats;
  try {
    metadata = lstatSync(path);
  } catch {
    throw new Error("private-input-unavailable");
  }
  invariant(!metadata.isSymbolicLink(), "private-input-symlink-rejected");
  invariant(
    kind === "file" ? metadata.isFile() : metadata.isDirectory(),
    "private-input-kind-mismatch",
  );
  invariant((metadata.mode & 0o077) === 0, "private-input-permissions-too-broad");
}

export function walkCorpus(root: string): CorpusFile[] {
  assertPrivateMode(root, "directory");
  const output: CorpusFile[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const metadata = lstatSync(path);
      invariant(!metadata.isSymbolicLink(), "corpus-symlink-rejected");
      if (metadata.isDirectory()) {
        invariant((metadata.mode & 0o077) === 0, "corpus-permissions-too-broad");
        walk(path);
      } else {
        invariant(metadata.isFile(), "corpus-entry-kind-invalid");
        invariant((metadata.mode & 0o077) === 0, "corpus-permissions-too-broad");
        const relativePath = relative(root, path).replaceAll("\\", "/");
        output.push({
          path,
          relativePath,
          relativeLower: relativePath.toLowerCase(),
        });
      }
    }
  };
  walk(root);
  return output;
}

export function corpusSnapshotHash(files: readonly CorpusFile[]): string {
  const hashes = files.map((file) => sha256File(file.path)).sort();
  return sha256Bytes(hashes.join("\n"));
}

export function corpusPathSnapshotHash(files: readonly CorpusFile[]): string {
  const bindings = files
    .map((file) => `${file.relativePath}\u0000${sha256File(file.path)}`)
    .sort();
  return sha256Bytes(bindings.join("\n"));
}

function sortedAliasKey(aliases: readonly TypedAlias[]): string {
  return [...aliases]
    .map((alias) => `${alias.kind}\u0000${alias.value}\u0000${alias.formulaId}`)
    .sort()
    .join("\n");
}

const CLEAN_ROOM_FORBIDDEN_INPUTS = Object.freeze([
  "third-party-original-source",
  "source-comments",
  "source-variable-names",
  "statement-layout",
  "complete-ast-or-ir",
  "private-source-paths",
]);

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  return (
    normalizedActual.length === normalizedExpected.length &&
    normalizedActual.every((value, index) => value === normalizedExpected[index])
  );
}

export function assertRightsContract(row: WorkRow, baseRevision: string): void {
  invariant(row.workStartEligibility === "blocked-incomplete-package", "rights-contract-mismatch");
  invariant(row.review.status === "blocked-incomplete-package", "rights-contract-mismatch");
  invariant(row.rights.canonicalLicenseTarget === "MIT", "rights-contract-mismatch");

  if (row.implementationInput.status === "ready-direct-source") {
    invariant(
      row.sourceSet === "F588" &&
        row.rights.class === "A" &&
        row.rights.lane === "direct-adaptation" &&
        row.rights.rightsEvidenceStatus === "frozen-per-record-classification" &&
        row.rights.sourceVisibility === "source-visible-after-content-gate" &&
        row.implementationInput.inputKind === "approved-direct-source" &&
        typeof row.implementationInput.safeSourceLocator === "string" &&
        row.implementationInput.safeSourceLocator.length > 0 &&
        row.implementationInput.runtimeId == null &&
        row.implementationInput.behaviorSpecAuthor == null &&
        row.implementationInput.behaviorSpecRevision == null &&
        row.implementationInput.behaviorSpecSha256 == null &&
        sameStringSet(row.implementationInput.forbiddenForIsolatedImplementer, []),
      "rights-contract-mismatch",
    );
    return;
  }

  if (row.implementationInput.status === "ready-project-owned-runtime-contract") {
    invariant(
      row.sourceSet === "B94" &&
        row.rights.class === "P" &&
        row.rights.lane === "direct-adaptation" &&
        row.rights.rightsEvidenceStatus === "project-owned-runtime-source" &&
        row.rights.sourceVisibility === "source-visible" &&
        row.implementationInput.inputKind === "project-owned-runtime-source-and-contract" &&
        row.implementationInput.safeSourceLocator == null &&
        typeof row.implementationInput.runtimeId === "string" &&
        row.implementationInput.runtimeId.length > 0 &&
        row.implementationInput.behaviorSpecAuthor === "FractalPark project" &&
        row.implementationInput.behaviorSpecRevision === baseRevision &&
        /^[a-f0-9]{64}$/.test(row.implementationInput.behaviorSpecSha256 ?? "") &&
        sameStringSet(row.implementationInput.forbiddenForIsolatedImplementer, []),
      "rights-contract-mismatch",
    );
    return;
  }

  invariant(
    row.implementationInput.status ===
      "blocked-missing-approved-nonreversible-behavior-spec" &&
      row.sourceSet === "F588" &&
      row.rights.class !== "P" &&
      row.rights.lane === "clean-room" &&
      row.rights.rightsEvidenceStatus === "frozen-per-record-classification" &&
      row.rights.sourceVisibility === "isolated-controller-only" &&
      row.implementationInput.inputKind === "clean-room-math-behavior-spec" &&
      row.implementationInput.safeSourceLocator == null &&
      row.implementationInput.runtimeId == null &&
      row.implementationInput.behaviorSpecAuthor == null &&
      row.implementationInput.behaviorSpecRevision == null &&
      row.implementationInput.behaviorSpecSha256 == null &&
      sameStringSet(
        row.implementationInput.forbiddenForIsolatedImplementer,
        CLEAN_ROOM_FORBIDDEN_INPUTS,
      ),
    "rights-contract-mismatch",
  );
}

function gitBaseIsAncestor(repositoryRoot: string, revision: string): boolean {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", revision, "HEAD"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    }).status === 0
  );
}

function gitPaths(repositoryRoot: string, args: readonly string[]): string[] {
  const result = spawnSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  invariant(result.status === 0, "repository-scope-query-failed");
  return result.stdout
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

interface RepositoryIndexBinding {
  readonly repositoryHead: string;
  readonly repositoryIndexTree: string;
}

function captureRepositoryIndexBinding(repositoryRoot: string): RepositoryIndexBinding {
  const unstaged = spawnSync("git", ["diff", "--quiet", "--no-ext-diff"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  invariant(unstaged.status === 0, "repository-binding-unavailable");
  const repositoryHead = gitPaths(repositoryRoot, ["rev-parse", "HEAD"])[0];
  const repositoryIndexTree = gitPaths(repositoryRoot, ["write-tree"])[0];
  invariant(
    /^[0-9a-f]{40}$/.test(repositoryHead) &&
      /^[0-9a-f]{40}$/.test(repositoryIndexTree),
    "repository-binding-unavailable",
  );
  return { repositoryHead, repositoryIndexTree };
}

function assertRepositoryScope(
  repositoryRoot: string,
  baseRevision: string,
): void {
  // Every path the unified-formula-library branch has legitimately touched
  // since the frozen handoff base revision aafe943f (12a/12b/12c included).
  const allowed = new Set([
    ".gitignore",
    "docs/adr/0008-unified-formula-library-contract.md",
    "docs/specs/unified-formula-library-v1.md",
    "docs/testing/v0.4.19-regression-matrix.md",
    "package.json",
    "resources/formula-library/v1/publication-decisions.json",
    "scripts/cross-check-native-recipes.ts",
    "scripts/diagnose-conformance.ts",
    "scripts/formula-library-bulk-migration.ts",
    "scripts/generate-formula-clean-room-evidence.ts",
    "scripts/generate-formula-direct-adaptation-evidence.ts",
    "scripts/generate-formula-publication-decisions.ts",
    "scripts/generate-formula-publication-readiness.ts",
    "scripts/recipe-canonicalize.ts",
    "scripts/run-webgl-worker.ts",
    "scripts/verify-formula-clean-room-evidence.ts",
    "scripts/verify-formula-direct-adaptation-evidence.ts",
    "scripts/verify-formula-publication-decisions.ts",
    "scripts/verify-formula-publication-readiness.ts",
    "src/engine/formulas/v1/bulk-migration.ts",
    "src/engine/formulas/v1/clean-room-behavior-package-gate-verifier.ts",
    "src/engine/formulas/v1/clean-room-behavior-package-gate.ts",
    "src/engine/formulas/v1/clean-room-evidence.ts",
    "src/engine/formulas/v1/direct-adaptation-evidence.ts",
    "src/engine/formulas/v1/index.ts",
    "src/engine/formulas/v1/native-recipes-b94-clamps.ts",
    "src/engine/formulas/v1/native-recipes-b94-classic.ts",
    "src/engine/formulas/v1/native-recipes-b94-held.ts",
    "src/engine/formulas/v1/native-recipes-b94-newton.ts",
    "src/engine/formulas/v1/native-recipes-b94-transcendental.ts",
    "src/engine/formulas/v1/native-recipes.ts",
    "src/engine/formulas/v1/provisional-preview.ts",
    "src/engine/formulas/v1/provisional-profile.ts",
    "src/engine/formulas/v1/publication-decisions.ts",
    "src/engine/formulas/v1/publication-readiness.ts",
    "src/engine/formulas/v1/revisions.ts",
    "src/engine/frm/codemirror-language.ts",
    "src/engine/frm/frm-v1-glsl-prelude.ts",
    "src/engine/frm/frm-v1-stdlib.ts",
    "src/engine/frm/type-system.ts",
    "src/engine/frm/v1-backend.ts",
    "src/prototypes/unified-formula-library.ts",
    "src/test/formula-clean-room-behavior-package-gate-integration.test.ts",
    "src/test/formula-clean-room-behavior-package-gate.test.ts",
    "src/test/formula-clean-room-evidence-integration.test.ts",
    "src/test/formula-clean-room-evidence-output.test.ts",
    "src/test/formula-clean-room-evidence.test.ts",
    "src/test/formula-direct-adaptation-evidence-output.test.ts",
    "src/test/formula-direct-adaptation-evidence.test.ts",
    "src/test/formula-library-bulk-migration.test.ts",
    "src/test/formula-library-provisional-assets.test.ts",
    "src/test/formula-native-recipes.test.ts",
    "src/test/formula-publication-decisions-output.test.ts",
    "src/test/formula-publication-decisions.test.ts",
    "src/test/formula-publication-readiness-output.test.ts",
    "src/test/formula-publication-readiness.test.ts",
    "src/test/frm-v1-stdlib.test.ts",
  ]);
  const changed = new Set([
    ...gitPaths(repositoryRoot, ["diff", "--name-only", `${baseRevision}...HEAD`]),
    ...gitPaths(repositoryRoot, ["diff", "--name-only"]),
    ...gitPaths(repositoryRoot, ["diff", "--cached", "--name-only"]),
    ...gitPaths(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  invariant(
    [...changed].every((path) => allowed.has(path)),
    "repository-scope-mismatch",
  );
}

export function preflight(repositoryRoot: string): PreflightContext {
  const workPackagePath = process.env.FRACTALPARK_FORMULA_HANDOFF;
  const corpusRoot = process.env.FRACTALPARK_FRM_CORPUS_DIR;
  const oracleRoot = process.env.FRACTALPARK_FORMULA_ORACLE_DIR;
  invariant(workPackagePath, "handoff-env-missing");
  invariant(corpusRoot, "corpus-env-missing");
  invariant(oracleRoot, "oracle-env-missing");
  assertPrivateMode(workPackagePath, "file");
  assertPrivateMode(oracleRoot, "directory");

  const workPackage = extractWorkPackage(workPackagePath);
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1",
    "work-package-schema-mismatch",
  );
  invariant(
    workPackage.status === "candidate-ledger-not-implementation-approval",
    "work-package-status-mismatch",
  );
  invariant(
    workPackage.payloadContentHash === EXPECTED_WORK_PACKAGE_SHA256,
    "work-package-frozen-hash-mismatch",
  );
  const unhashed: Record<string, unknown> = { ...workPackage };
  delete unhashed.payloadContentHash;
  invariant(
    sha256Bytes(canonical(unhashed as unknown as JsonValue)) ===
      workPackage.payloadContentHash,
    "work-package-content-hash-mismatch",
  );
  invariant(workPackage.rows.length === EXPECTED_ROWS, "work-package-row-count-mismatch");
  invariant(
    new Set(workPackage.rows.map((row) => row.formulaId)).size === EXPECTED_ROWS,
    "work-package-identity-duplicate",
  );
  invariant(
    workPackage.sourceBindings.rightsProtocol.sha256 ===
      EXPECTED_RIGHTS_PROTOCOL_SHA256,
    "rights-protocol-binding-mismatch",
  );
  invariant(
    workPackage.rows.filter((row) => row.sourceSet === "F588").length === 588 &&
      workPackage.rows.filter((row) => row.sourceSet === "B94").length === 89,
    "work-package-source-set-count-mismatch",
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
  const identities = parseJsonFile<IdentityManifest>(
    identitiesPath,
    "repository-binding-unavailable",
  );
  const aliases = parseJsonFile<AliasManifest>(
    aliasesPath,
    "repository-binding-unavailable",
  );
  invariant(
    identities.formulaCount === EXPECTED_ROWS &&
      identities.formulas.length === EXPECTED_ROWS,
    "identity-count-mismatch",
  );
  invariant(
    sha256File(identitiesPath) === workPackage.sourceBindings.standardFormulaIds.sha256,
    "identity-binding-mismatch",
  );
  invariant(
    sha256File(aliasesPath) === workPackage.sourceBindings.legacyFormulaAliases.sha256,
    "alias-binding-mismatch",
  );
  const aliasesByFormula = new Map<string, TypedAlias[]>();
  for (const alias of aliases.aliases) {
    const grouped = aliasesByFormula.get(alias.formulaId) ?? [];
    grouped.push(alias);
    aliasesByFormula.set(alias.formulaId, grouped);
  }
  workPackage.rows.forEach((row, index) => {
    assertRightsContract(row, workPackage.sourceBindings.repositoryRevision);
    const identity = identities.formulas[index];
    invariant(identity?.formulaId === row.formulaId, "identity-order-mismatch");
    const rowAliases = aliasesByFormula.get(row.formulaId) ?? [];
    const derivedSourceSet = rowAliases.some((alias) => alias.kind === "f588")
      ? "F588"
      : "B94";
    invariant(derivedSourceSet === row.sourceSet, "identity-source-set-mismatch");
    invariant(
      sortedAliasKey(row.typedLegacyAliases) === sortedAliasKey(rowAliases),
      "alias-row-mismatch",
    );
  });
  invariant(
    gitBaseIsAncestor(repositoryRoot, workPackage.sourceBindings.repositoryRevision),
    "repository-revision-not-ancestor",
  );
  assertRepositoryScope(
    repositoryRoot,
    workPackage.sourceBindings.repositoryRevision,
  );

  const corpusFiles = walkCorpus(corpusRoot);
  invariant(corpusFiles.length === EXPECTED_CORPUS_FILES, "corpus-file-count-mismatch");
  const corpusHash = corpusSnapshotHash(corpusFiles);
  invariant(corpusHash === EXPECTED_CORPUS_SHA256, "corpus-snapshot-mismatch");
  const corpusPathHash = corpusPathSnapshotHash(corpusFiles);
  invariant(
    corpusPathHash === EXPECTED_CORPUS_PATH_SNAPSHOT_SHA256,
    "corpus-path-snapshot-mismatch",
  );

  const expectedArtifacts = new Map<string, string>();
  for (const row of workPackage.rows) {
    const artifact = row.fixturesOrOracle.artifact;
    const artifactSha256 = row.fixturesOrOracle.artifactSha256;
    if (!artifact || !artifactSha256) continue;
    const previous = expectedArtifacts.get(artifact);
    invariant(!previous || previous === artifactSha256, "oracle-binding-conflict");
    expectedArtifacts.set(artifact, artifactSha256);
  }
  const actualArtifacts: Record<string, string> = {};
  const oracleRows = new Map<string, ExpectedOracleRow>();
  for (const [artifact, expected] of [...expectedArtifacts].sort()) {
    invariant(!artifact.includes("/") && !artifact.includes("\\"), "oracle-name-invalid");
    const artifactPath = join(oracleRoot, artifact);
    assertPrivateMode(artifactPath, "file");
    const actual = sha256File(artifactPath);
    invariant(actual === expected, "oracle-hash-mismatch");
    actualArtifacts[artifact] = actual;
    const payload = parseJsonFile<OracleArtifactPayload>(
      artifactPath,
      "oracle-artifact-invalid",
    );
    if (!Number.isInteger(payload.maxIter) || payload.maxIter < 1) continue;
    for (const oracle of payload.rows ?? []) {
      invariant(oracle.status === "ok", "oracle-row-status-mismatch");
      const key = `${artifact}\u0000${oracle.name.toLowerCase()}`;
      invariant(!oracleRows.has(key), "oracle-row-duplicate");
      oracleRows.set(key, {
        maxIterations: payload.maxIter,
        runs: oracle.pixels,
      });
    }
    for (const oracle of payload.outcomes ?? []) {
      const key = `${artifact}\u0000${oracle.name.toLowerCase()}`;
      invariant(!oracleRows.has(key), "oracle-row-duplicate");
      oracleRows.set(key, {
        maxIterations: payload.maxIter,
        runs: oracle.orbits,
      });
    }
  }
  for (const row of workPackage.rows) {
    if (row.implementationInput.status !== "ready-direct-source") continue;
    const artifact = row.fixturesOrOracle.artifact;
    const evidenceKey = row.fixturesOrOracle.evidenceKey;
    invariant(artifact && evidenceKey, "row-oracle-binding-missing");
    invariant(
      oracleRows.has(`${artifact}\u0000${evidenceKey.toLowerCase()}`),
      "row-oracle-evidence-missing",
    );
  }

  return {
    workPackage,
    corpusFiles,
    corpusRoot,
    oracleRows,
    inputHashes: {
      workPackage: workPackage.payloadContentHash,
      corpusSnapshot: corpusHash,
      corpusPathSnapshot: corpusPathHash,
      rightsProtocol: workPackage.sourceBindings.rightsProtocol.sha256,
      standardFormulaIds: sha256File(identitiesPath),
      legacyFormulaAliases: sha256File(aliasesPath),
      repositoryRevision: workPackage.sourceBindings.repositoryRevision,
      oracleArtifacts: actualArtifacts,
    },
  };
}

function resolveApprovedSource(
  files: readonly CorpusFile[],
  locator: string,
): CorpusFile | null {
  const normalized = locator.replaceAll("\\", "/").toLowerCase();
  const exact = files.filter((file) => file.relativeLower === normalized);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const segments = normalized.split("/").filter(Boolean);
  for (let length = Math.min(segments.length, 4); length >= 2; length--) {
    const suffix = segments.slice(-length).join("/");
    const matches = files.filter(
      (file) =>
        file.relativeLower === suffix ||
        file.relativeLower.endsWith(`/${suffix}`),
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return null;
}

function failed(
  row: WorkRow,
  failureStage: FormulaLibraryBulkFailureStage,
  reasonCode: FormulaLibraryBulkReasonCode,
): FailedRow {
  return {
    formulaId: row.formulaId,
    sourceSet: row.sourceSet,
    status: "failed",
    publicationEligible: false,
    failureStage,
    reasonCode,
  };
}

function stableEqual(left: JsonValue, right: JsonValue): boolean {
  return canonical(left) === canonical(right);
}

function oracleNumberMatches(
  actual: number | "non-finite",
  expected: number,
): boolean {
  if (actual === "non-finite" || !Number.isFinite(expected)) return false;
  const tolerance = 3e-4 * Math.max(1, Math.abs(actual), Math.abs(expected));
  return Math.abs(actual - expected) <= tolerance;
}

export function releaseOracleMatches(
  actual: ReturnType<typeof runFormulaLibraryOracle>,
  expected: ExpectedOracleRow,
): boolean {
  if (actual.length !== expected.runs.length) return false;
  return actual.every((run, index) => {
    const oracle = expected.runs[index];
    if (
      run.event !== null ||
      run.pixel[0] !== oracle.pixel[0] ||
      run.pixel[1] !== oracle.pixel[1] ||
      run.escapedAt !== oracle.escapedAt
    )
      return false;
    if (oracle.rounds !== undefined && run.orbit.length !== oracle.rounds)
      return false;
    if (!oracle.orbit) return true;
    if (run.orbit.length !== oracle.orbit.length) return false;
    return run.orbit.every(
      (point, pointIndex) =>
        oracleNumberMatches(point[0], oracle.orbit![pointIndex][0]) &&
        oracleNumberMatches(point[1], oracle.orbit![pointIndex][1]),
    );
  });
}

export interface PreparedDefinitionRow {
  readonly row: WorkRow;
  readonly definition: FormulaDefinitionV1;
  readonly backend: FrmLikeV1Backend;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly expectedOracle: ExpectedOracleRow | undefined;
}

/**
 * Input checks through backend compilation, without the release-oracle and
 * determinism gates. Shared by the census (`prepareRow`) and the 12d
 * conformance diagnosis, which needs the prepared definition even for rows
 * whose oracle comparison fails.
 */
export async function prepareDefinitionRow(
  row: WorkRow,
  context: PreflightContext,
): Promise<FailedRow | PreparedDefinitionRow> {
  if (row.implementationInput.status === "blocked-missing-approved-nonreversible-behavior-spec")
    return failed(row, "input", "missing-input");
  if (row.implementationInput.status === "ready-project-owned-runtime-contract")
    return failed(row, "v1-projection", "v1-projection-unsupported");
  if (row.implementationInput.status !== "ready-direct-source")
    return failed(row, "input", "missing-input");

  const locator = row.implementationInput.safeSourceLocator;
  const evidenceKey = row.fixturesOrOracle.evidenceKey;
  if (!locator || !evidenceKey)
    return failed(row, "input", "missing-input");
  const sourceFile = resolveApprovedSource(context.corpusFiles, locator);
  if (!sourceFile) return failed(row, "input", "missing-input");

  const fileSource = readFileSync(sourceFile.path, "latin1");
  const scanned = scanFrmEntries(fileSource);
  const selectedEntry = selectClassicMigrationEntry(scanned.entries, evidenceKey);
  if (!selectedEntry)
    return failed(row, "input", "identity-or-alias-mismatch");

  const classic = compileClassicFrmEntry(
    fileSource,
    selectedEntry.key,
    row.formulaId,
    2,
  );
  if (!classic.success || !classic.ast)
    return failed(row, "classic-lowering", "classic-lowering-failed");
  const projected = projectClassicAstToFrmLikeV1({
    formulaId: row.formulaId,
    ast: classic.ast,
    functionDefaults: classic.plugin?.fnDefaults,
  });
  if (!projected.ok)
    return failed(row, "v1-projection", "v1-projection-unsupported");

  const canonicalSource = canonicalizeFrmLikeV1(projected.ir);
  const parsed = parseFrmLikeV1(canonicalSource);
  if (!parsed.ok) return failed(row, "v1-parse", "v1-parse-failed");
  if (canonicalizeFrmLikeV1(parsed.ir) !== canonicalSource)
    return failed(row, "canonical-roundtrip", "canonical-roundtrip-failed");

  const revisions = await hashFrmLikeV1(canonicalSource, parsed.ir);
  const definition: FormulaDefinitionV1 = {
    schemaVersion: 1,
    formulaId: row.formulaId as FormulaIdV1,
    scope: "standard",
    source: canonicalSource,
    sourceRevision: revisions.sourceRevision as FormulaRevisionV1,
    semanticHash: revisions.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: parsed.ir.parameters,
    programModel: "orbit",
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [],
    capabilities: [],
  };
  const safety = await validateFormulaSafetyEnvelopeV1(
    projectExecutableFormulaDefinitionV1(definition),
  );
  if (!safety.ok)
    return failed(row, "safety-envelope", "safety-envelope-failed");

  const compiled = compileFrmLikeV1Backend(safety.ir);
  if (!compiled.ok)
    return failed(row, "backend-compile", "backend-compile-failed");
  const artifact = row.fixturesOrOracle.artifact;
  const expectedOracle = artifact
    ? context.oracleRows.get(`${artifact}\u0000${evidenceKey.toLowerCase()}`)
    : undefined;
  return {
    row,
    definition,
    backend: compiled.backend,
    sourceRevision: revisions.sourceRevision,
    semanticHash: revisions.semanticHash,
    expectedOracle,
  };
}

export async function prepareRow(
  row: WorkRow,
  context: PreflightContext,
): Promise<FailedRow | PendingPass> {
  const preparedDefinition = await prepareDefinitionRow(row, context);
  if (!("definition" in preparedDefinition)) return preparedDefinition;
  const {
    definition,
    backend: compiledBackend,
    sourceRevision,
    semanticHash,
    expectedOracle,
  } = preparedDefinition;
  if (!expectedOracle)
    return failed(row, "release-oracle", "release-oracle-mismatch");
  let firstCpu: FormulaLibraryCpuSmokeSnapshot;
  let secondCpu: FormulaLibraryCpuSmokeSnapshot;
  let actualOracle: ReturnType<typeof runFormulaLibraryOracle>;
  try {
    actualOracle = runFormulaLibraryOracle(
      compiledBackend,
      expectedOracle.runs.map((run) => run.pixel),
      expectedOracle.maxIterations,
    );
    firstCpu = runFormulaLibraryCpuSmoke(compiledBackend);
    secondCpu = runFormulaLibraryCpuSmoke(compiledBackend);
  } catch {
    return failed(row, "cpu-runtime", "cpu-runtime-failed");
  }
  if (!releaseOracleMatches(actualOracle, expectedOracle))
    return failed(row, "release-oracle", "release-oracle-mismatch");
  if (!stableEqual(firstCpu as unknown as JsonValue, secondCpu as unknown as JsonValue))
    return failed(row, "cpu-runtime", "nondeterministic-output");

  const backendArtifactSha256 = sha256Bytes(
    canonical({
      metadata: compiledBackend.metadata,
      glsl: compiledBackend.glsl,
    } as unknown as JsonValue),
  );
  const gpuRuns: GpuRun[] = actualOracle.map((run) => ({
    pixel: run.pixel,
    expectedOrbit: run.orbit.map((point) => {
      if (point[0] === "non-finite" || point[1] === "non-finite")
        throw new Error("gpu-orbit-non-finite");
      return [point[0], point[1]] as const;
    }),
  }));
  return {
    row,
    definition,
    backend: compiledBackend,
    sourceRevision,
    semanticHash,
    backendArtifactSha256,
    cpu: firstCpu,
    oracleRuns: expectedOracle.runs.length,
    gpuCase: {
      formulaId: row.formulaId,
      declarations: compiledBackend.glsl.declarations,
      init: compiledBackend.glsl.init,
      loop: compiledBackend.glsl.loop,
      continuePredicate: compiledBackend.glsl.continuePredicate,
      eventFlag: compiledBackend.glsl.eventFlag,
      maxIterations: expectedOracle.maxIterations,
      runs: gpuRuns,
      parameters: definition.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
        value: parameter.default,
      })),
      functionOptions: compiledBackend.glsl.functionOptions,
    },
  };
}

export type GpuStatus =
  | "passed"
  | "failed"
  | "nondeterministic"
  | "semantic-mismatch";

export function gpuFailureReason(
  status: GpuStatus | undefined,
): FormulaLibraryBulkReasonCode | null {
  if (status === "passed") return null;
  if (status === "nondeterministic") return "nondeterministic-output";
  if (status === "semantic-mismatch") return "webgl-cpu-mismatch";
  return "webgl-compile-link-draw-failed";
}

// SwiftShader wedges its GPU channel after several heavy shader
// compilations inside one browser session, and individual shaders can cost
// tens of seconds plus multi-GB transient JIT memory at first draw
// (observed 2026-08-17/18). Each chunk therefore runs in a short-lived
// subprocess (memory fully reclaimed by the OS) with a hard timeout; a
// failed chunk is retried case-by-case so one pathological shader only
// costs its own row its GPU evidence. Comparison semantics are unchanged.
const WEBGL_CHUNK_TIMEOUT_MS = 300_000;

async function runWebglSubprocess(
  cases: readonly GpuCase[],
): Promise<Map<string, GpuStatus>> {
  const merged = new Map<string, GpuStatus>();
  if (cases.length === 0) return merged;
  const workerPath = fileURLToPath(new URL("./run-webgl-worker.ts", import.meta.url));
  const tsxCli = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  const runChunk = (chunk: readonly GpuCase[]): Promise<boolean> =>
    new Promise((resolvePromise) => {
      const tempPath = join(
        tmpdir(),
        `fractalpark-webgl-chunk-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
      );
      let child: ReturnType<typeof spawn> | null = null;
      const cleanup = () => {
        if (child && child.exitCode === null && !child.killed && child.pid)
          try {
            // detached group kill: also reaps orphaned SwiftShader browsers
            // that would otherwise survive and OOM the next attempt.
            process.kill(-child.pid, "SIGKILL");
          } catch {
            // group already gone
          }
        // Chromium spawns its own session/process groups, so the group kill
        // above can miss the browser. On this dedicated runner every
        // chrome-headless-shell process belongs to these harnesses; sweep by
        // name as the second line of defense.
        try {
          spawnSync("pkill", ["-x", "chrome-headless"], { stdio: "ignore" });
        } catch {
          // pkill unavailable — rely on the group kill
        }
        try {
          unlinkSync(tempPath);
        } catch {
          // temp cleanup is best-effort; /tmp is transient
        }
      };
      try {
        writeFileSync(tempPath, JSON.stringify(chunk), { mode: 0o600 });
      } catch {
        resolvePromise(false);
        return;
      }
      // detached: the worker gets its own process group so a timeout can
      // SIGKILL the whole group (see cleanup).
      child = spawn(process.execPath, [tsxCli, workerPath, tempPath], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      child.stdout?.on("data", (data: Buffer) => {
        output += data.toString("utf8");
      });
      const timer = setTimeout(() => {
        cleanup();
      }, WEBGL_CHUNK_TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        cleanup();
        resolvePromise(false);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code === 0 && output.trim()) {
          try {
            const parsed = JSON.parse(output.trim()) as Record<string, GpuStatus>;
            for (const [key, value] of Object.entries(parsed)) merged.set(key, value);
            cleanup();
            resolvePromise(true);
            return;
          } catch {
            // fall through to failure
          }
        }
        cleanup();
        resolvePromise(false);
      });
    });
  if (await runChunk(cases)) return merged;
  // Chunk failed (timeout / wedge / OOM kill): retry each case alone so a
  // single pathological shader does not take down its chunk-mates.
  for (const single of cases) await runChunk([single]);
  return merged;
}

async function runWebglChunked(
  cases: readonly GpuCase[],
): Promise<ReadonlyMap<string, GpuStatus>> {
  const merged = new Map<string, GpuStatus>();
  const totalChunks = Math.ceil(cases.length / 3);
  for (let offset = 0; offset < cases.length; offset += 3) {
    const chunkResults = await runWebglSubprocess(cases.slice(offset, offset + 3));
    for (const [key, value] of chunkResults) merged.set(key, value);
    console.error(`webgl chunk ${offset / 3 + 1}/${totalChunks} done (${merged.size}/${cases.length} answered)`);
  }
  return merged;
}

export async function runWebgl(cases: readonly GpuCase[]): Promise<ReadonlyMap<string, GpuStatus>> {
  const results = new Map<string, GpuStatus>();
  if (cases.length === 0) return results;
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 8, height: 8 } });
    await page.evaluate(
      "globalThis.__name = globalThis.__name || function(target){ return target; };",
    );
    const evaluated = await page.evaluate((payloads) => {
      const outputs: Array<{ formulaId: string; status: GpuStatus }> = [];
      for (const payload of payloads) {
        try {
          if (!Number.isInteger(payload.maxIterations) || payload.maxIterations < 1)
            throw new Error("gpu-iteration-budget-invalid");
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const gl = canvas.getContext("webgl", {
            antialias: false,
            preserveDrawingBuffer: true,
          });
          if (!gl) throw new Error("webgl-unavailable");
          if (!gl.getExtension("OES_texture_float"))
            throw new Error("oes-texture-float-unavailable");
          if (!gl.getExtension("WEBGL_color_buffer_float"))
            throw new Error("webgl-color-buffer-float-unavailable");
          const debug = gl.getExtension("WEBGL_debug_renderer_info");
          const renderer = String(
            debug
              ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : gl.getParameter(gl.RENDERER),
          );
          if (!renderer.includes("SwiftShader"))
            throw new Error("swiftshader-renderer-required");
          const compile = (type: number, source: string): WebGLShader => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("shader-allocation-failed");
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
              throw new Error(`shader-compile-failed:${gl.getShaderInfoLog(shader)}`);
            return shader;
          };
          const vertex = compile(
            gl.VERTEX_SHADER,
            "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}",
          );
          const fragment = compile(
            gl.FRAGMENT_SHADER,
            `precision highp float;
${payload.declarations}
uniform float u_bulk_steps;
void main(){
  frmV1NonFiniteEvent=false;
  ${payload.init}
  bool active=true;
  float iterations=0.0;
  for(int i=0;i<${payload.maxIterations};i++){
    if(active&&float(i)<u_bulk_steps){
      ${payload.loop}
      iterations+=1.0;
      if(${payload.eventFlag}) active=false;
      else active=${payload.continuePredicate};
    }
  }
  gl_FragColor=vec4(z,iterations,${payload.eventFlag}?1.0:0.0);
}`,
          );
          const program = gl.createProgram();
          if (!program) throw new Error("program-allocation-failed");
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error("program-link-failed");
          gl.useProgram(program);
          const position = gl.getAttribLocation(program, "a");
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW,
          );
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

          const texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.FLOAT,
            null,
          );
          const framebuffer = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
          );
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error("float-framebuffer-incomplete");

          const vec2 = (name: string, x: number, y: number): void => {
            const location = gl.getUniformLocation(program, name);
            if (location !== null) gl.uniform2f(location, x, y);
          };
          const ismand = gl.getUniformLocation(program, "ismand");
          if (ismand !== null) gl.uniform1i(ismand, 1);
          for (const parameter of payload.parameters) {
            if (parameter.type === "function") {
              const selected = payload.functionOptions.indexOf(String(parameter.value));
              if (selected < 0) throw new Error("function-default-invalid");
              const location = gl.getUniformLocation(program, `u_frm_${parameter.name}`);
              if (location !== null) gl.uniform1i(location, selected);
            } else if (parameter.type === "real") {
              vec2(parameter.name, Number(parameter.value), 0);
            } else {
              const value = parameter.value as readonly [number, number];
              vec2(parameter.name, value[0], value[1]);
            }
          }
          const draw = (): Float32Array => {
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            const pixel = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
            if (gl.getError() !== gl.NO_ERROR) throw new Error("draw-failed");
            return pixel;
          };
          const sameNumber = (left: number, right: number): boolean =>
            Object.is(left, right) || (Number.isNaN(left) && Number.isNaN(right));
          const close = (actual: number, expected: number): boolean => {
            const tolerance = 3e-4 * Math.max(1, Math.abs(actual), Math.abs(expected));
            return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
          };
          const stepsLocation = gl.getUniformLocation(program, "u_bulk_steps");
          if (stepsLocation === null) throw new Error("gpu-step-uniform-missing");
          let status: GpuStatus = "passed";
          for (const run of payload.runs) {
            vec2("pixel", run.pixel[0], run.pixel[1]);
            vec2("c", run.pixel[0], run.pixel[1]);
            vec2("maxit", payload.maxIterations, 0);
            for (const [pointIndex, expectedZ] of run.expectedOrbit.entries()) {
              const expectedIterations = pointIndex + 1;
              gl.uniform1f(stepsLocation, expectedIterations);
              const first = draw();
              const second = draw();
              if (
                ![0, 1, 2, 3].every((index) =>
                  sameNumber(first[index], second[index]),
                )
              ) {
                status = "nondeterministic";
                break;
              }
              const parity =
                first[3] < 0.5 &&
                Math.abs(first[2] - expectedIterations) <= 0.25 &&
                close(first[0], expectedZ[0]) &&
                close(first[1], expectedZ[1]);
              if (!parity) {
                status = "semantic-mismatch";
                break;
              }
            }
            if (status !== "passed") break;
          }
          outputs.push({ formulaId: payload.formulaId, status });
        } catch {
          outputs.push({ formulaId: payload.formulaId, status: "failed" });
        }
      }
      return outputs;
    }, cases);
    for (const result of evaluated) results.set(result.formulaId, result.status);
  } finally {
    await browser.close();
  }
  return results;
}

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort());
}

async function run(context: PreflightContext): Promise<CensusRow[]> {
  const prepared: Array<FailedRow | PendingPass> = [];
  for (const row of context.workPackage.rows) {
    try {
      prepared.push(await prepareRow(row, context));
    } catch {
      prepared.push(failed(row, "controller", "controller-internal-error"));
    }
  }
  let gpu: ReadonlyMap<string, GpuStatus>;
  try {
    gpu = await runWebglChunked(
      prepared.filter((item): item is PendingPass => "gpuCase" in item).map((item) => item.gpuCase),
    );
  } catch {
    gpu = new Map();
  }
  return prepared.map((item) => {
    if (!("gpuCase" in item)) return item;
    const gpuStatus = gpu.get(item.row.formulaId);
    const gpuReason = gpuFailureReason(gpuStatus);
    if (gpuReason !== null)
      return failed(item.row, "webgl-compile-link-draw", gpuReason);
    return {
      formulaId: item.row.formulaId,
      sourceSet: item.row.sourceSet,
      status: "passed",
      publicationEligible: false,
      sourceRevision: item.sourceRevision,
      semanticHash: item.semanticHash,
      backendArtifactSha256: item.backendArtifactSha256,
      cpu: item.cpu,
      releaseOracle: {
        status: "passed",
        runs: item.oracleRuns,
      },
      webgl: {
        compileLinkDraw: "passed",
        deterministicDraw: "passed",
        cpuParity: "passed",
        oracleRuns: item.oracleRuns,
        orbitPoints: item.gpuCase.runs.reduce(
          (total, run) => total + run.expectedOrbit.length,
          0,
        ),
      },
    };
  });
}

function lstatIfPresent(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function securePrivateOutputDirectory(path: string): void {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fchmodSync(descriptor, 0o700);
  } finally {
    closeSync(descriptor);
  }
  const metadata = lstatSync(path);
  invariant(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "private-output-symlink-rejected",
  );
  invariant((metadata.mode & 0o777) === 0o700, "private-output-permissions-invalid");
}

function ensurePrivateLedgerDirectory(repositoryRoot: string): string {
  const rootMetadata = lstatSync(repositoryRoot);
  invariant(
    rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink(),
    "private-output-root-invalid",
  );
  const realRepositoryRoot = realpathSync(repositoryRoot);
  let current = repositoryRoot;
  let expectedReal = realRepositoryRoot;
  for (const component of PRIVATE_OUTPUT_COMPONENTS) {
    current = join(current, component);
    expectedReal = join(expectedReal, component);
    const metadata = lstatIfPresent(current);
    if (metadata === null) mkdirSync(current, { mode: 0o700 });
    else
      invariant(
        metadata.isDirectory() && !metadata.isSymbolicLink(),
        "private-output-symlink-rejected",
      );
    securePrivateOutputDirectory(current);
    invariant(
      realpathSync(current) === expectedReal,
      "private-output-containment-failed",
    );
  }
  return current;
}

function openVerifiedPrivateDirectory(path: string, expectedReal: string): number {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fchmodSync(descriptor, 0o700);
    const metadata = fstatSync(descriptor);
    invariant(
      metadata.isDirectory() &&
        (metadata.mode & 0o777) === 0o700 &&
        realpathSync(`/proc/self/fd/${descriptor}`) === expectedReal,
      "private-output-containment-failed",
    );
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assertPrivateDirectoryDescriptorStillBound(
  descriptor: number,
  path: string,
  expectedReal: string,
): void {
  const opened = fstatSync(descriptor);
  const current = lstatSync(path);
  invariant(
    current.isDirectory() &&
      !current.isSymbolicLink() &&
      current.dev === opened.dev &&
      current.ino === opened.ino &&
      realpathSync(path) === expectedReal,
    "private-output-containment-failed",
  );
}

function writePrivateFileThroughDirectoryDescriptor(
  directoryDescriptor: number,
  filename: string,
  content: string | Buffer,
): void {
  const descriptorPath = join(`/proc/self/fd/${directoryDescriptor}`, filename);
  const existing = lstatIfPresent(descriptorPath);
  if (existing !== null)
    invariant(
      existing.isFile() && !existing.isSymbolicLink(),
      "private-output-symlink-rejected",
    );
  const descriptor = openSync(
    descriptorPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() && opened.nlink === 1,
      "private-output-containment-failed",
    );
    ftruncateSync(descriptor, 0);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, content);
    const metadata = fstatSync(descriptor);
    invariant(
      metadata.isFile() &&
        metadata.nlink === 1 &&
        (metadata.mode & 0o777) === 0o600,
      "private-output-permissions-invalid",
    );
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateLedgerUnchecked(repositoryRoot: string, content: string): string {
  const outputDirectory = ensurePrivateLedgerDirectory(repositoryRoot);
  const expectedReal = join(realpathSync(repositoryRoot), ...PRIVATE_OUTPUT_COMPONENTS);
  const directoryDescriptor = openVerifiedPrivateDirectory(
    outputDirectory,
    expectedReal,
  );
  try {
    assertPrivateDirectoryDescriptorStillBound(
      directoryDescriptor,
      outputDirectory,
      expectedReal,
    );
    writePrivateFileThroughDirectoryDescriptor(
      directoryDescriptor,
      PRIVATE_OUTPUT_FILENAME,
      content,
    );
    assertPrivateDirectoryDescriptorStillBound(
      directoryDescriptor,
      outputDirectory,
      expectedReal,
    );
  } finally {
    closeSync(directoryDescriptor);
  }
  return join(outputDirectory, PRIVATE_OUTPUT_FILENAME);
}

export function writePrivateLedger(repositoryRoot: string, content: string): string {
  try {
    return writePrivateLedgerUnchecked(repositoryRoot, content);
  } catch (error) {
    const code = sanitizeControllerError(error);
    if (code.startsWith("private-output-")) throw new Error(code);
    throw new Error("private-output-write-failed");
  }
}

function ensurePrivatePresentableDirectory(repositoryRoot: string): string {
  const base = ensurePrivateLedgerDirectory(repositoryRoot);
  const output = join(base, PRIVATE_PRESENTABLE_COMPONENTS.at(-1)!);
  const metadata = lstatIfPresent(output);
  if (metadata === null) mkdirSync(output, { mode: 0o700 });
  else
    invariant(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      "private-output-symlink-rejected",
    );
  securePrivateOutputDirectory(output);
  invariant(
    realpathSync(output) ===
      join(realpathSync(repositoryRoot), ...PRIVATE_PRESENTABLE_COMPONENTS),
    "private-output-containment-failed",
  );
  return output;
}

function validPresentableFilename(filename: string): boolean {
  return (
    filename === PRIVATE_PRESENTABLE_MANIFEST ||
    filename === PRIVATE_PRESENTABLE_CONTACT_SHEET ||
    /^preview-(?:00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})\.png$/.test(filename)
  );
}

export function writePrivatePresentableFile(
  repositoryRoot: string,
  filename: string,
  content: string | Buffer,
): string {
  try {
    invariant(validPresentableFilename(filename), "private-output-containment-failed");
    const outputDirectory = ensurePrivatePresentableDirectory(repositoryRoot);
    const expectedReal = join(
      realpathSync(repositoryRoot),
      ...PRIVATE_PRESENTABLE_COMPONENTS,
    );
    const directoryDescriptor = openVerifiedPrivateDirectory(
      outputDirectory,
      expectedReal,
    );
    try {
      assertPrivateDirectoryDescriptorStillBound(
        directoryDescriptor,
        outputDirectory,
        expectedReal,
      );
      writePrivateFileThroughDirectoryDescriptor(
        directoryDescriptor,
        filename,
        content,
      );
      assertPrivateDirectoryDescriptorStillBound(
        directoryDescriptor,
        outputDirectory,
        expectedReal,
      );
    } finally {
      closeSync(directoryDescriptor);
    }
    return join(outputDirectory, filename);
  } catch (error) {
    const code = sanitizeControllerError(error);
    if (code.startsWith("private-output-")) throw new Error(code);
    throw new Error("private-output-write-failed");
  }
}

function expectedPresentableFilenames(): readonly string[] {
  return [
    PRIVATE_PRESENTABLE_MANIFEST,
    PRIVATE_PRESENTABLE_CONTACT_SHEET,
    ...Array.from(
      { length: EXPECTED_RUNNABLE_ROWS },
      (_, index) => `preview-${String(index + 1).padStart(3, "0")}.png`,
    ),
  ].sort();
}

function assertPrivatePresentableOutputSet(
  repositoryRoot: string,
  requireComplete: boolean,
): void {
  const directory = ensurePrivatePresentableDirectory(repositoryRoot);
  const expected = new Set(expectedPresentableFilenames());
  const actual = readdirSync(directory).sort();
  invariant(
    actual.every((filename) => expected.has(filename)) &&
      (!requireComplete ||
        actual.join("\u0000") === expectedPresentableFilenames().join("\u0000")),
    "private-output-containment-failed",
  );
  for (const filename of actual) {
    const metadata = lstatSync(join(directory, filename));
    invariant(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        (metadata.mode & 0o777) === 0o600,
      "private-output-permissions-invalid",
    );
  }
}

export function encodeDeterministicPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  invariant(
    Number.isInteger(width) &&
      Number.isInteger(height) &&
      width > 0 &&
      height > 0 &&
      rgba.length === width * height * 4,
    "provisional-assets-render-failed",
  );
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1);
  }
  const crc32 = (value: Buffer): number => {
    let crc = 0xffffffff;
    for (const octet of value) {
      crc ^= octet;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBytes = Buffer.from(type, "ascii");
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0);
    typeBytes.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return output;
  };
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export interface RunnableLedgerSelectionContract {
  readonly total: number;
  readonly passed: number;
  readonly contentHash: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nestedViewCandidate(value: unknown): unknown {
  if (!record(value)) return undefined;
  if (
    Object.hasOwn(value, "centerX") &&
    Object.hasOwn(value, "centerY") &&
    Object.hasOwn(value, "zoom")
  )
    return value;
  if (record(value.scene) && Object.hasOwn(value.scene, "bounds"))
    return value.scene.bounds;
  if (Object.hasOwn(value, "view")) return value.view;
  return undefined;
}

export function provisionalBoundsCandidatesForRow(
  row: Pick<
    WorkRow,
    | "sourceSet"
    | "primaryFamily"
    | "defaultProfileCandidate"
    | "previewInput"
  >,
): ProvisionalBoundsCandidatesV1 {
  const profileCandidate = row.defaultProfileCandidate?.candidate;
  const upstreamCandidate =
    row.sourceSet === "B94"
      ? row.defaultProfileCandidate?.explicitLegacyDefaultProfile === true
        ? nestedViewCandidate(profileCandidate)
        : undefined
      : nestedViewCandidate(profileCandidate);
  const b94CatalogCandidate =
    row.sourceSet === "B94" && record(row.previewInput?.candidate)
      ? row.previewInput.candidate.view
      : undefined;
  const familyFallback =
    typeof row.primaryFamily === "string"
      ? PROVISIONAL_FAMILY_SAFE_FALLBACKS_V1[row.primaryFamily]
      : undefined;
  return { upstreamCandidate, b94CatalogCandidate, familyFallback };
}

export function computeRunnableLedgerContentHash(value: unknown): string {
  invariant(record(value), "provisional-assets-ledger-mismatch");
  const withoutHash = { ...value };
  delete withoutHash.ledgerContentHash;
  return sha256Bytes(canonical(withoutHash as unknown as JsonValue));
}

export function validateRunnableLedgerSelection(
  value: unknown,
  expectedRows: readonly Pick<WorkRow, "formulaId" | "sourceSet">[],
  expectedInputHashes: unknown,
  contract: RunnableLedgerSelectionContract,
): PassedRow[] {
  invariant(record(value), "provisional-assets-ledger-mismatch");
  invariant(
    Object.keys(value).sort().join("\u0000") ===
      [
        "controllerVersion",
        "deterministic",
        "inputHashes",
        "ledgerContentHash",
        "ledgerHashAlgorithm",
        "rows",
        "schema",
        "summary",
      ]
        .sort()
        .join("\u0000") &&
      value.schema === "fractalpark-formula-library-bulk-migration-ledger/v2" &&
      value.controllerVersion === CONTROLLER_VERSION &&
      value.ledgerHashAlgorithm === "sha256-ecmascript-sorted-json/1" &&
      value.deterministic === true &&
      value.ledgerContentHash === contract.contentHash &&
      computeRunnableLedgerContentHash(value) === contract.contentHash &&
      stableEqual(
        value.inputHashes as JsonValue,
        expectedInputHashes as JsonValue,
      ) &&
      Array.isArray(value.rows) &&
      value.rows.length === contract.total &&
      expectedRows.length === contract.total &&
      record(value.summary) &&
      value.summary.total === contract.total &&
      value.summary.passed === contract.passed &&
      value.summary.failed === contract.total - contract.passed,
    "provisional-assets-ledger-mismatch",
  );
  const selected: PassedRow[] = [];
  for (const [index, raw] of value.rows.entries()) {
    invariant(record(raw), "provisional-assets-ledger-mismatch");
    const expected = expectedRows[index];
    invariant(
      raw.formulaId === expected.formulaId &&
        raw.sourceSet === expected.sourceSet &&
        raw.publicationEligible === false &&
        (raw.status === "passed" || raw.status === "failed"),
      "provisional-assets-ledger-mismatch",
    );
    if (raw.status === "passed") {
      invariant(
        raw.sourceSet === "F588" &&
          typeof raw.sourceRevision === "string" &&
          /^[0-9a-f]{64}$/.test(raw.sourceRevision) &&
          typeof raw.semanticHash === "string" &&
          /^[0-9a-f]{64}$/.test(raw.semanticHash) &&
          typeof raw.backendArtifactSha256 === "string" &&
          /^[0-9a-f]{64}$/.test(raw.backendArtifactSha256) &&
          record(raw.releaseOracle) &&
          raw.releaseOracle.status === "passed" &&
          record(raw.webgl) &&
          raw.webgl.compileLinkDraw === "passed" &&
          raw.webgl.deterministicDraw === "passed" &&
          raw.webgl.cpuParity === "passed",
        "provisional-assets-ledger-mismatch",
      );
      selected.push(raw as unknown as PassedRow);
    }
  }
  invariant(selected.length === contract.passed, "provisional-assets-ledger-mismatch");
  return selected;
}

function readFrozenRunnableLedgerValue(repositoryRoot: string): unknown {
  const privateRoot = join(repositoryRoot, PRIVATE_OUTPUT_COMPONENTS[0]);
  const privateLeaf = join(privateRoot, PRIVATE_OUTPUT_COMPONENTS[1]);
  const ledgerPath = join(privateLeaf, PRIVATE_OUTPUT_FILENAME);
  assertPrivateMode(privateRoot, "directory");
  assertPrivateMode(privateLeaf, "directory");
  assertPrivateMode(ledgerPath, "file");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch {
    throw new Error("provisional-assets-input-invalid");
  }
  invariant(
    record(value) &&
      value.schema === "fractalpark-formula-library-bulk-migration-ledger/v2" &&
      value.controllerVersion === CONTROLLER_VERSION &&
      value.ledgerContentHash === EXPECTED_RUNNABLE_LEDGER_SHA256 &&
      computeRunnableLedgerContentHash(value) === EXPECTED_RUNNABLE_LEDGER_SHA256 &&
      Array.isArray(value.rows) &&
      value.rows.length === EXPECTED_ROWS &&
      value.rows.filter(
        (row) =>
          record(row) &&
          row.status === "passed" &&
          row.sourceSet === "F588" &&
          row.publicationEligible === false,
      ).length === EXPECTED_RUNNABLE_ROWS &&
      value.rows.every(
        (row) =>
          record(row) &&
          row.publicationEligible === false &&
          (row.status === "passed" || row.status === "failed"),
      ),
    "provisional-assets-ledger-mismatch",
  );
  return value;
}

function readRunnableLedger(
  repositoryRoot: string,
  context: PreflightContext,
): PassedRow[] {
  const value = readFrozenRunnableLedgerValue(repositoryRoot);
  return validateRunnableLedgerSelection(
    value,
    context.workPackage.rows,
    context.inputHashes,
    {
      total: EXPECTED_ROWS,
      passed: EXPECTED_RUNNABLE_ROWS,
      contentHash: EXPECTED_RUNNABLE_LEDGER_SHA256,
    },
  );
}

export function computeProvisionalManifestContentHash(value: unknown): string {
  invariant(record(value), "provisional-assets-input-invalid");
  const withoutHash = { ...value };
  delete withoutHash.manifestContentHash;
  return sha256Bytes(canonical(withoutHash as unknown as JsonValue));
}

async function writeProvisionalAssets(
  repositoryRoot: string,
  context: PreflightContext,
  initialRepositoryBinding: RepositoryIndexBinding,
): Promise<Readonly<Record<string, JsonValue>>> {
  const selectedRows = readRunnableLedger(repositoryRoot, context);
  const selectedById = new Map(selectedRows.map((row) => [row.formulaId, row]));
  const prepared: PendingPass[] = [];
  for (const row of context.workPackage.rows) {
    const ledgerRow = selectedById.get(row.formulaId);
    if (!ledgerRow) continue;
    let candidate: FailedRow | PendingPass;
    try {
      candidate = await prepareRow(row, context);
    } catch {
      throw new Error("provisional-assets-revalidation-failed");
    }
    invariant("gpuCase" in candidate, "provisional-assets-revalidation-failed");
    invariant(
      candidate.sourceRevision === ledgerRow.sourceRevision &&
        candidate.semanticHash === ledgerRow.semanticHash &&
        candidate.backendArtifactSha256 === ledgerRow.backendArtifactSha256,
      "provisional-assets-revalidation-failed",
    );
    prepared.push(candidate);
  }
  invariant(
    prepared.length === EXPECTED_RUNNABLE_ROWS &&
      prepared.every((candidate, index) => candidate.row.formulaId === selectedRows[index].formulaId),
    "provisional-assets-revalidation-failed",
  );
  const gpu = await runWebglChunked(prepared.map((candidate) => candidate.gpuCase));
  invariant(
    prepared.every((candidate) => gpu.get(candidate.row.formulaId) === "passed"),
    "provisional-assets-revalidation-failed",
  );

  const previews: ReturnType<typeof renderProvisionalPreviewV1>[] = [];
  const rows: Array<Record<string, JsonValue>> = [];
  for (const [index, candidate] of prepared.entries()) {
    const projected = await projectProvisionalProfileV1(
      candidate.definition,
      provisionalBoundsCandidatesForRow(candidate.row),
    );
    const first = renderProvisionalPreviewV1(
      candidate.backend,
      projected.profile,
      PROVISIONAL_PROFILE_POLICY_V1.preview.width,
      PROVISIONAL_PROFILE_POLICY_V1.preview.height,
    );
    const second = renderProvisionalPreviewV1(
      candidate.backend,
      projected.profile,
      PROVISIONAL_PROFILE_POLICY_V1.preview.width,
      PROVISIONAL_PROFILE_POLICY_V1.preview.height,
    );
    invariant(
      Buffer.from(first.rgba).equals(Buffer.from(second.rgba)) &&
        stableEqual(
          {
            escapedPixels: first.escapedPixels,
            interiorPixels: first.interiorPixels,
            nonFinitePixels: first.nonFinitePixels,
            uniqueColors: first.uniqueColors,
            anomalies: first.anomalies,
          } as unknown as JsonValue,
          {
            escapedPixels: second.escapedPixels,
            interiorPixels: second.interiorPixels,
            nonFinitePixels: second.nonFinitePixels,
            uniqueColors: second.uniqueColors,
            anomalies: second.anomalies,
          } as unknown as JsonValue,
        ),
      "provisional-assets-render-failed",
    );
    const png = encodeDeterministicPng(first.width, first.height, first.rgba);
    const filename = `preview-${String(index + 1).padStart(3, "0")}.png`;
    previews.push(first);
    rows.push({
      slot: index + 1,
      formulaId: candidate.row.formulaId,
      status: "presentable-candidate",
      provisionalDefaultProfile: true,
      verifiedDefaultProfile: false,
      publicationEligible: false,
      sourceRevision: candidate.sourceRevision,
      semanticHash: candidate.semanticHash,
      backendArtifactSha256: candidate.backendArtifactSha256,
      boundsSource: projected.boundsSource,
      profile: projected.profile as unknown as JsonValue,
      preview: {
        file: filename,
        width: first.width,
        height: first.height,
        rawRgbaSha256: sha256Bytes(Buffer.from(first.rgba)),
        pngSha256: sha256Bytes(png),
        escapedPixels: first.escapedPixels,
        interiorPixels: first.interiorPixels,
        nonFinitePixels: first.nonFinitePixels,
        uniqueColors: first.uniqueColors,
        anomalies: first.anomalies,
      },
    });
  }
  const contact = composeProvisionalContactSheetV1(previews, 5);
  const contactPng = encodeDeterministicPng(contact.width, contact.height, contact.rgba);
  const anomalyList = rows.flatMap((row) => {
    const preview = row.preview as Record<string, JsonValue>;
    const anomalies = preview.anomalies as readonly JsonValue[];
    return anomalies.length > 0 ? [{ slot: row.slot, anomalies }] : [];
  });
  const finalRepositoryBinding = captureRepositoryIndexBinding(repositoryRoot);
  invariant(
    stableEqual(
      initialRepositoryBinding as unknown as JsonValue,
      finalRepositoryBinding as unknown as JsonValue,
    ),
    "repository-binding-unavailable",
  );
  const toolSourceHashes = {
    "scripts/formula-library-bulk-migration.ts": sha256File(
      join(repositoryRoot, "scripts", "formula-library-bulk-migration.ts"),
    ),
    "src/engine/formulas/v1/provisional-preview.ts": sha256File(
      join(repositoryRoot, "src", "engine", "formulas", "v1", "provisional-preview.ts"),
    ),
    "src/engine/formulas/v1/provisional-profile.ts": sha256File(
      join(repositoryRoot, "src", "engine", "formulas", "v1", "provisional-profile.ts"),
    ),
  };
  const generatorRevision = sha256Bytes(
    canonical({
      repositoryIndexTree: initialRepositoryBinding.repositoryIndexTree,
      toolSourceHashes,
    } as unknown as JsonValue),
  );
  const manifestWithoutHash = {
    schema: "fractalpark-formula-library-provisional-assets/v1",
    controllerVersion: PROVISIONAL_CONTROLLER_VERSION,
    policyVersion: PROVISIONAL_PROFILE_POLICY_V1.version,
    generationBinding: {
      ...initialRepositoryBinding,
      workingTreeMatchesIndex: true,
      generatorRevision,
      toolSourceHashes,
    },
    deterministic: true,
    runnableLedgerContentHash: EXPECTED_RUNNABLE_LEDGER_SHA256,
    publicationEligible: false,
    verifiedDefaultProfiles: 0,
    summary: {
      accounted: EXPECTED_ROWS,
      runnableSelection: EXPECTED_RUNNABLE_ROWS,
      failedHeldFailClosed: EXPECTED_ROWS - EXPECTED_RUNNABLE_ROWS,
      presentableCandidates: EXPECTED_RUNNABLE_ROWS,
      anomalyRows: anomalyList.length,
    },
    anomalyList,
    contactSheet: {
      file: PRIVATE_PRESENTABLE_CONTACT_SHEET,
      width: contact.width,
      height: contact.height,
      tileColumns: 5,
      tileRows: Math.ceil(rows.length / 5),
      rawRgbaSha256: sha256Bytes(Buffer.from(contact.rgba)),
      pngSha256: sha256Bytes(contactPng),
    },
    rows,
  };
  const manifestContentHash = computeProvisionalManifestContentHash(
    manifestWithoutHash,
  );
  const previewPngs = rows.map((row, index) => ({
    filename: (row.preview as Record<string, JsonValue>).file as string,
    png: encodeDeterministicPng(
      previews[index].width,
      previews[index].height,
      previews[index].rgba,
    ),
  }));
  assertPrivatePresentableOutputSet(repositoryRoot, false);
  for (const preview of previewPngs)
    writePrivatePresentableFile(repositoryRoot, preview.filename, preview.png);
  writePrivatePresentableFile(
    repositoryRoot,
    PRIVATE_PRESENTABLE_CONTACT_SHEET,
    contactPng,
  );
  const manifest = { ...manifestWithoutHash, manifestContentHash };
  const output = writePrivatePresentableFile(
    repositoryRoot,
    PRIVATE_PRESENTABLE_MANIFEST,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  assertPrivatePresentableOutputSet(repositoryRoot, true);
  return {
    output: relative(repositoryRoot, output).replaceAll("\\", "/"),
    manifestContentHash,
    summary: manifest.summary,
    contactSheet: manifest.contactSheet,
  } as unknown as Readonly<Record<string, JsonValue>>;
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const provisionalAssets = process.argv.includes("--provisional-assets");
  const provisionalRepositoryBinding = provisionalAssets
    ? captureRepositoryIndexBinding(repositoryRoot)
    : null;
  if (provisionalAssets) readFrozenRunnableLedgerValue(repositoryRoot);
  const context = preflight(repositoryRoot);
  const preflightOnly = process.argv.includes("--preflight");
  if (preflightOnly) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        controllerVersion: CONTROLLER_VERSION,
        rows: context.workPackage.rows.length,
        sourceSets: countBy(context.workPackage.rows.map((row) => row.sourceSet)),
        corpusFiles: context.corpusFiles.length,
        inputHashes: context.inputHashes,
      })}\n`,
    );
    return;
  }
  invariant(process.argv.includes("--write"), "write-flag-required");
  if (provisionalAssets) {
    invariant(provisionalRepositoryBinding, "repository-binding-unavailable");
    const result = await writeProvisionalAssets(
      repositoryRoot,
      context,
      provisionalRepositoryBinding,
    );
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        controllerVersion: PROVISIONAL_CONTROLLER_VERSION,
        ...result,
      })}\n`,
    );
    return;
  }
  const rows = await run(context);
  invariant(rows.length === EXPECTED_ROWS, "census-row-count-mismatch");
  const failedRows = rows.filter((row): row is FailedRow => row.status === "failed");
  const ledgerWithoutHash = {
    schema: "fractalpark-formula-library-bulk-migration-ledger/v2",
    controllerVersion: CONTROLLER_VERSION,
    ledgerHashAlgorithm: "sha256-ecmascript-sorted-json/1",
    deterministic: true,
    inputHashes: context.inputHashes,
    summary: {
      total: rows.length,
      passed: rows.length - failedRows.length,
      failed: failedRows.length,
      bySourceSet: countBy(rows.map((row) => row.sourceSet)),
      failureStages: countBy(failedRows.map((row) => row.failureStage)),
      reasonCodes: countBy(failedRows.map((row) => row.reasonCode)),
    },
    rows,
  };
  const ledgerContentHash = sha256Bytes(
    canonical(ledgerWithoutHash as unknown as JsonValue),
  );
  const ledger = { ...ledgerWithoutHash, ledgerContentHash };
  const output = writePrivateLedger(
    repositoryRoot,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      output: relative(repositoryRoot, output).replaceAll("\\", "/"),
      ledgerContentHash,
      summary: ledger.summary,
    })}\n`,
  );
}

const executableUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (executableUrl === import.meta.url) {
  main().catch((error: unknown) => {
    const code = sanitizeControllerError(error);
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  });
}
