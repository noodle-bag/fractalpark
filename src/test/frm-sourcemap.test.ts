/**
 * FRM Parser - Source Map Tests
 * M4.2 Phase 2.1
 */

import { describe, it, expect } from 'vitest';
import { FRMSourceMap } from '../engine/frm/sourcemap';
import type { AssignmentNode, IdentNode, NumberNode } from '../engine/frm/ast';

describe('FRM Source Map', () => {
  it('should record and retrieve mappings', () => {
    const sourceMap = new FRMSourceMap();
    const node: AssignmentNode = {
      type: 'assignment',
      target: 'z',
      value: { type: 'number', value: 0, loc: { line: 3, col: 3 } },
      loc: { line: 3, col: 3 },
    };
    
    sourceMap.record(node, 'z = 0.0;');
    
    const mapping = sourceMap.mapGLError(1, 1);
    expect(mapping).toBeDefined();
    expect(mapping?.frmLine).toBe(3);
    expect(mapping?.frmCol).toBe(3);
  });

  it('should find closest line for unmapped GLSL line', () => {
    const sourceMap = new FRMSourceMap();
    const nodeLine1: NumberNode = { type: 'number', value: 0, loc: { line: 1, col: 1 } };
    const nodeLine5: NumberNode = { type: 'number', value: 1, loc: { line: 5, col: 1 } };
    
    sourceMap.record(nodeLine1, 'line1');
    sourceMap.advanceLine();
    sourceMap.record(nodeLine5, 'line5');
    
    // Line 3 is between line 1 and line 5, should map to closest (line 5)
    const mapping = sourceMap.mapGLError(3, 1);
    expect(mapping).toBeDefined();
  });

  it('should format error message', () => {
    const sourceMap = new FRMSourceMap();
    const node: IdentNode = { type: 'ident', name: 'z', loc: { line: 2, col: 5 } };
    sourceMap.record(node, 'length(z)');
    
    const frmSource = 'loop:\n  z = z^2\nbailout:';
    const error = sourceMap.formatError({ line: 1, col: 1, message: 'Unknown identifier' }, frmSource);
    
    expect(error).toContain('Formula compile error');
    expect(error).toContain('Unknown identifier');
    expect(error).toContain('line 2');
  });

  it('should handle empty source map', () => {
    const sourceMap = new FRMSourceMap();
    const mapping = sourceMap.mapGLError(1, 1);
    expect(mapping).toBeNull();
  });
});
