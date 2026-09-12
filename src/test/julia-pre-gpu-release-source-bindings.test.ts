import { readFileSync } from "node:fs";
import { join } from "node:path";

import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import { matchesJuliaPreGpuReleaseSourceBindings } from "../../scripts/lib/julia-pre-gpu-release-source-bindings";
import { sha256HexSyncV1 } from "../engine/formulas/v1/revisions";
import { describe, expect, it } from "vitest";

const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
const lockJson = readFileSync(join(process.cwd(), "package-lock.json"), "utf8");
const current = Object.freeze(
  Object.fromEntries(
    Object.keys(preGpuAsset.sourceBindings).map((relativePath) => [
      relativePath,
      sha256HexSyncV1(
        readFileSync(join(process.cwd(), relativePath), "utf8"),
      ),
    ]),
  ),
);

describe("Julia pre-GPU release source bindings", () => {
  it("accepts only the reviewed 0.4.20 metadata transition", () => {
    expect(
      matchesJuliaPreGpuReleaseSourceBindings(
        preGpuAsset.sourceBindings,
        current,
        packageJson,
        lockJson,
      ),
    ).toBe(true);
  });

  it.each([
    ["package dependency", packageJson.replace('"next": "16.1.6"', '"next": "16.1.7"'), lockJson],
    ["package script", packageJson.replace('"dev": "next dev"', '"dev": "next dev --turbo"'), lockJson],
    ["lock dependency", packageJson, lockJson.replace('"next": "16.1.6"', '"next": "16.1.7"')],
    ["mixed release version", packageJson.replace('"version": "0.4.20"', '"version": "0.4.21"'), lockJson],
  ])("rejects a changed %s", (_label, candidatePackage, candidateLock) => {
    expect(
      matchesJuliaPreGpuReleaseSourceBindings(
        preGpuAsset.sourceBindings,
        current,
        candidatePackage,
        candidateLock,
      ),
    ).toBe(false);
  });

  it("rejects any non-package source drift", () => {
    expect(
      matchesJuliaPreGpuReleaseSourceBindings(
        preGpuAsset.sourceBindings,
        { ...current, "src/engine/formulas/v1/julia-binding.ts": "0".repeat(64) },
        packageJson,
        lockJson,
      ),
    ).toBe(false);
  });

  it("rejects a modified sealed binding", () => {
    expect(
      matchesJuliaPreGpuReleaseSourceBindings(
        { ...preGpuAsset.sourceBindings, "package.json": "0".repeat(64) },
        current,
        packageJson,
        lockJson,
      ),
    ).toBe(false);
  });
});
