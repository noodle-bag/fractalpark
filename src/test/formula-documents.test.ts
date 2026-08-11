import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import { registerBuiltins } from '@/engine/plugins/builtins';
import {
  FORMULA_CATALOG,
  getFormulaSelectionDefaults,
} from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { compileClassicFrmEntry } from '@/engine/frm/compile';
import {
  applyFormulaSelectionDefaults,
  buildFormulaDefaultDocument,
  getFormulaUniformDefaults,
} from '@/lib/formula-documents';
import { decodeParams, documentToExploreHref } from '@/lib/url-params';

describe('formula documents', () => {
  beforeAll(() => {
    registerBuiltins({ quiet: true });
  });

  it('builds a deterministic canonical document from catalog defaults', () => {
    const selection = getFormulaSelectionDefaults('tricorn');
    const first = buildFormulaDefaultDocument('tricorn');
    const second = buildFormulaDefaultDocument('tricorn');

    expect(first).toEqual(second);
    expect(first.scene.bounds).toEqual({
      ...selection.bounds,
      rotation: selection.bounds.rotation ?? 0,
    });
    expect(first.formula.formulaId).toBe('tricorn');
    expect(first.transform).toEqual(DEFAULT_FRACTAL_DOCUMENT.transform);
    expect(first.render).toEqual(DEFAULT_FRACTAL_DOCUMENT.render);
    expect(first.animation).toBeUndefined();
  });

  it('matches the formula-selection behavior used by Explore', () => {
    const current = normalizeFractalDocument({
      ...DEFAULT_FRACTAL_DOCUMENT,
      formula: {
        ...DEFAULT_FRACTAL_DOCUMENT.formula,
        formulaId: 'mandelbrot',
        isJulia: true,
        params: { formula: { u_previousFormulaValue: 1 } },
      },
      coloring: {
        ...DEFAULT_FRACTAL_DOCUMENT.coloring,
        paletteIndex: 5,
        params: {
          outside: { u_previousOutsideValue: 2 },
          inside: { u_previousInsideValue: 3 },
        },
      },
    });

    const selected = applyFormulaSelectionDefaults(current, 'tricorn');
    const canonical = buildFormulaDefaultDocument('tricorn');

    expect(selected.scene).toEqual(canonical.scene);
    expect(selected.formula).toEqual(canonical.formula);
    expect(selected.coloring).toEqual(canonical.coloring);
    expect(selected.transform).toEqual(current.transform);
    expect(selected.render).toEqual(current.render);
  });

  it('applies palette and plugin uniform fallbacks to all formulas without profiles', () => {
    const fallbackEntries = FORMULA_CATALOG.filter(
      (metadata) => !metadata.defaultProfile
    );

    expect(fallbackEntries).toHaveLength(71);

    for (const metadata of fallbackEntries) {
      const plugin = pluginRegistry.getFormula(metadata.id);
      const document = buildFormulaDefaultDocument(metadata.id);
      const uniformDefaults = Object.fromEntries(
        (plugin?.uniforms ?? []).map((uniform) => [
          uniform.name,
          uniform.default,
        ])
      );

      expect(plugin, `missing plugin for ${metadata.id}`).toBeDefined();
      expect(document.coloring.paletteIndex).toBe(metadata.suggestedPalette);
      expect(document.coloring.customGradient).toBeNull();
      expect(document.formula.params?.formula).toEqual(
        plugin && plugin.uniforms.length > 0 ? uniformDefaults : undefined
      );
    }
  });

  it('clears stale formula state when applying a fallback selection', () => {
    const current = normalizeFractalDocument({
      ...DEFAULT_FRACTAL_DOCUMENT,
      formula: {
        ...DEFAULT_FRACTAL_DOCUMENT.formula,
        formulaId: 'rings',
        params: { formula: { u_ringsP: 1.25 } },
      },
      coloring: {
        ...DEFAULT_FRACTAL_DOCUMENT.coloring,
        paletteIndex: 9,
        customGradient: [
          { position: 0, color: '#000000' },
          { position: 1, color: '#ffffff' },
        ],
      },
    });

    const selected = applyFormulaSelectionDefaults(current, 'phoenix');

    expect(selected.formula.params?.formula).toEqual({
      u_phoenixP: -0.5,
    });
    expect(selected.coloring.paletteIndex).toBe(2);
    expect(selected.coloring.customGradient).toBeNull();
  });

  it('keeps explicit profiles ahead of catalog fallbacks', () => {
    const document = buildFormulaDefaultDocument('mandelbox');

    expect(document.coloring.paletteIndex).toBe(10);
    expect(document.formula.params?.formula).toBeUndefined();
  });

  it('round-trips fallback palette while omitting default-valued uniforms', () => {
    const document = buildFormulaDefaultDocument('phoenix');
    const href = documentToExploreHref(document, 'en');
    const searchParams = new URL(href, 'https://www.fractalpark.com').searchParams;
    const decoded = decodeParams(searchParams);

    expect(decoded.formula).toBe('phoenix');
    expect(decoded.palette).toBe(2);
    expect(decoded.pluginParams).toBeUndefined();
    expect(searchParams.has('pp')).toBe(false);
  });

  it('rejects unknown formulas instead of publishing a fallback page state', () => {
    expect(() => buildFormulaDefaultDocument('missing-formula')).toThrow(
      'Unknown built-in formula: missing-formula'
    );
  });

  it('seeds imported classic formula uniforms from descriptors', () => {
    const compiled = compileClassicFrmEntry(`ImportedClassic {
  z = p1:
  z = fn2(z) + p3
  |z| < 16
}`, undefined, 'imported-classic');

    expect(compiled.success).toBe(true);
    expect(compiled.plugin).toBeDefined();
    expect(getFormulaUniformDefaults(compiled.plugin!)).toEqual({
      u_p1: [0, 0],
      u_p3: [0, 0],
      u_fn2: 0,
    });
  });
});
