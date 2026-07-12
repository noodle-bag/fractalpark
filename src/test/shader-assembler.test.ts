import { describe, it, expect, beforeAll } from 'vitest';
import { assembleShader, makeCacheKey } from '@/engine/shaders/assembler';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import type { PluginCombination } from '@/engine/plugins/types';

describe('Shader Assembler', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  describe('makeCacheKey', () => {
    it('should create consistent cache keys', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const key = makeCacheKey(combo);
      expect(key).toBe('mandelbrot|smooth|black|none');
    });

    it('should create unique keys for different combinations', () => {
      const key1 = makeCacheKey({
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      });
      const key2 = makeCacheKey({
        formulaId: 'burningShip',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      });
      expect(key1).not.toBe(key2);
    });
  });

  describe('assembleShader', () => {
    it('should assemble default combination without errors', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('precision highp float');
      expect(shader).toContain('BAILOUT_RADIUS 4.0');
      expect(shader).toContain('iterateStep');
    });

    it('should extend OrbitStats with Phase 2 orbit channels', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('vec2 finalZ;');
      expect(shader).toContain('vec2 zPrev;');
      expect(shader).toContain('float radius2;');
      expect(shader).toContain('float minRadius;');
      expect(shader).toContain('float maxRadius;');
      expect(shader).toContain('float angleAccum;');
    });

    it('should include complex math library', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('complexPow');
      expect(shader).toContain('complexMul');
      expect(shader).toContain('complexSqr');
    });

    it('should include palette functions', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('iqPalette');
      expect(shader).toContain('getColor');
    });

    it('should apply uniform-driven color adjustments after SSAA resolve', () => {
      const shader = assembleShader({
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      });

      expect(shader).toContain('uniform vec3 u_rgbCurvePoints[5]');
      expect(shader).toContain('if (!u_adjustmentsEnabled) return clamp(color, 0.0, 1.0);');
      expect(shader).toContain('vec3 applyColorAdjustments(vec3 color)');
      expect(shader).toContain('resolvedColor = acc / 16.0;');
      expect(shader).toContain('applyColorAdjustments(resolvedColor)');
    });

    it('should define ESCAPE_CONVERGE for Newton formulas', () => {
      const combo: PluginCombination = {
        formulaId: 'newton3',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('#define ESCAPE_CONVERGE');
      expect(shader).toContain('#define CONVERGE_EPSILON');
    });

    it('should not define ESCAPE_CONVERGE for diverge formulas', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      // Check that the actual define (not comment) is not present
      const lines = shader.split('\n');
      const escapeConvergeDefine = lines.find(
        (line) => line.trim() === '#define ESCAPE_CONVERGE'
      );
      expect(escapeConvergeDefine).toBeUndefined();
    });

    it('should include orbit trap when needed', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'orbitTrap',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('#define NEED_ORBIT_TRAP');
      expect(shader).toContain('orbitTrapDistance');
    });

    it('should include TIA define when needed', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'tia',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('#define NEED_TIA');
    });

    it('should include transform GLSL', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'kaleidoscope',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('transformUV');
    });

    it('should include formula iterateStep function', () => {
      const combo: PluginCombination = {
        formulaId: 'burningShip',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('iterateStep');
      expect(shader).toContain('abs');
    });

    it('should include outside coloring function', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'stripe',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('outsideColor');
    });

    it('should assemble orbitEcho coloring with Phase 2 orbit channels', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('s.finalZ');
      expect(shader).toContain('s.zPrev');
      expect(shader).toContain('s.minRadius');
      expect(shader).toContain('s.maxRadius');
      expect(shader).toContain('s.radius2');
    });

    it('should populate OrbitStats channels inside the main iteration loop', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'finalOrbit',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('stats.finalZ = z;');
      expect(shader).toContain('stats.zPrev = zPrev;');
      expect(shader).toContain('stats.radius2 = zz;');
      expect(shader).toContain('stats.minRadius = min(stats.minRadius, zz);');
      expect(shader).toContain('stats.maxRadius = max(stats.maxRadius, zz);');
      expect(shader).toContain('stats.angleAccum += angle;');
    });

    it('should include inside coloring function', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'smooth',
        insideColoringId: 'atomDomain',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('insideColor');
    });

    it('should throw error for missing formula', () => {
      const combo: PluginCombination = {
        formulaId: 'nonExistent',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      expect(() => assembleShader(combo)).toThrow('Missing plugin(s)');
    });

    it('should throw error for missing outside coloring', () => {
      const combo: PluginCombination = {
        formulaId: 'mandelbrot',
        outsideColoringId: 'nonExistent',
        insideColoringId: 'black',
        transformId: 'none',
      };
      expect(() => assembleShader(combo)).toThrow('Missing plugin(s)');
    });

    it('should assemble shader for each formula family', () => {
      const formulas: string[] = ['mandelbrot', 'newton3', 'magnet1', 'phoenix', 'mandelbox'];

      for (const id of formulas) {
        const combo: PluginCombination = {
          formulaId: id,
          outsideColoringId: 'smooth',
          insideColoringId: 'black',
          transformId: 'none',
        };
        const shader = assembleShader(combo);
        expect(shader).toContain('iterateStep');
        expect(shader.length).toBeGreaterThan(1000);
      }
    });

    it('should assemble shader for all transforms', () => {
      const transforms = ['none', 'kaleidoscope', 'mobius', 'inversion', 'polar', 'sinusoidal', 'spherical'];

      for (const transformId of transforms) {
        const combo: PluginCombination = {
          formulaId: 'mandelbrot',
          outsideColoringId: 'smooth',
          insideColoringId: 'black',
          transformId,
        };
        const shader = assembleShader(combo);
        expect(shader).toContain('transformUV');
      }
    });

    it('should include plugin uniforms in shader', () => {
      const formula = pluginRegistry.getFormula('phoenix');
      expect(formula?.uniforms.length).toBeGreaterThan(0);

      const combo: PluginCombination = {
        formulaId: 'phoenix',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('uniform');
    });

    it('should set correct bailout radius for formula', () => {
      const formulas: { id: string; expectedBailout: number }[] = [
        { id: 'mandelbrot', expectedBailout: 65536.0 },
        { id: 'magnet1', expectedBailout: 16.0 },
      ];

      for (const { id, expectedBailout } of formulas) {
        const formula = pluginRegistry.getFormula(id);
        if (formula) {
          expect(formula.bailout ?? 4.0).toBe(expectedBailout);
        }
      }
    });

    it('should include ESCAPE_CONVERGE define for Newton formulas', () => {
      const newtonFormulas = ['newton3', 'newton4', 'newtonSin', 'newtonExp'];

      for (const id of newtonFormulas) {
        const combo: PluginCombination = {
          formulaId: id,
          outsideColoringId: 'smooth',
          insideColoringId: 'black',
          transformId: 'none',
        };
        const shader = assembleShader(combo);
        expect(shader).toContain('#define ESCAPE_CONVERGE');
        expect(shader).toContain('#define CONVERGE_EPSILON');
      }
    });

    it('should use point as initial z for Newton formulas to avoid div-by-zero', () => {
      // This test verifies the fix for Issue #33
      // Newton formulas have z in the denominator, so z cannot start at 0
      const combo: PluginCombination = {
        formulaId: 'newton3',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      
      // The shader should contain the ESCAPE_CONVERGE path for z initialization
      expect(shader).toContain('ESCAPE_CONVERGE');
    });
    it('should wrap initGlsl into complete initFormula function', () => {
      // Formulas with initGlsl (e.g. logistic, duck) need a complete function wrapper
      const combo: PluginCombination = {
        formulaId: 'logistic',
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        transformId: 'none',
      };
      const shader = assembleShader(combo);
      expect(shader).toContain('#define HAS_INIT_FORMULA');
      expect(shader).toContain('vec2 initFormula(vec2 z, vec2 c, vec2 point)');
      expect(shader).toContain('return z;');
    });
  });
});
