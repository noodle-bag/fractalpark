import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { registerBuiltins } from "../src/engine/plugins/builtins";
import { NATIVE_RECIPE_HOLDS_V1 } from "../src/engine/formulas/v1/native-recipes-b94-held";
import {
  NATIVE_FORMULA_RECIPES_V1,
  validateNativeRecipeV1,
} from "../src/engine/formulas/v1/native-recipes";
import {
  preflight,
  prepareDefinitionRow,
  type PreflightContext,
  type WorkRow,
} from "./formula-library-bulk-migration";
import { writePublicAsset } from "./generate-formula-publication-decisions";

/**
 * Reconstructs the 174 revision-2 published Definitions and publishes them as
 * additive runtime revision 4 assets. Decision revision 3 is intentionally
 * unchanged: runtime/rev3 continues to own the 339 clean-room Definitions,
 * while runtime/rev4 closes the missing A106 + P68 public source projection.
 *
 * The write path is two-phase and fail-closed:
 *   controlled inputs -> validated 0600 private staging -> staging reread ->
 *   public release manifest hash -> immutable runtime shards.
 *
 * Usage:
 *   npx tsx scripts/build-formula-runtime-rev4.ts [--write]
 *
 * Without --write, both private staging and public assets must already exist
 * byte-for-byte; the command reports drift instead of changing files.
 */

const RUNTIME_REVISION = 4;
const DECISION_REVISION = 4;
const SHARD_SIZE = 64;
const EXPECTED_DIRECT_COUNT = 106;
const EXPECTED_PROJECT_OWNED_COUNT = 89;
const EXPECTED_ROW_COUNT = 195;
const EXPECTED_CENSUS_LEDGER_HASH =
  "fa7f6b35cd7e9d5afa77754755d3439ea949c7be2964024a4163a3874e9a5a37";
const EXPECTED_DECISIONS_CONTENT_HASH =
  "cac35a05d2d0c219b4f5ac00f3dea5b5fbb2b9c6b2fc15ea3383ef0f62d6031d";
const RELEASE_SCHEMA =
  "fractalpark-formula-library-runtime-release-manifest/v1";
const SHARD_SCHEMA = "fractalpark-formula-library-runtime-shard/v1";
const RUNTIME_MANIFEST_SCHEMA =
  "fractalpark-formula-library-runtime-manifest/v1";
const STAGING_RELATIVE_DIR = join(
  ".formula-library-private",
  "formula-library-v1",
  "runtime-rev4-staging",
);
const RELEASE_FILENAME = "release-manifest-rev4.json";
const RUNTIME_RELATIVE_DIR = join(
  "resources",
  "formula-library",
  "v1",
  "runtime",
  "rev4",
);

type JsonRecord = Record<string, unknown>;
type ImplementationBasis = "direct-adaptation" | "project-owned";

interface IdentityRow {
  readonly formulaId: string;
  readonly displayName: string;
  readonly primaryFamily: string;
}

interface DecisionRow {
  readonly formulaId: string;
  readonly publicationDecision: string;
  readonly implementationBasis: string | null;
}

interface CensusRow {
  readonly formulaId: string;
  readonly status: string;
  readonly sourceRevision?: string;
  readonly semanticHash?: string;
}

export interface RuntimeRev4SourceRow {
  readonly formulaId: string;
  readonly displayName: string;
  readonly family: string;
  readonly implementationBasis: ImplementationBasis;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly definition: string;
}

interface ReleaseRow {
  readonly formulaId: string;
  readonly displayName: string;
  readonly family: string;
  readonly implementationBasis: ImplementationBasis;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly definitionSha256: string;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    invariant(
      typeof value !== "number" || Number.isFinite(value),
      "runtime-rev4-manifest-invalid",
    );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value), "runtime-rev4-manifest-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function readJson(path: string): JsonRecord {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    invariant(isRecord(value), "runtime-rev4-input-invalid");
    return value;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "runtime-rev4-input-invalid"
    ) {
      throw error;
    }
    throw new Error("runtime-rev4-input-invalid");
  }
}

