import { describe, expect, it } from 'vitest';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import { getFormulaSelectionDefaults } from '@/engine/plugins/formula-catalog';
import {
  applyFormulaSelectionDefaults,
  buildFormulaDefaultDocument,
} from '@/lib/formula-documents';

describe('formula documents', () => {
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

  it('rejects unknown formulas instead of publishing a fallback page state', () => {
    expect(() => buildFormulaDefaultDocument('missing-formula')).toThrow(
      'Unknown built-in formula: missing-formula'
    );
  });
});
