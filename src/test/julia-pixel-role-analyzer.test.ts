import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeJuliaPixelRolesV1 } from "../engine/formulas/v1/julia-pixel-role-analyzer";
import { JULIA_PIXEL_RECOVERY_FIXTURES_V1 } from "./fixtures/julia-pixel-recovery-v1";

type CensusRow = Record<string, unknown> & {
  formulaId?: string;
  result?: string;
  modeClass?: string;
  roles?: string[];
  reasonCodes?: string[];
  changedRegionReceipt?: unknown;
};
type CensusCopy = {
  rows: CensusRow[];
  sourceBindings: Record<string, string>;
  recoveryContractContentHash: string;
};

describe("Julia Pixel role analyzer", () => {
  it("is conservative across the authored recovery fixtures", () => {
    for (const fixture of JULIA_PIXEL_RECOVERY_FIXTURES_V1) {
      const result = analyzeJuliaPixelRolesV1(fixture.source);
      if (fixture.expectation.roleOutcome === "classic-direct")
        expect(result.modeClass).toBe("classic-julia");
      if (fixture.expectation.roleOutcome === "generalized-held")
        expect(result).toMatchObject({
          modeClass: "generalized-two-plane",
          result: "held",
        });
      if (fixture.expectation.roleOutcome === "mutable-fail-closed") {
        expect(result.roles).toContain("role:unresolved");
      }
    }
  });

  it("is invariant under alpha renaming of a transitive alias", () => {
    const fixture = JULIA_PIXEL_RECOVERY_FIXTURES_V1.find(
      (x) => x.id === "transitive-alpha-renaming",
    )!;
    const left = analyzeJuliaPixelRolesV1(fixture.source);
    const right = analyzeJuliaPixelRolesV1(fixture.renamedSource!);
    expect(right.roles).toEqual(left.roles);
    expect(right.modeClass).toEqual(left.modeClass);
    expect(left.roles).toContain("role:derived-pixel-constant");
  });

  it("keeps recurrence literals unknown while treating bailout literals as control", () => {
    const recurrence = JULIA_PIXEL_RECOVERY_FIXTURES_V1.find(
      (x) => x.id === "literal-recurrence-review",
    )!;
    const control = JULIA_PIXEL_RECOVERY_FIXTURES_V1.find(
      (x) => x.id === "literal-control-rejected",
    )!;
    const recurrenceResult = analyzeJuliaPixelRolesV1(recurrence.source);
    expect(recurrenceResult.roles).toContain("role:unresolved");
    expect(recurrenceResult.roles).not.toContain("role:julia-constant");
    const result = analyzeJuliaPixelRolesV1(control.source);
    expect(result.roles).toContain("role:bailout-control");
    expect(result.roles).not.toContain("role:unresolved");
  });

  it("never accepts an unresolved or mutable classic census row", () => {
    const census = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "resources/formula-library/v1/julia-pixel-role-census.v1.json",
        ),
        "utf8",
      ),
    ) as CensusCopy;
    const mutableReasons = new Set([
      "mutable-pixel-alias",
      "read-then-overwrite",
      "loop-carried-write",
      "component-write",
    ]);
    for (const row of census.rows) {
      if (row.modeClass !== "classic-julia") continue;
      expect(row.roles ?? []).not.toContain("role:unresolved");
      expect(
        (row.reasonCodes ?? []).some((reason) => mutableReasons.has(reason)),
      ).toBe(false);
    }
    expect(
      census.rows.filter(
        (row) =>
          (row as unknown as { authorityEvidence?: { contractAppliesToCurrentSource?: boolean } })
            .authorityEvidence?.contractAppliesToCurrentSource === true,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects tampering, extra keys, duplicate rows, reordered authorities, and bindings", () => {
    const root = process.cwd();
    const original = JSON.parse(
      readFileSync(
        join(
          root,
          "resources/formula-library/v1/julia-pixel-role-census.v1.json",
        ),
        "utf8",
      ),
    );
    for (const mutate of [
      (value: CensusCopy) => {
        value.rows[0]!.result = "held";
      },
      (value: CensusCopy) => {
        value.rows[0]!.unexpected = true;
      },
      (value: CensusCopy) => {
        value.rows[1]!.formulaId = value.rows[0]!.formulaId;
      },
      (value: CensusCopy) => {
        [value.rows[0], value.rows[1]] = [value.rows[1], value.rows[0]];
      },
      (value: CensusCopy) => {
        value.rows[0]!.changedRegionReceipt = {
          reachableOrUnknownRegionCount: 1,
        };
      },
      (value: CensusCopy) => {
        value.sourceBindings[
          "src/engine/formulas/v1/julia-pixel-role-analyzer.ts"
        ] = "0".repeat(64);
      },
      (value: CensusCopy) => {
        value.recoveryContractContentHash = "0".repeat(64);
      },
    ]) {
      const copy = JSON.parse(JSON.stringify(original)) as CensusCopy;
      mutate(copy);
      const path = join(
        mkdtempSync(join(tmpdir(), "julia-role-")),
        "tampered.json",
      );
      writeFileSync(path, JSON.stringify(copy));
      expect(() =>
        execFileSync(
          "npx",
          ["tsx", "scripts/verify-julia-pixel-role-census.ts", "--asset", path],
          { cwd: root, stdio: "pipe" },
        ),
      ).toThrow();
    }
  }, 20_000);
});
