#!/usr/bin/env node
/**
 * Deterministic README generator for the public-project product block.
 *
 * The product block at the top of README.md is generated from the
 * public-project content contract (src/content/public-project.ts) — the same
 * source that drives /[locale]/about, the Explore landing SSR content, and
 * the SoftwareApplication JSON-LD. Manual README sections (Getting Started,
 * Scripts, Project Layout, Architecture, License) live outside the markers
 * and are never touched by the generator.
 *
 * Usage:
 *   npm run readme:generate   # rewrite the generated block in README.md
 *   npm run readme:check      # fail if README.md has drifted from the contract
 *
 * The generated region is fenced by:
 *   <!-- BEGIN GENERATED public-project -->
 *   <!-- END GENERATED public-project -->
 * Do not edit between the markers by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_PROJECT, publicProjectHref } from '@/content/public-project';

export const README_GENERATED_BEGIN =
  '<!-- BEGIN GENERATED public-project -->';
export const README_GENERATED_END = '<!-- END GENERATED public-project -->';

/** English product block shared by GitHub README and the About page. */
export function buildReadmeProductBlock(): string {
  const p = PUBLIC_PROJECT;
  const lines: string[] = [];

  lines.push(README_GENERATED_BEGIN);
  lines.push('');
  lines.push('# FractalPark');
  lines.push('');
  lines.push(p.tagline);
  lines.push('');
  lines.push(`![${p.heroImage.altEn}](public${p.heroImage.src})`);
  lines.push('');
  lines.push(
    `**${p.ctas
      .map((cta) => `[${cta.labelEn}](${publicProjectHref(cta.href, 'en')})`)
      .join(' · ')}**`
  );
  lines.push('');
  lines.push('## Available today');
  lines.push('');
  for (const capability of p.capabilities) {
    lines.push(`- **${capability.titleEn}** — ${capability.summaryEn}`);
  }
  lines.push('');
  lines.push('## Current boundaries');
  lines.push('');
  for (const item of p.boundaries.currentEn) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('On the roadmap (not released):');
  lines.push('');
  for (const item of p.boundaries.futureEn) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push(
    `FractalPark is released under the [MIT License](${p.license.url}).`
  );
  lines.push('');
  lines.push(README_GENERATED_END);

  return lines.join('\n');
}

/**
 * Splice the generated block into an existing README, replacing whatever is
 * currently between the markers. Throws when the markers are missing or
 * duplicated — the generator never invents marker placement.
 */
export function renderReadme(current: string): string {
  const beginIndex = current.indexOf(README_GENERATED_BEGIN);
  const endIndex = current.indexOf(README_GENERATED_END);

  if (beginIndex === -1 || endIndex === -1) {
    throw new Error(
      'README.md is missing the generated-block markers. Add ' +
        `"${README_GENERATED_BEGIN}" and "${README_GENERATED_END}" around the product block.`
    );
  }
  if (
    current.indexOf(README_GENERATED_BEGIN, beginIndex + 1) !== -1 ||
    current.indexOf(README_GENERATED_END, endIndex + 1) !== -1 ||
    endIndex < beginIndex
  ) {
    throw new Error('README.md has duplicated or misordered generated-block markers.');
  }

  const before = current.slice(0, beginIndex);
  const after = current.slice(endIndex + README_GENERATED_END.length);
  return `${before}${buildReadmeProductBlock()}${after}`;
}

function firstDifference(a: string, b: string): string {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i += 1) {
    if (aLines[i] !== bLines[i]) {
      return [
        `first difference at line ${i + 1}:`,
        `  committed: ${JSON.stringify(aLines[i] ?? '<missing>')}`,
        `  generated: ${JSON.stringify(bLines[i] ?? '<missing>')}`,
      ].join('\n');
    }
  }
  return 'files differ only in trailing content';
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') {
    console.error('Usage: tsx scripts/generate-readme.ts --write|--check');
    process.exitCode = 1;
    return;
  }

  const readmePath = join(process.cwd(), 'README.md');
  const current = readFileSync(readmePath, 'utf8');
  const next = renderReadme(current);

  if (mode === '--write') {
    if (next === current) {
      console.log('README.md already matches the public-project contract.');
      return;
    }
    writeFileSync(readmePath, next);
    console.log('README.md product block regenerated from src/content/public-project.ts.');
    return;
  }

  if (next !== current) {
    console.error('README.md has drifted from the public-project contract.');
    console.error(firstDifference(current, next));
    console.error('Run `npm run readme:generate` to regenerate the product block.');
    process.exitCode = 1;
    return;
  }
  console.log('README.md product block matches the public-project contract.');
}

if (process.argv[1] && process.argv[1].endsWith('generate-readme.ts')) {
  main();
}
