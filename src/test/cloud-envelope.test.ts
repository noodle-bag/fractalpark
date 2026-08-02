import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { FractalDocument } from '@/engine/document';
import {
  canonicalStringify,
  resolveRegistrySource,
  validateCloudEnvelopeV1,
} from '@/lib/cloud/envelope';

function envelopeOf(document: Partial<FractalDocument> = {}, extras: Record<string, unknown> = {}) {
  return {
    envelopeVersion: 1,
    document: { ...DEFAULT_FRACTAL_DOCUMENT, ...document },
    ...extras,
  };
}

function inputBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

describe('validateCloudEnvelopeV1', () => {
  it('accepts the default document and canonicalizes deterministically', () => {
    const input = envelopeOf();
    const result = validateCloudEnvelopeV1(input, inputBytes(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Untitled');
    expect(result.value.hasPortableFormulas).toBe(false);
    expect(result.value.configBytes).toBe(Buffer.byteLength(result.value.canonicalJson, 'utf8'));
    // Key order in the input must not change the canonical form.
    const reordered = JSON.parse(
      JSON.stringify(input, (_, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    );
    expect(validateCloudEnvelopeV1(reordered, inputBytes(reordered))).toMatchObject({
      ok: true,
      value: { canonicalJson: result.value.canonicalJson },
    });
  });

  it('rejects over-cap input before parsing', () => {
    const result = validateCloudEnvelopeV1({}, 1_048_577);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_envelope');
  });

  it('rejects structurally invalid and unsupported envelopes', () => {
    expect(validateCloudEnvelopeV1('nope', 6).ok).toBe(false);
    expect(validateCloudEnvelopeV1({ envelopeVersion: 999, document: {} }, 40).ok).toBe(false);
  });

  it('rejects unknown runtime entities from every allowlist', () => {
    const badFormula = envelopeOf({ formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, formulaId: 'no-such-formula' } });
    expect(validateCloudEnvelopeV1(badFormula, inputBytes(badFormula)).ok).toBe(false);
    const badColoring = envelopeOf({
      coloring: { ...DEFAULT_FRACTAL_DOCUMENT.coloring, outsideColoringId: 'no-such-coloring' },
    });
    expect(validateCloudEnvelopeV1(badColoring, inputBytes(badColoring)).ok).toBe(false);
    const badTransform = envelopeOf({ transform: { transformId: 'no-such-transform' } });
    expect(validateCloudEnvelopeV1(badTransform, inputBytes(badTransform)).ok).toBe(false);
  });

  it('enforces numeric budgets', () => {
    const iter0 = envelopeOf({ render: { ...DEFAULT_FRACTAL_DOCUMENT.render, maxIterations: 0 } });
    expect(validateCloudEnvelopeV1(iter0, inputBytes(iter0)).ok).toBe(false);
    const iterBig = envelopeOf({ render: { ...DEFAULT_FRACTAL_DOCUMENT.render, maxIterations: 4097 } });
    expect(validateCloudEnvelopeV1(iterBig, inputBytes(iterBig)).ok).toBe(false);
    const iterMax = envelopeOf({ render: { ...DEFAULT_FRACTAL_DOCUMENT.render, maxIterations: 4096 } });
    expect(validateCloudEnvelopeV1(iterMax, inputBytes(iterMax)).ok).toBe(true);

    const zoom0 = envelopeOf({ scene: { bounds: { ...DEFAULT_FRACTAL_DOCUMENT.scene.bounds, zoom: 0 } } });
    expect(validateCloudEnvelopeV1(zoom0, inputBytes(zoom0)).ok).toBe(false);
    const nanCenter = envelopeOf({ scene: { bounds: { ...DEFAULT_FRACTAL_DOCUMENT.scene.bounds, centerX: Number.NaN } } });
    expect(validateCloudEnvelopeV1(nanCenter, inputBytes(nanCenter)).ok).toBe(false);
    const hugeCenter = envelopeOf({ scene: { bounds: { ...DEFAULT_FRACTAL_DOCUMENT.scene.bounds, centerX: 2e6 } } });
    expect(validateCloudEnvelopeV1(hugeCenter, inputBytes(hugeCenter)).ok).toBe(false);

    const badPalette = envelopeOf({ coloring: { ...DEFAULT_FRACTAL_DOCUMENT.coloring, paletteIndex: 99999 } });
    expect(validateCloudEnvelopeV1(badPalette, inputBytes(badPalette)).ok).toBe(false);
  });

  it('enforces gradient and animation budgets', () => {
    const stops = Array.from({ length: 65 }, (_, i) => ({ position: i / 64, color: '#000000' }));
    const bigGradient = envelopeOf({ coloring: { ...DEFAULT_FRACTAL_DOCUMENT.coloring, customGradient: stops } });
    expect(validateCloudEnvelopeV1(bigGradient, inputBytes(bigGradient)).ok).toBe(false);

    const keyframes = Array.from({ length: 257 }, (_, i) => ({
      id: `k${i}`,
      bounds: DEFAULT_FRACTAL_DOCUMENT.scene.bounds,
    }));
    const bigView = envelopeOf({ animation: { viewKeyframes: keyframes } });
    expect(validateCloudEnvelopeV1(bigView, inputBytes(bigView)).ok).toBe(false);

    const tracks = Array.from({ length: 17 }, (_, i) => ({ id: `t${i}`, targetId: 'x', keyframes: [] }));
    const manyTracks = envelopeOf({ animation: { tracks } });
    expect(validateCloudEnvelopeV1(manyTracks, inputBytes(manyTracks)).ok).toBe(false);
  });

  it('verifies portable formula asset hashes and budgets', () => {
    const source = 'Mandelbrot { z = z^2 + c }';
    const hash = createHash('sha256').update(source, 'utf8').digest('hex');
    const goodAsset = { id: 'a1', language: 'frm', source, hash };
    const good = envelopeOf({}, { assets: { formulas: [goodAsset] } });
    const goodResult = validateCloudEnvelopeV1(good, inputBytes(good));
    expect(goodResult.ok).toBe(true);
    if (goodResult.ok) expect(goodResult.value.hasPortableFormulas).toBe(true);

    const badHash = envelopeOf({}, { assets: { formulas: [{ ...goodAsset, hash: '0'.repeat(64) }] } });
    expect(validateCloudEnvelopeV1(badHash, inputBytes(badHash)).ok).toBe(false);

    const tooMany = envelopeOf(
      {},
      { assets: { formulas: Array.from({ length: 5 }, (_, i) => ({ ...goodAsset, id: `a${i}` })) } },
    );
    expect(validateCloudEnvelopeV1(tooMany, inputBytes(tooMany)).ok).toBe(false);

    const bigSource = 'x'.repeat(65_537);
    const bigAsset = {
      id: 'a1',
      language: 'frm',
      source: bigSource,
      hash: createHash('sha256').update(bigSource, 'utf8').digest('hex'),
    };
    const tooBig = envelopeOf({}, { assets: { formulas: [bigAsset] } });
    expect(validateCloudEnvelopeV1(tooBig, inputBytes(tooBig)).ok).toBe(false);
  });

  it('enforces plugin param budgets on the raw document', () => {
    const manyParams = envelopeOf({
      formula: {
        ...DEFAULT_FRACTAL_DOCUMENT.formula,
        params: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`p${i}`, 1])) as never,
      },
    });
    expect(validateCloudEnvelopeV1(manyParams, inputBytes(manyParams)).ok).toBe(false);

    const longKey = envelopeOf({
      formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, params: { ['k'.repeat(65)]: 1 } as never },
    });
    expect(validateCloudEnvelopeV1(longKey, inputBytes(longKey)).ok).toBe(false);

    const hugeNumber = envelopeOf({
      formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, params: { a: 1e13 } as never },
    });
    expect(validateCloudEnvelopeV1(hugeNumber, inputBytes(hugeNumber)).ok).toBe(false);

    const nanParam = envelopeOf({
      formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, params: { a: Number.NaN } as never },
    });
    expect(validateCloudEnvelopeV1(nanParam, inputBytes(nanParam)).ok).toBe(false);

    const longString = envelopeOf({
      formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, params: { a: 's'.repeat(257) } as never },
    });
    expect(validateCloudEnvelopeV1(longString, inputBytes(longString)).ok).toBe(false);

    const okParams = envelopeOf({
      formula: { ...DEFAULT_FRACTAL_DOCUMENT.formula, params: { stripeDensity: 4, offset: 0.5 } as never },
    });
    expect(validateCloudEnvelopeV1(okParams, inputBytes(okParams)).ok).toBe(true);
  });

  it('projects the title from the envelope artwork name', () => {
    const named = envelopeOf({ metadata: { name: '  深空螺旋  ' } });
    const result = validateCloudEnvelopeV1(named, inputBytes(named));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('深空螺旋');

    const long = envelopeOf({ metadata: { name: 'n'.repeat(120) } });
    const longResult = validateCloudEnvelopeV1(long, inputBytes(long));
    expect(longResult.ok).toBe(true);
    if (longResult.ok) expect(longResult.value.title).toHaveLength(80);

    const blank = envelopeOf({ metadata: { name: '   ' } });
    const blankResult = validateCloudEnvelopeV1(blank, inputBytes(blank));
    expect(blankResult.ok).toBe(true);
    if (blankResult.ok) expect(blankResult.value.title).toBe('Untitled');
  });
});

describe('canonicalStringify', () => {
  it('sorts object keys and preserves array order', () => {
    expect(canonicalStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
});

describe('resolveRegistrySource', () => {
  it('resolves builtin formulas and gallery presets, rejects unknown ids', () => {
    expect(resolveRegistrySource('formula', 'mandelbrot')).toBe(true);
    expect(resolveRegistrySource('formula', 'no-such-formula')).toBe(false);
    expect(resolveRegistrySource('preset', 'preset-newton-deep-spiral')).toBe(true);
    expect(resolveRegistrySource('preset', 'preset-nope')).toBe(false);
  });
});
