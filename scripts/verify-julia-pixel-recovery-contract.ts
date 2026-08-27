import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ASSET_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXPECTED_BINDINGS = Object.freeze([
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
]);
const EXPECTED_ROLES = Object.freeze([
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
]);
const EXPECTED_MODES = Object.freeze([
  "classic-julia",
  "generalized-two-plane",
  "undetermined",
  "not-applicable",
]);
const EXPECTED_SUPPORT_LANES = Object.freeze([
  "existing-system-c",
  "parameter-binding",
  "source-split-direct",
  "source-split-transitive",
  "state-separated",
  "none",
]);
const EXPECTED_REMEDIATION_LANES = Object.freeze([
  "none",
  "canonical-rebind",
  "role-discovery",
  "mutable-state-separation",
  "tier1-numeric-diagnosis",
  "renderer-diagnosis",
  "identity-review",
]);
const EXPECTED_REWRITES = Object.freeze([
  "none",
  "E0-operational-equivalence",
  "E1-mathematical-identity",
  "identity-change",
]);
const EXPECTED_STATUSES = Object.freeze([
  "supported",
  "held",
  "unknown",
  "blocked",
  "not-applicable",
]);

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => typeof key === "string") &&
    [...(keys as string[])].sort().join("|") === [...expected].sort().join("|")
  );
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "julia-pixel-contract-verify-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  invariant(record(value), "julia-pixel-contract-verify-canonical-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path: string): JsonRecord {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), `julia-pixel-contract-verify-json-invalid:${path}`);
  return value;
}

function arrayEqual(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function safeHoldoutReceipt(): JsonRecord {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/verify-julia-pixel-blind-holdout.ts"],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  invariant(
    result.status === 0 && typeof result.stdout === "string",
    "julia-pixel-contract-verify-holdout-command-failed",
  );
  const lines = result.stdout.trim().split("\n");
  invariant(lines.length === 1, "julia-pixel-contract-verify-holdout-output-invalid");
  const value: unknown = JSON.parse(lines[0]!);
  invariant(record(value) && value.ok === true, "julia-pixel-contract-verify-holdout-invalid");
  return value;
}

