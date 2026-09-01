import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import finalAsset from "../../resources/formula-library/v1/julia-final-capability-census.v1.json";
import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import rendererAsset from "../../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import runtimeAsset from "../../public/formula-library/v1/runtime/published/index.json";
import {
  JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalCapabilityCensusV1,
} from "../engine/formulas/v1/julia-final-capability";
import {
  parseJuliaPreGpuCapabilityCensusV1,
  type JuliaPreGpuCapabilityRowV1,
} from "../engine/formulas/v1/julia-pre-gpu-capability";
import {
  buildJuliaRendererProfileV1,
  JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1,
  JULIA_RENDERER_SOURCE_BINDING_PATHS_V1,
  parseJuliaRendererEvidenceV1,
} from "../engine/formulas/v1/julia-renderer-evidence";
import { parsePublishedFormulaRuntimeIndexV1 } from "../engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";

const ROOT = process.cwd();

function sha256(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(ROOT, relativePath), "utf8"))
    .digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rehash<T extends { contentHash: string }>(value: T): T {
  const { contentHash: _contentHash, ...content } = value;
  void _contentHash;
  value.contentHash = sha256HexSyncV1(canonicalJsonV1(content, 10_000_000));
  return value;
}

describe("Julia renderer evidence closure", () => {
  it("parses source-bound Tier 2 evidence for the exact pre-GPU authority set", () => {
    const renderer = parseJuliaRendererEvidenceV1(rendererAsset);
    const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
    const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
    expect(renderer.ok).toBe(true);
    expect(preGpu.ok).toBe(true);
    expect(runtime.ok).toBe(true);
    if (!renderer.ok || !preGpu.ok || !runtime.ok) return;

    const expectedRows = preGpu.value.rows
      .filter((row) => row.disposition === "tier2-pending")
      .sort((left, right) => left.formulaId.localeCompare(right.formulaId));
    expect(expectedRows).toHaveLength(185);
    expect(renderer.value.rows.map((row) => row.formulaId)).toEqual(
      expectedRows.map((row) => row.formulaId),
    );
    expect(renderer.value.statusCounts.passed).toBeGreaterThan(0);
    expect(renderer.value.integrationWitnessFormulaIds).toEqual(
      JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1,
    );
    expect(renderer.value.integrationWitnessCount).toBe(1);
    expect(
      renderer.value.statusCounts.passed + renderer.value.statusCounts.blocked,
    ).toBe(185);
    expect(renderer.value.tier3Scope).toMatchObject({
      status: "pending-physical-device-evidence",
      physicalDeviceSampleCount: 0,
      crossDeviceGuarantee: false,
    });

    const runtimeById = new Map(
      runtime.value.rows.map((row) => [row.formulaId, row]),
    );
    const preGpuById = new Map(expectedRows.map((row) => [row.formulaId, row]));
    for (const evidenceRow of renderer.value.rows) {
      const runtimeRow = runtimeById.get(evidenceRow.formulaId);
      const preGpuRow: JuliaPreGpuCapabilityRowV1 | undefined = preGpuById.get(
        evidenceRow.formulaId,
      );
      expect(runtimeRow).toBeDefined();
      expect(preGpuRow).toBeDefined();
      if (!runtimeRow || !preGpuRow) continue;
      expect(evidenceRow).toMatchObject({
        evaluatedSourceRevision: preGpuRow.evaluatedSourceRevision,
        evaluatedSemanticHash: preGpuRow.evaluatedSemanticHash,
        bindingRevision: preGpuRow.bindingRevision,
        lane: preGpuRow.lane,
        modeClass: preGpuRow.modeClass,
      });
      expect(
        buildJuliaRendererProfileV1(runtimeRow, preGpuRow).profileDigest,
      ).toBe(evidenceRow.profileDigest);
      if (evidenceRow.status === "passed") {
        expect(evidenceRow).toMatchObject({
          fullFrameworkCompileLink: true,
          deterministicDoubleDraw: true,
          traceDepthComparisons: 96,
          imagePixelComparisons: 96,
          minimumImageDifferingPixels: 1,
          relativeTolerance: 0.005,
        });
        expect(evidenceRow.fullFrameworkCappedDraw).toBe(
          (
            JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1 as readonly string[]
          ).includes(evidenceRow.formulaId),
        );
      }
    }
  });

  it("binds renderer evidence to every declared source input", () => {
    const parsed = parseJuliaRendererEvidenceV1(rendererAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const relativePath of JULIA_RENDERER_SOURCE_BINDING_PATHS_V1)
      expect(parsed.value.sourceBindings[relativePath]).toBe(
        sha256(relativePath),
      );
  });

  it("rejects renderer row, profile, and content-hash tampering", () => {
    const rowTampered = clone(rendererAsset);
    rowTampered.rows[0]!.traceDepthComparisons += 1;
    expect(parseJuliaRendererEvidenceV1(rowTampered).ok).toBe(false);

    const profileTampered = clone(rendererAsset);
    profileTampered.rows[0]!.profileDigest = "0".repeat(64);
    expect(parseJuliaRendererEvidenceV1(profileTampered).ok).toBe(false);

    const hashTampered = clone(rendererAsset);
    hashTampered.contentHash = "f".repeat(64);
    expect(parseJuliaRendererEvidenceV1(hashTampered).ok).toBe(false);

    const rehashedSemanticTamper = clone(rendererAsset);
    const passed = rehashedSemanticTamper.rows.find(
      (row) => row.status === "passed",
    );
    expect(passed).toBeDefined();
    if (passed) passed.fullFrameworkCompileLink = false;
    rehash(rehashedSemanticTamper);
    expect(parseJuliaRendererEvidenceV1(rehashedSemanticTamper).ok).toBe(false);

    const rehashedWitnessTamper = clone(rendererAsset);
    const witness = rehashedWitnessTamper.rows.find(
      (row) => row.fullFrameworkCappedDraw,
    );
    const nonWitness = rehashedWitnessTamper.rows.find(
      (row) => !row.fullFrameworkCappedDraw && row.status === "passed",
    );
    expect(witness).toBeDefined();
    expect(nonWitness).toBeDefined();
    if (witness) witness.fullFrameworkCappedDraw = false;
    if (nonWitness) nonWitness.fullFrameworkCappedDraw = true;
    rehash(rehashedWitnessTamper);
    expect(parseJuliaRendererEvidenceV1(rehashedWitnessTamper).ok).toBe(false);
  });
});

