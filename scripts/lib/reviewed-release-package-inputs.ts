import { createHash } from "node:crypto";

export const SEALED_RELEASE_PACKAGE_HASHES = Object.freeze({
  "package.json": "852c7b8eb594c0a4b54b947ed7712a32f69907234124ddccf7e2cce46cab268f",
  "package-lock.json": "c7fb57104902f454d6dc1c29e776eebab2c19a26d98dc2253fef84058a033168",
});

export const REVIEWED_0421_PACKAGE_HASHES = Object.freeze({
  "package.json": "c7a9e6b6ea6672ce5ce12b48c57d79e2fd32769cd9b1554955a8550f80566215",
  "package-lock.json": "0a7dac65199459ad6aebeefa56c659e1d99bab9d5c8bc2aca081c773cdae6615",
});

export const REVIEWED_0422_PACKAGE_HASHES = Object.freeze({
  "package.json": "7dc543f2d181b6fbb8ea8fbc122a484b1629e193318bfc3008b6047076b882fb",
  "package-lock.json": "2803d81f3e5cc522e25e70246f69f775c2bb499c8453c80d5026d1d802b09e48",
});

export function sha256ReleaseInput(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function restoreOptionalFlag(
  lockJson: string,
  packagePath: string,
  license: string,
): string {
  const header = `    "${packagePath}": {`;
  const start = lockJson.indexOf(header);
  if (start < 0) return lockJson;
  const next = lockJson.indexOf('\n    "node_modules/', start + header.length);
  const end = next < 0 ? lockJson.length : next;
  const block = lockJson.slice(start, end);
  const licenseLine = `      "license": "${license}",`;
  if (!block.includes(licenseLine) || block.includes('      "optional": true,')) {
    return lockJson;
  }
  const restored = block.replace(
    licenseLine,
    `${licenseLine}\n      "optional": true,`,
  );
  return `${lockJson.slice(0, start)}${restored}${lockJson.slice(end)}`;
}

function removeLockPackageBlock(lockJson: string, packagePath: string): string {
  const header = `    "${packagePath}": {`;
  const start = lockJson.indexOf(header);
  if (start < 0) return lockJson;
  const next = lockJson.indexOf('\n    "node_modules/', start + header.length);
  const end = next < 0 ? lockJson.length : next + 1;
  return `${lockJson.slice(0, start)}${lockJson.slice(end)}`;
}

/** Removes only the exact reviewed 0.4.22 media-export dependency transition. */
export function reconstructReviewed0421PackageInputs(
  packageJson: string,
  lockJson: string,
): Readonly<Record<"package.json" | "package-lock.json", string>> | null {
  if (
    sha256ReleaseInput(packageJson) !== REVIEWED_0422_PACKAGE_HASHES["package.json"] ||
    sha256ReleaseInput(lockJson) !== REVIEWED_0422_PACKAGE_HASHES["package-lock.json"]
  ) return null;

  const reviewedPackage = packageJson
    .replace('\n  "version": "0.4.22",', '\n  "version": "0.4.21",')
    .replace('    "mediabunny": "^1.59.1",\n', '');
  let reviewedLock = lockJson
    .replace('\n  "version": "0.4.22",', '\n  "version": "0.4.21",')
    .replace('      "version": "0.4.22",', '      "version": "0.4.21",')
    .replace('        "mediabunny": "^1.59.1",\n', '');
  for (const packagePath of [
    "node_modules/@types/dom-mediacapture-transform",
    "node_modules/@types/dom-webcodecs",
    "node_modules/mediabunny",
  ]) reviewedLock = removeLockPackageBlock(reviewedLock, packagePath);

  if (
    sha256ReleaseInput(reviewedPackage) !== REVIEWED_0421_PACKAGE_HASHES["package.json"] ||
    sha256ReleaseInput(reviewedLock) !== REVIEWED_0421_PACKAGE_HASHES["package-lock.json"]
  ) return null;
  return Object.freeze({
    "package.json": reviewedPackage,
    "package-lock.json": reviewedLock,
  });
}

/**
 * Reconstructs the sealed 0.4.19 package inputs from the exact reviewed
 * 0.4.21 pair or its exact reviewed 0.4.22 media-export successor. No
 * generated authority or published asset is rewritten.
 */
export function reconstructReviewedReleasePackageInputs(
  packageJson: string,
  lockJson: string,
): Readonly<Record<keyof typeof SEALED_RELEASE_PACKAGE_HASHES, string>> | null {
  const packageHash = sha256ReleaseInput(packageJson);
  const lockHash = sha256ReleaseInput(lockJson);
  let reviewedPackage = packageJson;
  let reviewedLock = lockJson;
  if (
    packageHash === REVIEWED_0422_PACKAGE_HASHES["package.json"] &&
    lockHash === REVIEWED_0422_PACKAGE_HASHES["package-lock.json"]
  ) {
    const reconstructed = reconstructReviewed0421PackageInputs(packageJson, lockJson);
    if (!reconstructed) return null;
    reviewedPackage = reconstructed["package.json"];
    reviewedLock = reconstructed["package-lock.json"];
  } else if (
    packageHash !== REVIEWED_0421_PACKAGE_HASHES["package.json"] ||
    lockHash !== REVIEWED_0421_PACKAGE_HASHES["package-lock.json"]
  ) return null;

  const sealedPackage = reviewedPackage
    .replace('\n  "version": "0.4.21",', '\n  "version": "0.4.19",')
    .replace('    "sharp": "^0.34.5",\n', '');
  let sealedLock = reviewedLock
    .replace('\n  "version": "0.4.21",', '\n  "version": "0.4.19",')
    .replace('      "version": "0.4.21",', '      "version": "0.4.19",')
    .replace('        "sharp": "^0.34.5",\n', '');
  sealedLock = restoreOptionalFlag(sealedLock, "node_modules/@img/colour", "MIT");
  sealedLock = restoreOptionalFlag(sealedLock, "node_modules/sharp", "Apache-2.0");
  sealedLock = restoreOptionalFlag(sealedLock, "node_modules/sharp/node_modules/semver", "ISC");

  if (
    sha256ReleaseInput(sealedPackage) !== SEALED_RELEASE_PACKAGE_HASHES["package.json"] ||
    sha256ReleaseInput(sealedLock) !== SEALED_RELEASE_PACKAGE_HASHES["package-lock.json"]
  ) return null;
  return Object.freeze({
    "package.json": sealedPackage,
    "package-lock.json": sealedLock,
  });
}
