import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { compileFrmLikeV1Backend } from "../src/engine/frm/v1-backend";
import { validateFormulaProfileAssetV1 } from "../src/engine/formulas/v1/assets";
import { NATIVE_RECIPE_HOLDS_V1 } from "../src/engine/formulas/v1/native-recipes-b94-held";
import { RECIPES } from "../src/engine/formulas/v1/native-recipes-b94-recovered-amplified";
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
const outputRelative = "resources/formula-library/v1/recovery-evidence/amplified-v1";
const outputDirectory = join(root, outputRelative);
const crossCheckRelative = `${outputRelative}/cross-check.json`;
const manifestRelative = `${outputRelative}/manifest.json`;
const priorBatchManifestRelative =
  "resources/formula-library/v1/recovery-evidence/transcendental-v1/manifest.json";
const WIDTH = 96;
const HEIGHT = 60;
const execFileAsync = promisify(execFile);
const PROFILE_VIEW_OVERRIDES: Readonly<
  Record<string, { centerX: number; centerY: number; zoom: number; rotation: number }>
> = Object.freeze({
  newtonExp: Object.freeze({ centerX: 0, centerY: Math.PI, zoom: 2, rotation: 0 }),
});
const RECOVERED_RUNTIME_PATHS = Object.freeze([
  "src/engine/plugins/builtins/formulas/airshipCubic.ts",
  "src/engine/plugins/builtins/formulas/burningShipCubic.ts",
  "src/engine/plugins/builtins/formulas/burningShipQuartic.ts",
  "src/engine/plugins/builtins/formulas/cubicPerpendicularMandelbrot.ts",
  "src/engine/plugins/builtins/formulas/mandelbox.ts",
  "src/engine/plugins/builtins/formulas/multicorn5.ts",
  "src/engine/plugins/builtins/formulas/newtonCosh.ts",
  "src/engine/plugins/builtins/formulas/newtonExp.ts",
  "src/engine/plugins/builtins/formulas/quarticPerpendicularMandelbrot.ts",
]);
const CROSS_CHECK_SOURCE_PATHS = Object.freeze([
  "resources/formula-library/v1/publication-decisions.json",
  "scripts/cross-check-native-recipes.ts",
  "scripts/formula-library-bulk-migration.ts",
  "src/engine/formulas/v1/native-recipes-b94-held.ts",
  "src/engine/formulas/v1/native-recipes-b94-recovered-amplified.ts",
  "src/engine/formulas/v1/native-recipes.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/plugins/builtins/formulas/recoveredAmplifiedMath.ts",
  ...RECOVERED_RUNTIME_PATHS,
  "src/engine/shaders/complex-math.glsl",
]);
const RECEIPT_SOURCE_PATHS = Object.freeze([
  "scripts/generate-amplified-recovery-evidence.ts",
  "src/engine/formulas/v1/native-recipes-b94-recovered-amplified.ts",
  "src/engine/formulas/v1/native-recipes-b94-held.ts",
  "src/engine/formulas/v1/provisional-profile.ts",
  "src/engine/formulas/v1/provisional-preview.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/plugins/builtins/formulas/recoveredAmplifiedMath.ts",
  ...RECOVERED_RUNTIME_PATHS,
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
  invariant(isRecord(value), "amplified-evidence-canonical-json-invalid");
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
  invariant(isRecord(value), "amplified-evidence-json-invalid");
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
    receipt.schema === "fractalpark-b94-amplified-cross-check/v1" &&
      receipt.publicationEligible === false &&
      receipt.publicationDecisionMutation === false &&
      isRecord(receipt.result),
    "amplified-evidence-cross-check-invalid",
  );
  verifyBindings(
    receipt.sourceBindings,
    "amplified-evidence-cross-check-binding-invalid",
  );
  const result = receipt.result;
  invariant(
    result.ok === true &&
      result.recipes === 9 &&
      result.passed === 9 &&
      result.failed === 0 &&
      Array.isArray(result.rows) &&
      result.rows.length === 9,
    "amplified-evidence-cross-check-not-green",
  );
  return receipt;
}

