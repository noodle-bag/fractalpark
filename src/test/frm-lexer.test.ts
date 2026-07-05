/**
 * FRM Parser - Lexer Tests
 * M4.2 Phase 2.1
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../engine/frm/lexer';

describe('FRM Lexer', () => {
  it('should tokenize simple assignment', () => {
    const { tokens } = tokenize('z = 0');
    expect(tokens.map(t => t.type)).toContain('IDENT');
    expect(tokens.map(t => t.type)).toContain('EQUALS');
    expect(tokens.map(t => t.type)).toContain('NUMBER');
  });

  it('should tokenize complex number', () => {
    const { tokens } = tokenize('(1.5, -2.0)');
    const complex = tokens.find(t => t.type === 'COMPLEX');
    expect(complex).toBeDefined();
    expect(complex?.value).toBe('1.5,-2.0');
  });

  it('should tokenize magnitude syntax', () => {
    const { tokens } = tokenize('|z|');
    expect(tokens.filter(t => t.type === 'PIPE')).toHaveLength(2);
  });

  it('should tokenize formula structure', () => {
    const source = `
Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;
    const { tokens } = tokenize(source);
    expect(tokens.some(t => t.type === 'IDENT' && t.value === 'Mandelbrot')).toBe(true);
    expect(tokens.some(t => t.type === 'IDENT' && t.value === 'init')).toBe(true);
    expect(tokens.some(t => t.type === 'CARET')).toBe(true);
  });

  it('should skip comments', () => {
    const { tokens } = tokenize('z = 0 ; this is a comment');
    expect(tokens.find(t => t.type === 'IDENT' && t.value === 'this')).toBeUndefined();
  });

  it('should tokenize comparison operators', () => {
    const source = 'a < b && c > d || e <= f && g >= h';
    const { tokens } = tokenize(source);
    expect(tokens.some(t => t.type === 'LT')).toBe(true);
    expect(tokens.some(t => t.type === 'GT')).toBe(true);
    expect(tokens.some(t => t.type === 'LE')).toBe(true);
    expect(tokens.some(t => t.type === 'GE')).toBe(true);
    expect(tokens.some(t => t.type === 'AND')).toBe(true);
    expect(tokens.some(t => t.type === 'OR')).toBe(true);
  });

  it('should track line numbers', () => {
    const source = 'line1\nline2\nline3';
    const { tokens } = tokenize(source);
    const ids = tokens.filter(t => t.type === 'IDENT');
    expect(ids[0]?.loc.line).toBe(1);
    expect(ids[1]?.loc.line).toBe(2);
    expect(ids[2]?.loc.line).toBe(3);
  });
});
