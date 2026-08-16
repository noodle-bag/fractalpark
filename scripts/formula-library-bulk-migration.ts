import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

import { compileClassicFrmEntry } from "../src/engine/frm/compile";
import { scanFrmEntries } from "../src/engine/frm/scanner";
import {
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "../src/engine/frm/v1";
import { compileFrmLikeV1Backend } from "../src/engine/frm/v1-backend";
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

const CONTROLLER_VERSION = "formula-library-bulk-migration/1";
const EXPECTED_ROWS = 677;
const EXPECTED_CORPUS_FILES = 2196;
const EXPECTED_CORPUS_SHA256 =
  "ae81a9248e16d96bbbcfd949f0169f750db31b8b6cc0a3f822bd713160e0601e";
const EXPECTED_WORK_PACKAGE_SHA256 =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const DEFAULT_OUTPUT = join(
  "node_modules",
  ".cache",
  "formula-library-v1",
  "bulk-migration-ledger.json",
);
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface TypedAlias {
  readonly kind: string;
  readonly value: string;
  readonly formulaId: string;
}

interface WorkRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly typedLegacyAliases: readonly TypedAlias[];
  readonly implementationInput: {
    readonly status: string;
    readonly safeSourceLocator?: string | null;
    readonly runtimeId?: string;
  };
  readonly fixturesOrOracle: {
    readonly artifact?: string;
    readonly artifactSha256?: string;
    readonly evidenceKey?: string;
  };
}

interface WorkPackage {
  readonly schema: string;
  readonly status: string;
  readonly payloadContentHash: string;
  readonly sourceBindings: {
    readonly standardFormulaIds: { readonly sha256: string };
    readonly legacyFormulaAliases: { readonly sha256: string };
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
  readonly relativeLower: string;
  readonly basenameLower: string;
}

interface ExpectedOracleRun {
  readonly pixel: readonly [number, number];
  readonly escapedAt: number | null;
  readonly orbit?: readonly (readonly [number, number])[];
  readonly rounds?: number;
}

interface ExpectedOracleRow {
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

interface PreflightContext {
  readonly workPackage: WorkPackage;
  readonly corpusFiles: readonly CorpusFile[];
  readonly corpusRoot: string;
  readonly oracleRows: ReadonlyMap<string, ExpectedOracleRow>;
  readonly inputHashes: {
    readonly workPackage: string;
    readonly corpusSnapshot: string;
    readonly standardFormulaIds: string;
    readonly legacyFormulaAliases: string;
    readonly repositoryRevision: string;
    readonly oracleArtifacts: Readonly<Record<string, string>>;
  };
}

interface PassedRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly status: "passed";
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
  };
}

interface FailedRow {
  readonly formulaId: string;
  readonly sourceSet: "F588" | "B94";
  readonly status: "failed";
  readonly failureStage: FormulaLibraryBulkFailureStage;
  readonly reasonCode: FormulaLibraryBulkReasonCode;
}

type CensusRow = PassedRow | FailedRow;

interface GpuCase {
  readonly formulaId: string;
  readonly declarations: string;
  readonly init: string;
  readonly loop: string;
  readonly continuePredicate: string;
  readonly eventFlag: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly type: "real" | "complex" | "function";
    readonly value: number | readonly [number, number] | string;
  }[];
  readonly functionOptions: readonly string[];
}

interface PendingPass {
  readonly row: WorkRow;
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

function parseJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function extractWorkPackage(path: string): WorkPackage {
  const markdown = readFileSync(path, "utf8");
  const marker = markdown.indexOf(WORK_PACKAGE_START);
  invariant(marker >= 0, "work-package-marker-missing");
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(start >= 0 && end > start, "work-package-json-missing");
  return JSON.parse(markdown.slice(start, end)) as WorkPackage;
}

function walkCorpus(root: string): CorpusFile[] {
  const output: CorpusFile[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const relativePath = relative(root, path).replaceAll("\\", "/");
        output.push({
          path,
          relativeLower: relativePath.toLowerCase(),
          basenameLower: basename(path).toLowerCase(),
        });
      }
    }
  };
  walk(root);
  return output;
}

function corpusSnapshotHash(files: readonly CorpusFile[]): string {
  const hashes = files.map((file) => sha256File(file.path)).sort();
  return sha256Bytes(hashes.join("\n"));
}

