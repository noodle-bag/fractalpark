import { createHash } from "node:crypto";
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

import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { NATIVE_RECIPE_HOLDS_V1 } from "../src/engine/formulas/v1/native-recipes-b94-held";
import {
  NATIVE_FORMULA_RECIPES_V1,
  validateNativeRecipeV1,
} from "../src/engine/formulas/v1/native-recipes";
import { registerBuiltins } from "../src/engine/plugins/builtins";

/**
 * Independent verifier for runtime revision 4. It deliberately imports
 * neither build-formula-runtime-rev4 nor the bulk-migration controller.
 * Expectations are rebuilt from raw decision/census bytes and the native
 * recipe registry, then compared with the private staged sources and public
 * shards as exact sets.
 */

const RUNTIME_REVISION = 4;
const DECISION_REVISION = 4;
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
const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;
type ImplementationBasis = "direct-adaptation" | "project-owned";

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
      "runtime-rev4-verify-manifest-invalid",
    );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value), "runtime-rev4-verify-manifest-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function readStableFile(
  path: string,
  expectedMode: 0o600 | 0o644 | null,
): Buffer {
  const before = lstatSync(path);
  invariant(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      (expectedMode === null || (before.mode & 0o777) === expectedMode),
    "runtime-rev4-verify-file-invalid",
  );
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        opened.dev === before.dev &&
        opened.ino === before.ino,
      "runtime-rev4-verify-file-invalid",
    );
    const bytes = readFileSync(descriptor);
    const after = lstatSync(path);
    invariant(
      after.dev === opened.dev &&
        after.ino === opened.ino &&
        after.size === opened.size &&
        after.mtimeMs === opened.mtimeMs,
      "runtime-rev4-verify-file-invalid",
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function parseJson(bytes: Buffer, code: string): JsonRecord {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    invariant(isRecord(value), code);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    throw new Error(code);
  }
}

function asReleaseRow(value: unknown): ReleaseRow {
  invariant(
    isRecord(value) &&
      typeof value.formulaId === "string" &&
      typeof value.displayName === "string" &&
      typeof value.family === "string" &&
      (value.implementationBasis === "direct-adaptation" ||
        value.implementationBasis === "project-owned") &&
      typeof value.sourceRevision === "string" &&
      SHA256.test(value.sourceRevision) &&
      typeof value.semanticHash === "string" &&
      SHA256.test(value.semanticHash) &&
      typeof value.definitionSha256 === "string" &&
      SHA256.test(value.definitionSha256),
    "runtime-rev4-verify-release-row-invalid",
  );
  return value as unknown as ReleaseRow;
}

function compareSets(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    [...actual].sort().join("\u0000") === [...expected].sort().join("\u0000")
  );
}

