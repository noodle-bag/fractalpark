import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  README_GENERATED_BEGIN,
  README_GENERATED_END,
  buildReadmeProductBlock,
  renderReadme,
} from '../../scripts/generate-readme';
import { PUBLIC_PROJECT } from '@/content/public-project';

/**
 * README contract tests — the committed README product block must always be
 * reproducible from the public-project content contract. This is the same
 * drift gate as `npm run readme:check`, kept in the unit suite so it runs
 * with every test pass.
 */

const readmePath = join(process.cwd(), 'README.md');
const committedReadme = readFileSync(readmePath, 'utf8');

describe('README generator', () => {
  it('is deterministic', () => {
    expect(buildReadmeProductBlock()).toBe(buildReadmeProductBlock());
  });

  it('marks exactly one generated region in the committed README', () => {
    expect(committedReadme.split(README_GENERATED_BEGIN)).toHaveLength(2);
    expect(committedReadme.split(README_GENERATED_END)).toHaveLength(2);
    expect(
      committedReadme.indexOf(README_GENERATED_BEGIN)
    ).toBeLessThan(committedReadme.indexOf(README_GENERATED_END));
  });

  it('has no drift between the committed README and the contract', () => {
    expect(renderReadme(committedReadme)).toBe(committedReadme);
  });

  it('includes positioning, hero, four capabilities, boundaries, and license', () => {
    const block = buildReadmeProductBlock();
    expect(block).toContain(PUBLIC_PROJECT.tagline);
    expect(block).toContain(`public${PUBLIC_PROJECT.heroImage.src}`);
    for (const capability of PUBLIC_PROJECT.capabilities) {
      expect(block).toContain(capability.titleEn);
      expect(block).toContain(capability.summaryEn);
    }
    for (const item of PUBLIC_PROJECT.boundaries.currentEn) {
      expect(block).toContain(item);
    }
    expect(block).toContain('MIT License');
  });

  it('links CTAs to the canonical www host and keeps Drift out of the CTAs', () => {
    const block = buildReadmeProductBlock();
    for (const cta of PUBLIC_PROJECT.ctas) {
      expect(block).toContain(`https://www.fractalpark.com/en${cta.href}`);
    }
    expect(block).not.toContain('/drift');
  });

  it('does not present future directions as shipped capabilities', () => {
    const block = buildReadmeProductBlock();
    expect(block).toContain('On the roadmap (not released):');
    // Boundaries must explicitly negate accounts/cloud, not claim them.
    expect(block).toContain('no accounts, no cloud sync');
  });
});
