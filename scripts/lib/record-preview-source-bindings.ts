import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OLD_LOCK = 'c7fb57104902f454d6dc1c29e776eebab2c19a26d98dc2253fef84058a033168';
const CURRENT_LOCK = '476f0e862892ed77e4c14d0df1f0f86191a8ad131ae7165bf80c6c2922e03d9f';
const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');

// This Record-only proof does not renew historical Julia or performance evidence.
export function isReviewedRecordPreviewMetadataTransition(
  packageJson: string,
  lockJson: string,
): boolean {
  if (sha256(packageJson) !== 'b14572c91c20a150bf28b5b0bcffc431001577e38b62d57f2bf50ff682007350' ||
      sha256(lockJson) !== CURRENT_LOCK) return false;
  const oldPackage = packageJson.replace(
    '\n  "version": "0.4.20",', '\n  "version": "0.4.19",',
  );
  const oldLock = lockJson.replace(
    '\n  "version": "0.4.20",', '\n  "version": "0.4.19",',
  ).replace(
    '    "": {\n      "name": "fractalpark",\n      "version": "0.4.20",',
    '    "": {\n      "name": "fractalpark",\n      "version": "0.4.19",',
  );
  return sha256(oldPackage) === '852c7b8eb594c0a4b54b947ed7712a32f69907234124ddccf7e2cce46cab268f' &&
    sha256(oldLock) === OLD_LOCK;
}

/** Exact current bindings, or the one reviewed metadata-only lock transition. */
export function matchesRecordPreviewSourceBindings(
  bound: unknown,
  current: Readonly<Record<string, string>>,
): boolean {
  if (bound === null || typeof bound !== 'object' || Array.isArray(bound)) return false;
  const entries = Object.entries(bound);
  const keys = Object.keys(current);
  if (entries.length !== keys.length || entries.some(([key, digest]) =>
    !Object.hasOwn(current, key) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) return false;
  const differences = entries.filter(([key, digest]) => digest !== current[key]);
  if (differences.length === 0) return true;
  if (differences.length !== 1 || differences[0]![0] !== 'package-lock.json' ||
      differences[0]![1] !== OLD_LOCK || current['package-lock.json'] !== CURRENT_LOCK) return false;
  const reviewed = isReviewedRecordPreviewMetadataTransition(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
  );
  if (reviewed) console.log('[record-preview:bindings] verified metadata-only 0.4.19 -> 0.4.20; all other source bytes exact');
  return reviewed;
}
