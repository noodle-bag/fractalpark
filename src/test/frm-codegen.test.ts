/**
 * FRM Parser - Codegen Tests
 * M4.2 Phase 2.1
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../engine/frm/lexer';
import { parse } from '../engine/frm/parser';
import { validate } from '../engine/frm/validator';
import { generateGLSL } from '../engine/frm/codegen';
import { FRMSourceMap } from '../engine/frm/sourcemap';

describe('FRM Code Generator', () => {
  it('should generate GLSL for Mandelbrot', () => {
    const source = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    expect(ast).toBeDefined();
    
    const { valid } = validate(ast!);
    expect(valid).toBe(true);
    
    const sourceMap = new FRMSourceMap();
    const { glsl, bailout } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('vec2 iterateStep');
    expect(glsl).toContain('complexPow');
    expect(bailout).toBe(4.0);
  });

  it('should generate GLSL with magnitude', () => {
    const source = `Test {
loop:
  z = z^2 + c
bailout:
  |z| < 2
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl, bailout } = generateGLSL(ast!, sourceMap);
    
    // Note: magnitude (|z|) is used in bailout which is extracted as value
    // The bailout expression itself is used by the framework shader, not in iterateStep
    expect(bailout).toBe(2.0);
    expect(glsl).toContain('iterateStep');
  });

  it('should generate GLSL with function calls', () => {
    const source = `Test {
loop:
  z = sin(z) + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('complexSin');
  });

  it('should generate GLSL with real() and imag()', () => {
    const source = `Test {
loop:
  z = real(z) + imag(z) * c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('.x');
    expect(glsl).toContain('.y');
  });

  it('should generate GLSL with complex multiplication', () => {
    const source = `Test {
loop:
  z = z * c + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('complexMul');
  });

  it('should generate GLSL with complex division', () => {
    const source = `Test {
loop:
  z = z / c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('complexDiv');
  });

  it('should generate GLSL with complex constant', () => {
    const source = `Test {
loop:
  z = z + (0.5, 0.3)
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);
    
    expect(glsl).toContain('vec2(0.500000, 0.300000)');
  });

  it('should promote real literals for complex assignments', () => {
    const source = `Test {
init:
  z = pixel + 1
loop:
  z = z + 1
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { initGlsl, glsl } = generateGLSL(ast!, sourceMap);

    expect(initGlsl).toContain('z = (pixel + vec2(1.0, 0.0));');
    expect(glsl).toContain('z = (z + vec2(1.0, 0.0));');
  });

  it('should use Fractint-compatible magnitude and abs semantics', () => {
    const source = `Test {
loop:
  z = abs(z) + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);

    expect(glsl).toContain('abs(z)');
    expect(glsl).toContain('float frmMagnitude(vec2 value)');
    expect(glsl).not.toContain('length(z)');
  });

  it('should map cabs to complex magnitude length', () => {
    const source = `Test {
loop:
  z = cabs(z) + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);

    expect(glsl).toContain('length(z)');
    expect(glsl).not.toContain('abs(z)');
  });

  it('should generate else-if chains for multiple elseif branches', () => {
    const source = `Test {
loop:
  if real(z) > 1
    z = z + 1
  elseif real(z) > 0
    z = z - 1
  elseif real(z) > -1
    z = z + 2
  else
    z = z - 2
  endif
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl } = generateGLSL(ast!, sourceMap);

    expect(glsl).toContain('} else if (');
    expect((glsl.match(/else if/g) ?? [])).toHaveLength(2);
  });

  it('should generate LastSqr tracking and fn slot helpers', () => {
    const source = `Test {
loop:
  z = fn1(sqr(z)) + LastSqr + p4 + p5
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    const sourceMap = new FRMSourceMap();
    const { glsl, uniforms } = generateGLSL(ast!, sourceMap);

    expect(glsl).toContain('float frmLastSqr = 0.0;');
    expect(glsl).toContain('vec2 applyFn1(vec2 value)');
    expect(glsl).toContain('frmSqr(z)');
    expect(glsl).toContain('frmLastSqr');
    expect(uniforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'u_fn1', type: 'int' }),
        expect.objectContaining({ name: 'u_p4', type: 'vec2' }),
        expect.objectContaining({ name: 'u_p5', type: 'vec2' }),
      ])
    );
  });
});
