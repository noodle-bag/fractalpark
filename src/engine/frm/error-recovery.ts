/**
 * FRM Parser - Error Recovery
 * M4.2 Phase 2.1
 * 
 * Panic mode error recovery for parser
 */

import type { Token, TokenType } from './lexer';

export interface ParseError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
}

export class ErrorRecovery {
  private errors: ParseError[] = [];
  private panicMode = false;
  private panicDepth = 0;
  private maxPanicDepth = 10;

  /**
   * Report an error and enter panic mode
   */
  reportError(line: number, col: number, message: string, severity: 'error' | 'warning' = 'error'): void {
    this.errors.push({ line, col, message, severity });
    if (severity === 'error') {
      this.panicMode = true;
      this.panicDepth = 0;
    }
  }

  /**
   * Check if we should skip this token (in panic mode)
   */
  shouldSkip(token: Token): boolean {
    if (!this.panicMode) return false;

    this.panicDepth++;

    // Synchronization points
    const syncTokens: TokenType[] = ['IDENT', 'COLON', 'RBRACE', 'EOF'];
    
    // Also check for specific keywords
    if (token.type === 'IDENT') {
      const keywords = ['endif', 'elseif', 'else', 'init', 'loop', 'bailout'];
      if (keywords.includes(token.value.toLowerCase())) {
        this.panicMode = false;
        this.panicDepth = 0;
        return false;
      }
    }

    if (syncTokens.includes(token.type) || this.panicDepth > this.maxPanicDepth) {
      this.panicMode = false;
      this.panicDepth = 0;
      return false;
    }

    return true;
  }

  /**
   * Check if we're currently in panic mode
   */
  isInPanicMode(): boolean {
    return this.panicMode;
  }

  /**
   * Get all collected errors
   */
  getErrors(): ParseError[] {
    return [...this.errors];
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.some(e => e.severity === 'error');
  }

  /**
   * Clear all errors and reset state
   */
  clear(): void {
    this.errors = [];
    this.panicMode = false;
    this.panicDepth = 0;
  }
}
