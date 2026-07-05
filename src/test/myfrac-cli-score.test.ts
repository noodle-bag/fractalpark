import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { presetDraft, reportRun, scoreBatch, selectTop, selectTopRecords } from '@/cli/score-commands';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfrac-score-'));
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
  scene: { bounds: { centerX: -0.5, centerY: 0, zoom: 32, rotation: 0 } },
  formula: { formulaId: 'celticBurningShip', isJulia: false, juliaC: [-0.7, 0.27], power: 2 },
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

async function writeStructuredImage(outputPath: string): Promise<void> {
  const width = 96;
  const height = 96;
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels, 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const centerDistance = Math.hypot(x - 48, y - 48);
      const stripe = (x + y) % 18 < 9;
      const ring = Math.abs(centerDistance - 24) < 3 || Math.abs(centerDistance - 12) < 2;
      const value = ring ? 230 : stripe ? 140 : 28;
      pixels[index] = value;
      pixels[index + 1] = stripe ? 148 : value;
      pixels[index + 2] = ring ? 236 : value;
    }
  }
  await sharp(pixels, { raw: { width, height, channels } }).png().toFile(outputPath);
}

async function writeBlackImage(outputPath: string): Promise<void> {
  await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).png().toFile(outputPath);
}

describe('myfrac cli phase 4 score/select/report helpers', () => {
  it('scores candidates against image metrics and quality gates', async () => {
    const dir = makeTempDir();
    const goodImage = path.join(dir, 'good.png');
    const blackImage = path.join(dir, 'black.png');
    await writeStructuredImage(goodImage);
    await writeBlackImage(blackImage);

    const candidates = [
      {
        id: 'good-001',
        document: baseDocument,
        mutationTrace: [],
        targetTags: {
          style: ['blue'],
          structural: ['clear-structure', 'remaining-depth'],
          portfolioRole: ['deep-dive'],
        },
      },
      {
        id: 'black-001',
        document: {
          ...baseDocument,
          scene: { bounds: { centerX: 0, centerY: 0, zoom: 1.2, rotation: 0 } },
        },
        mutationTrace: [],
        targetTags: {
          style: ['quiet'],
          structural: [],
          portfolioRole: ['contemplative'],
        },
      },
    ];

    const candidatesPath = path.join(dir, 'candidates.jsonl');
    fs.writeFileSync(candidatesPath, `${candidates.map((item) => JSON.stringify(item)).join('\n')}\n`);
    const renderManifestPath = path.join(dir, 'render-manifest.json');
    fs.writeFileSync(
      renderManifestPath,
      `${JSON.stringify({
        mode: 'thumbnail',
        locale: 'en',
        items: [
          {
            id: 'good-001',
            output: goodImage,
            href: '/en/explore?good=1',
            url: 'https://fractalpark.com/en/explore?good=1',
            summary: {
              formulaId: 'celticBurningShip',
              isJulia: false,
              paletteIndex: 0,
              outsideColoringId: 'smooth',
              insideColoringId: 'black',
              transformId: 'none',
              bounds: { centerX: -0.5, centerY: 0, zoom: 32, rotation: 0 },
            },
          },
          {
            id: 'black-001',
            output: blackImage,
            href: '/en/explore?black=1',
            url: 'https://fractalpark.com/en/explore?black=1',
            summary: {
              formulaId: 'celticBurningShip',
              isJulia: false,
              paletteIndex: 0,
              outsideColoringId: 'smooth',
              insideColoringId: 'black',
              transformId: 'none',
              bounds: { centerX: 0, centerY: 0, zoom: 1.2, rotation: 0 },
            },
          },
        ],
      }, null, 2)}\n`,
    );

    const result = await scoreBatch({
      input: fs.readFileSync(candidatesPath, 'utf8'),
      renderManifest: renderManifestPath,
      outputDir: path.join(dir, 'scores'),
    });

    const scoredPath = result.data.scored;
    const scored = fs.readFileSync(scoredPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    expect(scored).toHaveLength(2);
    const good = scored.find((item) => item.id === 'good-001');
    const black = scored.find((item) => item.id === 'black-001');
    expect(good.scoring.qualityGate).not.toBe('reject');
    expect(black.scoring.qualityGate).toBe('reject');
    expect(good.scoring.total).toBeGreaterThan(black.scoring.total);
  });

  it('selects diversified top records', () => {
    const records = [
      {
        id: 'a',
        document: { ...baseDocument, formula: { ...baseDocument.formula, formulaId: 'mandelbrot' } },
        mutationTrace: [],
        targetTags: { style: [], structural: ['clear-structure'], portfolioRole: ['entry'] },
        render: { id: 'a', output: '/tmp/a.png', href: '/en/explore?a=1', url: 'https://fractalpark.com/en/explore?a=1', summary: { formulaId: 'mandelbrot', isJulia: false, paletteIndex: 0, outsideColoringId: 'smooth', insideColoringId: 'black', transformId: 'none', bounds: { centerX: 0, centerY: 0, zoom: 10, rotation: 0 } } },
        portfolio: { signature: 'mandelbrot|m|none|smooth|black|0', family: 'classic', overlapWithFeatured: false, overlapReasons: [] },
        scoring: { total: 82, qualityGate: 'keep', componentScores: { contrast: 10, entropy: 10, edge: 10, center: 10, colorDiscipline: 10, animationPotential: 0, portfolioDiversity: 6, structuralMystery: 8 }, metrics: { blackRatio: 0.1, brightRatio: 0, contrastStdDev: 24, entropy: 3.2, edgeDensity: 0.1, centerEnergyRatio: 1.2, colorfulness: 22 }, labels: ['clear-structure'], penalties: [], rationale: [] },
      },
      {
        id: 'b',
        document: { ...baseDocument, formula: { ...baseDocument.formula, formulaId: 'newton5' } },
        mutationTrace: [],
        targetTags: { style: [], structural: ['strong-layering'], portfolioRole: ['deep-dive'] },
        render: { id: 'b', output: '/tmp/b.png', href: '/en/explore?b=1', url: 'https://fractalpark.com/en/explore?b=1', summary: { formulaId: 'newton5', isJulia: false, paletteIndex: 0, outsideColoringId: 'smooth', insideColoringId: 'black', transformId: 'none', bounds: { centerX: 0, centerY: 0, zoom: 10, rotation: 0 } } },
        portfolio: { signature: 'newton5|m|none|smooth|black|0', family: 'newton', overlapWithFeatured: false, overlapReasons: [] },
        scoring: { total: 79, qualityGate: 'keep', componentScores: { contrast: 10, entropy: 10, edge: 10, center: 10, colorDiscipline: 10, animationPotential: 0, portfolioDiversity: 6, structuralMystery: 8 }, metrics: { blackRatio: 0.1, brightRatio: 0, contrastStdDev: 24, entropy: 3.2, edgeDensity: 0.1, centerEnergyRatio: 1.2, colorfulness: 22 }, labels: ['strong-layering'], penalties: [], rationale: [] },
      },
      {
        id: 'c',
        document: { ...baseDocument, formula: { ...baseDocument.formula, formulaId: 'mandelbrot' } },
        mutationTrace: [],
        targetTags: { style: [], structural: ['clear-structure'], portfolioRole: ['entry'] },
        render: { id: 'c', output: '/tmp/c.png', href: '/en/explore?c=1', url: 'https://fractalpark.com/en/explore?c=1', summary: { formulaId: 'mandelbrot', isJulia: false, paletteIndex: 0, outsideColoringId: 'smooth', insideColoringId: 'black', transformId: 'none', bounds: { centerX: 0, centerY: 0, zoom: 10, rotation: 0 } } },
        portfolio: { signature: 'mandelbrot|m|none|smooth|black|0', family: 'classic', overlapWithFeatured: false, overlapReasons: [] },
        scoring: { total: 81, qualityGate: 'keep', componentScores: { contrast: 10, entropy: 10, edge: 10, center: 10, colorDiscipline: 10, animationPotential: 0, portfolioDiversity: 6, structuralMystery: 8 }, metrics: { blackRatio: 0.1, brightRatio: 0, contrastStdDev: 24, entropy: 3.2, edgeDensity: 0.1, centerEnergyRatio: 1.2, colorfulness: 22 }, labels: ['clear-structure'], penalties: [], rationale: [] },
      },
    ];

    const shortlist = selectTopRecords(records as never[], 2);
    expect(shortlist).toHaveLength(2);
    expect(shortlist.map((item) => item.id)).toContain('a');
    expect(shortlist.map((item) => item.id)).toContain('b');
  });

  it('generates preset drafts and review reports from shortlist', () => {
    const dir = makeTempDir();
    const shortlist = {
      count: 1,
      items: [
        {
          rank: 1,
          adjustedScore: 88,
          selectionReasons: ['Fills a portfolio role'],
          id: 'candidate-001',
          document: baseDocument,
          mutationTrace: [],
          targetTags: {
            style: ['blue'],
            structural: ['clear-structure'],
            portfolioRole: ['deep-dive'],
          },
          render: {
            id: 'candidate-001',
            output: '/tmp/candidate-001.jpg',
            href: '/en/explore?candidate=1',
            url: 'https://fractalpark.com/en/explore?candidate=1',
            summary: {
              formulaId: 'mandelbrot',
              isJulia: false,
              paletteIndex: 0,
              outsideColoringId: 'smooth',
              insideColoringId: 'black',
              transformId: 'none',
              bounds: { centerX: -0.5, centerY: 0, zoom: 32, rotation: 0 },
            },
          },
          portfolio: {
            signature: 'mandelbrot|m|none|smooth|black|0',
            family: 'classic',
            overlapWithFeatured: false,
            overlapReasons: [],
          },
          scoring: {
            total: 84,
            qualityGate: 'keep',
            componentScores: {
              contrast: 10,
              entropy: 12,
              edge: 12,
              center: 8,
              colorDiscipline: 8,
              animationPotential: 0,
              portfolioDiversity: 6,
              structuralMystery: 10,
            },
            metrics: {
              blackRatio: 0.1,
              brightRatio: 0.02,
              contrastStdDev: 24,
              entropy: 3.3,
              edgeDensity: 0.11,
              centerEnergyRatio: 1.2,
              colorfulness: 18,
            },
            labels: ['clear-structure', 'remaining-depth', 'deep-dive'],
            penalties: [],
            rationale: ['Local rules are readable and the first-screen structure appears quickly.'],
          },
        },
      ],
    };

    const draft = presetDraft({
      input: shortlist,
      output: path.join(dir, 'preset-drafts.json'),
      locale: 'en',
    });
    expect(draft.data.count).toBe(1);
    expect(draft.data.items[0].preset.id).toContain('draft-celticburningship');

    const report = reportRun({
      input: JSON.stringify(shortlist.items[0]),
      selection: shortlist,
      outputDir: path.join(dir, 'report-pack'),
    });
    expect(fs.existsSync(report.data.report)).toBe(true);
    expect(fs.existsSync(report.data.contactSheet)).toBe(true);
    const html = fs.readFileSync(report.data.contactSheet, 'utf8');
    expect(html).toContain('candidate-001');
    expect(html).toContain('deep-dive');
  });

  it('writes shortlist files through select top command', () => {
    const dir = makeTempDir();
    const scoredLines = [
      {
        id: 'keep-1',
        document: baseDocument,
        mutationTrace: [],
        targetTags: { style: [], structural: ['clear-structure'], portfolioRole: ['entry'] },
        render: { id: 'keep-1', output: '/tmp/keep-1.jpg', href: '/en/explore?keep=1', url: 'https://fractalpark.com/en/explore?keep=1', summary: { formulaId: 'mandelbrot', isJulia: false, paletteIndex: 0, outsideColoringId: 'smooth', insideColoringId: 'black', transformId: 'none', bounds: { centerX: 0, centerY: 0, zoom: 5, rotation: 0 } } },
        portfolio: { signature: 'keep-1', family: 'classic', overlapWithFeatured: false, overlapReasons: [] },
        scoring: { total: 85, qualityGate: 'keep', componentScores: { contrast: 1, entropy: 1, edge: 1, center: 1, colorDiscipline: 1, animationPotential: 0, portfolioDiversity: 1, structuralMystery: 1 }, metrics: { blackRatio: 0.1, brightRatio: 0.1, contrastStdDev: 20, entropy: 3, edgeDensity: 0.1, centerEnergyRatio: 1, colorfulness: 10 }, labels: ['clear-structure'], penalties: [], rationale: [] },
      },
      {
        id: 'reject-1',
        document: baseDocument,
        mutationTrace: [],
        targetTags: { style: [], structural: [], portfolioRole: ['contemplative'] },
        render: { id: 'reject-1', output: '/tmp/reject-1.jpg', href: '/en/explore?reject=1', url: 'https://fractalpark.com/en/explore?reject=1', summary: { formulaId: 'mandelbrot', isJulia: false, paletteIndex: 0, outsideColoringId: 'smooth', insideColoringId: 'black', transformId: 'none', bounds: { centerX: 0, centerY: 0, zoom: 5, rotation: 0 } } },
        portfolio: { signature: 'reject-1', family: 'classic', overlapWithFeatured: false, overlapReasons: [] },
        scoring: { total: 10, qualityGate: 'reject', componentScores: { contrast: 1, entropy: 1, edge: 1, center: 1, colorDiscipline: 1, animationPotential: 0, portfolioDiversity: 1, structuralMystery: 1 }, metrics: { blackRatio: 0.9, brightRatio: 0.0, contrastStdDev: 1, entropy: 1, edgeDensity: 0.01, centerEnergyRatio: 1, colorfulness: 5 }, labels: ['information-exhausts-quickly'], penalties: ['black-field-dominant'], rationale: [] },
      },
    ];
    const input = `${scoredLines.map((line) => JSON.stringify(line)).join('\n')}\n`;
    const result = selectTop({ input, outputDir: path.join(dir, 'selected'), limit: 4 });
    expect(fs.existsSync(result.data.shortlist)).toBe(true);
    const shortlist = JSON.parse(fs.readFileSync(result.data.shortlist, 'utf8'));
    expect(shortlist.items).toHaveLength(1);
  });
});
