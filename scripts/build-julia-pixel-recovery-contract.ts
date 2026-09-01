import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import liveCensusAsset from "../resources/formula-library/v1/julia-capability-census.v1.json";
import finalV1Asset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import {
  JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import {
  JULIA_PIXEL_ACTIVATION_HANDOFF_CONTRACT_V1,
  JULIA_PIXEL_RECOVERY_AUTHORITY_LIFECYCLE_V1,
  JULIA_PIXEL_RECOVERY_BASELINE_REPOSITORY_REVISION_V1,
  JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1,
  JULIA_PIXEL_RECOVERY_CONTRACT_SCHEMA_V1,
  JULIA_PIXEL_RECOVERY_DIMENSIONS_V1,
  JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1,
  JULIA_PIXEL_RECOVERY_FINAL_V1_CONTENT_HASH_V1,
  JULIA_PIXEL_RECOVERY_LEGAL_MATRIX_V1,
  JULIA_PIXEL_RECOVERY_LIVE_CENSUS_CONTENT_HASH_V1,
  JULIA_PIXEL_RECOVERY_PRE_GPU_CONTENT_HASH_V1,
  JULIA_PIXEL_RECOVERY_RENDERER_CONTENT_HASH_V1,
  JULIA_PIXEL_RECOVERY_ROW_COUNT_V1,
  JULIA_PIXEL_RECOVERY_RUNTIME_INDEX_SHA256_V1,
  parseJuliaPixelRecoveryContractV1,
} from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const CANONICAL_NODE_BUDGET = 262_144;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const JULIA_PIXEL_RECOVERY_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "docs/specs/julia-pixel-two-plane-introduction-workflow-v1.md",
  "package-lock.json",
  "package.json",
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json",
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "scripts/build-julia-pixel-recovery-contract.ts",
  "scripts/generate-julia-pixel-blind-holdout.ts",
  "scripts/seal-julia-pixel-blind-holdout-state.ts",
  "scripts/transition-julia-pixel-holdout-attempt-ledger.ts",
  "scripts/verify-julia-pixel-blind-holdout.ts",
  "scripts/verify-julia-pixel-recovery-contract.ts",
  "src/engine/frm/v1.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-renderer-evidence.ts",
  "src/engine/formulas/v1/julia-pixel-changed-region.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/test/fixtures/julia-pixel-recovery-v1.ts",
  "tsconfig.json",
] as const);

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path: string): JsonRecord {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), `julia-pixel-contract-json-invalid:${path}`);
  return value;
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      JULIA_PIXEL_RECOVERY_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
        relativePath,
        sha256(readFileSync(join(ROOT, relativePath))),
      ]),
    ),
  );
}

