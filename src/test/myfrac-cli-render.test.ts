import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FractalDocument } from '@/engine/document';
import {
  normalizeBatchEntries,
  renderBatch,
  renderThumbnail,
  summarizeDocument,
  verifyPreset,
  verifyRegression,
  writeBatchReport,
} from '@/cli/render-commands';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfrac-render-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const documentFixture: FractalDocument = {
  schemaVersion: 1,
  scene: { bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
  formula: { formulaId: 'mandelbrot', isJulia: false, juliaC: [-0.7, 0.27], power: 2 },
    coloring: {
      pipelineVersion: 1,
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

describe('myfrac cli render/verify helpers', () => {
  it('rejects verify regression without suite or spec', async () => {
    await expect(verifyRegression({ suite: 'missing-suite' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects thumbnail render without output path', async () => {
    await expect(
      renderThumbnail({
        document: {
          schemaVersion: 1,
          scene: { bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          formula: { formulaId: 'mandelbrot', isJulia: false, julia: { re: 0, im: 0 }, params: {} },
          coloring: {
            paletteIndex: 0,
            outsideColoringId: 'smooth',
            insideColoringId: 'black',
            orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
            pluginParams: {},
            lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
          },
          transform: { transformId: 'none', pluginParams: {} },
          render: { maxIterations: 200, adaptiveIterations: false, useSSAA: false },
          animation: { keyframes: [] },
          metadata: {},
          assets: {},
        },
        output: '',
        locale: 'en',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects render batch without output dir', async () => {
    await expect(
      renderBatch({
        input: [],
        outputDir: '',
        mode: 'thumbnail',
        locale: 'en',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects preset verify without preset id', async () => {
    await expect(verifyPreset({ id: '', locale: 'en' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('parses JSONL batches with generated candidate ids', () => {
    const entries = normalizeBatchEntries(`${JSON.stringify({ document: documentFixture })}\n${JSON.stringify(documentFixture)}`);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('candidate-001');
    expect(entries[1].id).toBe('candidate-002');
  });

  it('wraps invalid JSONL parse errors as CLI input errors', () => {
    try {
      normalizeBatchEntries('{"document": {}\n');
      throw new Error('Expected normalizeBatchEntries to throw.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('summarizes document metadata for review packs', () => {
    expect(summarizeDocument(documentFixture)).toMatchObject({
      formulaId: 'mandelbrot',
      paletteIndex: 0,
      transformId: 'none',
      bounds: { zoom: 0.4, rotation: 0 },
    });
  });

  it('writes review-pack markdown with parameter summary', () => {
    const outputDir = makeTempDir();
    writeBatchReport(outputDir, [
      {
        id: 'candidate-001',
        href: '/en/thumbnail?cx=-0.5',
        output: '/tmp/example.jpg',
        summary: summarizeDocument(documentFixture),
      },
    ]);

    const report = fs.readFileSync(path.join(outputDir, 'report.md'), 'utf8');
    expect(report).toContain('candidate-001');
    expect(report).toContain('formula');
    expect(report).toContain('bounds');
  });
});
