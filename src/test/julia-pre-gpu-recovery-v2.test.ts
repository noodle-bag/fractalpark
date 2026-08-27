import candidateManifest from "../../resources/formula-library/v1/julia-pixel-candidate-manifest.v1.json";
import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import { describe, expect, it } from "vitest";
import {
  parseJuliaPixelCandidateManifestV1,
  parseJuliaPreGpuRecoveryCensusV2,
} from "../engine/formulas/v1/julia-pre-gpu-recovery-v2";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resealCensus(value: Record<string, unknown>): void {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  value.contentHash = sha256HexSyncV1(
    canonicalJsonV1(content, 1_048_576),
  );
}

function resealManifest(value: Record<string, unknown>): void {
  const base = {
    schema: value.schema,
    revision: value.revision,
    authority: value.authority,
    contractContentHash: value.contractContentHash,
    rowCount: value.rowCount,
    rows: value.rows,
  };
  const waveId = sha256HexSyncV1(canonicalJsonV1(base, 1_048_576));
  value.waveId = waveId;
  value.contentHash = waveId;
}

describe("Julia pre-GPU recovery v2", () => {
  it("parses and freezes the exact 534 projection and 236-row wave", () => {
    const parsed = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const manifest = parseJuliaPixelCandidateManifestV1(
      candidateManifest,
      parsed.value,
    );
    expect(manifest.ok).toBe(true);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.rows)).toBe(true);
    expect(parsed.value.statusCounts).toEqual({
      tier2Queue: 236,
      blocked: 15,
      held: 167,
      unknown: 116,
    });
    expect(parsed.value.queueLaneCounts).toEqual({
      existingSystemC: 74,
      parameterBinding: 7,
      sourceSplit: 155,
    });
    expect(
      parsed.value.rows.filter(
        (row) =>
          row.status === "held" &&
          row.reasonCodes.includes("recovered-authority-generalized-held"),
      ),
    ).toHaveLength(36);
  });

  it("rejects resealed row receipts and candidate receipt swaps", () => {
    const changedCensus = clone(preGpuAsset) as unknown as Record<
      string,
      unknown
    >;
    const censusRows = changedCensus.rows as Record<string, unknown>[];
    censusRows[0]!.rowReceipt = "a".repeat(64);
    resealCensus(changedCensus);
    expect(parseJuliaPreGpuRecoveryCensusV2(changedCensus).ok).toBe(false);

    const parsed = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const changedManifest = clone(candidateManifest) as unknown as Record<
      string,
      unknown
    >;
    const rows = changedManifest.rows as Record<string, unknown>[];
    [rows[0]!.candidateContentHash, rows[1]!.candidateContentHash] = [
      rows[1]!.candidateContentHash,
      rows[0]!.candidateContentHash,
    ];
    resealManifest(changedManifest);
    expect(
      parseJuliaPixelCandidateManifestV1(changedManifest, parsed.value).ok,
    ).toBe(false);
  });

  it("rejects accessors, sparse arrays, and symbol extras", () => {
    const accessor = clone(preGpuAsset) as unknown as Record<string, unknown>;
    const schema = accessor.schema;
    Object.defineProperty(accessor, "schema", {
      enumerable: true,
      get: () => schema,
    });
    expect(parseJuliaPreGpuRecoveryCensusV2(accessor).ok).toBe(false);

    const sparse = clone(preGpuAsset) as unknown as Record<string, unknown>;
    delete (sparse.rows as unknown[])[0];
    expect(parseJuliaPreGpuRecoveryCensusV2(sparse).ok).toBe(false);

    const symbol = clone(preGpuAsset) as unknown as Record<string, unknown>;
    Object.defineProperty(symbol.rows as unknown[], Symbol("hidden"), {
      value: true,
    });
    expect(parseJuliaPreGpuRecoveryCensusV2(symbol).ok).toBe(false);
  });
});