function sortedAliasKey(aliases: readonly TypedAlias[]): string {
  return [...aliases]
    .map((alias) => `${alias.kind}\u0000${alias.value}\u0000${alias.formulaId}`)
    .sort()
    .join("\n");
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

function assertRepositoryScope(
  repositoryRoot: string,
  baseRevision: string,
): void {
  const allowed = new Set([
    "package.json",
    "scripts/formula-library-bulk-migration.ts",
    "src/engine/formulas/v1/bulk-migration.ts",
    "src/test/formula-library-bulk-migration.test.ts",
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

function preflight(repositoryRoot: string): PreflightContext {
  const workPackagePath = process.env.FRACTALPARK_FORMULA_HANDOFF;
  const corpusRoot = process.env.FRACTALPARK_FRM_CORPUS_DIR;
  const oracleRoot = process.env.FRACTALPARK_FORMULA_ORACLE_DIR;
  invariant(workPackagePath, "handoff-env-missing");
  invariant(corpusRoot, "corpus-env-missing");
  invariant(oracleRoot, "oracle-env-missing");

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
  const identities = parseJsonFile<IdentityManifest>(identitiesPath);
  const aliases = parseJsonFile<AliasManifest>(aliasesPath);
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
    const actual = sha256File(artifactPath);
    invariant(actual === expected, "oracle-hash-mismatch");
    actualArtifacts[artifact] = actual;
    const payload = parseJsonFile<OracleArtifactPayload>(artifactPath);
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

function releaseOracleMatches(
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

async function prepareRow(
  row: WorkRow,
  context: PreflightContext,
): Promise<FailedRow | PendingPass> {
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
  if (!expectedOracle)
    return failed(row, "release-oracle", "release-oracle-mismatch");
  let firstCpu: FormulaLibraryCpuSmokeSnapshot;
  let secondCpu: FormulaLibraryCpuSmokeSnapshot;
  let actualOracle: ReturnType<typeof runFormulaLibraryOracle>;
  try {
    actualOracle = runFormulaLibraryOracle(
      compiled.backend,
      expectedOracle.runs.map((run) => run.pixel),
      expectedOracle.maxIterations,
    );
    firstCpu = runFormulaLibraryCpuSmoke(compiled.backend);
    secondCpu = runFormulaLibraryCpuSmoke(compiled.backend);
  } catch {
    return failed(row, "cpu-runtime", "cpu-runtime-failed");
  }
  if (!releaseOracleMatches(actualOracle, expectedOracle))
    return failed(row, "release-oracle", "release-oracle-mismatch");
  if (!stableEqual(firstCpu as unknown as JsonValue, secondCpu as unknown as JsonValue))
    return failed(row, "cpu-runtime", "nondeterministic-output");

  const backendArtifactSha256 = sha256Bytes(
    canonical({
      metadata: compiled.backend.metadata,
      glsl: compiled.backend.glsl,
    } as unknown as JsonValue),
  );
  return {
    row,
    sourceRevision: revisions.sourceRevision,
    semanticHash: revisions.semanticHash,
    backendArtifactSha256,
    cpu: firstCpu,
    oracleRuns: expectedOracle.runs.length,
    gpuCase: {
      formulaId: row.formulaId,
      declarations: compiled.backend.glsl.declarations,
      init: compiled.backend.glsl.init,
      loop: compiled.backend.glsl.loop,
      continuePredicate: compiled.backend.glsl.continuePredicate,
      eventFlag: compiled.backend.glsl.eventFlag,
      parameters: safety.ir.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
        value: parameter.default,
      })),
      functionOptions: compiled.backend.glsl.functionOptions,
    },
  };
}

async function runWebgl(
  cases: readonly GpuCase[],
): Promise<ReadonlyMap<string, "passed" | "failed" | "nondeterministic">> {
  const results = new Map<string, "passed" | "failed" | "nondeterministic">();
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
      const outputs: Array<{
        formulaId: string;
        status: "passed" | "failed" | "nondeterministic";
      }> = [];
      for (const payload of payloads) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const gl = canvas.getContext("webgl", {
            antialias: false,
            preserveDrawingBuffer: true,
          });
          if (!gl) throw new Error("webgl-unavailable");
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
            `precision highp float;\n${payload.declarations}\nvoid main(){frmV1NonFiniteEvent=false;${payload.init}\n${payload.loop}\nbool keep=${payload.continuePredicate};gl_FragColor=vec4(keep?1.0:0.0,${payload.eventFlag}?1.0:0.0,0.0,1.0);}`,
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
          const vec2 = (name: string, x: number, y: number): void => {
            const location = gl.getUniformLocation(program, name);
            if (location !== null) gl.uniform2f(location, x, y);
          };
          vec2("pixel", 0.25, 0.1);
          vec2("c", 0.25, 0.1);
          vec2("maxit", 16, 0);
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
          const draw = (): string => {
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            const pixel = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            if (gl.getError() !== gl.NO_ERROR) throw new Error("draw-failed");
            return [...pixel].join(",");
          };
          const first = draw();
          const second = draw();
          outputs.push({
            formulaId: payload.formulaId,
            status: first === second ? "passed" : "nondeterministic",
          });
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
  let gpu: ReadonlyMap<string, "passed" | "failed" | "nondeterministic">;
  try {
    gpu = await runWebgl(
      prepared.filter((item): item is PendingPass => "gpuCase" in item).map((item) => item.gpuCase),
    );
  } catch {
    gpu = new Map();
  }
  return prepared.map((item) => {
    if (!("gpuCase" in item)) return item;
    const gpuStatus = gpu.get(item.row.formulaId);
    if (gpuStatus === "nondeterministic")
      return failed(
        item.row,
        "webgl-compile-link-draw",
        "nondeterministic-output",
      );
    if (gpuStatus !== "passed")
      return failed(
        item.row,
        "webgl-compile-link-draw",
        "webgl-compile-link-draw-failed",
      );
    return {
      formulaId: item.row.formulaId,
      sourceSet: item.row.sourceSet,
      status: "passed",
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
      },
    };
  });
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
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
  const rows = await run(context);
  invariant(rows.length === EXPECTED_ROWS, "census-row-count-mismatch");
  const failedRows = rows.filter((row): row is FailedRow => row.status === "failed");
  const ledgerWithoutHash = {
    schema: "fractalpark-formula-library-bulk-migration-ledger/v1",
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
  const output = resolve(repositoryRoot, DEFAULT_OUTPUT);
  const outputDirectory = dirname(output);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  writeFileSync(output, `${JSON.stringify(ledger, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(output, 0o600);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      output: relative(repositoryRoot, output).replaceAll("\\", "/"),
      ledgerContentHash,
      summary: ledger.summary,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "controller-internal-error";
  process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
  process.exitCode = 1;
});
