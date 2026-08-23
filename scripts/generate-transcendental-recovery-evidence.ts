import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { compileFrmLikeV1Backend } from "../src/engine/frm/v1-backend";
import { validateFormulaProfileAssetV1 } from "../src/engine/formulas/v1/assets";
import { RECIPES } from "../src/engine/formulas/v1/native-recipes-b94-recovered-transcendental";
import { validateNativeRecipeV1 } from "../src/engine/formulas/v1/native-recipes";
import { renderProvisionalPreviewV1 } from "../src/engine/formulas/v1/provisional-preview";
import { projectProvisionalProfileV1 } from "../src/engine/formulas/v1/provisional-profile";
import { hashProfileRevisionV1 } from "../src/engine/formulas/v1/revisions";
import type { FormulaDefinitionV1, FormulaProfileV1 } from "../src/engine/formulas/v1/types";
import { getFormulaMetadata } from "../src/engine/plugins/formula-catalog";
import { registerBuiltins } from "../src/engine/plugins/builtins";
import { encodeDeterministicPng } from "./formula-library-bulk-migration";

type JsonRecord = Record<string, unknown>;

const root = process.cwd();
const outputRelative = "resources/formula-library/v1/recovery-evidence/transcendental-v1";
const outputDirectory = join(root, outputRelative);
const crossCheckRelative = `${outputRelative}/cross-check.json`;
const manifestRelative = `${outputRelative}/manifest.json`;
const WIDTH = 96;
const HEIGHT = 60;
const execFileAsync = promisify(execFile);
const PROFILE_VIEW_OVERRIDES: Readonly<
  Record<string, { centerX: number; centerY: number; zoom: number; rotation: number }>
> = Object.freeze({
  cosJulia: Object.freeze({ centerX: 0, centerY: 0.5, zoom: 0.25, rotation: 0 }),
  coshJulia: Object.freeze({ centerX: 0, centerY: 0.5, zoom: 0.35, rotation: 0 }),
  collatz: Object.freeze({ centerX: 1, centerY: 0, zoom: 10, rotation: 0 }),
  newton6: Object.freeze({ centerX: 0.5, centerY: 0.866, zoom: 1, rotation: 0 }),
});
const RECEIPT_SOURCE_PATHS = Object.freeze([
  "scripts/generate-transcendental-recovery-evidence.ts",
  "src/engine/formulas/v1/native-recipes-b94-recovered-transcendental.ts",
  "src/engine/formulas/v1/provisional-profile.ts",
  "src/engine/formulas/v1/provisional-preview.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/plugins/builtins/formulas/recoveredTranscendentalMath.ts",
  "src/engine/plugins/formula-catalog.ts",
  "scripts/formula-library-bulk-migration.ts",
  crossCheckRelative,
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value), "transcendental-evidence-canonical-json-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(relativePath: string): JsonRecord {
  const value = JSON.parse(readFileSync(join(root, relativePath), "utf8")) as unknown;
  invariant(isRecord(value), "transcendental-evidence-json-invalid");
  return value;
}

function sourceBindings(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    paths.map((relativePath) => [relativePath, sha256(readFileSync(join(root, relativePath)))]),
  );
}

function verifyBindings(bindings: unknown, code: string): void {
  invariant(isRecord(bindings), code);
  for (const [relativePath, digest] of Object.entries(bindings))
    invariant(
      typeof digest === "string" && sha256(readFileSync(join(root, relativePath))) === digest,
      `${code}:${relativePath}`,
    );
}

function verifyCrossCheckReceipt(): JsonRecord {
  const receipt = readJson(crossCheckRelative);
  invariant(
    receipt.schema === "fractalpark-b94-transcendental-cross-check/v1" &&
      receipt.publicationEligible === false &&
      receipt.publicationDecisionMutation === false &&
      isRecord(receipt.result),
    "transcendental-evidence-cross-check-invalid",
  );
  verifyBindings(
    receipt.sourceBindings,
    "transcendental-evidence-cross-check-binding-invalid",
  );
  const result = receipt.result;
  invariant(
    result.ok === true &&
      result.recipes === 12 &&
      result.passed === 12 &&
      result.failed === 0 &&
      Array.isArray(result.rows) &&
      result.rows.length === 12,
    "transcendental-evidence-cross-check-not-green",
  );
  return receipt;
}

function crossCheckRows(receipt: JsonRecord): Map<string, JsonRecord> {
  const rows = new Map<string, JsonRecord>();
  for (const row of (receipt.result as JsonRecord).rows as unknown[]) {
    invariant(
      isRecord(row) && typeof row.formulaId === "string",
      "transcendental-evidence-cross-check-row-invalid",
    );
    rows.set(row.formulaId, row);
  }
  return rows;
}