function ensurePrivateStaging(
  repositoryRoot: string,
  create: boolean,
): string {
  const privateRoot = join(repositoryRoot, ".formula-library-private");
  const libraryRoot = join(privateRoot, "formula-library-v1");
  for (const path of [privateRoot, libraryRoot]) {
    const metadata = lstatSync(path);
    invariant(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        realpathSync(path) === resolve(path),
      "runtime-rev4-staging-invalid",
    );
  }
  const staging = join(repositoryRoot, STAGING_RELATIVE_DIR);
  const existing = lstatSync(staging, { throwIfNoEntry: false });
  if (existing == null) {
    invariant(create, "runtime-rev4-staging-invalid");
    mkdirSync(staging, { mode: 0o700 });
  }
  const metadata = lstatSync(staging);
  invariant(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o777) === 0o700 &&
      realpathSync(staging) === resolve(staging),
    "runtime-rev4-staging-invalid",
  );
  return staging;
}

function writePrivateFile(path: string, content: string): void {
  const directory = dirname(path);
  const directoryDescriptor = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const temporary = join(
    `/proc/self/fd/${directoryDescriptor}`,
    `.${basename(path)}.${randomBytes(12).toString("hex")}.tmp`,
  );
  const target = join(`/proc/self/fd/${directoryDescriptor}`, basename(path));
  let temporaryExists = false;
  try {
    const descriptor = openSync(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    temporaryExists = true;
    try {
      fchmodSync(descriptor, 0o600);
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, target);
    temporaryExists = false;
    fsyncSync(directoryDescriptor);
  } finally {
    if (temporaryExists) {
      try {
        unlinkSync(temporary);
      } catch {
        // The primary error remains authoritative.
      }
    }
    closeSync(directoryDescriptor);
  }
  const installed = lstatSync(path);
  invariant(
    installed.isFile() &&
      !installed.isSymbolicLink() &&
      installed.nlink === 1 &&
      (installed.mode & 0o777) === 0o600 &&
      readFileSync(path, "utf8") === content,
    "runtime-rev4-staging-write-failed",
  );
}

function sortedUnique(values: readonly string[], code: string): string[] {
  const sorted = [...values].sort();
  invariant(new Set(sorted).size === sorted.length, code);
  return sorted;
}

function loadPublicInputs(repositoryRoot: string): {
  identities: Map<string, IdentityRow>;
  decisions: DecisionRow[];
  decisionsContentHash: string;
  decisionsSha256: string;
  identitiesSha256: string;
} {
  const identitiesPath = join(
    repositoryRoot,
    "resources/formula-library/v1/standard-formula-ids.json",
  );
  const decisionsPath = join(
    repositoryRoot,
    "resources/formula-library/v1/publication-decisions.json",
  );
  const identitiesBytes = readFileSync(identitiesPath);
  const decisionsBytes = readFileSync(decisionsPath);
  const identitiesAsset = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  const decisionsAsset = JSON.parse(decisionsBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(identitiesAsset) &&
      identitiesAsset.formulaCount === 677 &&
      Array.isArray(identitiesAsset.formulas) &&
      identitiesAsset.formulas.length === 677,
    "runtime-rev4-identity-invalid",
  );
  invariant(
    isRecord(decisionsAsset) &&
      decisionsAsset.decisionRevision === DECISION_REVISION &&
      decisionsAsset.formulaCount === 677 &&
      decisionsAsset.contentHash === EXPECTED_DECISIONS_CONTENT_HASH &&
      Array.isArray(decisionsAsset.rows) &&
      decisionsAsset.rows.length === 677 &&
      isRecord(decisionsAsset.decisionCounts) &&
      decisionsAsset.decisionCounts.publish === 534 &&
      decisionsAsset.decisionCounts.hold === 143 &&
      decisionsAsset.decisionCounts.exclude === 0 &&
      isRecord(decisionsAsset.identityBinding) &&
      decisionsAsset.identityBinding.standardFormulaIdsSha256 ===
        sha256Bytes(identitiesBytes),
    "runtime-rev4-decisions-invalid",
  );
  const unsignedDecisions = { ...decisionsAsset };
  delete unsignedDecisions.contentHash;
  invariant(
    sha256Bytes(canonicalJson(unsignedDecisions)) ===
      EXPECTED_DECISIONS_CONTENT_HASH,
    "runtime-rev4-decisions-invalid",
  );
  const identities = new Map<string, IdentityRow>();
  for (const raw of identitiesAsset.formulas) {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        typeof raw.displayName === "string" &&
        typeof raw.primaryFamily === "string" &&
        !identities.has(raw.formulaId),
      "runtime-rev4-identity-invalid",
    );
    identities.set(raw.formulaId, {
      formulaId: raw.formulaId,
      displayName: raw.displayName,
      primaryFamily: raw.primaryFamily,
    });
  }
  const decisions: DecisionRow[] = decisionsAsset.rows.map((raw) => {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        typeof raw.publicationDecision === "string" &&
        (raw.implementationBasis === null ||
          typeof raw.implementationBasis === "string"),
      "runtime-rev4-decisions-invalid",
    );
    return {
      formulaId: raw.formulaId,
      publicationDecision: raw.publicationDecision,
      implementationBasis: raw.implementationBasis,
    };
  });
  return {
    identities,
    decisions,
    decisionsContentHash: decisionsAsset.contentHash,
    decisionsSha256: sha256Bytes(decisionsBytes),
    identitiesSha256: sha256Bytes(identitiesBytes),
  };
}

