import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SITE } from '@/lib/site';

interface PackageMetadata {
  version: string;
}

interface LockMetadata extends PackageMetadata {
  packages: Record<string, { version?: string }>;
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as T;

describe('release-candidate version facts', () => {
  it('keeps package, lockfile root, SITE, and CHANGELOG on one version', () => {
    const pkg = readJson<PackageMetadata>('package.json');
    const lock = readJson<LockMetadata>('package-lock.json');
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');

    expect(pkg.version).toBe('0.4.18');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
    expect(SITE.version).toBe(pkg.version);
    expect(changelog).toMatch(
      new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}(?: -|$)`, 'm'),
    );
  });
});
