import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { compilePublishedFormulaPluginV1 } from "../src/engine/formulas/v1/published-adapter";
import type { FrmLikeV1Backend } from "../src/engine/frm/v1-backend";
import {
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
  PUBLISHED_FORMULA_PROFILE_SCHEMA_V1,
  PUBLISHED_FORMULA_RUNTIME_INDEX_SCHEMA_V1,
  type PublishedFormulaProfileV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from "../src/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const DECISIONS_PATH = join(
  ROOT,
  "resources/formula-library/v1/publication-decisions.json",
);
const RUNTIME_ROOT = join(ROOT, "resources/formula-library/v1/runtime");
const OUTPUT_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const SHA256 = /^[a-f0-9]{64}$/;
const WRITE = process.argv.includes("--write");
const EXPECTED_DECISION_CONTENT_HASH =
  "7106736785e8bbb7cc310056f93f550413b6a0b76ad21e648b50e55480a2a52c";
const EXPECTED_RUNTIME_MANIFEST_HASHES = Object.freeze({
  rev3: "4dfc5627a18fe11fc2b6227caf0b3034d279d67c97d10a622629f8e718eafafe",
  rev4: "9b79915127e9704cf7da5256c5012ac307a5979b9fcfd9d07a661db791f78ebe",
});

type JsonRecord = Record<string, unknown>;

interface RuntimeRow {
  readonly formulaId: string;
  readonly displayName: string;
  readonly family: string;
  readonly implementationBasis:
    | "direct-adaptation"
    | "project-owned"
    | "separated-independent-rewrite";
  readonly semanticHash: string;
  readonly definition: string;
  readonly sourceRevision?: string;
  readonly definitionSha256?: string;
}

interface ProfileCandidate {
  readonly mode: "parameter-plane" | "julia";
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly iterations: number;
  readonly juliaC?: readonly [number, number];
}

const PROFILE_CANDIDATES: readonly ProfileCandidate[] = Object.freeze([
  { mode: "parameter-plane", center: [-0.5, 0], zoom: 0.4, iterations: 96 },
  { mode: "parameter-plane", center: [0, 0], zoom: 0.25, iterations: 96 },
  { mode: "parameter-plane", center: [0, 0], zoom: 0.5, iterations: 128 },
  { mode: "parameter-plane", center: [-1, 0], zoom: 0.75, iterations: 128 },
  {
    mode: "julia",
    center: [0, 0],
    zoom: 0.4,
    iterations: 96,
    juliaC: [-0.8, 0.156],
  },
  {
    mode: "julia",
    center: [0, 0],
    zoom: 0.5,
    iterations: 128,
    juliaC: [0.285, 0.01],
  },
]);

const FAMILY_FALLBACKS: Readonly<Record<string, ProfileCandidate>> =
  Object.freeze({
    "algebraic-power": PROFILE_CANDIDATES[0]!,
    "folded-absolute": {
      mode: "parameter-plane",
      center: [-0.45, -0.45],
      zoom: 0.42,
      iterations: 128,
    },
    "function-composition": PROFILE_CANDIDATES[1]!,
    "orbit-memory": PROFILE_CANDIDATES[2]!,
    "rational-reciprocal": PROFILE_CANDIDATES[1]!,
    "root-finding": {
      mode: "julia",
      center: [0, 0],
      zoom: 0.35,
      iterations: 96,
      juliaC: [0, 0],
    },
    transcendental: PROFILE_CANDIDATES[1]!,
  });

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readPinnedPublicFile(path: string): Buffer {
  const metadata = lstatSync(path);
  invariant(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.nlink === 1 &&
      (metadata.mode & 0o777) === 0o644,
    "published-runtime-source-file-invalid",
  );
  return readFileSync(path);
}

function readJson(path: string): JsonRecord {
  const value = JSON.parse(readPinnedPublicFile(path).toString("utf8")) as unknown;
  invariant(isRecord(value), "published-runtime-json-invalid");
  return value;
}

