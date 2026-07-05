import { describe, it, expect, beforeAll } from 'vitest';
import { FORMULA_CATALOG, getDefaultBounds, getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins/index';

describe('Formula Catalog', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  it('should provide metadata for every builtin formula', () => {
    const formulas = pluginRegistry.listFormulas();

    expect(FORMULA_CATALOG).toHaveLength(formulas.length);

    for (const formula of formulas) {
      const metadata = getFormulaMetadata(formula.id);

      expect(metadata, `missing metadata for ${formula.id}`).toBeDefined();
      expect(metadata?.id).toBe(formula.id);
      expect(metadata?.family).toBeTruthy();
      expect(metadata?.difficulty).toBeTruthy();
      expect(metadata?.description?.trim().length).toBeGreaterThan(0);
      expect(metadata?.defaultBounds.zoom).toBeGreaterThan(0);
    }
  });

  it('should not contain duplicate catalog entries', () => {
    const ids = FORMULA_CATALOG.map((metadata) => metadata.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should classify burning ship and transcendental families distinctly', () => {
    expect(getFormulaMetadata('burningShip')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('burningShipImag')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('celticMandelbar')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('expJulia')?.family).toBe('transcendental');
    expect(getFormulaMetadata('expMandelbrot')?.family).toBe('transcendental');
    expect(getFormulaMetadata('sineMandelb')?.family).toBe('transcendental');
    expect(getFormulaMetadata('cosJulia')?.family).toBe('transcendental');
  });

  it('should keep key descriptions specific and formula-correct', () => {
    expect(getFormulaMetadata('quarticMandelbrot')?.description).toBe('Quartic Mandelbrot (z^4 + c)');
    expect(getFormulaMetadata('chebyshev2')?.description).toContain('Chebyshev T2');
    expect(getFormulaMetadata('chebyshev3')?.description).toContain('Chebyshev T3');
    expect(getFormulaMetadata('chebyshev4')?.description).toContain('Chebyshev T4');
    expect(getFormulaMetadata('airship')?.description).toContain('Airship');
    expect(getFormulaMetadata('celticBurningShip')?.description).toContain('Celtic Burning Ship');
    expect(getFormulaMetadata('circleInversion')?.description).toContain('reciprocal quadratic');
    expect(getFormulaMetadata('cosMandelb')?.description).toContain('Cosine Mandelbrot');
    expect(getFormulaMetadata('rationalMap1')?.description).toContain('Rational map');
    expect(getFormulaMetadata('atanhMandelbrot')?.description).toContain('hyperbolic tangent');
    expect(getFormulaMetadata('cothJulia')?.description).toContain('Hyperbolic cotangent');
    expect(getFormulaMetadata('newton5')?.description).toContain('z^5 - 1');
    expect(getFormulaMetadata('novaSine')?.description).toContain('Nova-style sine');
    expect(getFormulaMetadata('novaClassic')?.description).toContain('Nova');
    expect(getFormulaMetadata('collatz')?.description).toContain('Collatz-inspired');
    expect(getFormulaMetadata('rings')?.description).toContain('reciprocal rings term');
  });

  it('should avoid generic template bounds for key catalog formulas', () => {
    expect(getFormulaMetadata('tricorn')?.defaultBounds).toEqual({ centerX: -0.12, centerY: 0, zoom: 0.65 });
    expect(getFormulaMetadata('phoenix')?.defaultBounds).toEqual({ centerX: -0.35, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('quadJulia')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.85 });
    expect(getFormulaMetadata('cubicMandelbrot')?.defaultBounds).toEqual({ centerX: -0.15, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('quarticMandelbrot')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.6 });
    expect(getFormulaMetadata('mandelbox')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.65 });
    expect(getFormulaMetadata('multicorn4')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.72 });
    expect(getFormulaMetadata('multicorn5')?.defaultBounds).toEqual({ centerX: -0.08, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('multicorn6')?.defaultBounds).toEqual({ centerX: -0.04, centerY: 0, zoom: 0.86 });
    expect(getFormulaMetadata('chebyshev2')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('chebyshev3')?.defaultBounds).toEqual({ centerX: -0.05, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('chebyshev4')?.defaultBounds).toEqual({ centerX: -0.02, centerY: 0, zoom: 0.7 });
    expect(getFormulaMetadata('perpendicularTricorn')?.defaultBounds).toEqual({ centerX: -0.45, centerY: 0, zoom: 0.28 });
    expect(getFormulaMetadata('newton3')?.defaultBounds).toEqual({ centerX: -0.18, centerY: 0.1, zoom: 1.35 });
    expect(getFormulaMetadata('newton4')?.defaultBounds).toEqual({ centerX: 0.08, centerY: 0.08, zoom: 1.45 });
    expect(getFormulaMetadata('newtonSin')?.defaultBounds).toEqual({ centerX: 0.3, centerY: 0, zoom: 2.6 });
    expect(getFormulaMetadata('newtonCos')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 2.1 });
    expect(getFormulaMetadata('newton5')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.6 });
    expect(getFormulaMetadata('newtonSinh')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.8 });
    expect(getFormulaMetadata('newtonExp')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 2 });
    expect(getFormulaMetadata('magnet2')?.defaultBounds).toEqual({ centerX: 0.15, centerY: 0, zoom: 0.6 });
    expect(getFormulaMetadata('phoenixMulti')?.defaultBounds).toEqual({ centerX: -0.25, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('collatz')?.defaultBounds).toEqual({ centerX: 0.25, centerY: 0.1, zoom: 2.4 });
    expect(getFormulaMetadata('spider')?.defaultBounds).toEqual({ centerX: -0.35, centerY: 0.08, zoom: 0.52 });
    expect(getFormulaMetadata('expJulia')?.defaultBounds).toEqual({ centerX: -0.2, centerY: 0.15, zoom: 2.2 });
    expect(getFormulaMetadata('cosMandelb')?.defaultBounds).toEqual({ centerX: -1.2, centerY: 0, zoom: 0.25 });
    expect(getFormulaMetadata('expMandelbrot')?.defaultBounds).toEqual({ centerX: -0.3, centerY: 0, zoom: 1.6 });
    expect(getFormulaMetadata('sineMandelb')?.defaultBounds).toEqual({ centerX: -0.25, centerY: 0.12, zoom: 1.25 });
    expect(getFormulaMetadata('sineJulia')?.defaultBounds).toEqual({ centerX: 0.1, centerY: 0.12, zoom: 1.25 });
    expect(getFormulaMetadata('coshMandelb')?.defaultBounds).toEqual({ centerX: 0.18, centerY: 0, zoom: 1.2 });
    expect(getFormulaMetadata('sinhMandelb')?.defaultBounds).toEqual({ centerX: -0.16, centerY: 0, zoom: 1.15 });
    expect(getFormulaMetadata('coshJulia')?.defaultBounds).toEqual({ centerX: 0.08, centerY: 0.14, zoom: 1.22 });
    expect(getFormulaMetadata('coshSinh')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.05 });
    expect(getFormulaMetadata('cosJulia')?.defaultBounds).toEqual({ centerX: 0.12, centerY: 0.18, zoom: 1.3 });
    expect(getFormulaMetadata('tanJulia')?.defaultBounds).toEqual({ centerX: 0.22, centerY: 0, zoom: 1.35 });
    expect(getFormulaMetadata('sinhJulia')?.defaultBounds).toEqual({ centerX: -0.18, centerY: 0.08, zoom: 1.25 });
    expect(getFormulaMetadata('biomorph')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.6 });
    expect(getFormulaMetadata('logistic')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.4 });
    expect(getFormulaMetadata('celticMandelbar')?.defaultBounds).toEqual({ centerX: -0.22, centerY: 0, zoom: 0.75 });
    expect(getFormulaMetadata('airship')?.defaultBounds).toEqual({ centerX: -0.6, centerY: -0.35, zoom: 0.35 });
    expect(getFormulaMetadata('celticBurningShip')?.defaultBounds).toEqual({ centerX: -0.42, centerY: -0.18, zoom: 0.48 });
    expect(getFormulaMetadata('rationalMap1')?.defaultBounds).toEqual({ centerX: -0.08, centerY: 0, zoom: 0.68 });
    expect(getFormulaMetadata('atanhMandelbrot')?.defaultBounds).toEqual({ centerX: -0.12, centerY: 0, zoom: 1.22 });
    expect(getFormulaMetadata('rationalMap2')?.defaultBounds).toEqual({ centerX: -0.06, centerY: 0, zoom: 0.66 });
    expect(getFormulaMetadata('invertedLambda')?.defaultBounds).toEqual({ centerX: 0.18, centerY: 0, zoom: 0.5 });
    expect(getFormulaMetadata('tetration')?.defaultBounds).toEqual({ centerX: 0.18, centerY: 0, zoom: 1.15 });
    expect(getFormulaMetadata('circleInversion')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.95 });
    expect(getFormulaMetadata('frothyBasin')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('simonBrot')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.58 });
    expect(getFormulaMetadata('cothJulia')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('chebyshev6')).toBeUndefined();
    expect(getFormulaMetadata('multicorn8')).toBeUndefined();
    expect(getFormulaMetadata('burningShipQuintic')).toBeUndefined();
    expect(getFormulaMetadata('mcMullen24')).toBeUndefined();
    expect(getFormulaMetadata('rationalMap3')).toBeUndefined();
    expect(getFormulaMetadata('tanhMandelbrot')).toBeUndefined();
    expect(getFormulaMetadata('tanMandelb')).toBeUndefined();
    expect(getFormulaMetadata('duck')).toBeUndefined();
  });

  it('should return fallback bounds for unknown formulas', () => {
    expect(getDefaultBounds('unknown-formula')).toEqual({
      centerX: -0.5,
      centerY: 0,
      zoom: 0.4,
    });
  });
});
