import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  reconstructReviewedReleasePackageInputs,
  REVIEWED_0422_PACKAGE_HASHES,
  SEALED_RELEASE_PACKAGE_HASHES,
} from './reviewed-release-package-inputs';

const OLD_LOCK = SEALED_RELEASE_PACKAGE_HASHES['package-lock.json'];
const CURRENT_LOCK = REVIEWED_0422_PACKAGE_HASHES['package-lock.json'];

// This Record-only proof does not renew historical Julia or performance evidence.
export function isReviewedRecordPreviewReleaseTransition(
  packageJson: string,
  lockJson: string,
): boolean {
  return reconstructReviewedReleasePackageInputs(packageJson, lockJson) !== null;
}

/** Exact current bindings, or the one reviewed release-input lock transition. */
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
  const reviewed = isReviewedRecordPreviewReleaseTransition(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
  );
  if (reviewed) console.log('[record-preview:bindings] verified release inputs 0.4.19 -> 0.4.22; all other source bytes exact');
  return reviewed;
}