function verify(): void {
  const stat = lstatSync(ASSET_PATH);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o644,
    "julia-pixel-contract-verify-file-invalid",
  );
  const asset = readJson(ASSET_PATH);
  invariant(
    exactKeys(asset, [
      "schema",
      "revision",
      "stage",
      "authorityState",
      "baselineRepositoryRevision",
      "lineage",
      "dimensions",
      "legalMatrix",
      "baseEvidenceContract",
      "baseEvidenceContractDigest",
      "e1SupplementContract",
      "e1SupplementContractDigest",
      "changedRegionAnalyzer",
      "holdoutContract",
      "holdoutContractDigest",
      "authorityLifecycle",
      "handoffContract",
      "sourceBindings",
      "contentHash",
    ]) &&
      asset.schema === "fractalpark-julia-pixel-recovery-contract/v1" &&
      asset.revision === 1 &&
      asset.stage === "contract-frozen" &&
      asset.authorityState === "sealed" &&
      asset.baselineRepositoryRevision ===
        "138d1e7f6c78b2d9aedb2811e01bcdb42cad757c" &&
      typeof asset.contentHash === "string" &&
      SHA256.test(asset.contentHash),
    "julia-pixel-contract-verify-header-invalid",
  );
  const unsigned = { ...asset };
  delete unsigned.contentHash;
  invariant(
    asset.contentHash === sha256(canonical(unsigned)),
    "julia-pixel-contract-verify-content-hash-invalid",
  );

  invariant(record(asset.sourceBindings), "julia-pixel-contract-verify-bindings-invalid");
  invariant(
    arrayEqual(Object.keys(asset.sourceBindings), EXPECTED_BINDINGS),
    "julia-pixel-contract-verify-binding-set-invalid",
  );
  for (const relativePath of EXPECTED_BINDINGS) {
    const expected = sha256(readFileSync(join(ROOT, relativePath)));
    invariant(
      asset.sourceBindings[relativePath] === expected,
      `julia-pixel-contract-verify-binding-drift:${relativePath}`,
    );
  }

  const runtime = readJson(RUNTIME_INDEX_PATH);
  invariant(
    runtime.schema === "fractalpark-published-formula-runtime-index/v1" &&
      runtime.rowCount === 534 &&
      Array.isArray(runtime.rows) &&
      runtime.rows.length === 534,
    "julia-pixel-contract-verify-runtime-invalid",
  );
  invariant(
    sha256(canonical(runtime)) ===
      "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5",
    "julia-pixel-contract-verify-runtime-digest-invalid",
  );
  const runtimeRows = runtime.rows as unknown[];
  const ids = runtimeRows.map((row, index) => {
    invariant(
      record(row) && typeof row.formulaId === "string",
      "julia-pixel-contract-verify-runtime-row-invalid",
    );
    const previous = runtimeRows[index - 1];
    invariant(
      UUID_V5.test(row.formulaId) &&
        (index === 0 ||
          (record(previous) &&
            typeof previous.formulaId === "string" &&
            previous.formulaId < row.formulaId)),
      "julia-pixel-contract-verify-runtime-row-invalid",
    );
    return row.formulaId;
  });
  invariant(new Set(ids).size === 534, "julia-pixel-contract-verify-runtime-set-invalid");
  invariant(record(asset.lineage), "julia-pixel-contract-verify-lineage-invalid");
  invariant(
    asset.lineage.rowCount === 534 &&
      asset.lineage.runtimeIndexCanonicalSha256 ===
        "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5" &&
      canonical(asset.lineage.orderedFormulaIds) === canonical(ids) &&
      asset.lineage.orderedFormulaIdsDigest === sha256(canonical(ids)) &&
      asset.lineage.liveCensusContentHash ===
        "e079815c5e8f865608dc6ec52121bbbe47857f2c2ecb9000080602ab5e54f197" &&
      asset.lineage.preGpuContentHash ===
        "bd272c801ec22f7709bcc32213e72ec7402369804fa14df0209dd165dd804fe8" &&
      asset.lineage.rendererEvidenceContentHash ===
        "650e19ec8915fec8ffe4b690411c3e28305ae12ce1766115f8f01cccda186db2" &&
      asset.lineage.finalCensusV1ContentHash ===
        "1de7daa2195d9737e72135f7f4251c5d08e800060e459b4170825294427f36a0",
    "julia-pixel-contract-verify-lineage-invalid",
  );

  invariant(record(asset.dimensions), "julia-pixel-contract-verify-dimensions-invalid");
  invariant(
    arrayEqual(asset.dimensions.roles, EXPECTED_ROLES) &&
      arrayEqual(asset.dimensions.modeClasses, EXPECTED_MODES) &&
      arrayEqual(asset.dimensions.supportLanes, EXPECTED_SUPPORT_LANES) &&
      arrayEqual(asset.dimensions.remediationLanes, EXPECTED_REMEDIATION_LANES) &&
      arrayEqual(asset.dimensions.rewriteClasses, EXPECTED_REWRITES) &&
      arrayEqual(asset.dimensions.finalStatuses, EXPECTED_STATUSES),
    "julia-pixel-contract-verify-dimensions-invalid",
  );
  invariant(record(asset.legalMatrix), "julia-pixel-contract-verify-matrix-invalid");
  invariant(
    asset.legalMatrix.candidateFinalStatusForbidden === true &&
      asset.legalMatrix.unknownReachabilityTreatedAs === "reachable" &&
      arrayEqual(asset.legalMatrix.finalInputsAllowedAuthorityStates, ["sealed"]) &&
      arrayEqual(asset.legalMatrix.perIdPolicyFieldsForbidden, [
        "threshold",
        "thresholds",
        "tolerance",
        "tolerances",
        "whitelist",
        "allowlist",
      ]),
    "julia-pixel-contract-verify-matrix-invalid",
  );

  invariant(
    record(asset.baseEvidenceContract) &&
      asset.baseEvidenceContractDigest === sha256(canonical(asset.baseEvidenceContract)) &&
      record(asset.baseEvidenceContract.tier1) &&
      canonical(asset.baseEvidenceContract.tier1.points) ===
        canonical([[-0.35, 0.2], [0.12, -0.28], [0.43, 0.11]]) &&
      canonical(asset.baseEvidenceContract.tier1.constants) ===
        canonical([[-0.7, 0.27], [0.285, 0.01], [-0.1542022, 0.6137691]]) &&
      canonical(asset.baseEvidenceContract.tier1.depths) ===
        canonical([1, 2, 4, 8, 16, 32, 64, 128]) &&
      record(asset.baseEvidenceContract.tier2) &&
      asset.baseEvidenceContract.tier2.api === "WebGL2" &&
      asset.baseEvidenceContract.tier2.rendererClass === "SwiftShader-software" &&
      asset.baseEvidenceContract.tier2.relativeTolerance === 0.005 &&
      record(asset.baseEvidenceContract.tier2.trace) &&
      asset.baseEvidenceContract.tier2.trace.orbitSteps === 128 &&
      asset.baseEvidenceContract.tier2.trace.stateDimensions === 18 &&
      record(asset.baseEvidenceContract.tier2.image) &&
      asset.baseEvidenceContract.tier2.image.pixelComparisons === 96 &&
      asset.baseEvidenceContract.tier2.image.minimumDifferingPixels === 1,
    "julia-pixel-contract-verify-base-evidence-invalid",
  );

  invariant(
    record(asset.e1SupplementContract) &&
      asset.e1SupplementContractDigest ===
        sha256(canonical(asset.e1SupplementContract)) &&
      asset.e1SupplementContract.absoluteTolerance === 0.000001 &&
      asset.e1SupplementContract.relativeTolerance === 0.0005 &&
      asset.e1SupplementContract.maximumNormalizedComponentError === 1 &&
      asset.e1SupplementContract.maximumMeanNormalizedComponentError === 0.25 &&
      asset.e1SupplementContract.terminalEventExact === true &&
      asset.e1SupplementContract.completedStepExact === true &&
      asset.e1SupplementContract.terminalClassExact === true &&
      asset.e1SupplementContract.perIdOverridesAllowed === false,
    "julia-pixel-contract-verify-e1-invalid",
  );

  invariant(
    record(asset.changedRegionAnalyzer) &&
      asset.changedRegionAnalyzer.schema ===
        "fractalpark-julia-pixel-changed-region-analyzer/v1" &&
      asset.changedRegionAnalyzer.revision ===
        asset.sourceBindings["src/engine/formulas/v1/julia-pixel-changed-region.ts"] &&
      asset.changedRegionAnalyzer.unknownTreatment === "reachable" &&
      asset.changedRegionAnalyzer.uncoveredReachableOrUnknownMaximum === 0,
    "julia-pixel-contract-verify-analyzer-invalid",
  );

  const holdout = safeHoldoutReceipt();
  invariant(record(asset.holdoutContract), "julia-pixel-contract-verify-holdout-invalid");
  invariant(
    asset.holdoutContractDigest === sha256(canonical(asset.holdoutContract)) &&
      asset.holdoutContract.generatorRevision === holdout.generatorRevision &&
      asset.holdoutContract.verifierRevision === holdout.verifierRevision &&
      asset.holdoutContract.stateSealerRevision === holdout.stateSealerRevision &&
      asset.holdoutContract.attemptTransitionRevision ===
        asset.sourceBindings[
          "scripts/transition-julia-pixel-holdout-attempt-ledger.ts"
        ] &&
      asset.holdoutContract.historySchema ===
        "fractalpark-julia-pixel-blind-holdout-history/v1" &&
      asset.holdoutContract.attemptLedgerSchema ===
        "fractalpark-julia-pixel-holdout-attempt-ledger/v1" &&
      asset.holdoutContract.candidateManifestSchema ===
        "fractalpark-julia-pixel-candidate-manifest/v1" &&
      asset.holdoutContract.attemptManifestSchema ===
        "fractalpark-julia-pixel-holdout-attempt-manifest/v1" &&
      asset.holdoutContract.attemptReceiptSchema ===
        "fractalpark-julia-pixel-holdout-attempt-receipt/v1" &&
      canonical(asset.holdoutContract.transitionStates) ===
        canonical(["pre-candidate", "wave-frozen", "sealed"]) &&
      asset.holdoutContract.sealedCorpusDigest === holdout.sealedCorpusDigest &&
      asset.holdoutContract.caseKeySetDigest === holdout.caseKeySetDigest &&
      asset.holdoutContract.caseCount === holdout.caseCount &&
      canonical(asset.holdoutContract.historicalCorpusDigests) ===
        canonical(holdout.historicalCorpusDigests) &&
      canonical(asset.holdoutContract.historicalGeneratorRevisions) ===
        canonical(holdout.historicalGeneratorRevisions) &&
      canonical(asset.holdoutContract.historicalCaseKeySetDigests) ===
        canonical(holdout.historicalCaseKeySetDigests) &&
      canonical(asset.holdoutContract.historicalCaseCounts) ===
        canonical(holdout.historicalCaseCounts) &&
      asset.holdoutContract.caseKeyIntersectionCount === 0 &&
      holdout.caseKeyIntersectionCount === 0 &&
      asset.holdoutContract.historyManifestDigest ===
        holdout.historyManifestDigest &&
      asset.holdoutContract.attemptLedgerDigest === holdout.attemptLedgerDigest &&
      asset.holdoutContract.attemptCount === 0 &&
      holdout.attemptCount === 0 &&
      asset.holdoutContract.maximumAttemptsPerRowPerWave === 1,
    "julia-pixel-contract-verify-holdout-invalid",
  );

  invariant(
    record(asset.authorityLifecycle) &&
      asset.authorityLifecycle.immutable === true &&
      asset.authorityLifecycle.mutableTransitionsForbidden === true &&
      asset.authorityLifecycle.finalInputState === "sealed" &&
      record(asset.handoffContract) &&
      arrayEqual(asset.handoffContract.states, ["review-pending", "activation-eligible"]) &&
      asset.handoffContract.consumerState === "activation-eligible" &&
      asset.handoffContract.consumerBinding ===
        "not-available-until-7E-H-independent-receipt-and-source-authority-verifier" &&
      asset.handoffContract.censusMutationForAcknowledgmentForbidden === true,
    "julia-pixel-contract-verify-authority-invalid",
  );

  const serialized = JSON.stringify(asset);
  invariant(
    !serialized.includes('"candidate"') &&
      !serialized.includes('"whitelist":') &&
      !serialized.includes('"allowlist":') &&
      !serialized.includes('"perIdThreshold') &&
      !serialized.includes('"perIdTolerance'),
    "julia-pixel-contract-verify-policy-shape-invalid",
  );
}

try {
  verify();
  const asset = readJson(ASSET_PATH);
  const lineage = asset.lineage as JsonRecord;
  const holdout = asset.holdoutContract as JsonRecord;
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      rowCount: lineage.rowCount,
      orderedFormulaIdsDigest: lineage.orderedFormulaIdsDigest,
      baseEvidenceContractDigest: asset.baseEvidenceContractDigest,
      e1SupplementContractDigest: asset.e1SupplementContractDigest,
      holdoutContractDigest: asset.holdoutContractDigest,
      sealedCorpusDigest: holdout.sealedCorpusDigest,
      caseKeySetDigest: holdout.caseKeySetDigest,
      caseKeyIntersectionCount: holdout.caseKeyIntersectionCount,
      contentHash: asset.contentHash,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "julia-pixel-contract-independent-verification-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