function crossCheckRows(receipt: JsonRecord): Map<string, JsonRecord> {
  const rows = new Map<string, JsonRecord>();
  for (const row of (receipt.result as JsonRecord).rows as unknown[]) {
    invariant(
      isRecord(row) && typeof row.formulaId === "string",
      "amplified-evidence-cross-check-row-invalid",
    );
    rows.set(row.formulaId, row);
  }
  return rows;
}

function verifyPublicationIsolation(): void {
  const decisions = readJson("resources/formula-library/v1/publication-decisions.json");
  invariant(Array.isArray(decisions.rows), "amplified-evidence-decisions-invalid");
  const held = new Set(
    decisions.rows
      .filter(
        (row): row is JsonRecord =>
          isRecord(row) &&
          row.rightsStatus === "project-owned" &&
          row.publicationDecision === "hold" &&
          (row.decisionReason === "held-b94-chaotic-amplification" ||
            row.decisionReason === "held-b94-ill-conditioned-cancellation"),
      )
      .map((row) => String(row.formulaId)),
  );
  const formulaIds = new Set(RECIPES.map((recipe) => recipe.formulaId as string));
  invariant(
    held.size === 9 &&
      formulaIds.size === 9 &&
      [...formulaIds].every((formulaId) => held.has(formulaId)),
    "amplified-evidence-publication-isolation-invalid",
  );
}

function verifyPriorBatchManifest(): JsonRecord {
  const manifest = readJson(priorBatchManifestRelative);
  invariant(
    manifest.schema === "fractalpark-b94-transcendental-recovery-evidence/v1" &&
      manifest.publicationEligible === false &&
      manifest.publicationDecisionMutation === false &&
      isRecord(manifest.gateProgress) &&
      manifest.gateProgress.passed === 12 &&
      manifest.gateProgress.required === 21 &&
      Array.isArray(manifest.rows) &&
      manifest.rows.length === 12 &&
      manifest.rows.every(
        (row) =>
          isRecord(row) &&
          row.technicalStatus === "passed" &&
          row.publicationDecision === "hold",
      ),
    "amplified-evidence-prior-batch-invalid",
  );
  verifyBindings(
    manifest.sourceBindings,
    "amplified-evidence-prior-batch-binding-invalid",
  );
  const withoutHash = { ...manifest };
  delete withoutHash.contentHash;
  invariant(
    manifest.contentHash === sha256(canonicalJson(withoutHash)),
    "amplified-evidence-prior-batch-hash-invalid",
  );
  return manifest;
}