describe("Julia final capability census", () => {
  it("closes all 534 rows without activating product behavior", () => {
    const final = parseJuliaFinalCapabilityCensusV1(finalAsset);
    const renderer = parseJuliaRendererEvidenceV1(rendererAsset);
    expect(final.ok).toBe(true);
    expect(renderer.ok).toBe(true);
    if (!final.ok || !renderer.ok) return;

    expect(final.value.rowCount).toBe(534);
    expect(final.value.activationStatus).toBe("inactive-awaiting-29h");
    expect(final.value.statusCounts).toEqual({
      supported: renderer.value.statusCounts.passed,
      unknown: 149,
      blocked: 200 + renderer.value.statusCounts.blocked,
      notApplicable: 0,
    });
    expect(final.value.supportedCounts.generalized).toBe(0);
    expect(final.value.supportedCounts.parameterBinding).toBe(0);
    expect(final.value.supportedCounts.classic).toBe(
      final.value.statusCounts.supported,
    );
    expect(
      final.value.supportedCounts.existingSystemC +
        final.value.supportedCounts.sourceSplit,
    ).toBe(final.value.statusCounts.supported);
    expect(
      final.value.rows.every(
        (row) =>
          row.crossDeviceGuarantee === false &&
          !row.proofTiers.tier3PhysicalDevice,
      ),
    ).toBe(true);
    const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
    expect(preGpu.ok).toBe(true);
    if (!preGpu.ok) return;
    const preGpuById = new Map(
      preGpu.value.rows.map((row) => [row.formulaId, row]),
    );
    const rendererById = new Map(
      renderer.value.rows.map((row) => [row.formulaId, row]),
    );
    for (const row of final.value.rows) {
      const preGpuRow = preGpuById.get(row.formulaId);
      expect(preGpuRow).toBeDefined();
      if (!preGpuRow) continue;
      expect(row).toMatchObject({
        lane: preGpuRow.lane,
        modeClass: preGpuRow.modeClass,
        contract: preGpuRow.contract,
        bindingRevision: preGpuRow.bindingRevision,
        preGpuEvidenceContentHash: final.value.preGpuContentHash,
      });
      const rendererRow = rendererById.get(row.formulaId);
      if (preGpuRow.disposition === "tier2-pending") {
        expect(rendererRow).toBeDefined();
        if (!rendererRow) continue;
        expect(row.status).toBe(
          rendererRow.status === "passed" ? "supported" : "blocked",
        );
        expect(row.profileDigest).toBe(rendererRow.profileDigest);
        expect(row.tier2EvidenceContentHash).toBe(renderer.value.contentHash);
        expect(row.proofTiers.tier2).toBe(rendererRow.status === "passed");
        expect(row.activationEligible).toBe(rendererRow.status === "passed");
      } else {
        expect(rendererRow).toBeUndefined();
        expect(row.status).toBe(preGpuRow.status);
        expect(row.profileDigest).toBeNull();
        expect(row.tier2EvidenceContentHash).toBeNull();
        expect(row.proofTiers.tier2).toBe(false);
        expect(row.activationEligible).toBe(false);
      }
    }
    for (const row of final.value.rows.filter(
      (candidate) => candidate.status === "supported",
    )) {
      expect(row.activationEligible).toBe(true);
      expect(row.proofTiers).toMatchObject({
        tier0: true,
        tier1: true,
        tier2: true,
        tier3PhysicalDevice: false,
      });
      expect(row.profileDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(row).toMatchObject({
        preGpuEvidenceContentHash: final.value.preGpuContentHash,
        tier2EvidenceContentHash: renderer.value.contentHash,
        tier3ScopeId: "fractalpark-julia-tier3-scope/v1",
        technicalAuthor: "ellie",
        independentReviewer: "codex-cli",
      });
    }
  });

  it("binds final census to every declared source input", () => {
    const parsed = parseJuliaFinalCapabilityCensusV1(finalAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const relativePath of JULIA_FINAL_CAPABILITY_SOURCE_BINDING_PATHS_V1)
      expect(parsed.value.sourceBindings[relativePath]).toBe(
        sha256(relativePath),
      );
  });

  it("rejects activation, proof-tier, and content-hash tampering", () => {
    const activationTampered = clone(finalAsset);
    const inactive = activationTampered.rows.find(
      (row) => row.status !== "supported",
    );
    expect(inactive).toBeDefined();
    if (inactive) inactive.activationEligible = true;
    expect(parseJuliaFinalCapabilityCensusV1(activationTampered).ok).toBe(
      false,
    );

    const proofTampered = clone(finalAsset);
    const supported = proofTampered.rows.find(
      (row) => row.status === "supported",
    );
    expect(supported).toBeDefined();
    if (supported) supported.proofTiers.tier2 = false;
    expect(parseJuliaFinalCapabilityCensusV1(proofTampered).ok).toBe(false);

    const hashTampered = clone(finalAsset);
    hashTampered.contentHash = "0".repeat(64);
    expect(parseJuliaFinalCapabilityCensusV1(hashTampered).ok).toBe(false);

    const rehashedActivationTamper = clone(finalAsset);
    const rehashedInactive = rehashedActivationTamper.rows.find(
      (row) => row.status !== "supported",
    );
    expect(rehashedInactive).toBeDefined();
    if (rehashedInactive) rehashedInactive.activationEligible = true;
    rehash(rehashedActivationTamper);
    expect(parseJuliaFinalCapabilityCensusV1(rehashedActivationTamper).ok).toBe(
      false,
    );

    const rehashedCountTamper = clone(finalAsset);
    rehashedCountTamper.statusCounts.supported += 1;
    rehashedCountTamper.statusCounts.blocked -= 1;
    rehash(rehashedCountTamper);
    expect(parseJuliaFinalCapabilityCensusV1(rehashedCountTamper).ok).toBe(
      false,
    );
  });
});
