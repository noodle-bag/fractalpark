import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import censusAsset from "../../resources/formula-library/v1/julia-capability-census.v1.json";
import {
  JULIA_CAPABILITY_CENSUS_CONTENT_HASH_V1,
  JULIA_CAPABILITY_CENSUS_ROW_COUNT_V1,
  JULIA_CAPABILITY_CENSUS_V1,
  parseJuliaCapabilityCensusV1,
  resolveJuliaCapabilityV1,
  verifyJuliaCapabilityCensusSetV1,
} from "@/engine/formulas/v1/julia-capability";
import {
  parsePublishedFormulaRuntimeIndexV1,
  resolvePublishedFormulaDefaultProfileV1,
} from "@/engine/formulas/v1/published-runtime";

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

  it("fails closed on tampering, missing rows, and stale source revisions", () => {
    const tampered = structuredClone(censusAsset);
    tampered.rows[0]!.status = "supported" as "unknown";
    expect(parseJuliaCapabilityCensusV1(tampered)).toEqual({
      ok: false,
      code: "julia-capability-census-invalid",
    });

    const first = JULIA_CAPABILITY_CENSUS_V1.rows[0]!;
    expect(resolveJuliaCapabilityV1(first.formulaId, first.sourceRevision)).toEqual({
      status: "unknown",
      supportsEditing: false,
    });
    expect(resolveJuliaCapabilityV1(first.formulaId, "0".repeat(64))).toEqual({
      status: "stale",
      supportsEditing: false,
    });
    expect(resolveJuliaCapabilityV1("mandelbrot", undefined)).toEqual({
      status: "missing",
      supportsEditing: false,
    });
  });

  it("projects all ten legacy Julia defaults to parameter-plane without mutating legacy data", () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(runtimeIndex());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const legacyJuliaRows = parsed.value.rows.filter(
      (row) => row.profile.mode === "julia",
    );
    expect(legacyJuliaRows).toHaveLength(10);
    for (const row of legacyJuliaRows) {
      const legacyJuliaC = row.profile.juliaC;
      const effective = resolvePublishedFormulaDefaultProfileV1(row);
      expect(effective.mode).toBe("parameter-plane");
      expect(effective).not.toHaveProperty("juliaC");
      expect(row.profile.mode).toBe("julia");
      expect(row.profile.juliaC).toEqual(legacyJuliaC);
    }
    expect(
      parsed.value.rows.filter(
        (row) => resolvePublishedFormulaDefaultProfileV1(row).mode === "julia",
      ),
    ).toHaveLength(0);
  });
});
