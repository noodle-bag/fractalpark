import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import profiles from '../../resources/formula-library/v1/record-preview-profiles.v1.json';
import {
  isReviewedRecordPreviewReleaseTransition,
  matchesRecordPreviewSourceBindings,
} from '../../scripts/lib/record-preview-source-bindings';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');
const packageJson = read('package.json');
const lockJson = read('package-lock.json');
const current = Object.fromEntries(Object.keys(profiles.sourceBindings).map(path => [path, sha256(read(path))]));

describe('Record preview source bindings', () => {
  it('accepts exact current bindings without rewriting them', () => {
    expect(matchesRecordPreviewSourceBindings(current, current)).toBe(true);
  });

  it('accepts the sealed Profile map only under the exact reviewed package pair', () => {
    const before = JSON.stringify(profiles);
    expect(isReviewedRecordPreviewReleaseTransition(packageJson, lockJson)).toBe(true);
    expect(matchesRecordPreviewSourceBindings(profiles.sourceBindings, current)).toBe(true);
    expect(JSON.stringify(profiles)).toBe(before);
  });

  it.each(Object.keys(profiles.sourceBindings))('rejects a changed or forged input: %s', path => {
    expect(matchesRecordPreviewSourceBindings(profiles.sourceBindings, {
      ...current, [path]: '0'.repeat(64),
    })).toBe(false);
    expect(matchesRecordPreviewSourceBindings({
      ...profiles.sourceBindings, [path]: '0'.repeat(64),
    }, current)).toBe(false);
  });

  it('rejects missing, extra and malformed bindings', () => {
    const missing: Record<string, string> = { ...profiles.sourceBindings };
    delete missing['package-lock.json'];
    for (const invalid of [missing, null, [], { ...profiles.sourceBindings, extra: '0'.repeat(64) },
      { ...profiles.sourceBindings, 'package-lock.json': 1 }]) {
      expect(matchesRecordPreviewSourceBindings(invalid, current)).toBe(false);
    }
  });

  it('rejects mixed, unknown, whitespace and duplicate-key metadata changes', () => {
    for (const candidate of [
      packageJson.replace('0.4.21', '0.4.20'),
      packageJson.replace('0.4.21', '0.4.22'),
      `${packageJson} `,
      packageJson.replace('"version": "0.4.21",', '"version": "forged", "version": "0.4.21",'),
    ]) expect(isReviewedRecordPreviewReleaseTransition(candidate, lockJson)).toBe(false);
    for (const candidate of [lockJson.replace('0.4.21', '0.4.20'), `${lockJson} `]) {
      expect(isReviewedRecordPreviewReleaseTransition(packageJson, candidate)).toBe(false);
    }
  });

  it('rejects package scripts, dependencies, engines and lock integrity changes', () => {
    const mutations = [
      { ...JSON.parse(packageJson), scripts: { build: 'changed' } },
      { ...JSON.parse(packageJson), dependencies: { next: '0' } },
      { ...JSON.parse(packageJson), devDependencies: { vitest: '0' } },
      { ...JSON.parse(packageJson), engines: { node: '0' } },
      { ...JSON.parse(packageJson), extra: true },
    ];
    for (const value of mutations) expect(isReviewedRecordPreviewReleaseTransition(
      `${JSON.stringify(value, null, 2)}\n`, lockJson,
    )).toBe(false);
    for (const key of ['version', 'integrity', 'resolved']) {
      const lock = JSON.parse(lockJson);
      lock.packages['node_modules/next'][key] = 'changed';
      expect(isReviewedRecordPreviewReleaseTransition(packageJson, `${JSON.stringify(lock, null, 2)}\n`)).toBe(false);
    }
  });
});