export async function verifyRuntimeRev4(repositoryRoot: string): Promise<{
  rows: number;
  directAdaptation: number;
  projectOwned: number;
  shardCount: number;
  releaseManifestSha256: string;
}> {
  const staging = join(repositoryRoot, STAGING_RELATIVE_DIR);
  const releasePath = join(staging, RELEASE_FILENAME);
  const releaseBytes = readStableFile(releasePath, 0o600);
  const release = parseJson(
    releaseBytes,
    "runtime-rev4-verify-release-manifest-invalid",
  );
  invariant(
    release.schema === RELEASE_SCHEMA &&
      release.runtimeRevision === RUNTIME_REVISION &&
      release.decisionRevision === DECISION_REVISION &&
      release.rowCount === EXPECTED_ROW_COUNT &&
      typeof release.contentHash === "string" &&
      SHA256.test(release.contentHash) &&
      typeof release.publicationDecisionsContentHash === "string" &&
      typeof release.publicationDecisionsSha256 === "string" &&
      typeof release.standardFormulaIdsSha256 === "string" &&
      release.censusLedgerContentHash === EXPECTED_CENSUS_LEDGER_HASH &&
      typeof release.nativeRecipeSetHash === "string" &&
      Array.isArray(release.rows) &&
      release.rows.length === EXPECTED_ROW_COUNT,
    "runtime-rev4-verify-release-manifest-invalid",
  );
  const unsignedRelease = { ...release };
  delete unsignedRelease.contentHash;
  invariant(
    sha256Bytes(canonicalJson(unsignedRelease)) === release.contentHash,
    "runtime-rev4-verify-release-manifest-invalid",
  );
  const releaseRows = release.rows.map(asReleaseRow);
  invariant(
    new Set(releaseRows.map((row) => row.formulaId)).size ===
      EXPECTED_ROW_COUNT &&
      releaseRows.every((row, index) =>
        index === 0 || releaseRows[index - 1]!.formulaId < row.formulaId,
      ),
    "runtime-rev4-verify-release-set-invalid",
  );

  const decisionsPath = join(
    repositoryRoot,
    "resources/formula-library/v1/publication-decisions.json",
  );
  const decisionsBytes = readStableFile(decisionsPath, 0o644);
  const decisions = parseJson(
    decisionsBytes,
    "runtime-rev4-verify-decisions-invalid",
  );
  invariant(
    decisions.decisionRevision === DECISION_REVISION &&
      decisions.formulaCount === 677 &&
      decisions.contentHash === EXPECTED_DECISIONS_CONTENT_HASH &&
      decisions.contentHash === release.publicationDecisionsContentHash &&
      sha256Bytes(decisionsBytes) === release.publicationDecisionsSha256 &&
      isRecord(decisions.decisionCounts) &&
      decisions.decisionCounts.publish === 534 &&
      decisions.decisionCounts.hold === 143 &&
      decisions.decisionCounts.exclude === 0 &&
      Array.isArray(decisions.rows) &&
      decisions.rows.length === 677,
    "runtime-rev4-verify-decisions-invalid",
  );
  const unsignedDecisions = { ...decisions };
  delete unsignedDecisions.contentHash;
  invariant(
    sha256Bytes(canonicalJson(unsignedDecisions)) ===
      EXPECTED_DECISIONS_CONTENT_HASH,
    "runtime-rev4-verify-decisions-invalid",
  );
  const expectedDirect: string[] = [];
  const expectedProjectOwned: string[] = [];
  const expectedBasis = new Map<string, ImplementationBasis>();
  const heldIds = new Set<string>();
  for (const raw of decisions.rows) {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        typeof raw.publicationDecision === "string",
      "runtime-rev4-verify-decisions-invalid",
    );
    if (raw.publicationDecision !== "publish") heldIds.add(raw.formulaId);
    if (
      raw.publicationDecision === "publish" &&
      raw.implementationBasis === "direct-adaptation"
    ) {
      expectedDirect.push(raw.formulaId);
      expectedBasis.set(raw.formulaId, "direct-adaptation");
    }
    if (
      raw.publicationDecision === "publish" &&
      raw.implementationBasis === "project-owned"
    ) {
      expectedProjectOwned.push(raw.formulaId);
      expectedBasis.set(raw.formulaId, "project-owned");
    }
  }
  invariant(
    expectedDirect.length === EXPECTED_DIRECT_COUNT &&
      expectedProjectOwned.length === EXPECTED_PROJECT_OWNED_COUNT &&
      expectedBasis.size === EXPECTED_ROW_COUNT &&
      compareSets(
        releaseRows.map((row) => row.formulaId),
        [...expectedDirect, ...expectedProjectOwned],
      ) &&
      releaseRows.filter(
        (row) => row.implementationBasis === "direct-adaptation",
      ).length === EXPECTED_DIRECT_COUNT &&
      releaseRows.filter((row) => row.implementationBasis === "project-owned")
        .length === EXPECTED_PROJECT_OWNED_COUNT &&
      releaseRows.every(
        (row) =>
          !heldIds.has(row.formulaId) &&
          expectedBasis.get(row.formulaId) === row.implementationBasis,
      ),
    "runtime-rev4-verify-release-set-invalid",
  );

  const identitiesPath = join(
    repositoryRoot,
    "resources/formula-library/v1/standard-formula-ids.json",
  );
  const identitiesBytes = readStableFile(identitiesPath, null);
  invariant(
    sha256Bytes(identitiesBytes) === release.standardFormulaIdsSha256 &&
      isRecord(decisions.identityBinding) &&
      decisions.identityBinding.standardFormulaIdsSha256 ===
        sha256Bytes(identitiesBytes),
    "runtime-rev4-verify-identity-invalid",
  );
  const identities = parseJson(
    identitiesBytes,
    "runtime-rev4-verify-identity-invalid",
  );
  invariant(
    Array.isArray(identities.formulas) && identities.formulas.length === 677,
    "runtime-rev4-verify-identity-invalid",
  );
  const identitiesById = new Map<string, JsonRecord>();
  for (const raw of identities.formulas) {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        !identitiesById.has(raw.formulaId),
      "runtime-rev4-verify-identity-invalid",
    );
    identitiesById.set(raw.formulaId, raw);
  }

  const censusPath = join(
    repositoryRoot,
    ".formula-library-private/formula-library-v1/bulk-migration-ledger.json",
  );
  const census = parseJson(
    readStableFile(censusPath, 0o600),
    "runtime-rev4-verify-census-invalid",
  );
  invariant(
    census.ledgerContentHash === EXPECTED_CENSUS_LEDGER_HASH &&
      Array.isArray(census.rows) &&
      census.rows.length === 677,
    "runtime-rev4-verify-census-invalid",
  );
  const unsignedCensus = { ...census };
  delete unsignedCensus.ledgerContentHash;
  invariant(
    sha256Bytes(canonicalJson(unsignedCensus)) === EXPECTED_CENSUS_LEDGER_HASH,
    "runtime-rev4-verify-census-invalid",
  );
  const censusById = new Map<string, JsonRecord>();
  for (const raw of census.rows) {
    invariant(
      isRecord(raw) &&
        typeof raw.formulaId === "string" &&
        !censusById.has(raw.formulaId),
      "runtime-rev4-verify-census-invalid",
    );
    censusById.set(raw.formulaId, raw);
  }

  registerBuiltins({ quiet: true });
  const nativeHolds = new Set(
    NATIVE_RECIPE_HOLDS_V1.map((entry) => entry.recipe.formulaId as string),
  );
  const nativeById = new Map(
    NATIVE_FORMULA_RECIPES_V1.map((recipe) => [recipe.formulaId as string, recipe]),
  );
  invariant(
    nativeById.size === EXPECTED_PROJECT_OWNED_COUNT && nativeHolds.size === 21,
    "runtime-rev4-verify-native-set-invalid",
  );

  const definitions = new Map<string, string>();
  for (const row of releaseRows) {
    const identity = identitiesById.get(row.formulaId);
    invariant(
      identity &&
        identity.displayName === row.displayName &&
        identity.primaryFamily === row.family &&
        row.definitionSha256 === row.sourceRevision,
      "runtime-rev4-verify-release-row-invalid",
    );
    const definitionBytes = readStableFile(
      join(staging, `${row.formulaId}.frm`),
      0o600,
    );
    invariant(
      sha256Bytes(definitionBytes) === row.sourceRevision,
      "runtime-rev4-verify-definition-hash-mismatch",
    );
    const definition = definitionBytes.toString("utf8");
    const parsed = parseFrmLikeV1(definition);
    invariant(parsed.ok, "runtime-rev4-verify-definition-invalid");
    const revisions = await hashFrmLikeV1(definition, parsed.ir);
    invariant(
      revisions.sourceRevision === row.sourceRevision &&
        revisions.semanticHash === row.semanticHash,
      "runtime-rev4-verify-definition-invalid",
    );
    if (row.implementationBasis === "direct-adaptation") {
      const censusRow = censusById.get(row.formulaId);
      invariant(
        censusRow?.status === "passed" &&
          censusRow.sourceRevision === row.sourceRevision &&
          censusRow.semanticHash === row.semanticHash,
        "runtime-rev4-verify-direct-evidence-mismatch",
      );
    } else {
      const recipe = nativeById.get(row.formulaId);
      invariant(recipe, "runtime-rev4-verify-native-set-invalid");
      const validated = await validateNativeRecipeV1(recipe);
      invariant(
        validated.ok &&
          validated.sourceRevision === row.sourceRevision &&
          validated.semanticHash === row.semanticHash &&
          validated.definition.source === definition,
        "runtime-rev4-verify-native-evidence-mismatch",
      );
    }
    definitions.set(row.formulaId, definition);
  }
  invariant(
    compareSets(readdirSync(staging), [
      RELEASE_FILENAME,
      ...releaseRows.map((row) => `${row.formulaId}.frm`),
    ]),
    "runtime-rev4-verify-staging-set-invalid",
  );

  const runtimeDirectory = join(repositoryRoot, RUNTIME_RELATIVE_DIR);
  const runtimeDirectoryMetadata = lstatSync(runtimeDirectory);
  invariant(
    runtimeDirectoryMetadata.isDirectory() &&
      !runtimeDirectoryMetadata.isSymbolicLink() &&
      (runtimeDirectoryMetadata.mode & 0o777) === 0o755 &&
      realpathSync(runtimeDirectory) === resolve(runtimeDirectory),
    "runtime-rev4-verify-public-directory-invalid",
  );
  const publicManifestBytes = readStableFile(
    join(runtimeDirectory, "manifest.json"),
    0o644,
  );
  const publicManifest = parseJson(
    publicManifestBytes,
    "runtime-rev4-verify-public-manifest-invalid",
  );
  invariant(
    publicManifest.schema === RUNTIME_MANIFEST_SCHEMA &&
      publicManifest.runtimeRevision === RUNTIME_REVISION &&
      publicManifest.decisionRevision === DECISION_REVISION &&
      publicManifest.releaseManifestSha256 === sha256Bytes(releaseBytes) &&
      publicManifest.publicationDecisionsContentHash === decisions.contentHash &&
      publicManifest.rowCount === EXPECTED_ROW_COUNT &&
      typeof publicManifest.shardCount === "number" &&
      Array.isArray(publicManifest.shards) &&
      publicManifest.shards.length === publicManifest.shardCount,
    "runtime-rev4-verify-public-manifest-invalid",
  );
  const publicRows: JsonRecord[] = [];
  const expectedPublicFiles = ["manifest.json"];
  for (const [index, rawEntry] of publicManifest.shards.entries()) {
    invariant(
      isRecord(rawEntry) &&
        typeof rawEntry.file === "string" &&
        typeof rawEntry.sha256 === "string" &&
        SHA256.test(rawEntry.sha256) &&
        typeof rawEntry.rows === "number",
      "runtime-rev4-verify-public-manifest-invalid",
    );
    expectedPublicFiles.push(rawEntry.file);
    const shardBytes = readStableFile(
      join(runtimeDirectory, rawEntry.file),
      0o644,
    );
    invariant(
      sha256Bytes(shardBytes) === rawEntry.sha256,
      "runtime-rev4-verify-shard-hash-mismatch",
    );
    const shard = parseJson(
      shardBytes,
      "runtime-rev4-verify-shard-invalid",
    );
    invariant(
      shard.schema === SHARD_SCHEMA &&
        shard.runtimeRevision === RUNTIME_REVISION &&
        shard.decisionRevision === DECISION_REVISION &&
        shard.shardIndex === index &&
        shard.shardCount === publicManifest.shardCount &&
        Array.isArray(shard.rows) &&
        shard.rows.length === rawEntry.rows,
      "runtime-rev4-verify-shard-invalid",
    );
    for (const rawRow of shard.rows) {
      invariant(isRecord(rawRow), "runtime-rev4-verify-shard-invalid");
      publicRows.push(rawRow);
    }
  }
  invariant(
    compareSets(readdirSync(runtimeDirectory), expectedPublicFiles) &&
      publicRows.length === EXPECTED_ROW_COUNT,
    "runtime-rev4-verify-public-set-invalid",
  );
  for (const [index, raw] of publicRows.entries()) {
    const releaseRow = releaseRows[index];
    invariant(
      releaseRow &&
        raw.formulaId === releaseRow.formulaId &&
        raw.displayName === releaseRow.displayName &&
        raw.family === releaseRow.family &&
        raw.implementationBasis === releaseRow.implementationBasis &&
        raw.sourceRevision === releaseRow.sourceRevision &&
        raw.semanticHash === releaseRow.semanticHash &&
        raw.definition === definitions.get(releaseRow.formulaId),
      "runtime-rev4-verify-public-row-mismatch",
    );
  }

  const nativeRows = releaseRows.filter(
    (row) => row.implementationBasis === "project-owned",
  );
  const nativeRecipeSetHash = sha256Bytes(
    canonicalJson(
      nativeRows.map((row) => ({
        formulaId: row.formulaId,
        sourceRevision: row.sourceRevision,
        semanticHash: row.semanticHash,
      })),
    ),
  );
  invariant(
    nativeRecipeSetHash === release.nativeRecipeSetHash,
    "runtime-rev4-verify-native-set-invalid",
  );

  return {
    rows: releaseRows.length,
    directAdaptation: releaseRows.filter(
      (row) => row.implementationBasis === "direct-adaptation",
    ).length,
    projectOwned: nativeRows.length,
    shardCount: Number(publicManifest.shardCount),
    releaseManifestSha256: sha256Bytes(releaseBytes),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  verifyRuntimeRev4(process.cwd())
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
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
          : "runtime-rev4-verify-internal-error";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
