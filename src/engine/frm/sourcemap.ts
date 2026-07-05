/**
 * FRM Parser - Source Map
 * M4.2 Phase 2.1
 * 
 * Maps GLSL errors back to FRM source locations
 */

import type { ASTNode } from './ast';

export interface SourceMapping {
  frmLine: number;
  frmCol: number;
  glslLine: number;
  glslCol: number;
  nodeType: string;
  nodeSource: string;
}

export class FRMSourceMap {
  private mappings: SourceMapping[] = [];
  private glslToFRM = new Map<number, SourceMapping>();
  private currentGlslLine = 1;

  /**
   * Record a mapping from FRM location to GLSL location
   */
  record(node: ASTNode, glslSource: string): void {
    const mapping: SourceMapping = {
      frmLine: node.loc.line,
      frmCol: node.loc.col,
      glslLine: this.currentGlslLine,
      glslCol: 1,
      nodeType: node.type,
      nodeSource: glslSource.substring(0, 50),
    };

    this.mappings.push(mapping);
    this.glslToFRM.set(this.currentGlslLine, mapping);
  }

  /**
   * Advance GLSL line counter
   */
  advanceLine(count = 1): void {
    this.currentGlslLine += count;
  }

  /**
   * Map a GLSL error back to FRM location
   */
  mapGLError(glslLine: number, glslCol: number): SourceMapping | null {
    void glslCol;
    // Try exact match first
    const exact = this.glslToFRM.get(glslLine);
    if (exact) return exact;

    // Find closest line
    let closest: SourceMapping | null = null;
    let minDistance = Infinity;

    for (const mapping of this.mappings) {
      const dist = Math.abs(mapping.glslLine - glslLine);
      if (dist < minDistance) {
        minDistance = dist;
        closest = mapping;
      }
    }

    return closest;
  }

  /**
   * Format an error message for user display
   */
  formatError(
    glslError: { line: number; col: number; message: string },
    frmSource: string
  ): string {
    const mapping = this.mapGLError(glslError.line, glslError.col);
    if (!mapping) {
      return `Compile error: ${glslError.message}`;
    }

    const frmLines = frmSource.split('\n');
    const frmLine = frmLines[mapping.frmLine - 1] || '';
    const pointer = ' '.repeat(Math.max(0, mapping.frmCol - 1)) + '^';

    return [
      `Formula compile error:`,
      `  ${glslError.message}`,
      ``,
      `Location: line ${mapping.frmLine}, column ${mapping.frmCol}`,
      `      ${frmLine}`,
      `      ${pointer}`,
      ``,
      `Generated GLSL (line ${glslError.line}):`,
      `  ${mapping.nodeSource}...`,
    ].join('\n');
  }

  /**
   * Get all mappings for debugging
   */
  getMappings(): SourceMapping[] {
    return [...this.mappings];
  }
}