function numericRemedy(runtimeId: string): JsonRecord {
  if (runtimeId === "mandelbox")
    return {
      explicitRadiusSquaredOrder: "x*x-plus-y*y",
      orbitOutputGrid: 16,
    };
  if (runtimeId === "newtonCosh")
    return {
      stableExp: "binary32-taylor8-x-over-256-square8",
      stableSinCos: "binary32-taylor-range-reduced-double-angle",
      realClamp: 80,
    };
  if (runtimeId === "newtonExp")
    return {
      stableExp: "binary32-taylor8-x-over-256-square8",
      stableSinCos: "binary32-taylor-range-reduced-double-angle",
      realClamp: 20,
      squaredDenominatorRangeSafe: true,
    };
  return { integerPower: "binary32-left-associated-complex-multiply" };
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
  invariant(validation.ok, `amplified-evidence-julia-profile-invalid:${runtimeId}`);
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
  invariant(recipe, `amplified-evidence-runtime-invalid:${runtimeId}`);
  const validated = await validateNativeRecipeV1(recipe);
  invariant(validated.ok, `amplified-evidence-recipe-invalid:${runtimeId}`);
  const parsed = parseFrmLikeV1(recipe.source);
  invariant(parsed.ok, `amplified-evidence-parse-invalid:${runtimeId}`);
  invariant(
    canonicalizeFrmLikeV1(parsed.ir) === recipe.source,
    `amplified-evidence-source-noncanonical:${runtimeId}`,
  );
  const compiled = compileFrmLikeV1Backend(parsed.ir);
  invariant(compiled.ok, `amplified-evidence-backend-invalid:${runtimeId}`);
  const metadata = getFormulaMetadata(runtimeId);
  invariant(metadata, `amplified-evidence-metadata-missing:${runtimeId}`);
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
    `amplified-evidence-preview-nondeterministic:${runtimeId}`,
  );
  invariant(
    first.uniqueColors >= 2 &&
      first.escapedPixels > 0 &&
      first.interiorPixels > 0 &&
      first.nonFinitePixels <= Math.floor((WIDTH * HEIGHT) / 50) &&
      !first.anomalies.includes("flat-preview") &&
      first.escapedPixels + first.interiorPixels + first.nonFinitePixels === WIDTH * HEIGHT,
    `amplified-evidence-preview-vacuous:${runtimeId}`,
  );
  const png = encodeDeterministicPng(WIDTH, HEIGHT, first.rgba);
  const crossCheckRow = crossCheck.get(recipe.formulaId as string);
  invariant(
    crossCheckRow?.ok === true &&
      crossCheckRow.v1WebglParity === "passed" &&
      isRecord(crossCheckRow.nativeCrossCheck) &&
      crossCheckRow.nativeCrossCheck.ok === true &&
      crossCheckRow.sourceRevision === validated.sourceRevision,
    `amplified-evidence-cross-check-row-invalid:${runtimeId}`,
  );
  const hold = NATIVE_RECIPE_HOLDS_V1.find(
    (candidate) => candidate.recipe.formulaId === recipe.formulaId,
  );
  invariant(
    hold && hold.holdClass !== "swiftshader-transcendental",
    `amplified-evidence-hold-class-invalid:${runtimeId}`,
  );
  const row: JsonRecord = {
    formulaId: recipe.formulaId,
    runtimeId,
    family: recipe.family,
    failureClass: hold.holdClass,
    technicalStatus: "passed",
    publicationDecision: "hold",
    sourceRevision: validated.sourceRevision,
    semanticHash: validated.semanticHash,
    numericRemedy: numericRemedy(runtimeId),
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
    schema: "fractalpark-b94-amplified-recovery-receipt/v1",
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
    receipt.schema === "fractalpark-b94-amplified-recovery-receipt/v1" &&
      receipt.deterministicDoubleRender === true &&
      receipt.publicationEligible === false &&
      receipt.publicationDecisionMutation === false &&
      isRecord(receipt.row) &&
      receipt.row.formulaId === recipe.formulaId &&
      receipt.row.runtimeId === recipe.runtimeId,
    `amplified-evidence-receipt-invalid:${recipe.runtimeId}`,
  );
  verifyBindings(receipt.sourceBindings, "amplified-evidence-receipt-binding-invalid");
  const withoutHash = { ...receipt };
  delete withoutHash.contentHash;
  invariant(
    receipt.contentHash === sha256(canonicalJson(withoutHash)),
    `amplified-evidence-receipt-hash-invalid:${recipe.runtimeId}`,
  );
  const preview = receipt.row.preview;
  invariant(
    isRecord(preview) &&
      typeof preview.file === "string" &&
      typeof preview.pngSha256 === "string" &&
      preview.pngSha256 === sha256(readFileSync(join(outputDirectory, preview.file))),
    `amplified-evidence-preview-binding-invalid:${recipe.runtimeId}`,
  );
  return receipt;
}

