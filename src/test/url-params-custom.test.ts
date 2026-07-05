/**
 * URL Params Tests for Custom Formulas
 * M4.2 Phase 2.3
 */

import { describe, it, expect } from 'vitest';
import { 
  encodeParams, 
  decodeParams, 
  isCustomFormula, 
  validateFormula 
} from '../lib/url-params';

describe('Custom Formula URL Handling', () => {
  describe('isCustomFormula', () => {
    it('should identify frm- prefixed formulas as custom', () => {
      expect(isCustomFormula('frm-mandelbrot')).toBe(true);
      expect(isCustomFormula('frm-myformula')).toBe(true);
    });

    it('should identify custom- prefixed formulas as custom', () => {
      expect(isCustomFormula('custom-123')).toBe(true);
      expect(isCustomFormula('custom-myfrac')).toBe(true);
    });

    it('should not identify builtin formulas as custom', () => {
      expect(isCustomFormula('mandelbrot')).toBe(false);
      expect(isCustomFormula('burningShip')).toBe(false);
      expect(isCustomFormula('tricorn')).toBe(false);
    });
  });

  describe('encodeParams', () => {
    it('should encode custom formula ID directly', () => {
      const params = encodeParams({ 
        formula: 'frm-myformula',
        centerX: 0,
        centerY: 0,
        zoom: 1,
      });
      
      expect(params.get('fm')).toBe('frm-myformula');
    });

    it('should use short keys for builtin formulas', () => {
      const params = encodeParams({ 
        formula: 'mandelbrot',
        centerX: 0,
        centerY: 0,
        zoom: 1,
      });
      
      // mandelbrot is default, so fm should not be present
      expect(params.get('fm')).toBeNull();
    });

    it('should encode plugin params', () => {
      const params = encodeParams({
        formula: 'phoenix',
        pluginParams: { 'u_phoenixP': -0.5 },
        centerX: 0,
        centerY: 0,
        zoom: 1,
      });
      
      // Phoenix has default p = -0.5, so it shouldn't be encoded
      expect(params.get('pp')).toBeNull();
    });
  });

  describe('decodeParams', () => {
    it('should decode custom formula ID', () => {
      const params = new URLSearchParams('fm=frm-custom-test');
      const state = decodeParams(params);
      
      expect(state.formula).toBe('frm-custom-test');
    });

    it('should decode builtin formula from short key', () => {
      const params = new URLSearchParams('fm=bs');
      const state = decodeParams(params);
      
      expect(state.formula).toBe('burningShip');
    });

    it('should decode plugin params', () => {
      const params = new URLSearchParams('pp=u_custom:1.5,u_other:2.0');
      const state = decodeParams(params);
      
      expect(state.pluginParams).toEqual({
        'u_custom': 1.5,
        'u_other': 2.0,
      });
    });
  });

  describe('validateFormula', () => {
    it('should return formula ID if it exists in registry', () => {
      // mandelbrot should always exist
      const result = validateFormula('mandelbrot');
      expect(result).toBe('mandelbrot');
    });

    it('should fallback to mandelbrot for non-existent formulas', () => {
      const result = validateFormula('frm-nonexistent-test');
      expect(result).toBe('mandelbrot');
    });
  });
});