function runtimeRows(
  revision: "rev3" | "rev4",
): Readonly<{
  rows: RuntimeRow[];
  manifestSha256: string;
  rowCount: number;
  shardCount: number;
}> {
  const root = join(RUNTIME_ROOT, revision);
  const manifestPath = join(root, "manifest.json");
  const manifestBytes = readPinnedPublicFile(manifestPath);
  invariant(
    sha256(manifestBytes) === EXPECTED_RUNTIME_MANIFEST_HASHES[revision],
    "published-runtime-source-manifest-hash-mismatch",
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  invariant(isRecord(manifest), "published-runtime-manifest-invalid");
  invariant(
    manifest.schema === "fractalpark-formula-library-runtime-manifest/v1" &&
      manifest.decisionRevision === 3 &&
      Array.isArray(manifest.shards) &&
      Number.isInteger(manifest.rowCount) &&
      Number.isInteger(manifest.shardCount) &&
      manifest.shards.length === manifest.shardCount,
    "published-runtime-manifest-invalid",
  );
  const rows: RuntimeRow[] = [];
  for (const [index, rawEntry] of manifest.shards.entries()) {
    invariant(isRecord(rawEntry), "published-runtime-shard-entry-invalid");
    invariant(
      typeof rawEntry.file === "string" &&
        typeof rawEntry.sha256 === "string" &&
        SHA256.test(rawEntry.sha256) &&
        Number.isInteger(rawEntry.rows),
      "published-runtime-shard-entry-invalid",
    );
    const bytes = readPinnedPublicFile(join(root, rawEntry.file));
    invariant(
      sha256(bytes) === rawEntry.sha256,
      "published-runtime-shard-hash-mismatch",
    );
    const shard = JSON.parse(bytes.toString("utf8")) as unknown;
    invariant(isRecord(shard), "published-runtime-shard-invalid");
    invariant(
      shard.schema === "fractalpark-formula-library-runtime-shard/v1" &&
        shard.decisionRevision === 3 &&
        shard.shardIndex === index &&
        shard.shardCount === manifest.shardCount &&
        Array.isArray(shard.rows) &&
        shard.rows.length === rawEntry.rows,
      "published-runtime-shard-invalid",
    );
    for (const rawRow of shard.rows) {
      invariant(isRecord(rawRow), "published-runtime-row-invalid");
      invariant(
        typeof rawRow.formulaId === "string" &&
          typeof rawRow.displayName === "string" &&
          typeof rawRow.family === "string" &&
          [
            "direct-adaptation",
            "project-owned",
            "separated-independent-rewrite",
          ].includes(String(rawRow.implementationBasis)) &&
          typeof rawRow.semanticHash === "string" &&
          SHA256.test(rawRow.semanticHash) &&
          typeof rawRow.definition === "string",
        "published-runtime-row-invalid",
      );
      rows.push(rawRow as unknown as RuntimeRow);
    }
  }
  invariant(rows.length === manifest.rowCount, "published-runtime-row-count");
  return {
    rows,
    manifestSha256: sha256(manifestBytes),
    rowCount: manifest.rowCount as number,
    shardCount: manifest.shardCount as number,
  };
}

function probeProfile(
  backend: FrmLikeV1Backend,
  candidate: ProfileCandidate,
): Readonly<{ escapeRatio: number; iterationVariance: number }> {
  const iterations: number[] = [];
  let escaped = 0;
  const samples = 7;
  for (let yi = 0; yi < samples; yi += 1) {
    for (let xi = 0; xi < samples; xi += 1) {
      const normalizedX = xi / (samples - 1) - 0.5;
      const normalizedY = yi / (samples - 1) - 0.5;
      const point = {
        re: candidate.center[0] + normalizedX / candidate.zoom,
        im: candidate.center[1] + normalizedY / candidate.zoom,
      };
      const juliaC = candidate.juliaC ?? [0, 0];
      const state = backend.cpu.createState({
        pixel: point,
        c:
          candidate.mode === "parameter-plane"
            ? point
            : { re: juliaC[0], im: juliaC[1] },
        maxit: candidate.iterations,
        ismand: candidate.mode === "parameter-plane",
      });
      const initialized = backend.cpu.init(state);
      let stoppedAt = candidate.iterations;
      if (initialized.event) {
        stoppedAt = 0;
        escaped += 1;
      } else {
        for (let iteration = 0; iteration < candidate.iterations; iteration += 1) {
          const step = backend.cpu.step(state);
          const continuation = backend.cpu.shouldContinue(state);
          if (step.event || continuation.event || continuation.continue === false) {
            stoppedAt = iteration + 1;
            escaped += 1;
            break;
          }
        }
      }
      iterations.push(stoppedAt);
    }
  }
  const mean =
    iterations.reduce((sum, value) => sum + value, 0) / iterations.length;
  const variance =
    iterations.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    iterations.length;
  return {
    escapeRatio: Number((escaped / iterations.length).toFixed(6)),
    iterationVariance: Number(variance.toFixed(6)),
  };
}

function profileFromCandidate(
  candidate: ProfileCandidate,
  quality: "mechanical" | "family" | "none",
  probe?: Readonly<{ escapeRatio: number; iterationVariance: number }>,
): PublishedFormulaProfileV1 {
  return Object.freeze({
    schema: PUBLISHED_FORMULA_PROFILE_SCHEMA_V1,
    quality,
    mode: candidate.mode,
    center: candidate.center,
    zoom: candidate.zoom,
    rotation: 0,
    iterations: candidate.iterations,
    ...(candidate.juliaC ? { juliaC: candidate.juliaC } : {}),
    ...(probe ? { probe } : {}),
  });
}

function mechanicalProfile(
  family: string,
  backend: FrmLikeV1Backend,
): PublishedFormulaProfileV1 {
  for (const candidate of PROFILE_CANDIDATES) {
    const probe = probeProfile(backend, candidate);
    if (
      probe.escapeRatio >= 0.1 &&
      probe.escapeRatio <= 0.9 &&
      probe.iterationVariance >= 1
    )
      return profileFromCandidate(candidate, "mechanical", probe);
  }
  const fallback = FAMILY_FALLBACKS[family];
  if (fallback) return profileFromCandidate(fallback, "family");
  return profileFromCandidate(PROFILE_CANDIDATES[1]!, "none");
}

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out.push(relative(root, path));
      else invariant(false, "published-runtime-output-entry-invalid");
    }
  };
  visit(root);
  return out.sort();
}

