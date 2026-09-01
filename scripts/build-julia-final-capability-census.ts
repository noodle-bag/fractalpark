import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import liveCensusAsset from "../resources/formula-library/v1/julia-capability-census.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import {
  JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1,
  JULIA_FINAL_CAPABILITY_CENSUS_SCHEMA_V1,
  JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalCapabilityCensusV1,
  type JuliaFinalCapabilityRowV1,
} from "../src/engine/formulas/v1/julia-final-capability";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import {
  parseJuliaRendererEvidenceV1,
  type JuliaRendererEvidenceRowV1,
} from "../src/engine/formulas/v1/julia-renderer-evidence";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const RENDERER_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
);
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
);
const CANONICAL_NODE_BUDGET = 131_072;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
        relativePath,
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      ]),
    ),
  );
}

function preGpuProofTiers(disposition: string): {
  tier0: boolean;
  tier1: boolean;
} {
  if (disposition === "existing-system-c-tier1-blocked")
    return { tier0: true, tier1: false };
  if (disposition === "source-split-tier1-blocked")
    return { tier0: true, tier1: false };
  return { tier0: false, tier1: false };
}

function buildArtifact() {
  const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
  invariant(preGpu.ok, "julia-final-pre-gpu-invalid");
  const renderer = parseJuliaRendererEvidenceV1(
    JSON.parse(readFileSync(RENDERER_PATH, "utf8")),
  );
  invariant(renderer.ok, "julia-final-renderer-evidence-invalid");
  invariant(
    renderer.value.preGpuContentHash === preGpu.value.contentHash &&
      renderer.value.preGpuRowMapContentHash === preGpu.value.rowMapContentHash,
    "julia-final-renderer-authority-drift",
  );
  const rendererById = new Map(
    renderer.value.rows.map((row) => [row.formulaId, row]),
  );
  const expectedRendererIds = preGpu.value.rows
    .filter((row) => row.disposition === "tier2-pending")
    .map((row) => row.formulaId)
    .sort();
  invariant(
    expectedRendererIds.length === rendererById.size &&
      expectedRendererIds.every((formulaId) => rendererById.has(formulaId)),
    "julia-final-renderer-row-set-invalid",
  );
  const rows: JuliaFinalCapabilityRowV1[] = preGpu.value.rows.map(
    (row): JuliaFinalCapabilityRowV1 => {
      const rendererRow: JuliaRendererEvidenceRowV1 | undefined =
        rendererById.get(row.formulaId);
      if (row.disposition === "tier2-pending") {
        invariant(
          rendererRow &&
            rendererRow.evaluatedSourceRevision ===
              row.evaluatedSourceRevision &&
            rendererRow.evaluatedSemanticHash === row.evaluatedSemanticHash &&
            rendererRow.bindingRevision === row.bindingRevision &&
            rendererRow.lane === row.lane &&
            rendererRow.modeClass === row.modeClass,
          `julia-final-renderer-row-drift:${row.formulaId}`,
        );
        const supported = rendererRow.status === "passed";
        return {
          formulaId: row.formulaId,
          baselineSourceRevision: row.baselineSourceRevision,
          evaluatedSourceRevision: row.evaluatedSourceRevision,
          evaluatedSemanticHash: row.evaluatedSemanticHash,
          status: supported ? "supported" : "blocked",
          lane: row.lane,
          modeClass: row.modeClass,
          contract: row.contract,
          bindingRevision: row.bindingRevision,
          profileDigest: rendererRow.profileDigest,
          preGpuEvidenceContentHash: preGpu.value.contentHash,
          tier2EvidenceContentHash: renderer.value.contentHash,
          tier3ScopeId: "fractalpark-julia-tier3-scope/v1",
          technicalAuthor: "ellie",
          independentReviewer: "codex-cli",
          proofTiers: {
            tier0: true,
            tier1: true,
            tier2: supported,
            tier3PhysicalDevice: false,
          },
          crossDeviceGuarantee: false,
          activationEligible: supported,
          nextRequiredEvidence: supported
            ? "29h-product-activation-and-tier3-physical-device-sampling"
            : "tier2-remediation-or-revision",
        };
      }
      invariant(
        !rendererRow,
        `julia-final-unexpected-renderer-row:${row.formulaId}`,
      );
      const proofTiers = preGpuProofTiers(row.disposition);
      return {
        formulaId: row.formulaId,
        baselineSourceRevision: row.baselineSourceRevision,
        evaluatedSourceRevision: row.evaluatedSourceRevision,
        evaluatedSemanticHash: row.evaluatedSemanticHash,
        status: row.status,
        lane: row.lane,
        modeClass: row.modeClass,
        contract: row.contract,
        bindingRevision: row.bindingRevision,
        profileDigest: null,
        preGpuEvidenceContentHash: preGpu.value.contentHash,
        tier2EvidenceContentHash: null,
        tier3ScopeId: "fractalpark-julia-tier3-scope/v1",
        technicalAuthor: "ellie",
        independentReviewer: "codex-cli",
        proofTiers: {
          tier0: proofTiers.tier0,
          tier1: proofTiers.tier1,
          tier2: false,
          tier3PhysicalDevice: false,
        },
        crossDeviceGuarantee: false,
        activationEligible: false,
        nextRequiredEvidence: row.nextRequiredEvidence,
      };
    },
  );
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  invariant(
    rows.length === JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1 &&
      new Set(rows.map((row) => row.formulaId)).size === rows.length,
    "julia-final-row-set-invalid",
  );
  const supportedRows = rows.filter((row) => row.status === "supported");
  const content = {
    schema: JULIA_FINAL_CAPABILITY_CENSUS_SCHEMA_V1,
    revision: 1 as const,
    stage: "final-verified-census" as const,
    activationStatus: "inactive-awaiting-29h" as const,
    liveCensusContentHash: liveCensusAsset.contentHash,
    preGpuContentHash: preGpu.value.contentHash,
    preGpuRowMapContentHash: preGpu.value.rowMapContentHash,
    rendererEvidenceContentHash: renderer.value.contentHash,
    sourceBindings: sourceBindings(),
    tier3Scope: {
      schema: "fractalpark-julia-tier3-scope/v1" as const,
      status: "pending-physical-device-evidence" as const,
      physicalDeviceSampleCount: 0 as const,
      crossDeviceGuarantee: false as const,
    },
    rowCount: JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1,
    statusCounts: {
      supported: supportedRows.length,
      unknown: rows.filter((row) => row.status === "unknown").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      notApplicable: rows.filter((row) => row.status === "not-applicable")
        .length,
    },
    supportedCounts: {
      classic: supportedRows.filter((row) => row.modeClass === "classic-julia")
        .length,
      generalized: supportedRows.filter(
        (row) => row.modeClass === "generalized-two-plane",
      ).length,
      existingSystemC: supportedRows.filter(
        (row) => row.lane === "existing-system-c",
      ).length,
      parameterBinding: supportedRows.filter(
        (row) => row.lane === "parameter-binding",
      ).length,
      sourceSplit: supportedRows.filter((row) => row.lane === "source-split")
        .length,
    },
    rows,
  };
  const artifact = {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
  invariant(
    parseJuliaFinalCapabilityCensusV1(artifact).ok,
    "julia-final-artifact-invalid",
  );
  return artifact;
}

function main(): void {
  const artifact = buildArtifact();
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temporaryPath = `${OUTPUT_PATH}.tmp`;
    writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o644 });
    renameSync(temporaryPath, OUTPUT_PATH);
    process.stdout.write(
      `wrote ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.statusCounts.supported} supported, ${artifact.statusCounts.unknown} unknown, ${artifact.statusCounts.blocked} blocked)\n`,
    );
    return;
  }
  invariant(
    readFileSync(OUTPUT_PATH, "utf8") === serialized,
    "julia-final-census-drift",
  );
  process.stdout.write(
    `verified ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.statusCounts.supported} supported, ${artifact.statusCounts.unknown} unknown, ${artifact.statusCounts.blocked} blocked)\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown-error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
