import { describe, expect, it } from 'vitest';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import {
  appendRemixSource,
  applyRemixSource,
  parseRemixSource,
} from '@/lib/remix-source';
import { documentToExploreHref } from '@/lib/url-params';

describe('Remix source navigation', () => {
  it('appends and parses authoritative namespaced formula sources', () => {
    const document = buildFormulaDefaultDocument('mandelbrot');
    const href = appendRemixSource(
      documentToExploreHref(document, 'zh'),
      { type: 'formula', id: 'mandelbrot' }
    );
    const url = new URL(href, 'https://www.fractalpark.com');

    expect(url.pathname).toBe('/zh/explore');
    expect(url.searchParams.get('remix')).toBe('formula:mandelbrot');
    expect(parseRemixSource(url.searchParams)).toEqual({
      type: 'formula',
      id: 'mandelbrot',
      sourceId: 'formula:mandelbrot',
    });
  });

  it('accepts published preset sources and writes provenance only to metadata', () => {
    const document = buildFormulaDefaultDocument('newton3');
    const source = parseRemixSource(
      new URLSearchParams('remix=preset%3Apreset-newton-deep-spiral')
    );
    const remixed = applyRemixSource(document, source);

    expect(remixed).toEqual({
      ...document,
      metadata: {
        ...document.metadata,
        source: 'remix',
        sourceId: 'preset:preset-newton-deep-spiral',
      },
    });
    expect(remixed.formula).toEqual(document.formula);
    expect(remixed.scene).toEqual(document.scene);
  });

  it.each([
    ['empty', 'remix='],
    ['unknown type', 'remix=gallery%3Apreset-newton-deep-spiral'],
    ['unknown formula', 'remix=formula%3Aunknown-formula'],
    ['unknown preset', 'remix=preset%3Aunknown-preset'],
    ['missing namespace', 'remix=mandelbrot'],
    ['extra namespace', 'remix=formula%3Amandelbrot%3Aextra'],
    ['control character', 'remix=formula%3Amandelbrot%0A'],
    ['repeated parameter', 'remix=formula%3Amandelbrot&remix=formula%3Atricorn'],
    ['overlong value', `remix=formula%3A${'a'.repeat(129)}`],
  ])('ignores %s values', (_label, query) => {
    expect(parseRemixSource(new URLSearchParams(query))).toBeNull();
  });

  it('leaves legacy Documents unchanged when no Remix source exists', () => {
    const document = buildFormulaDefaultDocument('mandelbrot');
    expect(applyRemixSource(document, null)).toBe(document);
  });

  it('rejects invalid sources during link construction', () => {
    expect(() =>
      appendRemixSource('/en/explore', {
        type: 'formula',
        id: 'unknown-formula',
      })
    ).toThrow('Invalid Remix source');
  });
});