function writeOutput(files: ReadonlyMap<string, Buffer>): void {
  const parent = dirname(OUTPUT_ROOT);
  mkdirSync(parent, { recursive: true, mode: 0o755 });
  const temp = `${OUTPUT_ROOT}.tmp-${process.pid}`;
  const backup = `${OUTPUT_ROOT}.backup-${process.pid}`;
  rmSync(temp, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true, mode: 0o755 });
  for (const [path, bytes] of files) {
    const destination = join(temp, path);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o755 });
    writeFileSync(destination, bytes, { mode: 0o644 });
    chmodSync(destination, 0o644);
  }
  let backedUp = false;
  try {
    if (existsSync(OUTPUT_ROOT)) {
      renameSync(OUTPUT_ROOT, backup);
      backedUp = true;
    }
    renameSync(temp, OUTPUT_ROOT);
    if (backedUp) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    if (backedUp && !existsSync(OUTPUT_ROOT)) renameSync(backup, OUTPUT_ROOT);
    throw error;
  }
}

function verifyOutput(files: ReadonlyMap<string, Buffer>): boolean {
  const expected = [...files.keys()].sort();
  const actual = filesUnder(OUTPUT_ROOT);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) return false;
  for (const [path, bytes] of files) {
    const target = join(OUTPUT_ROOT, path);
    const stat = statSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return false;
    if ((stat.mode & 0o777) !== 0o644) return false;
    if (!readFileSync(target).equals(bytes)) return false;
  }
  return true;
}

