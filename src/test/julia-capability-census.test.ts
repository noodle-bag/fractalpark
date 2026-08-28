import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import activationAsset from "../../resources/formula-library/v1/julia-runtime-activation.v1.json";
import censusAsset from "../../resources/formula-library/v1/julia-capability-census.v1.json";
import {
  JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1,
  JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1,
  JULIA_CAPABILITY_CENSUS_V1,
  parseJuliaCapabilityCensusV1,
  verifyJuliaCapabilityCensusSetV1,
} from "@/engine/formulas/v1/julia-capability";
import {
  JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
  JULIA_RUNTIME_ACTIVATION_V1,
  parseJuliaRuntimeActivationV1,
  resolveActivatedPublishedFormulaDefaultProfileV1,
  resolveJuliaRuntimeCapabilityV1,
  verifyJuliaRuntimeActivationSetV1,
} from "@/engine/formulas/v1/julia-runtime-activation-v1";
import { parsePublishedFormulaRuntimeIndexV1 } from "@/engine/formulas/v1/published-runtime";

const RUNTIME_INDEX_PATH = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published/index.json",
);

function runtimeIndex(): unknown {
  return JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8"));
}

describe("Julia capability census v1 skeleton", () => {
  it("binds an immutable all-unknown census to the exact published 534 set", () => {
    const parsed = parseJuliaCapabilityCensusV1(censusAsset);
    expect(parsed.ok).toBe(true);
    expect(JULIA_CAPABILITY_CENSUS_V1.rowCount).toBe(
      JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1,
    );
    expect(JULIA_CAPABILITY_CENSUS_V1.rowCount).toBe(534);
    expect(
      JULIA_CAPABILITY_CENSUS_V1.rows.every((row) => row.status === "unknown"),
    ).toBe(true);
    expect(JULIA_CAPABILITY_CENSUS_V1.contentHash).toBe(
      JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1,
    );
    expect(Object.isFrozen(JULIA_CAPABILITY_CENSUS_V1)).toBe(true);
    expect(Object.isFrozen(JULIA_CAPABILITY_CENSUS_V1.rows)).toBe(true);
    expect(verifyJuliaCapabilityCensusSetV1(runtimeIndex())).toBe(true);
  });

  it("activates only the exact source-bound supported projection", () => {
    const parsed = parseJuliaRuntimeActivationV1(activationAsset);
    expect(parsed.ok).toBe(true);
    expect(JULIA_RUNTIME_ACTIVATION_V1?.rows).toHaveLength(
      JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
    );
    expect(verifyJuliaRuntimeActivationSetV1(runtimeIndex())).toBe(true);

    const supported = JULIA_RUNTIME_ACTIVATION_V1!.rows[0]!;
    expect(
      resolveJuliaRuntimeCapabilityV1(supported.formulaId, supported.sourceRevision),
    ).toEqual({
      status: "supported",
      reason: "active",
      supportsEditing: true,
      supportsRuntime: true,
    });
    expect(resolveJuliaRuntimeCapabilityV1(supported.formulaId, "0".repeat(64))).toEqual({
      status: "stale",
      reason: "stale",
      supportsEditing: false,
      supportsRuntime: false,
    });
    const unsupported = JULIA_CAPABILITY_CENSUS_V1.rows.find(
      (row) =>
        !JULIA_RUNTIME_ACTIVATION_V1!.rows.some(
          (candidate) => candidate.formulaId === row.formulaId,
        ),
    )!;
    expect(
      resolveJuliaRuntimeCapabilityV1(unsupported.formulaId, unsupported.sourceRevision),
    ).toEqual({
      status: "unsupported",
      reason: "unsupported",
      supportsEditing: false,
      supportsRuntime: false,
    });
    expect(resolveJuliaRuntimeCapabilityV1("mandelbrot", undefined)).toEqual({
      status: "missing",
      reason: "non-canonical",
      supportsEditing: false,
      supportsRuntime: false,
    });
  });

  it("restores exactly the authority-approved Julia default Profile", () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(runtimeIndex());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const persistedJuliaRows = parsed.value.rows.filter(
      (row) => row.profile.mode === "julia",
    );
    expect(persistedJuliaRows).toHaveLength(10);
    const effectiveJuliaRows = persistedJuliaRows.filter(
      (row) => resolveActivatedPublishedFormulaDefaultProfileV1(row).mode === "julia",
    );
    expect(effectiveJuliaRows).toHaveLength(1);
    expect(
      resolveJuliaRuntimeCapabilityV1(
        effectiveJuliaRows[0]!.formulaId,
        effectiveJuliaRows[0]!.sourceRevision,
      ).supportsRuntime,
    ).toBe(true);
    expect(
      persistedJuliaRows.filter(
        (row) => resolveActivatedPublishedFormulaDefaultProfileV1(row).mode === "parameter-plane",
      ),
    ).toHaveLength(9);
    for (const row of persistedJuliaRows) {
      expect(row.profile.mode).toBe("julia");
      expect(row.profile.juliaC).toBeDefined();
    }
  });
});
