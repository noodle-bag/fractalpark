import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exploreBatch, exploreMutate, exploreShard } from '@/cli/explore-commands';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfrac-phase3-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const baseDocument = {
  schemaVersion: 1,
  scene: {
    bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
  },
  formula: {
    formulaId: 'mandelbrot',
    isJulia: false,
    juliaC: [-0.7, 0.27],
    power: 2,
  },
  coloring: {
    paletteIndex: 0,
    customGradient: null,
    outsideColoringId: 'smooth',
    insideColoringId: 'black',
    orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
    lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
  },
  transform: { transformId: 'none' },
  render: { maxIterations: 200, adaptiveIterations: false, useSSAA: false },
  animation: { keyframes: [] },
  metadata: {},
  assets: {},
};

describe('myfrac cli explore commands', () => {
  it('generates deterministic mutate candidates with traces', () => {
    const config = {
      id: 'campaign-deterministic',
      seedSources: [{ type: 'document', path: '__in-memory__' }],
      budget: { candidateCount: 4, shardCount: 1 },
      mutation: {
        deterministicSeed: 42,
        strategies: ['bounds-jitter', 'palette-gradient-variant', 'transform-switch'],
      },
      styleTags: ['blue'],
      structuralTags: ['clear-structure'],
      portfolioRoleTags: ['entry'],
    };

    const first = exploreMutate({ document: baseDocument, config });
    const second = exploreMutate({ document: baseDocument, config });

    expect(first.data.items).toHaveLength(4);
    expect(first.data.items.map((item) => item.id)).toEqual(second.data.items.map((item) => item.id));
    expect(first.data.items[0].mutationTrace.length).toBeGreaterThan(1);
    expect(first.data.items[0].targetTags.structural).toContain('clear-structure');
  });

  it('writes manifest and merged candidates for explore batch', () => {
    const outputDir = makeTempDir();
    const config = {
      id: 'campaign-batch',
      seedSources: [
        { type: 'preset', presetId: 'preset-newton-deep-spiral' },
      ],
      budget: { candidateCount: 3, shardCount: 2 },
      mutation: {
        deterministicSeed: 7,
        strategies: ['bounds-jitter', 'bounds-zoom-ladder', 'formula-family-swap'],
      },
      targetFamilies: ['classic', 'newton'],
      structuralTags: ['remaining-depth'],
    };

    const result = exploreBatch({ config, outputDir });

    expect(result.data.count).toBe(3);
    expect(fs.existsSync(result.data.manifest)).toBe(true);
    expect(fs.existsSync(result.data.merged)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.data.manifest, 'utf8'));
    const mergedLines = fs.readFileSync(result.data.merged, 'utf8').trim().split('\n');

    expect(manifest.runId).toBe('campaign-batch');
    expect(manifest.shardCount).toBe(2);
    expect(mergedLines).toHaveLength(3);
    expect(fs.existsSync(path.join(outputDir, 'reports', 'campaign-summary.md'))).toBe(true);
  });

  it('writes deterministic shard outputs from a manifest', () => {
    const outputDir = makeTempDir();
    const config = {
      id: 'campaign-shard',
      seedSources: [
        { type: 'preset', presetId: 'preset-newton-deep-spiral' },
      ],
      budget: { candidateCount: 4, shardCount: 2 },
      mutation: {
        deterministicSeed: 11,
        strategies: ['bounds-jitter', 'transform-switch', 'inside-outside-variant'],
      },
    };

    const batch = exploreBatch({ config, outputDir });
    const shard0 = exploreShard({ manifestPath: batch.data.manifest, shardIndex: 0 });
    const shard1 = exploreShard({ manifestPath: batch.data.manifest, shardIndex: 1 });

    expect(fs.existsSync(shard0.data.output)).toBe(true);
    expect(fs.existsSync(shard1.data.output)).toBe(true);

    const shard0Lines = fs.readFileSync(shard0.data.output, 'utf8').trim().split('\n');
    const shard1Lines = fs.readFileSync(shard1.data.output, 'utf8').trim().split('\n');

    expect(shard0Lines.length + shard1Lines.length).toBe(4);
    expect(shard0.data.shardIndex).toBe(0);
    expect(shard1.data.shardIndex).toBe(1);
  });
});
