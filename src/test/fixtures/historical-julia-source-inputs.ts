import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  reconstructReviewedReleasePackageInputs,
  REVIEWED_0421_PACKAGE_HASHES,
} from "../../../scripts/lib/reviewed-release-package-inputs";

const HISTORICAL = Object.freeze({
  "package.json": "852c7b8eb594c0a4b54b947ed7712a32f69907234124ddccf7e2cce46cab268f",
  "package-lock.json": "c7fb57104902f454d6dc1c29e776eebab2c19a26d98dc2253fef84058a033168",
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
    packageHash !== REVIEWED_0421_PACKAGE_HASHES["package.json"] ||
    lockHash !== REVIEWED_0421_PACKAGE_HASHES["package-lock.json"]
  ) throw new Error("historical-julia-package-input-not-reviewed");

  const historical = reconstructReviewedReleasePackageInputs(packageJson, lockJson);
  if (historical === null) {
    throw new Error("historical-julia-package-reconstruction-invalid");
  }
  return historical;
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
