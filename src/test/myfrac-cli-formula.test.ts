import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formulaGenerate } from '@/cli/formula-commands';

describe('myfrac cli formula commands', () => {
  it('generates deterministic formula data for an explicit seed', () => {
    const result = formulaGenerate({ seed: 'mf1-0a00000000601020' });

    expect(result.ok).toBe(true);
    expect(result.data.seed).toBe('mf1-0a00000000601020');
    expect(result.data.source).toContain(`${result.data.formulaName} {`);
    expect(result.data.compile.success).toBe(true);
  });

  it('normalizes uppercase seeds', () => {
    const result = formulaGenerate({ seed: 'MF1-0A00000000601020' });

    expect(result.ok).toBe(true);
    expect(result.data.seed).toBe('mf1-0a00000000601020');
  });

  it('returns a generated seed when omitted', () => {
    const result = formulaGenerate({});

    expect(result.ok).toBe(true);
    expect(result.data.seed).toMatch(/^mf1-[0-9a-f]{16}$/);
    expect(result.data.compile.success).toBe(true);
  });

  it('uses recent history to avoid immediately repeating the same blueprint', () => {
    const historyPath = path.join(os.tmpdir(), `myfrac-formula-history-${Date.now()}.json`);
    const repeatedSeed = 'mf1-10a0101000602030';
    const diversifiedSeed = 'mf1-10a0f02000602031';

    const firstBytes = Array.from({ length: 6 }, () => seedToBytes(repeatedSeed)).flat();
    let firstIndex = 0;
    const first = formulaGenerate({
      historyPath,
      randomByte: () => firstBytes[firstIndex++],
    });

    expect(first.ok).toBe(true);
    expect(first.data.selection.blueprint).toBe('poly.core.shifted');

    const secondBytes = [
      ...Array.from({ length: 5 }, () => seedToBytes(repeatedSeed)).flat(),
      ...seedToBytes(diversifiedSeed),
    ];
    let secondIndex = 0;
    const second = formulaGenerate({
      historyPath,
      randomByte: () => secondBytes[secondIndex++],
    });

    expect(second.ok).toBe(true);
    expect(second.data.selection.blueprint).toBe('poly.core.affine-shift');

    fs.rmSync(historyPath, { force: true });
  });
});

function seedToBytes(seed: string): number[] {
  return seed
    .slice(4)
    .match(/.{2}/g)!
    .map((pair) => Number.parseInt(pair, 16));
}