function holdoutContract(bindings: Readonly<Record<string, string>>) {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/verify-julia-pixel-blind-holdout.ts"],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  invariant(
    result.status === 0 &&
      typeof result.stdout === "string" &&
      result.stdout.trim().split("\n").length === 1,
    "julia-pixel-contract-holdout-verifier-failed",
  );
  const holdout: unknown = JSON.parse(result.stdout.trim());
  invariant(
    record(holdout) &&
      holdout.ok === true &&
      holdout.generatorRevision ===
        bindings["scripts/generate-julia-pixel-blind-holdout.ts"] &&
      holdout.stateSealerRevision ===
        bindings["scripts/seal-julia-pixel-blind-holdout-state.ts"] &&
      holdout.verifierRevision ===
        bindings["scripts/verify-julia-pixel-blind-holdout.ts"] &&
      typeof holdout.sealedCorpusDigest === "string" &&
      SHA256.test(holdout.sealedCorpusDigest) &&
      typeof holdout.caseKeySetDigest === "string" &&
      SHA256.test(holdout.caseKeySetDigest) &&
      Number.isSafeInteger(holdout.caseCount) &&
      (holdout.caseCount as number) > 0 &&
      Array.isArray(holdout.historicalCorpusDigests) &&
      Array.isArray(holdout.historicalGeneratorRevisions) &&
      Array.isArray(holdout.historicalCaseKeySetDigests) &&
      Array.isArray(holdout.historicalCaseCounts) &&
      holdout.caseKeyIntersectionCount === 0 &&
      typeof holdout.historyManifestDigest === "string" &&
      SHA256.test(holdout.historyManifestDigest) &&
      typeof holdout.attemptLedgerDigest === "string" &&
      SHA256.test(holdout.attemptLedgerDigest) &&
      holdout.attemptCount === 0,
    "julia-pixel-contract-holdout-invalid",
  );
  return Object.freeze({
    schema: "fractalpark-julia-pixel-blind-holdout-contract/v1" as const,
    generatorRevision: holdout.generatorRevision,
    verifierRevision: holdout.verifierRevision,
    stateSealerRevision: holdout.stateSealerRevision,
    attemptTransitionRevision:
      bindings["scripts/transition-julia-pixel-holdout-attempt-ledger.ts"],
    historySchema: "fractalpark-julia-pixel-blind-holdout-history/v1" as const,
    attemptLedgerSchema:
      "fractalpark-julia-pixel-holdout-attempt-ledger/v1" as const,
    candidateManifestSchema:
      "fractalpark-julia-pixel-candidate-manifest/v1" as const,
    attemptManifestSchema:
      "fractalpark-julia-pixel-holdout-attempt-manifest/v1" as const,
    attemptReceiptSchema:
      "fractalpark-julia-pixel-holdout-attempt-receipt/v1" as const,
    transitionStates: Object.freeze([
      "pre-candidate",
      "wave-frozen",
      "sealed",
    ] as const),
    sealedCorpusDigest: holdout.sealedCorpusDigest,
    caseKeySetDigest: holdout.caseKeySetDigest,
    caseCount: holdout.caseCount,
    historicalCorpusDigests: Object.freeze(holdout.historicalCorpusDigests),
    historicalGeneratorRevisions: Object.freeze(
      holdout.historicalGeneratorRevisions,
    ),
    historicalCaseKeySetDigests: Object.freeze(
      holdout.historicalCaseKeySetDigests,
    ),
    historicalCaseCounts: Object.freeze(holdout.historicalCaseCounts),
    caseKeyIntersectionCount: 0 as const,
    historyManifestDigest: holdout.historyManifestDigest,
    attemptLedgerDigest: holdout.attemptLedgerDigest,
    attemptCount: 0 as const,
    maximumAttemptsPerRowPerWave: 1 as const,
    disclosure: "schema-revisions-digests-counts-and-verdict-only" as const,
  });
}

