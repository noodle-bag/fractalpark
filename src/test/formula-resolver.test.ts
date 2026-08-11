import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { pluginRegistry } from '@/engine/plugins/registry';
import {
  resolveCustomFormula,
  resolveFormulaReference,
} from '@/lib/formula-resolver';

const SOURCE = `; @mode: native
; @default-view: -0.7435, 0.1314, 88, 0
SharedResolver {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const CUSTOM_IDS = [
  'custom-shared-resolver',
  'custom-invalid-resolver',
  'custom-missing-resolver',
  'custom-transient-resolver',
  'custom-classic-resolver',
];

describe('formula resolver', () => {
  beforeAll(() => {
    registerBuiltins({ quiet: true });
  });

  afterEach(() => {
    for (const id of CUSTOM_IDS) {
      pluginRegistry.unregister('formula', id);
    }
  });

  it('resolves built-in formulas from the catalog and plugin registry', () => {
    const resolution = resolveFormulaReference('mandelbrot', []);

    expect(resolution).toMatchObject({
      success: true,
      formulaId: 'mandelbrot',
      kind: 'builtin',
    });
  });

  it('gives Editor and Explore the same custom plugin and experience hint', () => {
    const formula = {
      id: 'custom-shared-resolver',
      source: SOURCE,
    };

    const editorResolution = resolveCustomFormula(formula);
    const exploreResolution = resolveFormulaReference(formula.id, [formula]);

    expect(editorResolution.success).toBe(true);
    expect(exploreResolution.success).toBe(true);
    if (!editorResolution.success || !exploreResolution.success) return;

    expect(exploreResolution.kind).toBe('custom');
    expect(exploreResolution.plugin).toEqual(editorResolution.plugin);
    expect(exploreResolution.experienceHint).toEqual(
      editorResolution.experienceHint
    );
    expect(exploreResolution.experienceHint?.bounds).toEqual({
      centerX: -0.7435,
      centerY: 0.1314,
      zoom: 88,
      rotation: 0,
    });
    expect(pluginRegistry.getFormula(formula.id)).toEqual(
      editorResolution.plugin
    );
  });

  it('returns an explicit failure for missing or invalid local formulas', () => {
    expect(
      resolveFormulaReference('custom-missing-resolver', [])
    ).toMatchObject({
      success: false,
      code: 'formula-not-found',
      formulaId: 'custom-missing-resolver',
    });

    expect(
      resolveCustomFormula({
        id: 'custom-invalid-resolver',
        source: 'Invalid { loop: z = }',
      })
    ).toMatchObject({
      success: false,
      code: 'compile-failed',
      formulaId: 'custom-invalid-resolver',
    });
  });

  it('keeps an in-session Editor preview available before it is persisted', () => {
    const compiled = resolveCustomFormula({
      id: 'custom-transient-resolver',
      source: SOURCE,
    });
    expect(compiled.success).toBe(true);

    const resolution = resolveFormulaReference(
      'custom-transient-resolver',
      []
    );
    expect(resolution).toMatchObject({
      success: true,
      formulaId: 'custom-transient-resolver',
      kind: 'custom',
    });
  });

  it('routes imported classic FRM through the classic compiler and registers its used uniforms', () => {
    const resolution = resolveCustomFormula({
      id: 'custom-classic-resolver',
      source: `ClassicImport {
  z = p1:
  z = fn2(z) + p3
  |z| < 16
}`,
    });

    expect(resolution).toMatchObject({ success: true, kind: 'custom' });
    if (!resolution.success) return;
    expect(resolution.plugin.uniforms.map((uniform) => uniform.name)).toEqual([
      'u_p1',
      'u_p3',
      'u_fn2',
    ]);
  });

  it('never lets a custom formula overwrite a built-in formula ID', () => {
    const builtin = pluginRegistry.getFormula('mandelbrot');
    const resolution = resolveCustomFormula({
      id: 'mandelbrot',
      source: SOURCE,
    });

    expect(resolution).toMatchObject({
      success: false,
      code: 'builtin-id-conflict',
      formulaId: 'mandelbrot',
    });
    expect(pluginRegistry.getFormula('mandelbrot')).toBe(builtin);
  });
});
