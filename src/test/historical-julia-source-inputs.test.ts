import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import evidence from "../../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import {
  readHistoricalJuliaSourceInput,
  reconstructHistoricalJuliaPackages,
} from "./fixtures/historical-julia-source-inputs";
import { reconstructReviewed0421PackageInputs } from "../../scripts/lib/reviewed-release-package-inputs";

const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
const lockJson = readFileSync(join(process.cwd(), "package-lock.json"), "utf8");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function mutate(source: string, path: string[], value: unknown): string {
  const parsed = JSON.parse(source);
  let target = parsed;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path[path.length - 1]!] = value;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

describe("historical Julia package input reconstruction", () => {
  it("reconstructs exact sealed bytes from only the reviewed release-input changes", () => {
    const historical = reconstructHistoricalJuliaPackages(packageJson, lockJson);
    expect(Object.isFrozen(historical)).toBe(true);
    for (const path of ["package.json", "package-lock.json"] as const) {
      expect(sha256(historical[path])).toBe(evidence.sourceBindings[path]);
      expect(readHistoricalJuliaSourceInput(path)).toBe(historical[path]);
    }
    const historicalPackage = JSON.parse(historical["package.json"]);
    const historicalLock = JSON.parse(historical["package-lock.json"]);
    expect(historicalPackage.version).toBe("0.4.19");
    expect(historicalLock.version).toBe("0.4.19");
    expect(historicalLock.packages[""].version).toBe("0.4.19");
    historicalPackage.version = "0.4.21";
    historicalPackage.dependencies.sharp = "^0.34.5";
    historicalLock.version = "0.4.21";
    historicalLock.packages[""].version = "0.4.21";
    historicalLock.packages[""].dependencies.sharp = "^0.34.5";
    delete historicalLock.packages["node_modules/@img/colour"].optional;
    delete historicalLock.packages["node_modules/sharp"].optional;
    delete historicalLock.packages["node_modules/sharp/node_modules/semver"].optional;
    const reviewed0421 = reconstructReviewed0421PackageInputs(packageJson, lockJson);
    expect(reviewed0421).not.toBeNull();
    expect(historicalPackage).toEqual(JSON.parse(reviewed0421!["package.json"]));
    expect(historicalLock).toEqual(JSON.parse(reviewed0421!["package-lock.json"]));
  });

  it("also accepts the exact historical pair without changing it", () => {
    const historical = reconstructHistoricalJuliaPackages(packageJson, lockJson);
    expect(reconstructHistoricalJuliaPackages(
      historical["package.json"], historical["package-lock.json"],
    )).toEqual(historical);
  });

  it.each([
    ["dependency", ["dependencies", "next"], "0.0.0"],
    ["reviewed media dependency", ["devDependencies", "mediabunny"], "0.0.0"],
    ["dev dependency", ["devDependencies", "vitest"], "0.0.0"],
    ["script", ["scripts", "build"], "echo changed"],
    ["engines", ["engines"], { node: "0" }],
    ["extra field", ["unreviewed"], true],
    ["unknown version", ["version"], "0.4.22"],
    ["mixed package version", ["version"], "0.4.20"],
  ] as const)("rejects package %s changes", (_name, path, value) => {
    expect(() => reconstructHistoricalJuliaPackages(
      mutate(packageJson, [...path], value), lockJson,
    )).toThrow("historical-julia-package-input-not-reviewed");
  });

  it.each([
    ["package version", ["packages", "node_modules/next", "version"], "0.0.0"],
    ["integrity", ["packages", "node_modules/next", "integrity"], "sha512-forged"],
    ["reviewed media integrity", ["packages", "node_modules/mediabunny", "integrity"], "sha512-forged"],
    ["resolved", ["packages", "node_modules/next", "resolved"], "https://example.invalid/next.tgz"],
    ["root dependency", ["packages", "", "dependencies", "next"], "0.0.0"],
    ["lock format", ["lockfileVersion"], 2],
    ["extra field", ["unreviewed"], true],
    ["mixed top version", ["version"], "0.4.20"],
    ["mixed root package version", ["packages", "", "version"], "0.4.20"],
  ] as const)("rejects lock %s changes", (_name, path, value) => {
    expect(() => reconstructHistoricalJuliaPackages(
      packageJson, mutate(lockJson, [...path], value),
    )).toThrow("historical-julia-package-input-not-reviewed");
  });

  it("rejects a coordinated but unreviewed application version bump", () => {
    expect(() => reconstructHistoricalJuliaPackages(
      mutate(packageJson, ["version"], "0.4.22"),
      mutate(mutate(lockJson, ["version"], "0.4.22"), ["packages", "", "version"], "0.4.22"),
    )).toThrow("historical-julia-package-input-not-reviewed");
  });

  it("rejects whitespace and duplicate-key changes instead of normalizing JSON", () => {
    for (const changed of [
      `${packageJson} `,
      packageJson.replace('"version": "0.4.21",', '"version": "forged", "version": "0.4.21",'),
    ]) expect(() => reconstructHistoricalJuliaPackages(changed, lockJson)).toThrow();
  });

  it("rejects tampering with the historical pair and mixed historical/current pairs", () => {
    const historical = reconstructHistoricalJuliaPackages(packageJson, lockJson);
    expect(() => reconstructHistoricalJuliaPackages(
      `${historical["package.json"]} `, historical["package-lock.json"],
    )).toThrow();
    expect(() => reconstructHistoricalJuliaPackages(
      historical["package.json"], lockJson,
    )).toThrow();
    expect(() => reconstructHistoricalJuliaPackages(
      packageJson, historical["package-lock.json"],
    )).toThrow();
  });

  it("reads every other bound source verbatim without historical substitution", () => {
    for (const [path, expected] of Object.entries(evidence.sourceBindings)) {
      if (path === "package.json" || path === "package-lock.json") continue;
      const source = readHistoricalJuliaSourceInput(path);
      expect(source).toBe(readFileSync(join(process.cwd(), path), "utf8"));
      expect(sha256(source)).toBe(expected);
      expect(sha256(`${source}\n// changed execution input`)).not.toBe(expected);
    }
  });
});
