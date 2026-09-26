import {
  reconstructReviewedReleasePackageInputs,
  REVIEWED_0422_PACKAGE_HASHES,
  SEALED_RELEASE_PACKAGE_HASHES,
} from "./reviewed-release-package-inputs";

/**
 * Qualifies the exact 0.4.22 release-input transition for a sealed pre-GPU
 * authority. This does not regenerate or renew the historical asset.
 */
export function matchesSealedJuliaReleaseSourceBindings(
  bound: unknown,
  current: Readonly<Record<string, string>>,
  packageJson: string,
  lockJson: string,
): boolean {
  if (bound === null || typeof bound !== "object" || Array.isArray(bound)) {
    return false;
  }
  const boundEntries = Object.entries(bound);
  const currentKeys = Object.keys(current);
  if (
    boundEntries.length !== currentKeys.length ||
    boundEntries.some(
      ([key, digest]) =>
        !Object.hasOwn(current, key) ||
        typeof digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(digest),
    )
  ) return false;

  const differences = boundEntries.filter(
    ([key, digest]) => current[key] !== digest,
  );
  if (differences.length === 0) return true;
  if (
    differences.length !== 2 ||
    !differences.every(([key, digest]) =>
      (key === "package.json" || key === "package-lock.json") &&
      digest === SEALED_RELEASE_PACKAGE_HASHES[key]
    ) ||
    current["package.json"] !== REVIEWED_0422_PACKAGE_HASHES["package.json"] ||
    current["package-lock.json"] !==
      REVIEWED_0422_PACKAGE_HASHES["package-lock.json"]
  ) return false;

  return reconstructReviewedReleasePackageInputs(packageJson, lockJson) !== null;
}

export const matchesJuliaPreGpuReleaseSourceBindings =
  matchesSealedJuliaReleaseSourceBindings;
