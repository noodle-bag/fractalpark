import { createHash } from "node:crypto";

const SEALED_PACKAGE_HASHES = Object.freeze({
  "package.json": "852c7b8eb594c0a4b54b947ed7712a32f69907234124ddccf7e2cce46cab268f",
  "package-lock.json": "c7fb57104902f454d6dc1c29e776eebab2c19a26d98dc2253fef84058a033168",
});
const RELEASE_0420_PACKAGE_HASHES = Object.freeze({
  "package.json": "b14572c91c20a150bf28b5b0bcffc431001577e38b62d57f2bf50ff682007350",
  "package-lock.json": "476f0e862892ed77e4c14d0df1f0f86191a8ad131ae7165bf80c6c2922e03d9f",
});

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function reconstructSealedPackageInputs(
  packageJson: string,
  lockJson: string,
): Readonly<Record<keyof typeof SEALED_PACKAGE_HASHES, string>> | null {
  if (
    sha256(packageJson) !== RELEASE_0420_PACKAGE_HASHES["package.json"] ||
    sha256(lockJson) !== RELEASE_0420_PACKAGE_HASHES["package-lock.json"]
  ) return null;

  const sealedPackage = packageJson.replace(
    '\n  "version": "0.4.20",',
    '\n  "version": "0.4.19",',
  );
  const sealedLock = lockJson
    .replace(
      '\n  "version": "0.4.20",',
      '\n  "version": "0.4.19",',
    )
    .replace(
      '    "": {\n      "name": "fractalpark",\n      "version": "0.4.20",',
      '    "": {\n      "name": "fractalpark",\n      "version": "0.4.19",',
    );
  if (
    sha256(sealedPackage) !== SEALED_PACKAGE_HASHES["package.json"] ||
    sha256(sealedLock) !== SEALED_PACKAGE_HASHES["package-lock.json"]
  ) return null;
  return Object.freeze({
    "package.json": sealedPackage,
    "package-lock.json": sealedLock,
  });
}

/**
 * Qualifies the exact 0.4.20 metadata-only package transition for a sealed
 * pre-GPU authority. This does not regenerate or renew the historical asset.
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
      digest === SEALED_PACKAGE_HASHES[key]
    ) ||
    current["package.json"] !== RELEASE_0420_PACKAGE_HASHES["package.json"] ||
    current["package-lock.json"] !==
      RELEASE_0420_PACKAGE_HASHES["package-lock.json"]
  ) return false;

  return reconstructSealedPackageInputs(packageJson, lockJson) !== null;
}

export const matchesJuliaPreGpuReleaseSourceBindings =
  matchesSealedJuliaReleaseSourceBindings;
