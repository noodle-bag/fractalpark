import { readFileSync } from "node:fs";
import { join } from "node:path";

import liveCensusAsset from "../resources/formula-library/v1/julia-capability-census.v1.json";
import finalAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import { matchesSealedJuliaReleaseSourceBindings } from "./lib/julia-pre-gpu-release-source-bindings";
import {
  JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1,
  JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalCapabilityCensusV1,
  type JuliaFinalCapabilityRowV1,
} from "../src/engine/formulas/v1/julia-final-capability";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import {
  parseJuliaRendererEvidenceV1,
  type JuliaRendererEvidenceRowV1,
} from "../src/engine/formulas/v1/julia-renderer-evidence";
import { sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function preGpuProofTiers(disposition: string): {
  tier0: boolean;
  tier1: boolean;
} {
  if (
    disposition === "existing-system-c-tier1-blocked" ||
    disposition === "source-split-tier1-blocked"
  ) {
    return { tier0: true, tier1: false };
  }
  return { tier0: false, tier1: false };
}

const final = parseJuliaFinalCapabilityCensusV1(finalAsset);
const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
const renderer = parseJuliaRendererEvidenceV1(rendererAsset);
invariant(final.ok, "julia-final-release-sealed-invalid");
invariant(preGpu.ok, "julia-final-release-pre-gpu-invalid");
invariant(renderer.ok, "julia-final-release-renderer-invalid");

const currentBindings = Object.freeze(
  Object.fromEntries(
    JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
      relativePath,
      sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
    ]),
  ),
);
invariant(
  matchesSealedJuliaReleaseSourceBindings(
    final.value.sourceBindings,
    currentBindings,
    readFileSync(join(ROOT, "package.json"), "utf8"),
    readFileSync(join(ROOT, "package-lock.json"), "utf8"),
  ),
  "julia-final-release-source-binding-invalid",
);
invariant(
  final.value.liveCensusContentHash === liveCensusAsset.contentHash &&
    final.value.preGpuContentHash === preGpu.value.contentHash &&
    final.value.preGpuRowMapContentHash === preGpu.value.rowMapContentHash &&
    final.value.rendererEvidenceContentHash === renderer.value.contentHash &&
    renderer.value.preGpuContentHash === preGpu.value.contentHash &&
    renderer.value.preGpuRowMapContentHash === preGpu.value.rowMapContentHash,
  "julia-final-release-authority-drift",
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
  "julia-final-release-renderer-row-set-invalid",
);

const expectedRows: JuliaFinalCapabilityRowV1[] = preGpu.value.rows.map(
  (row): JuliaFinalCapabilityRowV1 => {
    const rendererRow: JuliaRendererEvidenceRowV1 | undefined =
      rendererById.get(row.formulaId);
    if (row.disposition === "tier2-pending") {
      invariant(
        rendererRow &&
          rendererRow.evaluatedSourceRevision === row.evaluatedSourceRevision &&
          rendererRow.evaluatedSemanticHash === row.evaluatedSemanticHash &&
          rendererRow.bindingRevision === row.bindingRevision &&
          rendererRow.lane === row.lane &&
          rendererRow.modeClass === row.modeClass,
        `julia-final-release-renderer-row-drift:${row.formulaId}`,
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
      `julia-final-release-unexpected-renderer-row:${row.formulaId}`,
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
expectedRows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
invariant(
  expectedRows.length === JULIA_FINAL_CAPABILITY_CENSUS_ROW_COUNT_V1 &&
    JSON.stringify(expectedRows) === JSON.stringify(final.value.rows),
  "julia-final-release-row-drift",
);

console.log(
  `PASS: ${expectedRows.length} Julia final capability rows exact; reviewed 0.4.20 metadata transition only`,
);
