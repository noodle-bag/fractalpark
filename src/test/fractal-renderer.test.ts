import { describe, it, expect, beforeAll } from 'vitest';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins/index';

describe('FractalRenderer', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  describe('Plugin System Integration', () => {
    it('should have all 94 formulas registered', () => {
      const formulas = pluginRegistry.listFormulas();
      expect(formulas.length).toBe(94);
      const bailoutMap = new Map(formulas.map((formula) => [formula.id, formula.bailout]));
      expect(bailoutMap.get('magnet1')).toBe(16);
      expect(bailoutMap.get('magnet2')).toBe(16);
      expect(
        formulas
          .filter((formula) => formula.id !== 'magnet1' && formula.id !== 'magnet2')
          .every((formula) => formula.bailout === 65536)
      ).toBe(true);
    });

    it('should have 6 outside coloring modes', () => {
      const modes = pluginRegistry.listOutsideColoring();
      expect(modes.length).toBe(6);
    });

    it('should have 3 inside coloring modes', () => {
      const modes = pluginRegistry.listInsideColoring();
      expect(modes.length).toBe(3);
    });

    it('should have 7 transforms', () => {
      const transforms = pluginRegistry.listTransforms();
      expect(transforms.length).toBe(7);
    });
  });

  describe('Formula Plugins', () => {
    it('should have mandelbrot formula with correct properties', () => {
      const formula = pluginRegistry.getFormula('mandelbrot');
      expect(formula).toBeDefined();
      expect(formula?.category).toBe('formula');
      expect(formula?.bailout).toBe(65536);
      // escapeType is undefined for mandelbrot (defaults to diverge behavior)
      expect(formula?.escapeType ?? 'diverge').toBe('diverge');
      expect(formula?.supportsJulia).toBe(true);
    });

    it('should have Newton formulas with converge escape type', () => {
      const newton3 = pluginRegistry.getFormula('newton3');
      expect(newton3).toBeDefined();
      expect(newton3?.escapeType).toBe('converge');
    });

    it('should have formulas from all families', () => {
      const families = ['classic', 'burning-ship', 'newton', 'magnet', 'phoenix', 'transcendental', 'exotic'];
      const formulas = pluginRegistry.listFormulas();

      for (const family of families) {
        const familyFormulas = formulas.filter((f) => f.family === family);
        expect(familyFormulas.length).toBeGreaterThan(0);
      }
    });

    it('should register the M4.9c batch 1 formulas with expected families', () => {
      expect(pluginRegistry.getFormula('multicorn4')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('chebyshev2')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('expMandelbrot')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('circleInversion')?.family).toBe('exotic');
      expect(pluginRegistry.getFormula('dendrite')).toBeUndefined();
    });

    it('should register the Batch 2 transcendental and multicorn formulas', () => {
      expect(pluginRegistry.getFormula('multicorn5')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('cosMandelb')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('sineJulia')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('logMandelbrot')).toBeUndefined();
      expect(pluginRegistry.getFormula('coshSinh')?.family).toBe('transcendental');
    });

    it('should register the Batch 3 airship, chebyshev, and transcendental variants', () => {
      expect(pluginRegistry.getFormula('airship')?.family).toBe('burning-ship');
      expect(pluginRegistry.getFormula('chebyshev3')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('sinhMandelb')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('coshJulia')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('tanMandelb')).toBeUndefined();
      expect(pluginRegistry.getFormula('duck')).toBeUndefined();
    });

    it('should register M4.9e classic expansion formulas', () => {
      expect(pluginRegistry.getFormula('chebyshev4')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('multicorn6')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('perpendicularBurningShip')?.family).toBe('burning-ship');
      expect(pluginRegistry.getFormula('rabbitJulia')?.family).toBe('classic');
    });

    it('should register M4.9e rational and transcendental candidates', () => {
      expect(pluginRegistry.getFormula('rationalMap1')?.family).toBe('exotic');
      expect(pluginRegistry.getFormula('mcMullen23')?.family).toBe('exotic');
      expect(pluginRegistry.getFormula('atanhMandelbrot')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('asinhJulia')?.family).toBe('transcendental');
    });

    it('should register M4.9e convergence family variants', () => {
      expect(pluginRegistry.getFormula('newtonCos')?.escapeType).toBe('converge');
      expect(pluginRegistry.getFormula('halleyCubic')?.escapeType).toBe('converge');
      expect(pluginRegistry.getFormula('novaClassic')?.escapeType).toBe('converge');
    });

    it('should register the new M4.9e expansion formulas across all targeted families', () => {
      expect(pluginRegistry.getFormula('perpendicularTricorn')?.family).toBe('classic');
      expect(pluginRegistry.getFormula('celticBurningShip')?.family).toBe('burning-ship');
      expect(pluginRegistry.getFormula('newton5')?.escapeType).toBe('converge');
      expect(pluginRegistry.getFormula('newtonSinh')?.escapeType).toBe('converge');
      expect(pluginRegistry.getFormula('novaSine')?.escapeType).toBe('converge');
      expect(pluginRegistry.getFormula('cothJulia')?.family).toBe('transcendental');
      expect(pluginRegistry.getFormula('chebyshev6')).toBeUndefined();
      expect(pluginRegistry.getFormula('multicorn8')).toBeUndefined();
      expect(pluginRegistry.getFormula('burningShipQuintic')).toBeUndefined();
      expect(pluginRegistry.getFormula('mcMullen24')).toBeUndefined();
      expect(pluginRegistry.getFormula('rationalMap3')).toBeUndefined();
      expect(pluginRegistry.getFormula('tanhMandelbrot')).toBeUndefined();
    });
  });

  describe('Transform Plugins', () => {
    it('should have all transforms registered', () => {
      const expectedTransforms = [
        'none',
        'kaleidoscope',
        'mobius',
        'inversion',
        'polar',
        'sinusoidal',
        'spherical',
      ];

      for (const id of expectedTransforms) {
        const transform = pluginRegistry.getTransform(id);
        expect(transform).toBeDefined();
        expect(transform?.category).toBe('transform');
      }
    });
  });

  describe('Coloring Plugins', () => {
    it('should have smooth outside coloring', () => {
      const coloring = pluginRegistry.getOutsideColoring('smooth');
      expect(coloring).toBeDefined();
      expect(coloring?.needsOrbitStats).toEqual([]);
    });

    it('should have orbitTrap outside coloring with trapMin dependency', () => {
      const coloring = pluginRegistry.getOutsideColoring('orbitTrap');
      expect(coloring).toBeDefined();
      expect(coloring?.needsOrbitStats).toContain('trapMin');
    });

    it('should have tia outside coloring with tiaSum dependency', () => {
      const coloring = pluginRegistry.getOutsideColoring('tia');
      expect(coloring).toBeDefined();
      expect(coloring?.needsOrbitStats).toContain('tiaSum');
    });

    it('should register orbitEcho outside coloring as an orbit-channel consumer', () => {
      const coloring = pluginRegistry.getOutsideColoring('orbitEcho');
      expect(coloring).toBeDefined();
      expect(coloring?.glsl).toContain('s.minRadius');
      expect(coloring?.glsl).toContain('s.radius2');
      expect(coloring?.glsl).toContain('s.zPrev');
    });
  });
});