function loadCensus(repositoryRoot: string): {
  byId: Map<string, CensusRow>;
  contentHash: string;
} {
  const ledger = readJson(
    join(
      repositoryRoot,
      ".formula-library-private/formula-library-v1/bulk-migration-ledger.json",
    ),
  );
  invariant(
    ledger.ledgerContentHash === EXPECTED_CENSUS_LEDGER_HASH &&
      Array.isArray(ledger.rows) &&
      ledger.rows.length === 677,
    "runtime-rev4-census-invalid",
  );
  const unsigned = { ...ledger };
  delete unsigned.ledgerContentHash;
  invariant(
    sha256Bytes(canonicalJson(unsigned)) === EXPECTED_CENSUS_LEDGER_HASH,
    "runtime-rev4-census-invalid",
  );
  const byId = new Map<string, CensusRow>();
  for (const raw of ledger.rows) {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        typeof raw.status === "string" &&
        !byId.has(raw.formulaId),
      "runtime-rev4-census-invalid",
    );
    byId.set(raw.formulaId, {
      formulaId: raw.formulaId,
      status: raw.status,
      ...(typeof raw.sourceRevision === "string"
        ? { sourceRevision: raw.sourceRevision }
        : {}),
      ...(typeof raw.semanticHash === "string"
        ? { semanticHash: raw.semanticHash }
        : {}),
    });
  }
  return { byId, contentHash: EXPECTED_CENSUS_LEDGER_HASH };
}

async function buildDirectRows(
  ids: readonly string[],
  identities: ReadonlyMap<string, IdentityRow>,
  census: ReadonlyMap<string, CensusRow>,
  context: PreflightContext,
): Promise<RuntimeRev4SourceRow[]> {
  const workById = new Map<string, WorkRow>(
    context.workPackage.rows.map((row) => [row.formulaId, row]),
  );
  const rows: RuntimeRev4SourceRow[] = [];
  for (const formulaId of ids) {
    const workRow = workById.get(formulaId);
    const censusRow = census.get(formulaId);
    const identity = identities.get(formulaId);
    invariant(
      workRow && censusRow && identity,
      "runtime-rev4-direct-set-invalid",
    );
    invariant(
      workRow.sourceSet === "F588" &&
        censusRow.status === "passed" &&
        typeof censusRow.sourceRevision === "string" &&
        typeof censusRow.semanticHash === "string",
      "runtime-rev4-direct-set-invalid",
    );
    const prepared = await prepareDefinitionRow(workRow, context);
    invariant(
      "definition" in prepared &&
        prepared.sourceRevision === censusRow.sourceRevision &&
        prepared.semanticHash === censusRow.semanticHash &&
        prepared.definition.sourceRevision === censusRow.sourceRevision &&
        prepared.definition.semanticHash === censusRow.semanticHash,
      "runtime-rev4-direct-definition-invalid",
    );
    rows.push({
      formulaId,
      displayName: identity.displayName,
      family: identity.primaryFamily,
      implementationBasis: "direct-adaptation",
      sourceRevision: prepared.sourceRevision,
      semanticHash: prepared.semanticHash,
      definition: prepared.definition.source,
    });
  }
  return rows;
}

