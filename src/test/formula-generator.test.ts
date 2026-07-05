import { describe, expect, it } from 'vitest';
import { compileFrm } from '../engine/frm/compile';
import {
  createFormulaGenerationSeedFromBytes,
  generateDiversifiedFormula,
  generateFormulaFromSeed,
} from '../engine/frm/generator';

function seed(bytes: number[]) {
  return createFormulaGenerationSeedFromBytes(bytes);
}

describe('formula generator', () => {
  it('is deterministic for the same seed', () => {
    const result1 = generateFormulaFromSeed(seed([0x0a, 0x00, 0x00, 0x00, 0x00, 0x60, 0x10, 0x20]));
    const result2 = generateFormulaFromSeed(seed([0x0a, 0x00, 0x00, 0x00, 0x00, 0x60, 0x10, 0x20]));

    expect(result1).toEqual(result2);
  });

  it('generates compilable formulas across all families', () => {
    const seeds = [
      seed([0x0a, 0x00, 0x00, 0x00, 0x00, 0x60, 0x10, 0x20]), // Polynomial
      seed([0x32, 0x00, 0x00, 0x00, 0x00, 0x60, 0x11, 0x21]), // Rational
      seed([0x50, 0xf0, 0x00, 0x00, 0x00, 0x60, 0x12, 0x22]), // Root-Finding Halley
      seed([0x64, 0x00, 0x00, 0x00, 0x00, 0x60, 0x13, 0x23]), // Transcendental Entire
      seed([0x90, 0x00, 0x00, 0x00, 0x00, 0x60, 0x14, 0x24]), // Transcendental Meromorphic
      seed([0xaa, 0x00, 0x00, 0x00, 0x00, 0x60, 0x15, 0x25]), // Anti-Holomorphic
      seed([0xc8, 0xff, 0x00, 0x00, 0x00, 0x60, 0x16, 0x26]), // Non-Holomorphic / Piecewise
      seed([0xee, 0x00, 0x00, 0x00, 0x00, 0x60, 0x17, 0x27]), // Memory / Recurrence
    ];

    for (const currentSeed of seeds) {
      const generated = generateFormulaFromSeed(currentSeed);
      const result = compileFrm(generated.source, `test-${generated.formulaName.toLowerCase()}`);

      expect(result.success, `${generated.selection.family} should compile`).toBe(true);
      expect(generated.source).toContain(`${generated.formulaName} {`);
    }
  });

  it('clips wrapper flags for non-wrapper-safe blueprints', () => {
    const generated = generateFormulaFromSeed(seed([0xaa, 0x00, 0x00, 0x00, 0x0c, 0x60, 0x18, 0x28]));

    expect(generated.selection.family).toBe('Anti-Holomorphic');
    expect(generated.selection.requestedFeatureFlags).toEqual(
      expect.arrayContaining(['wrapper_flip_on', 'wrapper_conj_on'])
    );
    expect(generated.selection.appliedFeatureFlags).not.toContain('wrapper_flip_on');
    expect(generated.selection.appliedFeatureFlags).not.toContain('wrapper_conj_on');
  });

  it('routes halley-like mechanism to a concrete blueprint', () => {
    const generated = generateFormulaFromSeed(seed([0x50, 0xff, 0x00, 0x00, 0x00, 0x60, 0x19, 0x29]));

    expect(generated.selection.family).toBe('Root-Finding');
    expect(generated.selection.mechanism).toBe('halley-like-step');
    expect(generated.selection.blueprint).toBe('root.halley.poly');

    const result = compileFrm(generated.source, 'test-halley');
    expect(result.success).toBe(true);
  });

  it('splits previously collapsed mechanisms across multiple blueprints', () => {
    const polynomialShiftA = generateFormulaFromSeed(seed([0x10, 0xa0, 0x10, 0x10, 0x00, 0x60, 0x20, 0x30]));
    const polynomialShiftB = generateFormulaFromSeed(seed([0x10, 0xa0, 0xf0, 0x20, 0x00, 0x60, 0x20, 0x31]));

    expect(polynomialShiftA.selection.mechanism).toBe('parameter-shift');
    expect(polynomialShiftA.selection.blueprint).toBe('poly.core.shifted');
    expect(polynomialShiftB.selection.blueprint).toBe('poly.core.affine-shift');

    const polynomialPixelA = generateFormulaFromSeed(seed([0x10, 0xf0, 0x10, 0x10, 0x00, 0x60, 0x21, 0x32]));
    const polynomialPixelB = generateFormulaFromSeed(seed([0x10, 0xf0, 0xf0, 0x20, 0x00, 0x60, 0x21, 0x33]));

    expect(polynomialPixelA.selection.mechanism).toBe('pixel-coupling-light');
    expect(polynomialPixelA.selection.blueprint).toBe('poly.core.pixel-coupled');
    expect(polynomialPixelB.selection.blueprint).toBe('poly.core.pixel-orbit');

    const antiShiftA = generateFormulaFromSeed(seed([0xa8, 0xa0, 0x10, 0x10, 0x00, 0x60, 0x22, 0x34]));
    const antiShiftB = generateFormulaFromSeed(seed([0xa8, 0xa0, 0x40, 0x20, 0x00, 0x60, 0x22, 0x35]));
    const antiShiftC = generateFormulaFromSeed(seed([0xa8, 0xa0, 0x90, 0x30, 0x00, 0x60, 0x22, 0x36]));

    expect(antiShiftA.selection.mechanism).toBe('conjugate-shift');
    expect(antiShiftA.selection.blueprint).toBe('anti.conj.shift');
    expect(antiShiftB.selection.blueprint).toBe('anti.conj.affine');
    expect(antiShiftC.selection.blueprint).toBe('anti.conj.reciprocal');

    const memoryFeedbackA = generateFormulaFromSeed(seed([0xe8, 0x10, 0x10, 0x10, 0x00, 0x60, 0x23, 0x36]));
    const memoryFeedbackB = generateFormulaFromSeed(seed([0xe8, 0x10, 0x55, 0x20, 0x00, 0x60, 0x23, 0x37]));
    const memoryFeedbackC = generateFormulaFromSeed(seed([0xe8, 0x10, 0x80, 0x30, 0x00, 0x60, 0x23, 0x38]));
    const memoryFeedbackD = generateFormulaFromSeed(seed([0xe8, 0x10, 0x90, 0x40, 0x00, 0x60, 0x23, 0x39]));

    expect(memoryFeedbackA.selection.mechanism).toBe('feedback');
    expect(memoryFeedbackA.selection.blueprint).toBe('memory.echo.quadratic');
    expect(memoryFeedbackB.selection.blueprint).toBe('memory.echo.shifted');
    expect(memoryFeedbackC.selection.blueprint).toBe('memory.transcendental.echo');
    expect(memoryFeedbackD.selection.blueprint).toBe('memory.echo.inversion');

    const memorySlotA = generateFormulaFromSeed(seed([0xe8, 0xd0, 0x10, 0x10, 0x00, 0x60, 0x24, 0x39]));
    const memorySlotB = generateFormulaFromSeed(seed([0xe8, 0xd0, 0xf0, 0x20, 0x00, 0x60, 0x24, 0x3a]));

    expect(memorySlotA.selection.mechanism).toBe('slot-driven-memory');
    expect(memorySlotA.selection.blueprint).toBe('memory.slot.weave');
    expect(memorySlotB.selection.blueprint).toBe('memory.slot.orbit');

    const entireVariationA = generateFormulaFromSeed(seed([0x70, 0xf0, 0x10, 0x10, 0x00, 0x60, 0x25, 0x3b]));
    const entireVariationB = generateFormulaFromSeed(seed([0x70, 0xf0, 0x68, 0x20, 0x00, 0x60, 0x25, 0x3c]));
    const entireVariationC = generateFormulaFromSeed(seed([0x70, 0xf0, 0x70, 0x30, 0x00, 0x60, 0x25, 0x3d]));
    const entireVariationD = generateFormulaFromSeed(seed([0x70, 0xf0, 0x90, 0x40, 0x00, 0x60, 0x25, 0x3e]));

    expect(entireVariationA.selection.mechanism).toBe('gentle-entire-variation');
    expect(entireVariationA.selection.blueprint).toBe('trans.wave.fold');
    expect(entireVariationB.selection.blueprint).toBe('trans.sqrt.core');
    expect(entireVariationC.selection.blueprint).toBe('trans.sin.drift');
    expect(entireVariationD.selection.blueprint).toBe('trans.rot.swirl');

    for (const generated of [
      polynomialShiftA,
      polynomialShiftB,
      polynomialPixelA,
      polynomialPixelB,
      antiShiftA,
      antiShiftB,
      antiShiftC,
      memoryFeedbackA,
      memoryFeedbackB,
      memoryFeedbackC,
      memoryFeedbackD,
      memorySlotA,
      memorySlotB,
      entireVariationA,
      entireVariationB,
      entireVariationC,
      entireVariationD,
    ]) {
      expect(compileFrm(generated.source, `test-${generated.formulaName.toLowerCase()}`).success).toBe(true);
    }
  });

  it('compiles the first exotic-first blueprint batch', () => {
    const generated = [
      generateFormulaFromSeed(seed([0x32, 0x70, 0x80, 0x10, 0x00, 0x60, 0x40, 0x50])), // rat.inversion.quadratic
      generateFormulaFromSeed(seed([0x32, 0xf0, 0x60, 0x20, 0x00, 0x60, 0x41, 0x51])), // rat.rings.perturb
      generateFormulaFromSeed(seed([0x32, 0xf0, 0xf0, 0x30, 0x00, 0x60, 0x42, 0x52])), // rat.mcmullen.light
      generateFormulaFromSeed(seed([0x32, 0x10, 0x90, 0x40, 0x00, 0x60, 0x43, 0x53])), // hybrid.spider.recip
      generateFormulaFromSeed(seed([0x70, 0xf0, 0x90, 0x50, 0x00, 0x60, 0x44, 0x54])), // trans.rot.swirl
      generateFormulaFromSeed(seed([0xa8, 0xa0, 0x90, 0x60, 0x00, 0x60, 0x45, 0x55])), // anti.conj.reciprocal
      generateFormulaFromSeed(seed([0xc8, 0x10, 0x90, 0x70, 0x00, 0x60, 0x46, 0x56])), // nonholo.abs.reciprocal
      generateFormulaFromSeed(seed([0xe8, 0x10, 0x90, 0x80, 0x00, 0x60, 0x47, 0x57])), // memory.echo.inversion
    ];

    expect(generated.map((item) => item.selection.blueprint)).toEqual([
      'rat.inversion.quadratic',
      'rat.rings.perturb',
      'rat.mcmullen.light',
      'hybrid.spider.recip',
      'trans.rot.swirl',
      'anti.conj.reciprocal',
      'nonholo.abs.reciprocal',
      'memory.echo.inversion',
    ]);

    for (const item of generated) {
      expect(compileFrm(item.source, `test-${item.formulaName.toLowerCase()}`).success).toBe(true);
    }
  });

  it('produces a broader blueprint spread across deterministic sample seeds', () => {
    const generated = Array.from({ length: 64 }, (_, index) => {
      const bytes = [
        (index * 37) & 0xff,
        (index * 53 + 17) & 0xff,
        (index * 91 + 29) & 0xff,
        (index * 19 + 43) & 0xff,
        (index * 73 + 7) & 0xff,
        (index * 41 + 11) & 0xff,
        (index * 59 + 13) & 0xff,
        (index * 97 + 31) & 0xff,
      ];
      return generateFormulaFromSeed(seed(bytes));
    });

    const blueprints = new Set(generated.map((item) => item.selection.blueprint));
    const families = new Set(generated.map((item) => item.selection.family));
    expect(blueprints.size).toBeGreaterThanOrEqual(22);
    expect(families.size).toBeGreaterThanOrEqual(8);
  });

  it('prefers candidates that avoid recent blueprint history when possible', () => {
    const repeatedSeed = seed([0x10, 0xa0, 0x10, 0x10, 0x00, 0x60, 0x20, 0x30]);
    const diversifiedSeed = seed([0x10, 0xa0, 0xf0, 0x20, 0x00, 0x60, 0x20, 0x31]);
    const recent = generateFormulaFromSeed(repeatedSeed);

    const bytes = [
      ...recent.bytes,
      ...recent.bytes,
      ...parseSeedBytes(diversifiedSeed),
      ...parseSeedBytes(repeatedSeed),
      ...parseSeedBytes(repeatedSeed),
      ...parseSeedBytes(repeatedSeed),
    ];

    let index = 0;
    const generated = generateDiversifiedFormula({
      history: [
        {
          seed: recent.seed,
          family: recent.selection.family,
          blueprint: recent.selection.blueprint,
        },
      ],
      candidateCount: 6,
      randomByte: () => bytes[index++],
    });

    expect(generated.selection.blueprint).toBe('poly.core.affine-shift');
  });

  it('falls back reserved init modes to z0', () => {
    const generated = generateFormulaFromSeed(seed([0x0a, 0x00, 0x00, 0x00, 0x00, 0x6f, 0x20, 0x30]));

    expect(generated.selection.initMode).toBe('z0');
    expect(generated.source).toContain('init:\n  z = 0');
  });
});

function parseSeedBytes(currentSeed: string): number[] {
  return currentSeed
    .slice(4)
    .match(/.{2}/g)!
    .map((pair) => Number.parseInt(pair, 16));
}
