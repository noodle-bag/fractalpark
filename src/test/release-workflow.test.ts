import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkflow = (name: string): string =>
  readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

const countOccurrences = (source: string, needle: string): number =>
  source.split(needle).length - 1;

describe('release workflow boundaries', () => {
  it('keeps the baseline CI independent of heavyweight Record asset verification', () => {
    const ci = readWorkflow('ci.yml');

    expect(ci).toContain('npm run lint');
    expect(ci).toContain('npm run test:run');
    expect(ci).toContain('npm run build');
    expect(ci).toContain('npm run formula:rights:verify-build');
    expect(ci).not.toContain('verify-formula-record-preview-profiles');
    expect(ci).not.toContain('verify-formula-record-masters');
    expect(ci).not.toContain('formula:performance:verify');
    expect(ci).not.toContain('playwright install');
  });

  it('runs heavyweight Record verification only in its path-filtered workflow', () => {
    const assets = readWorkflow('formula-record-assets.yml');

    expect(assets).toContain('paths:');
    expect(assets).toContain('pull_request:');
    expect(assets).toContain('push:');
    expect(assets).toContain('branches: [main]');
    expect(assets).toContain('workflow_dispatch:');
    expect(assets).toContain('verify-formula-record-preview-profiles.ts');
    expect(assets).toContain('verify-formula-record-masters.ts');

    const requiredInputPaths = [
      'public/formula-library/v1/previews/**',
      'public/formula-library/v1/record-previews/**',
      'public/formula-library/v1/runtime/published/**',
      'resources/formula-library/**',
      'src/engine/**',
      'scripts/*formula-record-preview*',
      'scripts/*formula-record-masters*',
      'package-lock.json',
    ];
    for (const inputPath of requiredInputPaths) {
      expect(countOccurrences(assets, `"${inputPath}"`)).toBe(2);
    }
  });

  it('publishes tags from verified delivery facts without rebuilding the application', () => {
    const release = readWorkflow('release.yml');

    expect(release).toContain('workflow_dispatch:');
    expect(release).toContain('git cat-file -t');
    expect(release).toContain('git merge-base --is-ancestor');
    expect(release).toContain('--workflow CI');
    expect(release).toContain('--commit "$tag_sha"');
    expect(release).toContain('--branch main');
    expect(release).toContain('--event push');
    expect(release).toContain('select(.conclusion == "success")');
    expect(release).toContain('environment=Production');
    expect(release).toContain('/deployments/$deployment_id/statuses');
    expect(release).toContain('test "$deployment_state" = "success"');
    expect(release).not.toContain('/commits/$tag_sha/status');
    expect(release).toContain('release-tag-version-mismatch');
    expect(release).toContain('gh release create');
    expect(release).not.toContain('npm ci');
    expect(release).not.toContain('npm run build');
    expect(release).not.toContain('formula:performance:release');
    expect(release).not.toContain('verify-formula-record-masters');
  });
});
