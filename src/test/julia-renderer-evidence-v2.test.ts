import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  verifyPrivateEvidenceFile,
  verifyPrivateEvidenceRoot,
} from "../../scripts/lib/julia-private-evidence-root";
import {
  auditJuliaRuntimeDependenciesV2,
  auditJuliaWorkerBundleV2,
  pinJuliaRuntimeDependenciesV2,
} from "../../scripts/lib/julia-worker-bundle-audit";

import manifestAsset from "../../resources/formula-library/v1/julia-pixel-candidate-manifest.v1.json";
import candidateAsset from "../../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import { parseJuliaPixelRecoveryCandidatesV1 } from "../engine/formulas/v1/julia-pixel-recovery-candidates";
import {
  parseJuliaPixelCandidateManifestV1,
  parseJuliaPreGpuRecoveryCensusV2,
} from "../engine/formulas/v1/julia-pre-gpu-recovery-v2";
import {
  buildJuliaRendererProfileV2,
  JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2,
  JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
  parseJuliaRendererEvidenceV2,
} from "../engine/formulas/v1/julia-renderer-evidence-v2";
import {
  buildJuliaRendererDefinitionBindingPathsV2,
  buildJuliaRendererExecutionSourceBindingPathsV2,
  buildJuliaRendererFullSourceBindingPathsV2,
  buildJuliaRendererSourceBindingContentHashV2,
  buildJuliaRendererSourceBindingMapV2,
  JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2,
  JULIA_RENDERER_SOURCE_BINDING_PATHS_V2,
  verifyJuliaRendererSourceBindingMapV2,
} from "../engine/formulas/v1/julia-renderer-source-bindings-v2";
import { parsePublishedFormulaRuntimeIndexV1 } from "../engine/formulas/v1/published-runtime";

const ROOT = process.cwd();
const EVIDENCE_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v2.json",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);