function verifyPublicationIsolation(): void {
  const decisions = readJson("resources/formula-library/v1/publication-decisions.json");
  invariant(Array.isArray(decisions.rows), "transcendental-evidence-decisions-invalid");
  const held = new Set(
    decisions.rows
      .filter(
        (row): row is JsonRecord =>
          isRecord(row) &&
          row.rightsStatus === "project-owned" &&
          row.publicationDecision === "hold" &&
          row.decisionReason === "held-b94-swiftshader-transcendental",
      )
      .map((row) => String(row.formulaId)),
  );
  const formulaIds = new Set(RECIPES.map((recipe) => recipe.formulaId as string));
  invariant(
    held.size === 12 &&
      formulaIds.size === 12 &&
      [...formulaIds].every((formulaId) => held.has(formulaId)),
    "transcendental-evidence-publication-isolation-invalid",
  );
}

async function projectRecoveryProfile(
  runtimeId: string,
  definition: FormulaDefinitionV1,
  view: { centerX: number; centerY: number; zoom: number; rotation: number },
  override: boolean,
) {
  const projected = await projectProvisionalProfileV1(
    definition,
    override ? { upstreamCandidate: view } : { b94CatalogCandidate: view },
  );
  if (!runtimeId.endsWith("Julia")) return projected;
  const base = projected.profile;
  const withoutRevision: Omit<FormulaProfileV1, "profileRevision"> = {
    schemaVersion: base.schemaVersion,
    formulaId: base.formulaId,
    sourceRevision: base.sourceRevision,
    parameters: base.parameters,
    mode: "julia",
    juliaC: [-0.8, 0.156],
    view: base.view,
    iterations: base.iterations,
    coloring: base.coloring,
    palette: base.palette,
    transform: base.transform,
  };
  const profileRevision = await hashProfileRevisionV1(withoutRevision);
  const validation = await validateFormulaProfileAssetV1(
    { ...withoutRevision, profileRevision },
    definition,
    profileRevision,
  );
  invariant(validation.ok, `transcendental-evidence-julia-profile-invalid:${runtimeId}`);
  return { ...projected, profile: validation.value };
}

function receiptFilename(formulaId: string): string {
  return `receipt-${formulaId}.json`;
}

function previewFilename(formulaId: string): string {
  return `preview-${formulaId}.png`;
}