async function main(): Promise<void> {
  const decisions = readJson(DECISIONS_PATH);
  invariant(
    decisions.schema === "fractalpark-formula-library-publication-decisions/v1" &&
      decisions.decisionRevision === 3 &&
      typeof decisions.contentHash === "string" &&
      decisions.contentHash === EXPECTED_DECISION_CONTENT_HASH &&
      Array.isArray(decisions.rows),
    "published-runtime-decisions-invalid",
  );
  const expected = new Map<string, string>();
  for (const rawRow of decisions.rows) {
    invariant(isRecord(rawRow), "published-runtime-decision-row-invalid");
    if (rawRow.publicationDecision !== "publish") continue;
    invariant(
      typeof rawRow.formulaId === "string" &&
        [
          "direct-adaptation",
          "project-owned",
          "separated-independent-rewrite",
        ].includes(String(rawRow.implementationBasis)),
      "published-runtime-decision-row-invalid",
    );
    invariant(
      !expected.has(rawRow.formulaId),
      "published-runtime-decision-duplicate",
    );
    expected.set(rawRow.formulaId, String(rawRow.implementationBasis));
  }

  const rev3 = runtimeRows("rev3");
  const rev4 = runtimeRows("rev4");
  const sourceRows = [...rev3.rows, ...rev4.rows];
  invariant(
    sourceRows.length === expected.size,
    "published-runtime-publish-count-mismatch",
  );

  const ids = new Set<string>();
  const revisions = new Set<string>();
  const indexRows: PublishedFormulaRuntimeIndexRowV1[] = [];
  const files = new Map<string, Buffer>();
  let mechanicalProfiles = 0;
  let familyProfiles = 0;
  let noneProfiles = 0;

  for (const row of sourceRows.sort((left, right) =>
    left.formulaId.localeCompare(right.formulaId),
  )) {
    invariant(!ids.has(row.formulaId), "published-runtime-formula-duplicate");
    ids.add(row.formulaId);
    invariant(
      expected.get(row.formulaId) === row.implementationBasis,
      "published-runtime-basis-mismatch",
    );
    const sourceRevision = sha256(row.definition);
    invariant(
      row.sourceRevision === undefined || row.sourceRevision === sourceRevision,
      "published-runtime-source-revision-mismatch",
    );
    invariant(
      row.definitionSha256 === undefined ||
        row.definitionSha256 === sourceRevision,
      "published-runtime-definition-hash-mismatch",
    );
    invariant(
      !revisions.has(sourceRevision),
      "published-runtime-source-revision-duplicate",
    );
    revisions.add(sourceRevision);
    const compiled = await compilePublishedFormulaPluginV1({
      formulaId: row.formulaId,
      displayName: row.displayName,
      family: row.family,
      sourceRevision,
      semanticHash: row.semanticHash,
      source: row.definition,
    });
    invariant(compiled.ok, `published-runtime-compile-failed:${row.formulaId}`);
    const profile = mechanicalProfile(row.family, compiled.value.backend);
    if (profile.quality === "mechanical") mechanicalProfiles += 1;
    else if (profile.quality === "family") familyProfiles += 1;
    else noneProfiles += 1;
    const definitionPath = `definitions/${sourceRevision}.frm`;
    files.set(definitionPath, Buffer.from(row.definition, "utf8"));
    indexRows.push({
      formulaId: row.formulaId,
      displayName: row.displayName,
      family: row.family,
      implementationBasis: row.implementationBasis,
      sourceRevision,
      semanticHash: row.semanticHash,
      definitionPath,
      descriptorSchema: compiled.value.descriptor.schema,
      parameters: compiled.value.descriptor.parameters,
      profile,
    });
  }
  invariant(ids.size === expected.size, "published-runtime-id-set-mismatch");
  invariant(indexRows.length === 513, "published-runtime-row-count-mismatch");
  invariant(noneProfiles === 0, "published-runtime-profile-none");
  for (const formulaId of expected.keys())
    invariant(ids.has(formulaId), "published-runtime-id-set-mismatch");

  const indexDocument = {
    schema: PUBLISHED_FORMULA_RUNTIME_INDEX_SCHEMA_V1,
    decisionRevision: decisions.decisionRevision,
    publicationDecisionsContentHash: decisions.contentHash,
    rowCount: indexRows.length,
    rows: indexRows,
  };
  const indexCanonicalSha256 = sha256HexSyncV1(
    canonicalJsonV1(indexDocument, 131_072),
  );
  invariant(
    indexCanonicalSha256 === PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    "published-runtime-index-canonical-hash-mismatch",
  );
  const indexBytes = Buffer.from(json(indexDocument), "utf8");
  files.set("index.json", indexBytes);
  const manifestBytes = Buffer.from(
    json({
      schema: "fractalpark-published-formula-runtime-manifest/v1",
      decisionRevision: decisions.decisionRevision,
      publicationDecisionsContentHash: decisions.contentHash,
      rowCount: indexRows.length,
      definitionCount: revisions.size,
      indexFile: "index.json",
      indexSha256: sha256(indexBytes),
      indexCanonicalSha256,
      sourceManifests: [
        {
          runtimeRevision: 3,
          sha256: rev3.manifestSha256,
          rowCount: rev3.rowCount,
          shardCount: rev3.shardCount,
        },
        {
          runtimeRevision: 4,
          sha256: rev4.manifestSha256,
          rowCount: rev4.rowCount,
          shardCount: rev4.shardCount,
        },
      ],
      profileCounts: {
        mechanical: mechanicalProfiles,
        family: familyProfiles,
        none: noneProfiles,
      },
    }),
    "utf8",
  );
  files.set("manifest.json", manifestBytes);

  if (WRITE) writeOutput(files);
  const current = verifyOutput(files);
  process.stdout.write(
    `${JSON.stringify({
      ok: current,
      write: WRITE,
      drift: !current,
      rowCount: indexRows.length,
      definitionCount: revisions.size,
      fileCount: files.size,
      profileCounts: {
        mechanical: mechanicalProfiles,
        family: familyProfiles,
        none: noneProfiles,
      },
      manifestSha256: sha256(manifestBytes),
      indexSha256: sha256(indexBytes),
      indexCanonicalSha256,
    })}\n`,
  );
  if (!current) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "published-runtime-failed",
    })}\n`,
  );
  process.exitCode = 1;
});
