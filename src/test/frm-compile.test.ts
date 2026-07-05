/**
 * FRM Parser - End-to-End Compilation Tests
 * M4.2 Phase 2.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileFrm, compileToGLSL } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';

describe('FRM Compile', () => {
  beforeEach(() => {
    // Clear cache before each test to avoid interference
    frmParserCache.clear();
  });
  it('should compile Mandelbrot formula successfully', () => {
    const source = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(true);
    expect(result.plugin).toBeDefined();
    expect(result.plugin?.name).toBe('Mandelbrot');
    expect(result.glsl).toContain('iterateStep');
  });

  it('should compile Julia formula', () => {
    const source = `Julia {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(true);
    expect(result.plugin?.name).toBe('Julia');
  });

  it('should compile formula with parameters', () => {
    const source = `Phoenix {
init:
  z = 0
loop:
  z = z^2 + c + p1 * zPrev
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(true);
    expect(result.glsl).toContain('u_p1');
  });

  it('should expose canonical formula envelope', () => {
    const source = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);

    expect(result.success).toBe(true);
    expect(result.canonicalFormula).toBeDefined();
    expect(result.canonicalFormula?.metadata.dialect).toBe('fractint-compat');
    expect(result.canonicalFormula?.ast.name).toBe('Mandelbrot');
  });

  it('should compile Phase 1 builtin symbols and fn slots', () => {
    const source = `LegacyCompat {
init:
  z = pixel
loop:
  z = fn1(sqr(z)) + p4 + p5 + pi + e + maxit + ismand + LastSqr
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);

    expect(result.success).toBe(true);
    expect(result.plugin?.uniforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'u_fn1', type: 'int', default: 0 }),
        expect.objectContaining({ name: 'u_p4', type: 'vec2' }),
        expect.objectContaining({ name: 'u_p5', type: 'vec2' }),
      ])
    );
    expect(result.glsl).toContain('frmLastSqr');
    expect(result.canonicalFormula?.compatibilityNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'info',
          message: expect.stringContaining('ismand currently maps to !u_isJulia'),
        }),
        expect.objectContaining({
          kind: 'info',
          message: expect.stringContaining('fn1'),
        }),
      ])
    );
  });

  it('should report error for undefined variable', () => {
    const source = `Test {
loop:
  z = undefined_var + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('Undeclared variable') || e.includes('Undeclared variable'))).toBe(true);
  });

  it('should report error for unknown function', () => {
    const source = `Test {
loop:
  z = unknown_func(z) + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown function') || e.includes('Unknown function'))).toBe(true);
  });

  it('should compileToGLSL helper', () => {
    const source = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileToGLSL(source);
    
    expect(result.glsl).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should generate unique plugin ID', () => {
    const source = `MyFormula {
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source, 'custom-id');
    
    expect(result.success).toBe(true);
    expect(result.plugin?.id).toBe('custom-id');
  });

  it('should auto-generate ID if not provided', () => {
    const source = `MyFormula {
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(true);
    expect(result.plugin?.id).toContain('myformula');
  });

  it('should compile formula with if statement', () => {
    const source = `Barnsley {
init:
  z = 0
loop:
  if real(z) >= 0
    z = (z - 1) * c
  else
    z = (z + 1) * c
  endif
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);
    
    expect(result.success).toBe(true);
    expect(result.glsl).toContain('if');
    expect(result.glsl).toContain('else');
  });

  it('should compile if ismand without missing endif warnings', () => {
    const source = `CompatIf {
loop:
  if ismand
    z = z + 1
  endif
bailout:
  |z| < 4
}`;
    const result = compileFrm(source);

    expect(result.success).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('endif'))).toBe(false);
  });
});
