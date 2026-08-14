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

  it('keeps the WebGL gate classified by its actual executor', () => {
    const ci = readFileSync(
      join(process.cwd(), '.github/workflows/ci.yml'),
      'utf8',
    );
    const matrix = readFileSync(
      join(process.cwd(), 'docs/testing/v0.4.18-regression-matrix.md'),
      'utf8',
    );
    const spec = readFileSync(
      join(process.cwd(), 'docs/specs/frm-compatibility-v1.md'),
      'utf8',
    );
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');

    expect(ci).not.toContain('test:webgl-smoke');
    expect(matrix).toMatch(/\| CC-5 \|[^\n]+\| L2 \(project-owned maintainer WebGL gate\) \|/);
    expect(spec).toContain(
      'The current committed workflow does not run Playwright or\n  WebGL',
    );
    expect(changelog).not.toMatch(/public WebGL gate/i);
    expect(changelog).toContain('project-owned maintainer WebGL gate');
  });
});