function buildManifest(): { manifest: JsonRecord; bytes: Buffer } {
  verifyPublicationIsolation();
  const priorBatchManifest = verifyPriorBatchManifest();
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
    schema: "fractalpark-b94-amplified-recovery-evidence/v1",
    deterministic: true,
    publicationEligible: false,
    publicationDecisionMutation: false,
    gateProgress: {
      batchPassed: 9,
      aggregatePassed: 21,
      required: 21,
      publicationGateReleased: false,
    },
    dimensions: { width: WIDTH, height: HEIGHT },
    previewContract: {
      minimumUniqueColors: 2,
      requireEscapedAndInterior: true,
      maximumNonFiniteFraction: 0.02,
      nonFiniteMarkersRecordedNotHidden: true,
    },
    sourceBindings: sourceBindings([
      "scripts/generate-amplified-recovery-evidence.ts",
      priorBatchManifestRelative,
      crossCheckRelative,
    ]),
    priorBatchArtifact: {
      path: priorBatchManifestRelative,
      sha256: sha256(readFileSync(join(root, priorBatchManifestRelative))),
      contentHash: priorBatchManifest.contentHash,
      passed: 12,
    },
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
            "scripts/generate-amplified-recovery-evidence.ts",
            `--runtime=${runtimeId}`,
            "--write",
          ],
          { cwd: root, maxBuffer: 1024 * 1024 },
        );
        const result = JSON.parse(stdout) as unknown;
        invariant(
          isRecord(result) && result.ok === true && result.runtimeId === runtimeId,
          `amplified-evidence-worker-invalid:${runtimeId}`,
        );
      }
    }),
  );
}

async function writeCrossCheckReceipt(): Promise<void> {
  const command =
    "FRACTALPARK_RECIPE_EXTRA_PROBE=0,3.14159265 " +
    "FRACTALPARK_RECIPE_BATCH_FILE=src/engine/formulas/v1/native-recipes-b94-recovered-amplified.ts " +
    "npx tsx scripts/cross-check-native-recipes.ts";
  const { stdout } = await execFileAsync(
    "npx",
    ["tsx", "scripts/cross-check-native-recipes.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        FRACTALPARK_RECIPE_EXTRA_PROBE: "0,3.14159265",
        FRACTALPARK_RECIPE_BATCH_FILE:
          "src/engine/formulas/v1/native-recipes-b94-recovered-amplified.ts",
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const result = JSON.parse(stdout) as unknown;
  invariant(
    isRecord(result) &&
      result.ok === true &&
      result.recipes === 9 &&
      result.passed === 9 &&
      result.failed === 0,
    "amplified-evidence-cross-check-generation-invalid",
  );
  const receipt = {
    schema: "fractalpark-b94-amplified-cross-check/v1",
    command,
    environment: {
      webglApi: "WebGL 1",
      rendererPolicy: "SwiftShader required by both harness legs",
    },
    publicationEligible: false,
    publicationDecisionMutation: false,
    sourceBindings: sourceBindings(CROSS_CHECK_SOURCE_PATHS),
    result,
  };
  writeFileSync(
    join(root, crossCheckRelative),
    Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
  );
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const writeAll = process.argv.includes("--write-all");
  const runtimeArg = process.argv.find((argument) => argument.startsWith("--runtime="));
  const runtimeId = runtimeArg?.slice("--runtime=".length);
  mkdirSync(outputDirectory, { recursive: true });

  if (writeAll) {
    await writeCrossCheckReceipt();
    await writeAllFormulaReceipts();
    const built = buildManifest();
    writeFileSync(join(root, manifestRelative), built.bytes);
    invariant(
      JSON.stringify(readdirSync(outputDirectory).sort()) ===
        JSON.stringify(expectedOutputSet()),
      "amplified-evidence-output-set-invalid",
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
    invariant(recipe, `amplified-evidence-runtime-invalid:${runtimeId}`);
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
        `amplified-evidence-runtime-drift:${runtimeId}`,
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
      "amplified-evidence-manifest-drift",
    );
  invariant(
    JSON.stringify(readdirSync(outputDirectory).sort()) === JSON.stringify(expectedOutputSet()),
    "amplified-evidence-output-set-invalid",
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
