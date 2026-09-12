import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HISTORICAL = Object.freeze({
  "package.json": "852c7b8eb594c0a4b54b947ed7712a32f69907234124ddccf7e2cce46cab268f",
  "package-lock.json": "c7fb57104902f454d6dc1c29e776eebab2c19a26d98dc2253fef84058a033168",
});
const METADATA_ONLY_0420 = Object.freeze({
  "package.json": "b14572c91c20a150bf28b5b0bcffc431001577e38b62d57f2bf50ff682007350",
  "package-lock.json": "476f0e862892ed77e4c14d0df1f0f86191a8ad131ae7165bf80c6c2922e03d9f",
});

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

/** Historical test input, never current release or runtime qualification. */
export function reconstructHistoricalJuliaPackages(
  packageJson: string,
  lockJson: string,
): Readonly<Record<keyof typeof HISTORICAL, string>> {
  const packageHash = sha256(packageJson);
  const lockHash = sha256(lockJson);
  if (
    packageHash === HISTORICAL["package.json"] &&
    lockHash === HISTORICAL["package-lock.json"]
  ) return Object.freeze({ "package.json": packageJson, "package-lock.json": lockJson });

  // Authenticate the complete pair before changing any bytes. In particular,
  // dependency versions, scripts, formatting and mixed root versions cannot pass.
  if (
    packageHash !== METADATA_ONLY_0420["package.json"] ||
    lockHash !== METADATA_ONLY_0420["package-lock.json"]
  ) throw new Error("historical-julia-package-input-not-reviewed");

  const historicalPackage = packageJson.replace(
    '\n  "version": "0.4.20",', '\n  "version": "0.4.19",',
  );
  const historicalLock = lockJson.replace(
    '\n  "version": "0.4.20",', '\n  "version": "0.4.19",',
  ).replace(
    '    "": {\n      "name": "fractalpark",\n      "version": "0.4.20",',
    '    "": {\n      "name": "fractalpark",\n      "version": "0.4.19",',
  );
  if (
    sha256(historicalPackage) !== HISTORICAL["package.json"] ||
    sha256(historicalLock) !== HISTORICAL["package-lock.json"]
  ) throw new Error("historical-julia-package-reconstruction-invalid");
  return Object.freeze({
    "package.json": historicalPackage,
    "package-lock.json": historicalLock,
  });
}

export function readHistoricalJuliaSourceInput(relativePath: string): string {
  if (relativePath === "package.json" || relativePath === "package-lock.json") {
    return reconstructHistoricalJuliaPackages(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
      readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
    )[relativePath];
  }
  // All executable sources and evidence remain byte-for-byte current inputs.
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