async function buildProjectOwnedRows(
  ids: readonly string[],
  identities: ReadonlyMap<string, IdentityRow>,
): Promise<RuntimeRev4SourceRow[]> {
  registerBuiltins({ quiet: true });
  const held = new Set(
    NATIVE_RECIPE_HOLDS_V1.map((entry) => entry.recipe.formulaId as string),
  );
  const recipes = new Map(
    NATIVE_FORMULA_RECIPES_V1.map((recipe) => [recipe.formulaId as string, recipe]),
  );
  invariant(
    recipes.size === EXPECTED_PROJECT_OWNED_COUNT && held.size === 21,
    "runtime-rev4-native-set-invalid",
  );
  const rows: RuntimeRev4SourceRow[] = [];
  for (const formulaId of ids) {
    const recipe = recipes.get(formulaId);
    const identity = identities.get(formulaId);
    invariant(
      recipe && identity,
      "runtime-rev4-native-set-invalid",
    );
    const validated = await validateNativeRecipeV1(recipe);
    invariant(validated.ok, "runtime-rev4-native-definition-invalid");
    rows.push({
      formulaId,
      displayName: identity.displayName,
      family: identity.primaryFamily,
      implementationBasis: "project-owned",
      sourceRevision: validated.sourceRevision,
      semanticHash: validated.semanticHash,
      definition: validated.definition.source,
    });
  }
  return rows;
}

export async function collectRuntimeRev4Rows(
  repositoryRoot: string,
): Promise<{
  rows: RuntimeRev4SourceRow[];
  decisionsContentHash: string;
  decisionsSha256: string;
  identitiesSha256: string;
  censusContentHash: string;
}> {
  const publicInputs = loadPublicInputs(repositoryRoot);
  const directIds = sortedUnique(
    publicInputs.decisions
      .filter(
        (row) =>
          row.publicationDecision === "publish" &&
          row.implementationBasis === "direct-adaptation",
      )
      .map((row) => row.formulaId),
    "runtime-rev4-direct-set-invalid",
  );
  const projectOwnedIds = sortedUnique(
    publicInputs.decisions
      .filter(
        (row) =>
          row.publicationDecision === "publish" &&
          row.implementationBasis === "project-owned",
      )
      .map((row) => row.formulaId),
    "runtime-rev4-native-set-invalid",
  );
  invariant(
    directIds.length === EXPECTED_DIRECT_COUNT &&
      projectOwnedIds.length === EXPECTED_PROJECT_OWNED_COUNT,
    "runtime-rev4-published-set-invalid",
  );
  const census = loadCensus(repositoryRoot);
  const context = preflight(repositoryRoot);
  const rows = [
    ...(await buildDirectRows(
      directIds,
      publicInputs.identities,
      census.byId,
      context,
    )),
    ...(await buildProjectOwnedRows(projectOwnedIds, publicInputs.identities)),
  ].sort((left, right) =>
    left.formulaId < right.formulaId ? -1 : left.formulaId > right.formulaId ? 1 : 0,
  );
  invariant(
    rows.length === EXPECTED_ROW_COUNT &&
      new Set(rows.map((row) => row.formulaId)).size === EXPECTED_ROW_COUNT,
    "runtime-rev4-published-set-invalid",
  );
  return {
    rows,
    decisionsContentHash: publicInputs.decisionsContentHash,
    decisionsSha256: publicInputs.decisionsSha256,
    identitiesSha256: publicInputs.identitiesSha256,
    censusContentHash: census.contentHash,
  };
}