async function buildFormulaReceipt(runtimeId: string): Promise<{
  receipt: JsonRecord;
  receiptBytes: Buffer;
  png: Buffer;
}> {
  registerBuiltins({ quiet: true });
  verifyPublicationIsolation();
  const crossCheck = crossCheckRows(verifyCrossCheckReceipt());
  const recipe = RECIPES.find((candidate) => candidate.runtimeId === runtimeId);
  invariant(recipe, `transcendental-evidence-runtime-invalid:${runtimeId}`);
  const validated = await validateNativeRecipeV1(recipe);
  invariant(validated.ok, `transcendental-evidence-recipe-invalid:${runtimeId}`);
  const parsed = parseFrmLikeV1(recipe.source);
  invariant(parsed.ok, `transcendental-evidence-parse-invalid:${runtimeId}`);
  invariant(
    canonicalizeFrmLikeV1(parsed.ir) === recipe.source,
    `transcendental-evidence-source-noncanonical:${runtimeId}`,
  );
  const compiled = compileFrmLikeV1Backend(parsed.ir);
  invariant(compiled.ok, `transcendental-evidence-backend-invalid:${runtimeId}`);
  const metadata = getFormulaMetadata(runtimeId);
  invariant(metadata, `transcendental-evidence-metadata-missing:${runtimeId}`);
  const catalogView = {
    centerX: metadata.defaultBounds.centerX,
    centerY: metadata.defaultBounds.centerY,
    zoom: metadata.defaultBounds.zoom,
    rotation: metadata.defaultBounds.rotation ?? 0,
  };
  const profileOverride = PROFILE_VIEW_OVERRIDES[runtimeId];
  const profile = await projectRecoveryProfile(
    runtimeId,
    validated.definition,
    profileOverride ?? catalogView,
    profileOverride !== undefined,
  );
  const first = renderProvisionalPreviewV1(compiled.backend, profile.profile, WIDTH, HEIGHT);
  const second = renderProvisionalPreviewV1(compiled.backend, profile.profile, WIDTH, HEIGHT);
  invariant(
    Buffer.from(first.rgba).equals(Buffer.from(second.rgba)),
    `transcendental-evidence-preview-nondeterministic:${runtimeId}`,
  );
  invariant(
    first.uniqueColors >= 2 &&
      first.nonFinitePixels <= Math.floor((WIDTH * HEIGHT) / 50) &&
      !first.anomalies.includes("flat-preview") &&
      first.escapedPixels + first.interiorPixels + first.nonFinitePixels === WIDTH * HEIGHT,
    `transcendental-evidence-preview-vacuous:${runtimeId}`,
  );
  const png = encodeDeterministicPng(WIDTH, HEIGHT, first.rgba);
  const crossCheckRow = crossCheck.get(recipe.formulaId as string);
  invariant(
    crossCheckRow?.ok === true &&
      crossCheckRow.v1WebglParity === "passed" &&
      isRecord(crossCheckRow.nativeCrossCheck) &&
      crossCheckRow.nativeCrossCheck.ok === true &&
      crossCheckRow.sourceRevision === validated.sourceRevision,
    `transcendental-evidence-cross-check-row-invalid:${runtimeId}`,
  );
  const row: JsonRecord = {
    formulaId: recipe.formulaId,
    runtimeId,
    family: recipe.family,
    failureClass: "swiftshader-transcendental",
    technicalStatus: "passed",
    publicationDecision: "hold",
    sourceRevision: validated.sourceRevision,
    semanticHash: validated.semanticHash,
    numericRemedy: {
      stableExp: "binary32-taylor8-x-over-256-square8",
      stableSinCos: "binary32-taylor-range-reduced-double-angle",
      stableHypot: "binary32-scaled-hypot",
      orbitOutputGrid: 16,
    },
    crossCheck: crossCheckRow,
    profile: { boundsSource: profile.boundsSource, value: profile.profile },
    preview: {
      file: previewFilename(recipe.formulaId),
      width: WIDTH,
      height: HEIGHT,
      rawRgbaSha256: sha256(first.rgba),
      pngSha256: sha256(png),
      escapedPixels: first.escapedPixels,
      interiorPixels: first.interiorPixels,
      nonFinitePixels: first.nonFinitePixels,
      uniqueColors: first.uniqueColors,
      anomalies: first.anomalies,
    },
  };
  const withoutHash: JsonRecord = {
    schema: "fractalpark-b94-transcendental-recovery-receipt/v1",
    deterministicDoubleRender: true,
    publicationEligible: false,
    publicationDecisionMutation: false,
    sourceBindings: sourceBindings(RECEIPT_SOURCE_PATHS),
    row,
  };
  const receipt = {
    ...withoutHash,
    contentHash: sha256(canonicalJson(withoutHash)),
  };
  return {
    receipt,
    receiptBytes: Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
    png,
  };
}

function verifyReceipt(recipe: (typeof RECIPES)[number]): JsonRecord {
  const relativePath = `${outputRelative}/${receiptFilename(recipe.formulaId)}`;
  const receipt = readJson(relativePath);
  invariant(
    receipt.schema === "fractalpark-b94-transcendental-recovery-receipt/v1" &&
      receipt.deterministicDoubleRender === true &&
      receipt.publicationEligible === false &&
      receipt.publicationDecisionMutation === false &&
      isRecord(receipt.row) &&
      receipt.row.formulaId === recipe.formulaId &&
      receipt.row.runtimeId === recipe.runtimeId,
    `transcendental-evidence-receipt-invalid:${recipe.runtimeId}`,
  );
  verifyBindings(receipt.sourceBindings, "transcendental-evidence-receipt-binding-invalid");
  const withoutHash = { ...receipt };
  delete withoutHash.contentHash;
  invariant(
    receipt.contentHash === sha256(canonicalJson(withoutHash)),
    `transcendental-evidence-receipt-hash-invalid:${recipe.runtimeId}`,
  );
  const preview = receipt.row.preview;
  invariant(
    isRecord(preview) &&
      typeof preview.file === "string" &&
      typeof preview.pngSha256 === "string" &&
      preview.pngSha256 === sha256(readFileSync(join(outputDirectory, preview.file))),
    `transcendental-evidence-preview-binding-invalid:${recipe.runtimeId}`,
  );
  return receipt;
}

