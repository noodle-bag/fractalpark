import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

export function verifyPrivateEvidenceRoot(
  root: string,
  relativePrivateRoot: string,
  errorCode: string,
): string {
  const parts = relativePrivateRoot.split("/");
  if (
    isAbsolute(relativePrivateRoot) ||
    parts.length === 0 ||
    parts.some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error(errorCode);
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error(errorCode);
  const chain = [resolve(root)];
  for (const part of parts) chain.push(join(chain.at(-1)!, part));
  for (const [index, directory] of chain.entries()) {
    const stat = lstatSync(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== uid ||
      (index > 0 && (stat.mode & 0o777) !== 0o700) ||
      realpathSync(directory) !== resolve(directory)
    )
      throw new Error(errorCode);
  }
  return chain.at(-1)!;
}

export function verifyPrivateEvidenceFile(
  privateRoot: string,
  path: string,
  errorCode: string,
): string {
  const root = realpathSync(privateRoot);
  const resolved = realpathSync(path);
  if (resolved === root || !resolved.startsWith(`${root}${sep}`))
    throw new Error(errorCode);
  return resolved;
}