function releaseManifest(
  collected: Awaited<ReturnType<typeof collectRuntimeRev4Rows>>,
): { serialized: string; rows: ReleaseRow[] } {
  const rows: ReleaseRow[] = collected.rows.map((row) => ({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family,
    implementationBasis: row.implementationBasis,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    definitionSha256: sha256Bytes(row.definition),
  }));
  const nativeRecipeSetHash = sha256Bytes(
    canonicalJson(
      rows
        .filter((row) => row.implementationBasis === "project-owned")
        .map((row) => ({
          formulaId: row.formulaId,
          sourceRevision: row.sourceRevision,
          semanticHash: row.semanticHash,
        })),
    ),
  );
  const body = {
    schema: RELEASE_SCHEMA,
    runtimeRevision: RUNTIME_REVISION,
    decisionRevision: DECISION_REVISION,
    publicationDecisionsContentHash: collected.decisionsContentHash,
    publicationDecisionsSha256: collected.decisionsSha256,
    standardFormulaIdsSha256: collected.identitiesSha256,
    censusLedgerContentHash: collected.censusContentHash,
    nativeRecipeSetHash,
    rowCount: rows.length,
    rows,
  };
  const manifest = {
    ...body,
    contentHash: sha256Bytes(canonicalJson(body)),
  };
  return { serialized: `${JSON.stringify(manifest, null, 2)}\n`, rows };
}

function stageDefinitions(
  staging: string,
  rows: readonly RuntimeRev4SourceRow[],
  releaseSerialized: string,
): void {
  const expected = new Set([
    RELEASE_FILENAME,
    ...rows.map((row) => `${row.formulaId}.frm`),
  ]);
  for (const name of readdirSync(staging)) {
    invariant(expected.has(name), "runtime-rev4-staging-set-invalid");
  }
  for (const row of rows) {
    writePrivateFile(join(staging, `${row.formulaId}.frm`), row.definition);
  }
  writePrivateFile(join(staging, RELEASE_FILENAME), releaseSerialized);
  invariant(
    readdirSync(staging).sort().join("\u0000") ===
      [...expected].sort().join("\u0000"),
    "runtime-rev4-staging-set-invalid",
  );
}

async function readStagedRows(
  staging: string,
  releaseRows: readonly ReleaseRow[],
): Promise<RuntimeRev4SourceRow[]> {
  const rows: RuntimeRev4SourceRow[] = [];
  for (const entry of releaseRows) {
    const path = join(staging, `${entry.formulaId}.frm`);
    const metadata = lstatSync(path);
    invariant(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1 &&
        (metadata.mode & 0o777) === 0o600,
      "runtime-rev4-staging-invalid",
    );
    const definition = readFileSync(path, "utf8");
    invariant(
      sha256Bytes(definition) === entry.definitionSha256 &&
        entry.definitionSha256 === entry.sourceRevision,
      "runtime-rev4-staging-hash-mismatch",
    );
    const parsed = parseFrmLikeV1(definition);
    invariant(parsed.ok, "runtime-rev4-staging-definition-invalid");
    const revisions = await hashFrmLikeV1(definition, parsed.ir);
    invariant(
      revisions.sourceRevision === entry.sourceRevision &&
        revisions.semanticHash === entry.semanticHash,
      "runtime-rev4-staging-definition-invalid",
    );
    rows.push({ ...entry, definition });
  }
  return rows;
}

function runtimeDocuments(
  rows: readonly RuntimeRev4SourceRow[],
  releaseManifestSha256: string,
  decisionsContentHash: string,
): { writes: { path: string; serialized: string }[]; manifest: JsonRecord } {
  const shardCount = Math.ceil(rows.length / SHARD_SIZE);
  const writes: { path: string; serialized: string }[] = [];
  const shardFiles: { file: string; sha256: string; rows: number }[] = [];
  for (let index = 0; index < shardCount; index += 1) {
    const shardRows = rows.slice(index * SHARD_SIZE, (index + 1) * SHARD_SIZE);
    const shard = {
      schema: SHARD_SCHEMA,
      decisionRevision: DECISION_REVISION,
      runtimeRevision: RUNTIME_REVISION,
      shardIndex: index,
      shardCount,
      rows: shardRows,
    };
    const serialized = `${JSON.stringify(shard, null, 2)}\n`;
    const file = `shard-${String(index).padStart(3, "0")}.json`;
    shardFiles.push({ file, sha256: sha256Bytes(serialized), rows: shardRows.length });
    writes.push({ path: file, serialized });
  }
  const manifest = {
    schema: RUNTIME_MANIFEST_SCHEMA,
    decisionRevision: DECISION_REVISION,
    runtimeRevision: RUNTIME_REVISION,
    releaseManifestSha256,
    publicationDecisionsContentHash: decisionsContentHash,
    shardCount,
    rowCount: rows.length,
    shards: shardFiles,
  };
  writes.push({ path: "manifest.json", serialized: `${JSON.stringify(manifest, null, 2)}\n` });
  return { writes, manifest };
}

