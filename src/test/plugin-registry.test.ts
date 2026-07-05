import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '@/engine/plugins/registry';
import type {
  FormulaPlugin,
  OutsideColoringPlugin,
  InsideColoringPlugin,
  TransformPlugin,
} from '@/engine/plugins/types';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  const mockFormula: FormulaPlugin = {
    id: 'testFormula',
    category: 'formula',
    name: 'test.formula',
    source: 'builtin',
    glsl: 'vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev) { return z; }',
    uniforms: [],
    bailout: 4.0,
    supportsPower: true,
    supportsJulia: true,
    family: 'classic',
    escapeType: 'diverge',
  };

  const mockOutsideColoring: OutsideColoringPlugin = {
    id: 'testOutside',
    category: 'outsideColoring',
    name: 'test.outside',
    source: 'builtin',
    glsl: 'float outsideColor(float si, int iter, OrbitStats s) { return 0.5; }',
    uniforms: [],
    needsOrbitStats: [],
  };

  const mockInsideColoring: InsideColoringPlugin = {
    id: 'testInside',
    category: 'insideColoring',
    name: 'test.inside',
    source: 'builtin',
    glsl: 'vec3 insideColor(OrbitStats s) { return vec3(0.0); }',
    uniforms: [],
    needsOrbitStats: [],
  };

  const mockTransform: TransformPlugin = {
    id: 'testTransform',
    category: 'transform',
    name: 'test.transform',
    source: 'builtin',
    glsl: 'vec2 transformUV(vec2 uv) { return uv; }',
    uniforms: [],
  };

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('register', () => {
    it('should register a formula plugin', () => {
      registry.register(mockFormula);
      expect(registry.getFormula('testFormula')).toBe(mockFormula);
    });

    it('should register an outside coloring plugin', () => {
      registry.register(mockOutsideColoring);
      expect(registry.getOutsideColoring('testOutside')).toBe(mockOutsideColoring);
    });

    it('should register an inside coloring plugin', () => {
      registry.register(mockInsideColoring);
      expect(registry.getInsideColoring('testInside')).toBe(mockInsideColoring);
    });

    it('should register a transform plugin', () => {
      registry.register(mockTransform);
      expect(registry.getTransform('testTransform')).toBe(mockTransform);
    });

    it('should throw error for unknown category', () => {
      const invalidPlugin = { ...mockFormula, category: 'invalid' as const };
      expect(() => registry.register(invalidPlugin as unknown as FormulaPlugin)).toThrow(
        'Unknown plugin category'
      );
    });
  });

  describe('unregister', () => {
    it('should unregister a formula plugin', () => {
      registry.register(mockFormula);
      registry.unregister('formula', 'testFormula');
      expect(registry.getFormula('testFormula')).toBeUndefined();
    });

    it('should unregister an outside coloring plugin', () => {
      registry.register(mockOutsideColoring);
      registry.unregister('outsideColoring', 'testOutside');
      expect(registry.getOutsideColoring('testOutside')).toBeUndefined();
    });

    it('should unregister an inside coloring plugin', () => {
      registry.register(mockInsideColoring);
      registry.unregister('insideColoring', 'testInside');
      expect(registry.getInsideColoring('testInside')).toBeUndefined();
    });

    it('should unregister a transform plugin', () => {
      registry.register(mockTransform);
      registry.unregister('transform', 'testTransform');
      expect(registry.getTransform('testTransform')).toBeUndefined();
    });
  });

  describe('list methods', () => {
    it('should list all formulas', () => {
      registry.register(mockFormula);
      const formulas = registry.listFormulas();
      expect(formulas).toHaveLength(1);
      expect(formulas[0].id).toBe('testFormula');
    });

    it('should list all outside coloring modes', () => {
      registry.register(mockOutsideColoring);
      const modes = registry.listOutsideColoring();
      expect(modes).toHaveLength(1);
      expect(modes[0].id).toBe('testOutside');
    });

    it('should list all inside coloring modes', () => {
      registry.register(mockInsideColoring);
      const modes = registry.listInsideColoring();
      expect(modes).toHaveLength(1);
      expect(modes[0].id).toBe('testInside');
    });

    it('should list all transforms', () => {
      registry.register(mockTransform);
      const transforms = registry.listTransforms();
      expect(transforms).toHaveLength(1);
      expect(transforms[0].id).toBe('testTransform');
    });
  });

  describe('has methods', () => {
    it('should check if formula exists', () => {
      expect(registry.hasFormula('testFormula')).toBe(false);
      registry.register(mockFormula);
      expect(registry.hasFormula('testFormula')).toBe(true);
    });

    it('should check if outside coloring exists', () => {
      expect(registry.hasOutsideColoring('testOutside')).toBe(false);
      registry.register(mockOutsideColoring);
      expect(registry.hasOutsideColoring('testOutside')).toBe(true);
    });

    it('should check if inside coloring exists', () => {
      expect(registry.hasInsideColoring('testInside')).toBe(false);
      registry.register(mockInsideColoring);
      expect(registry.hasInsideColoring('testInside')).toBe(true);
    });

    it('should check if transform exists', () => {
      expect(registry.hasTransform('testTransform')).toBe(false);
      registry.register(mockTransform);
      expect(registry.hasTransform('testTransform')).toBe(true);
    });
  });

  describe('multiple plugins', () => {
    it('should handle multiple formulas', () => {
      const formula1 = { ...mockFormula, id: 'formula1' };
      const formula2 = { ...mockFormula, id: 'formula2' };
      registry.register(formula1);
      registry.register(formula2);
      expect(registry.listFormulas()).toHaveLength(2);
    });

    it('should handle plugins with uniforms', () => {
      const formulaWithUniforms: FormulaPlugin = {
        ...mockFormula,
        id: 'formulaWithUniforms',
        uniforms: [
          { name: 'u_testFloat', type: 'float', default: 1.0, min: 0, max: 10 },
          { name: 'u_testInt', type: 'int', default: 5 },
          { name: 'u_testVec2', type: 'vec2', default: [0, 0] },
        ],
      };
      registry.register(formulaWithUniforms);
      const retrieved = registry.getFormula('formulaWithUniforms');
      expect(retrieved?.uniforms).toHaveLength(3);
      expect(retrieved?.uniforms[0].name).toBe('u_testFloat');
    });
  });

  describe('formula-specific properties', () => {
    it('should preserve converge escape type for Newton formulas', () => {
      const newtonFormula: FormulaPlugin = {
        ...mockFormula,
        id: 'newtonTest',
        escapeType: 'converge',
        family: 'newton',
      };
      registry.register(newtonFormula);
      const retrieved = registry.getFormula('newtonTest');
      expect(retrieved?.escapeType).toBe('converge');
      expect(retrieved?.family).toBe('newton');
    });

    it('should preserve bailout value', () => {
      const formulaWithBailout: FormulaPlugin = {
        ...mockFormula,
        id: 'highBailout',
        bailout: 100.0,
      };
      registry.register(formulaWithBailout);
      expect(registry.getFormula('highBailout')?.bailout).toBe(100.0);
    });
  });
});