function evidenceAsset(): unknown {
  return JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Julia renderer evidence v2", () => {
  it("parses the frozen 236-row artifact with an inactive sealed holdout", () => {
    const parsed = parseJuliaRendererEvidenceV2(evidenceAsset());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.rowCount).toBe(JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2);
    expect(
      parsed.value.statusCounts.passed + parsed.value.statusCounts.blocked,
    ).toBe(JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2);
    expect(parsed.value.waveId).toBe(parsed.value.candidateManifestContentHash);
    expect(parsed.value.activationStatus).toBe("inactive-evidence-only");
    expect(parsed.value.sealedHoldout.e1CandidateCount).toBe(0);
    expect(parsed.value.sealedHoldout.sealedAttemptCount).toBe(0);
    expect(parsed.value.tier3Scope.physicalDeviceSampleCount).toBe(0);
    expect(Object.keys(parsed.value.runtimeDependencyBindings).sort()).toEqual([
      "@playwright/test",
      "chromium-runtime",
      "playwright",
      "playwright-core",
    ]);
    expect(
      parsed.value.rows.filter((row) => row.fullFrameworkCappedDraw),
    ).toHaveLength(1);
    expect(
      parsed.value.rows.find((row) => row.fullFrameworkCappedDraw)?.formulaId,
    ).toBe(JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.rows)).toBe(true);
    expect(Object.isFrozen(parsed.value.rows[0]?.binding)).toBe(true);
  });

  it("binds every evidence row to the exact frozen candidate manifest order", () => {
    const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
    expect(preGpu.ok).toBe(true);
    if (!preGpu.ok) return;
    const manifest = parseJuliaPixelCandidateManifestV1(
      manifestAsset,
      preGpu.value,
    );
    const evidence = parseJuliaRendererEvidenceV2(evidenceAsset());
    expect(manifest.ok).toBe(true);
    expect(evidence.ok).toBe(true);
    if (!manifest.ok || !evidence.ok) return;
    expect(
      evidence.value.rows.map((row) => [
        row.formulaId,
        row.candidateContentHash,
        row.evaluatedSourceRevision,
        row.evaluatedSemanticHash,
      ]),
    ).toEqual(
      manifest.value.rows.map((row) => [
        row.formulaId,
        row.candidateContentHash,
        row.sourceRevision,
        row.semanticHash,
      ]),
    );
    expect(
      manifest.value.rows.filter(
        (row) => String(row.rewriteClass) === "E1-mathematical-identity",
      ),
    ).toHaveLength(0);
  });

  it("builds a source-bound parameter profile without changing the frozen default", () => {
    const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
    const runtime = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(preGpu.ok).toBe(true);
    expect(runtime.ok).toBe(true);
    if (!preGpu.ok || !runtime.ok) return;
    const row = preGpu.value.rows.find(
      (candidate) => candidate.supportLane === "parameter-binding",
    );
    expect(row).toBeDefined();
    const runtimeRow = runtime.value.rows.find(
      (candidate) => candidate.formulaId === row?.formulaId,
    );
    expect(runtimeRow).toBeDefined();
    if (!row || !runtimeRow) return;
    const built = buildJuliaRendererProfileV2(runtimeRow, row);
    expect(built.profile.binding.kind).toBe("parameter");
    if (built.profile.binding.kind !== "parameter") return;
    expect(Object.hasOwn(built.profile.parameters, built.profile.binding.slotName)).toBe(
      true,
    );
    expect(built.profileDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects row, source-binding, and sealed-holdout tampering", () => {
    const original = evidenceAsset() as Record<string, unknown>;

    const reordered = clone(original) as {
      rows: unknown[];
    };
    [reordered.rows[0], reordered.rows[1]] = [
      reordered.rows[1],
      reordered.rows[0],
    ];
    expect(parseJuliaRendererEvidenceV2(reordered)).toEqual({
      ok: false,
      code: "julia-renderer-evidence-v2-invalid",
    });

    const sourceTamper = clone(original) as {
      sourceBindings: Record<string, string>;
    };
    sourceTamper.sourceBindings[Object.keys(sourceTamper.sourceBindings)[0]!] =
      "0".repeat(64);
    expect(parseJuliaRendererEvidenceV2(sourceTamper).ok).toBe(false);

    const holdoutTamper = clone(original) as {
      sealedHoldout: { sealedAttemptCount: number };
    };
    holdoutTamper.sealedHoldout.sealedAttemptCount = 1;
    expect(parseJuliaRendererEvidenceV2(holdoutTamper).ok).toBe(false);

    const runtimeTamper = clone(original) as {
      runtimeDependencyBindings: Record<string, string>;
    };
    runtimeTamper.runtimeDependencyBindings["chromium-runtime"] = "0".repeat(64);
    expect(parseJuliaRendererEvidenceV2(runtimeTamper).ok).toBe(false);
  });

  it("separates GPU execution sources from canonical-only evidence tooling", () => {
    const execution = new Set(JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2);
    const full = new Set(JULIA_RENDERER_SOURCE_BINDING_PATHS_V2);
    for (const path of execution) expect(full.has(path)).toBe(true);
    expect(execution.has("scripts/run-julia-tier2-webgl-worker-v2.ts")).toBe(true);
    expect(execution.has("scripts/verify-julia-tier2-webgl-v2.ts")).toBe(true);
    expect(execution.has("scripts/build-julia-renderer-evidence-v2.ts")).toBe(
      false,
    );
    expect(execution.has("scripts/verify-julia-renderer-evidence-v2.ts")).toBe(
      false,
    );
    expect(full.size - execution.size).toBe(5);
  });

  it("binds all 236 dynamically selected definition bytes in both source maps", () => {
    const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
    const candidates = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
    const runtime = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(preGpu.ok).toBe(true);
    expect(candidates.ok).toBe(true);
    expect(runtime.ok).toBe(true);
    if (!preGpu.ok || !candidates.ok || !runtime.ok) return;
    const definitions = buildJuliaRendererDefinitionBindingPathsV2(
      preGpu.value.rows,
      runtime.value.rows,
      candidates.value.rows,
    );
    expect(definitions).toHaveLength(236);
    const execution = buildJuliaRendererExecutionSourceBindingPathsV2(definitions);
    const full = buildJuliaRendererFullSourceBindingPathsV2(definitions);
    for (const path of definitions) {
      expect(execution).toContain(path);
      expect(full).toContain(path);
    }
    const isolatedRuntime = mkdtempSync(join(tmpdir(), "julia-pinned-runtime-"));
    try {
      const isolatedBundle = join(isolatedRuntime, "worker.mjs");
      const audit = auditJuliaWorkerBundleV2(
        ROOT,
        join(ROOT, "scripts/run-julia-tier2-webgl-worker-v2.ts"),
        isolatedBundle,
        execution,
        true,
      );
      const replayedAudit = auditJuliaWorkerBundleV2(
        ROOT,
        join(ROOT, "scripts/run-julia-tier2-webgl-worker-v2.ts"),
        isolatedBundle,
        execution,
        false,
      );
      expect(replayedAudit.bundleSha256).toBe(audit.bundleSha256);
      expect(audit.repoInputPaths).toContain(
        "resources/formula-library/v1/julia-capability-census.v1.json",
      );
      expect(audit.repoInputPaths).toContain(
        "src/engine/formulas/v1/julia-capability.ts",
      );
      expect(audit.repoInputPaths).toContain(
        "src/engine/formulas/v1/julia-pixel-recovery-candidate.ts",
      );
      expect(audit.repoInputPaths.every((path) => execution.includes(path))).toBe(
        true,
      );
      expect(Object.keys(audit.runtimeDependencyBindings).sort()).toEqual([
        "@playwright/test",
        "chromium-runtime",
        "playwright",
        "playwright-core",
      ]);
      const pinnedExecutable = pinJuliaRuntimeDependenciesV2(
        ROOT,
        audit.browserExecutablePath,
        isolatedRuntime,
        audit.runtimeDependencyBindings,
      );
      expect(
        auditJuliaRuntimeDependenciesV2(isolatedRuntime, pinnedExecutable),
      ).toEqual(audit.runtimeDependencyBindings);
    } finally {
      rmSync(isolatedRuntime, { recursive: true, force: true });
    }
    const readCurrent = (path: string): string =>
      readFileSync(join(ROOT, path), "utf8");
    const before = buildJuliaRendererSourceBindingContentHashV2(
      execution,
      readCurrent,
    );
    const afterDefinitionDrift = buildJuliaRendererSourceBindingContentHashV2(
      execution,
      (path) =>
        path === definitions[0] ? `${readCurrent(path)} ` : readCurrent(path),
    );
    expect(afterDefinitionDrift).not.toBe(before);
    const artifactBindings = buildJuliaRendererSourceBindingMapV2(full, readCurrent);
    const driftedArtifactBindings = {
      ...artifactBindings,
      [definitions[0]!]: "0".repeat(64),
    };
    expect(() =>
      verifyJuliaRendererSourceBindingMapV2(
        driftedArtifactBindings,
        full,
        readCurrent,
      ),
    ).toThrow(`julia-renderer-source-binding-invalid:${definitions[0]}`);

    const tampered = clone(candidates.value.rows) as unknown as Array<{
      formulaId: string;
      status: string;
      candidate?: { definitionPath: string } | null;
    }>;
    const sourceSplit = tampered.find((row) => row.candidate !== undefined);
    expect(sourceSplit?.candidate).toBeDefined();
    if (!sourceSplit?.candidate) return;
    sourceSplit.candidate.definitionPath =
      `julia-pixel-recovery-candidates/definitions/${"0".repeat(64)}.frm`;
    expect(() =>
      buildJuliaRendererDefinitionBindingPathsV2(
        preGpu.value.rows,
        runtime.value.rows,
        tampered,
      ),
    ).toThrow("julia-renderer-definition-binding-candidate-invalid");
  }, 20_000);

  it("rejects symlinked or over-permissive private evidence roots", () => {
    const temporary = mkdtempSync(join(tmpdir(), "julia-private-root-"));
    try {
      const root = join(temporary, "repo");
      const first = join(root, ".formula-library-private");
      const second = join(first, "formula-library-v1");
      const privateRoot = join(second, "julia-pixel-recovery-v1");
      mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
      chmodSync(first, 0o700);
      chmodSync(second, 0o700);
      chmodSync(privateRoot, 0o700);
      expect(
        verifyPrivateEvidenceRoot(
          root,
          ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
          "private-root-invalid",
        ),
      ).toBe(privateRoot);
      const evidence = join(privateRoot, "evidence.json");
      writeFileSync(evidence, "{}\n", { mode: 0o600 });
      expect(verifyPrivateEvidenceFile(privateRoot, evidence, "escape")).toBe(
        evidence,
      );

      chmodSync(second, 0o755);
      expect(() =>
        verifyPrivateEvidenceRoot(
          root,
          ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
          "private-root-invalid",
        ),
      ).toThrow("private-root-invalid");

      const symlinkRoot = join(temporary, "symlink-repo");
      mkdirSync(symlinkRoot, { mode: 0o700 });
      symlinkSync(first, join(symlinkRoot, ".formula-library-private"));
      expect(() =>
        verifyPrivateEvidenceRoot(
          symlinkRoot,
          ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
          "private-root-invalid",
        ),
      ).toThrow("private-root-invalid");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