function ensureRuntimeDirectory(repositoryRoot: string): string {
  const runtimeRoot = join(
    repositoryRoot,
    "resources/formula-library/v1/runtime",
  );
  const metadata = lstatSync(runtimeRoot);
  invariant(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "runtime-rev4-output-invalid",
  );
  const directory = join(repositoryRoot, RUNTIME_RELATIVE_DIR);
  try {
    mkdirSync(directory, { mode: 0o755 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const installed = lstatSync(directory);
  invariant(
    installed.isDirectory() &&
      !installed.isSymbolicLink() &&
      realpathSync(directory) === resolve(directory),
    "runtime-rev4-output-invalid",
  );
  return directory;
}

export async function buildRuntimeRev4(
  repositoryRoot: string,
  write: boolean,
): Promise<{
  rows: number;
  directAdaptation: number;
  projectOwned: number;
  shardCount: number;
  releaseManifestSha256: string;
  drift: boolean;
}> {
  const collected = await collectRuntimeRev4Rows(repositoryRoot);
  const release = releaseManifest(collected);
  const staging = ensurePrivateStaging(repositoryRoot, write);
  if (write) stageDefinitions(staging, collected.rows, release.serialized);
  const storedReleasePath = join(staging, RELEASE_FILENAME);
  const storedReleaseMetadata = lstatSync(storedReleasePath);
  invariant(
    storedReleaseMetadata.isFile() &&
      !storedReleaseMetadata.isSymbolicLink() &&
      (storedReleaseMetadata.mode & 0o777) === 0o600,
    "runtime-rev4-staging-invalid",
  );
  const storedRelease = readFileSync(storedReleasePath, "utf8");
  invariant(
    storedRelease === release.serialized,
    "runtime-rev4-release-manifest-drift",
  );
  const stagedRows = await readStagedRows(staging, release.rows);
  const releaseManifestSha256 = sha256Bytes(storedRelease);
  const documents = runtimeDocuments(
    stagedRows,
    releaseManifestSha256,
    collected.decisionsContentHash,
  );
  let drift = false;
  const runtimeDirectory = join(repositoryRoot, RUNTIME_RELATIVE_DIR);
  if (write) ensureRuntimeDirectory(repositoryRoot);
  for (const output of documents.writes) {
    const path = join(runtimeDirectory, output.path);
    let current: string | null = null;
    try {
      current = readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current !== output.serialized) drift = true;
    if (write) writePublicAsset(path, output.serialized);
  }
  if (!write) invariant(!drift, "runtime-rev4-public-assets-drift");
  return {
    rows: stagedRows.length,
    directAdaptation: stagedRows.filter(
      (row) => row.implementationBasis === "direct-adaptation",
    ).length,
    projectOwned: stagedRows.filter(
      (row) => row.implementationBasis === "project-owned",
    ).length,
    shardCount: Number(documents.manifest.shardCount),
    releaseManifestSha256,
    drift,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  buildRuntimeRev4(process.cwd(), process.argv.includes("--write"))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          mode: process.argv.includes("--write") ? "write" : "check",
          decisionRevision: DECISION_REVISION,
          runtimeRevision: RUNTIME_REVISION,
          ...result,
        })}\n`,
      );
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error && error.message.startsWith("runtime-rev4-")
          ? error.message
          : "runtime-rev4-internal-error";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