function buildManifest(): { manifest: JsonRecord; bytes: Buffer } {
  verifyPublicationIsolation();
  const crossCheck = verifyCrossCheckReceipt();
  const recipes = [...RECIPES].sort((left, right) =>
    left.formulaId < right.formulaId ? -1 : left.formulaId > right.formulaId ? 1 : 0,
  );
  const receipts = recipes.map(verifyReceipt);
  const rows = receipts.map((receipt) => receipt.row);
  const artifacts = recipes.map((recipe) => {
    const receiptFile = receiptFilename(recipe.formulaId);
    const previewFile = previewFilename(recipe.formulaId);
    return {
      formulaId: recipe.formulaId,
      receipt: { file: receiptFile, sha256: sha256(readFileSync(join(outputDirectory, receiptFile))) },
      preview: { file: previewFile, sha256: sha256(readFileSync(join(outputDirectory, previewFile))) },
    };
  });
  const withoutHash: JsonRecord = {
    schema: "fractalpark-b94-transcendental-recovery-evidence/v1",
    deterministic: true,
    publicationEligible: false,
    publicationDecisionMutation: false,
    gateProgress: { passed: 12, required: 21 },
    dimensions: { width: WIDTH, height: HEIGHT },
    previewContract: {
      minimumUniqueColors: 2,
      maximumNonFiniteFraction: 0.02,
      nonFiniteMarkersRecordedNotHidden: true,
    },
    sourceBindings: sourceBindings([
      "scripts/generate-transcendental-recovery-evidence.ts",
      crossCheckRelative,
    ]),
    crossCheckArtifact: {
      path: crossCheckRelative,
      sha256: sha256(readFileSync(join(root, crossCheckRelative))),
      result: crossCheck.result,
    },
    artifacts,
    rows,
  };
  const manifest = {
    ...withoutHash,
    contentHash: sha256(canonicalJson(withoutHash)),
  };
  return { manifest, bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
}

function expectedOutputSet(): string[] {
  return [
    "cross-check.json",
    "manifest.json",
    ...RECIPES.flatMap((recipe) => [
      receiptFilename(recipe.formulaId),
      previewFilename(recipe.formulaId),
    ]),
  ].sort();
}

async function writeAllFormulaReceipts(): Promise<void> {
  const queue = RECIPES.map((recipe) => recipe.runtimeId);
  const workerCount = Math.min(4, queue.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const runtimeId = queue.shift();
        if (!runtimeId) return;
        const { stdout } = await execFileAsync(
          "npx",
          [
            "tsx",
            "scripts/generate-transcendental-recovery-evidence.ts",
            `--runtime=${runtimeId}`,
            "--write",
          ],
          { cwd: root, maxBuffer: 1024 * 1024 },
        );
        const result = JSON.parse(stdout) as unknown;
        invariant(
          isRecord(result) && result.ok === true && result.runtimeId === runtimeId,
          `transcendental-evidence-worker-invalid:${runtimeId}`,
        );
      }
    }),
  );
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const writeAll = process.argv.includes("--write-all");
  const runtimeArg = process.argv.find((argument) => argument.startsWith("--runtime="));
  const runtimeId = runtimeArg?.slice("--runtime=".length);
  mkdirSync(outputDirectory, { recursive: true });

  if (writeAll) {
    await writeAllFormulaReceipts();
    const built = buildManifest();
    writeFileSync(join(root, manifestRelative), built.bytes);
    invariant(
      JSON.stringify(readdirSync(outputDirectory).sort()) ===
        JSON.stringify(expectedOutputSet()),
      "transcendental-evidence-output-set-invalid",
    );
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: "parallel-write-all",
        workers: Math.min(4, RECIPES.length),
        rows: (built.manifest.rows as unknown[]).length,
        contentHash: built.manifest.contentHash,
        output: manifestRelative,
      })}\n`,
    );
    return;
  }

  if (runtimeId) {
    const recipe = RECIPES.find((candidate) => candidate.runtimeId === runtimeId);
    invariant(recipe, `transcendental-evidence-runtime-invalid:${runtimeId}`);
    const built = await buildFormulaReceipt(runtimeId);
    const receiptPath = join(outputDirectory, receiptFilename(recipe.formulaId));
    const previewPath = join(outputDirectory, previewFilename(recipe.formulaId));
    if (write) {
      writeFileSync(receiptPath, built.receiptBytes);
      writeFileSync(previewPath, built.png);
    } else {
      invariant(
        readFileSync(receiptPath).equals(built.receiptBytes) &&
          readFileSync(previewPath).equals(built.png),
        `transcendental-evidence-runtime-drift:${runtimeId}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: write ? "formula-write" : "formula-verify",
        runtimeId,
        formulaId: recipe.formulaId,
        contentHash: built.receipt.contentHash,
      })}\n`,
    );
    return;
  }

  const built = buildManifest();
  if (write) writeFileSync(join(root, manifestRelative), built.bytes);
  else
    invariant(
      readFileSync(join(root, manifestRelative)).equals(built.bytes),
      "transcendental-evidence-manifest-drift",
    );
  invariant(
    JSON.stringify(readdirSync(outputDirectory).sort()) === JSON.stringify(expectedOutputSet()),
    "transcendental-evidence-output-set-invalid",
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: write ? "manifest-write" : "verify",
      rows: (built.manifest.rows as unknown[]).length,
      contentHash: built.manifest.contentHash,
      output: manifestRelative,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "unknown",
    })}\n`,
  );
  process.exitCode = 1;
});