function buildArtifact() {
  const runtime = readJson(RUNTIME_INDEX_PATH);
  invariant(
    runtime.schema === "fractalpark-published-formula-runtime-index/v1" &&
      runtime.rowCount === JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 &&
      Array.isArray(runtime.rows) &&
      runtime.rows.length === JULIA_PIXEL_RECOVERY_ROW_COUNT_V1,
    "julia-pixel-contract-runtime-invalid",
  );
  invariant(
    sha256HexSyncV1(canonicalJsonV1(runtime, 131_072)) ===
      JULIA_PIXEL_RECOVERY_RUNTIME_INDEX_SHA256_V1,
    "julia-pixel-contract-runtime-drift",
  );
  const runtimeRows = runtime.rows as unknown[];
  const orderedFormulaIds = runtimeRows.map((row, index) => {
    invariant(record(row), "julia-pixel-contract-runtime-row-invalid");
    const previous = runtimeRows[index - 1];
    invariant(
      typeof row.formulaId === "string" &&
        UUID_V5.test(row.formulaId) &&
        (index === 0 ||
          (record(previous) &&
            typeof previous.formulaId === "string" &&
            previous.formulaId < row.formulaId)),
      "julia-pixel-contract-runtime-row-invalid",
    );
    return row.formulaId;
  });
  invariant(
    new Set(orderedFormulaIds).size === JULIA_PIXEL_RECOVERY_ROW_COUNT_V1,
    "julia-pixel-contract-runtime-set-invalid",
  );
  invariant(
    liveCensusAsset.contentHash === JULIA_PIXEL_RECOVERY_LIVE_CENSUS_CONTENT_HASH_V1 &&
      preGpuAsset.contentHash === JULIA_PIXEL_RECOVERY_PRE_GPU_CONTENT_HASH_V1 &&
      rendererAsset.contentHash === JULIA_PIXEL_RECOVERY_RENDERER_CONTENT_HASH_V1 &&
      finalV1Asset.contentHash === JULIA_PIXEL_RECOVERY_FINAL_V1_CONTENT_HASH_V1,
    "julia-pixel-contract-29g-lineage-drift",
  );
  const bindings = sourceBindings();
  const frozenHoldout = holdoutContract(bindings);
  const content = {
    schema: JULIA_PIXEL_RECOVERY_CONTRACT_SCHEMA_V1,
    revision: 1 as const,
    stage: "contract-frozen" as const,
    authorityState: "sealed" as const,
    baselineRepositoryRevision:
      JULIA_PIXEL_RECOVERY_BASELINE_REPOSITORY_REVISION_V1,
    lineage: {
      rowCount: JULIA_PIXEL_RECOVERY_ROW_COUNT_V1,
      runtimeIndexCanonicalSha256:
        JULIA_PIXEL_RECOVERY_RUNTIME_INDEX_SHA256_V1,
      orderedFormulaIds,
      orderedFormulaIdsDigest: sha256HexSyncV1(
        canonicalJsonV1(orderedFormulaIds, 4_096),
      ),
      liveCensusContentHash: JULIA_PIXEL_RECOVERY_LIVE_CENSUS_CONTENT_HASH_V1,
      preGpuContentHash: JULIA_PIXEL_RECOVERY_PRE_GPU_CONTENT_HASH_V1,
      rendererEvidenceContentHash:
        JULIA_PIXEL_RECOVERY_RENDERER_CONTENT_HASH_V1,
      finalCensusV1ContentHash:
        JULIA_PIXEL_RECOVERY_FINAL_V1_CONTENT_HASH_V1,
    },
    dimensions: JULIA_PIXEL_RECOVERY_DIMENSIONS_V1,
    legalMatrix: JULIA_PIXEL_RECOVERY_LEGAL_MATRIX_V1,
    baseEvidenceContract: JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1,
    baseEvidenceContractDigest: sha256HexSyncV1(
      canonicalJsonV1(JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1),
    ),
    e1SupplementContract: JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1,
    e1SupplementContractDigest: sha256HexSyncV1(
      canonicalJsonV1(JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1),
    ),
    changedRegionAnalyzer: {
      schema: JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1,
      revision: bindings["src/engine/formulas/v1/julia-pixel-changed-region.ts"]!,
      mapping: "source-diff-to-production-ir-node-and-def-use-region" as const,
      reachability: "path-sensitive-static-over-approximation" as const,
      unknownTreatment: "reachable" as const,
      uncoveredReachableOrUnknownMaximum: 0 as const,
    },
    holdoutContract: frozenHoldout,
    holdoutContractDigest: sha256HexSyncV1(canonicalJsonV1(frozenHoldout)),
    authorityLifecycle: JULIA_PIXEL_RECOVERY_AUTHORITY_LIFECYCLE_V1,
    handoffContract: JULIA_PIXEL_ACTIVATION_HANDOFF_CONTRACT_V1,
    sourceBindings: bindings,
  };
  const artifact = {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
  invariant(
    parseJuliaPixelRecoveryContractV1(artifact).ok,
    "julia-pixel-contract-self-invalid",
  );
  return artifact;
}

function writeAtomic(path: string, bytes: string): void {
  const temporary = `${path}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o644 });
  chmodSync(temporary, 0o644);
  try {
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function main(): void {
  const artifact = buildArtifact();
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) writeAtomic(OUTPUT_PATH, bytes);
  let current = false;
  try {
    const stat = lstatSync(OUTPUT_PATH);
    current =
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o644 &&
      readFileSync(OUTPUT_PATH, "utf8") === bytes;
  } catch {
    current = false;
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: current,
      write: process.argv.includes("--write"),
      output: OUTPUT_PATH.slice(dirname(ROOT).length + 1),
      rowCount: artifact.lineage.rowCount,
      orderedFormulaIdsDigest: artifact.lineage.orderedFormulaIdsDigest,
      baseEvidenceContractDigest: artifact.baseEvidenceContractDigest,
      e1SupplementContractDigest: artifact.e1SupplementContractDigest,
      holdoutContractDigest: artifact.holdoutContractDigest,
      contentHash: artifact.contentHash,
    })}\n`,
  );
  if (!current) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "julia-pixel-contract-build-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
