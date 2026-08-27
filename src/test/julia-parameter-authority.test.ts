import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import asset from "../../resources/formula-library/v1/julia-parameter-authority.v1.json";
import { describe, expect, it } from "vitest";
import {
  decideJuliaParameterAuthorityV1,
  parseJuliaParameterAuthorityAssetV1,
} from "@/engine/formulas/v1/julia-parameter-authority";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reseal(value: unknown): void {
  const target = value as Record<string, unknown>;
  const unsigned = { ...target };
  delete unsigned.contentHash;
  target.contentHash = sha256HexSyncV1(
    canonicalJsonV1(unsigned, 10_000_000),
  );
}

describe("julia parameter authority receipts", () => {
  it("seals the exact 175 canonical replays and required counts", () => {
    const parsed = parseJuliaParameterAuthorityAssetV1(asset);
    expect(parsed.ok).toBe(true);
    expect(asset.rowCount).toBe(175);
    expect(asset.canonicalSourceDelta).toEqual({
      "terminal-newline-only": 163,
      other: 12,
    });
    expect(asset.authorityDecision).toEqual({
      "canonical-authority-recovered": 43,
      "generalized-held": 3,
      "undetermined-unknown": 116,
      "multiple-held": 4,
      "no-passing-blocked": 9,
    });
    expect(asset.rows).toHaveLength(175);
    expect(
      asset.rows.every(
        (row) =>
          row.invariants.safetyEnvelopePass &&
          row.invariants.irInvariant &&
          row.invariants.semanticInvariant &&
          row.invariants.parameterSchemaInvariant &&
          !Object.prototype.hasOwnProperty.call(row, "candidateSource"),
      ),
    ).toBe(true);
    if (parsed.ok) {
      expect(Object.isFrozen(parsed.value)).toBe(true);
      expect(Object.isFrozen(parsed.value.rows)).toBe(true);
      expect(Object.isFrozen(parsed.value.rows[0]!.attempts[0])).toBe(true);
    }
  });

  it("uses census mode only after harness-derived slot uniqueness", () => {
    expect(decideJuliaParameterAuthorityV1("classic-julia", ["seed"])).toBe(
      "canonical-authority-recovered",
    );
    expect(
      decideJuliaParameterAuthorityV1("generalized-two-plane", ["seed"]),
    ).toBe("generalized-held");
    expect(decideJuliaParameterAuthorityV1("undetermined", ["seed"])).toBe(
      "undetermined-unknown",
    );
    expect(
      decideJuliaParameterAuthorityV1("classic-julia", ["a", "b"]),
    ).toBe("multiple-held");
    expect(decideJuliaParameterAuthorityV1("classic-julia", [])).toBe(
      "no-passing-blocked",
    );
  });

  it("fails closed after structurally invalid payloads are resealed", () => {
    const reordered = clone(asset);
    [reordered.rows[0], reordered.rows[1]] = [
      reordered.rows[1]!,
      reordered.rows[0]!,
    ];
    reseal(reordered);
    expect(parseJuliaParameterAuthorityAssetV1(reordered).ok).toBe(false);

    const extraBinding = clone(asset);
    Object.assign(extraBinding.sourceBindings, {
      unexpected: "0".repeat(64),
    });
    reseal(extraBinding);
    expect(parseJuliaParameterAuthorityAssetV1(extraBinding).ok).toBe(false);

    const counted = clone(asset);
    counted.rowCount = 174;
    reseal(counted);
    expect(parseJuliaParameterAuthorityAssetV1(counted).ok).toBe(false);

    const malformedParameter = clone(asset);
    const firstParameter = malformedParameter.rows[0]!
      .baselineParameterSchema[0]! as unknown as { default: unknown };
    firstParameter.default = [0];
    reseal(malformedParameter);
    expect(parseJuliaParameterAuthorityAssetV1(malformedParameter).ok).toBe(
      false,
    );
  });

  it("derives selected and passing slots only from validated attempts", () => {
    const selected = clone(asset);
    const unique = selected.rows.find(
      (row) => row.slotResolution.status === "unique",
    )!;
    unique.slotResolution.selectedSlotName = "not-a-passing-slot";
    reseal(selected);
    expect(parseJuliaParameterAuthorityAssetV1(selected).ok).toBe(false);

    const statusMismatch = clone(asset);
    const passingAttempt = statusMismatch.rows
      .flatMap((row) => row.attempts)
      .find((attempt) => attempt.status === "tier1-candidate")! as unknown as {
      status: string;
    };
    passingAttempt.status = "blocked";
    reseal(statusMismatch);
    expect(parseJuliaParameterAuthorityAssetV1(statusMismatch).ok).toBe(false);

    const passingMismatch = clone(asset);
    const resolved = passingMismatch.rows.find(
      (row) => row.slotResolution.status === "unique",
    )!;
    resolved.slotResolution.status = "no-passing";
    delete (resolved.slotResolution as { selectedSlotName?: string })
      .selectedSlotName;
    resolved.slotResolution.passingSlotNames = [];
    resolved.authorityDecision = "no-passing-blocked";
    reseal(passingMismatch);
    expect(parseJuliaParameterAuthorityAssetV1(passingMismatch).ok).toBe(false);
  });

  it("rejects per-row canonical-delta swaps in the independent verifier", () => {
    const tampered = clone(asset);
    const newlineRow = tampered.rows.find(
      (row) => row.canonicalSourceDelta === "terminal-newline-only",
    )!;
    const otherRow = tampered.rows.find(
      (row) => row.canonicalSourceDelta === "other",
    )!;
    newlineRow.canonicalSourceDelta = "other";
    otherRow.canonicalSourceDelta = "terminal-newline-only";
    reseal(tampered);
    expect(parseJuliaParameterAuthorityAssetV1(tampered).ok).toBe(true);

    const repositoryRoot = process.cwd();
    const fixtureRoot = mkdtempSync(join(tmpdir(), "julia-authority-"));
    try {
      const resourceRoot = join(
        fixtureRoot,
        "resources/formula-library/v1",
      );
      mkdirSync(resourceRoot, { recursive: true });
      for (const name of [
        "julia-pixel-recovery-contract.v1.json",
        "julia-parameter-binding-evidence.v1.json",
        "julia-pixel-role-census.v1.json",
        "publication-decisions.json",
      ]) {
        symlinkSync(
          join(repositoryRoot, "resources/formula-library/v1", name),
          join(resourceRoot, name),
        );
      }
      writeFileSync(
        join(resourceRoot, "julia-parameter-authority.v1.json"),
        `${JSON.stringify(tampered, null, 2)}\n`,
      );
      mkdirSync(join(fixtureRoot, "public/formula-library"), {
        recursive: true,
      });
      symlinkSync(
        join(repositoryRoot, "public/formula-library/v1"),
        join(fixtureRoot, "public/formula-library/v1"),
        "dir",
      );

      expect(() =>
        execFileSync(
          join(repositoryRoot, "node_modules/.bin/tsx"),
          [
            join(
              repositoryRoot,
              "scripts/verify-julia-parameter-authority.ts",
            ),
          ],
          { cwd: fixtureRoot, stdio: "pipe" },
        ),
      ).toThrow();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("translates hostile object traps into a typed invalid result", () => {
    const hostile = new Proxy(asset, {
      ownKeys() {
        throw new Error("trap");
      },
    });
    expect(parseJuliaParameterAuthorityAssetV1(hostile)).toEqual({
      ok: false,
      code: "asset-invalid",
    });
  });
});
