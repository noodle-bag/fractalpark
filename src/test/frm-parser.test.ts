/**
 * FRM Parser - Parser Tests
 * M4.2 Phase 2.1
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../engine/frm/lexer';
import { parse } from '../engine/frm/parser';
import type { AssignmentNode, BinaryNode, IfNode } from '../engine/frm/ast';

describe('FRM Parser', () => {
  it('should parse simple Mandelbrot formula', () => {
    const source = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast, errors } = parse(tokens);
    
    expect(errors).toHaveLength(0);
    expect(ast).toBeDefined();
    expect(ast?.name).toBe('Mandelbrot');
    expect(ast?.initBlock).toHaveLength(1);
    expect(ast?.loopBlock).toHaveLength(1);
  });

  it('should parse formula with complex constant', () => {
    const source = `Julia {
init:
  z = pixel
loop:
  z = z^2 + (0.3, 0.5)
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    
    expect(ast).toBeDefined();
    expect(ast?.loopBlock[0]?.type).toBe('assignment');
  });

  it('should parse formula with function call', () => {
    const source = `Test {
loop:
  z = sin(z) + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    
    expect(ast).toBeDefined();
    const loopStmt = ast?.loopBlock[0];
    expect(loopStmt?.type).toBe('assignment');
  });

  it('should parse if statement', () => {
    const source = `Test {
loop:
  if |z| < 2
    z = z * 2
  endif
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast, errors } = parse(tokens);
    
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(errors.some(e => e.message.includes('endif'))).toBe(false);
    expect(ast?.loopBlock[0]?.type).toBe('if');
  });

  it('should not warn for closed if-endif blocks', () => {
    const source = `Test {
loop:
  if ismand
    z = z + 1
  endif
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { errors } = parse(tokens);

    expect(errors.some(e => e.message.includes('endif'))).toBe(false);
  });

  it('should parse if-else statement', () => {
    const source = `Test {
loop:
  if real(z) > 0
    z = z + 1
  else
    z = z - 1
  endif
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    
    expect(ast).toBeDefined();
    const ifStmt = ast?.loopBlock[0];
    expect(ifStmt?.type).toBe('if');
    const ifNode = ifStmt as IfNode;
    expect(ifNode.else).toBeDefined();
  });

  it('should parse multiple elseif branches', () => {
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
    const { ast, errors } = parse(tokens);

    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const ifNode = ast?.loopBlock[0] as IfNode;
    expect(ifNode.type).toBe('if');
    expect(ifNode.elseIf).toHaveLength(2);
    expect(ifNode.else).toBeDefined();
  });

  it('should handle operator precedence', () => {
    const source = `Test {
loop:
  z = a + b * c ^ d
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    const { ast } = parse(tokens);
    
    expect(ast).toBeDefined();
    // Should parse as: a + (b * (c ^ d))
    const loopStmt = ast?.loopBlock[0] as AssignmentNode;
    expect(loopStmt.value.type).toBe('binary');
    const expr = loopStmt.value as BinaryNode;
    expect(expr.op).toBe('+');
  });

  it('should report error for missing bailout', () => {
    const source = `Test {
init:
  z = 0
loop:
  z = z^2
}`;
    const { tokens } = tokenize(source);
    const { errors } = parse(tokens);
    
    expect(errors.length).toBeGreaterThan(0);
  });
});
