/**
 * FRM Parser - Recursive Descent Parser
 * M4.2 Phase 2.1 + M4.4 Enhanced Error Recovery
 * 
 * Operator precedence (low to high):
 * 1: ||
 * 2: &&
 * 3: < > <= >= == !=
 * 4: + -
 * 5: * /
 * 6: ^ (right-associative)
 * 7: unary - ! |expr|
 */

import type { ASTNode, FrmAST, SourceLocation } from './ast';
import type { Token, TokenType } from './lexer';
import { KNOWN_FUNCTION_NAMES } from './builtins';

export interface ParseError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Smart error messages with suggestions
 */
const SMART_ERRORS: Record<string, { message: string; suggestion?: string }> = {
  'Expected RBRACE but got EOF': {
    message: 'Formula definition is not closed',
    suggestion: 'Add a closing brace "}" at the end of the formula',
  },
  'Missing bailout expression': {
    message: 'Missing bailout expression',
    suggestion: 'Add a bailout block, for example: bailout:\n  |z| < 4',
  },
  'Expected COLON': {
    message: 'Missing colon',
    suggestion: 'Add a colon after the section name, for example: init:',
  },
  'Expected section name': {
    message: 'Expected section name',
    suggestion: 'Available sections: init, loop, bailout',
  },
};

/**
 * System variables that cannot be assigned
 */
const SYSTEM_VARS = new Set(['c', 'pixel']);

/**
 * Known functions for typo detection
 */
const KNOWN_FUNCTIONS = new Set(KNOWN_FUNCTION_NAMES);

export class Parser {
  private tokens: Token[];
  private pos = 0;
  errors: ParseError[] = [];
  private maxErrors = 20;

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(t => t.type !== 'NEWLINE'); // Skip newlines for parsing
  }

  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const token = this.current();
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return token;
  }

  private expect(type: TokenType, context?: string): Token | null {
    if (this.current().type === type) {
      return this.advance();
    }
    
    const expectedMsg = context 
      ? `Expected ${type}${context ? ` (${context})` : ''}` 
      : `Expected ${type}`;
    const gotMsg = `but got ${this.current().type}`;
    
    this.error(`${expectedMsg}, ${gotMsg}`, this.current().loc);
    return null;
  }

  private error(message: string, loc?: SourceLocation, suggestion?: string) {
    if (this.errors.length >= this.maxErrors) return;
    
    const location = loc || this.current().loc;
    
    // Check for smart error replacement
    const smart = SMART_ERRORS[message];
    if (smart) {
      this.errors.push({
        line: location.line,
        col: location.col,
        message: smart.message,
        suggestion: suggestion || smart.suggestion,
        severity: 'error',
      });
    } else {
      this.errors.push({
        line: location.line,
        col: location.col,
        message,
        suggestion,
        severity: 'error',
      });
    }
  }

  private warning(message: string, loc?: SourceLocation, suggestion?: string) {
    if (this.errors.length >= this.maxErrors) return;
    
    const location = loc || this.current().loc;
    this.errors.push({
      line: location.line,
      col: location.col,
      message,
      suggestion,
      severity: 'warning',
    });
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.current().type);
  }

  private consume(type: TokenType): boolean {
    if (this.match(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * Synchronize to a safe point after error
   */
  private synchronize() {
    const syncTokens: TokenType[] = ['IDENT', 'COLON', 'RBRACE', 'EOF'];
    
    while (!this.match(...syncTokens) && !this.match('EOF')) {
      this.advance();
    }
  }

  /**
   * Find closest function name for typo suggestion
   */
  private suggestFunction(name: string): string | undefined {
    let bestMatch: string | undefined;
    let bestScore = Infinity;
    
    for (const func of KNOWN_FUNCTIONS) {
      const score = this.levenshtein(name, func);
      if (score < bestScore && score <= 2) {
        bestScore = score;
        bestMatch = func;
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate Levenshtein distance for typo detection
   */
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  parse(): FrmAST | null {
    // Parse formula name: Name { ... }
    const nameToken = this.expect('IDENT', 'formula name');
    if (!nameToken) {
      this.synchronize();
      return null;
    }
    const name = nameToken.value;

    if (!this.expect('LBRACE', 'left brace "{"')) {
      this.synchronize();
      return null;
    }

    let initBlock: ASTNode[] = [];
    let loopBlock: ASTNode[] = [];
    let bailoutExpr: ASTNode | null = null;
    let hasInit = false;
    let hasLoop = false;
    let hasBailout = false;

    while (!this.match('RBRACE') && !this.match('EOF')) {
      const section = this.current();
      if (section.type !== 'IDENT') {
        this.error(
          `Expected section name (init, loop, bailout), but got ${section.type}`,
          section.loc,
          'Add a colon after the section name, for example: init:'
        );
        this.advance();
        this.synchronize();
        continue;
      }

      const sectionName = section.value.toLowerCase();
      
      // Check for duplicate sections
      if (sectionName === 'init' && hasInit) {
        this.warning('Duplicate init section; the last one will be used', section.loc);
      } else if (sectionName === 'loop' && hasLoop) {
        this.warning('Duplicate loop section; the last one will be used', section.loc);
      } else if (sectionName === 'bailout' && hasBailout) {
        this.warning('Duplicate bailout section; the last one will be used', section.loc);
      }
      
      this.advance();

      if (!this.expect('COLON', 'colon ":"')) {
        this.synchronize();
        continue;
      }

      switch (sectionName) {
        case 'init':
          initBlock = this.parseBlock();
          hasInit = true;
          break;
        case 'loop':
          loopBlock = this.parseBlock();
          hasLoop = true;
          break;
        case 'bailout':
          bailoutExpr = this.parseExpression();
          hasBailout = true;
          break;
        default:
          this.error(`Unknown section: ${sectionName}`, section.loc, 'Available sections: init, loop, bailout');
          this.parseBlock(); // Skip unknown section
      }
    }

    this.expect('RBRACE', 'right brace "}"');

    if (!bailoutExpr) {
      this.error(
        'Missing bailout expression',
        this.current().loc,
        'Every formula must include a bailout block, for example: bailout:\n  |z| < 4'
      );
      return null;
    }

    // Warnings for missing sections
    if (!hasInit) {
      this.warning('Missing init section; using empty initialization', nameToken.loc);
    }
    if (!hasLoop) {
      this.warning('Missing loop section; using empty loop body', nameToken.loc);
    }

    return {
      name,
      params: [], // Params are inferred from usage
      initBlock,
      loopBlock,
      bailoutExpr,
    };
  }

  private parseBlock(): ASTNode[] {
    const statements: ASTNode[] = [];
    
    // Section keywords that terminate a block
    const sectionKeywords = ['init', 'loop', 'bailout', 'elseif', 'else', 'endif'];
    
    while (!this.match('RBRACE') && !this.match('EOF')) {
      const current = this.current();
      
      // Check for section keywords that end this block
      if (current.type === 'IDENT') {
        const keyword = current.value.toLowerCase();
        if (sectionKeywords.includes(keyword) && keyword !== 'if') {
          break;
        }
      }

      // Try to parse a statement with error recovery
      try {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
      } catch {
        // Statement-level error recovery
        this.error('Statement parsing failed; skipping to the next statement', this.current().loc);
        this.synchronizeToStatementEnd();
      }

      if (this.errors.length > this.maxErrors) {
        this.error('Too many errors; stopping parse', this.current().loc);
        break;
      }
    }

    return statements;
  }

  /**
   * Synchronize to end of current statement
   */
  private synchronizeToStatementEnd() {
    // Skip until we hit a newline equivalent (IDENT starting new statement, RBRACE, etc.)
    while (!this.match('EOF')) {
      if (this.match('IDENT')) {
        const val = this.current().value.toLowerCase();
        if (['if', 'elseif', 'else', 'endif', 'init', 'loop', 'bailout'].includes(val)) {
          break;
        }
      }
      if (this.match('RBRACE')) break;
      this.advance();
    }
  }

  private parseStatement(): ASTNode | null {
    // Check for if statement
    if (this.current().type === 'IDENT' && this.current().value.toLowerCase() === 'if') {
      return this.parseIfStatement();
    }

    // Assignment: target = value
    if (this.peek(0).type === 'IDENT' && this.peek(1).type === 'EQUALS') {
      return this.parseAssignment();
    }

    // Expression statement (rare but possible)
    return this.parseExpression();
  }

  private parseAssignment(): ASTNode | null {
    const targetToken = this.expect('IDENT', 'assignment target');
    if (!targetToken) return null;

    const target = targetToken.value;
    const loc = targetToken.loc;

    // Check for assignment to system variable
    if (SYSTEM_VARS.has(target.toLowerCase())) {
      this.error(
        `Cannot assign to system variable '${target}'`,
        loc,
        `'${target}' is reserved; use another variable name such as '${target}2' or 'my${target}'`
      );
    }

    if (!this.expect('EQUALS', 'equals sign "="')) return null;

    const value = this.parseExpression();
    if (!value) return null;

    return { type: 'assignment', target, value, loc };
  }

  private parseIfStatement(): ASTNode | null {
    const ifToken = this.current();
    const loc = ifToken.loc;
    
    if (ifToken.type !== 'IDENT' || ifToken.value.toLowerCase() !== 'if') {
      this.error('Expected if', loc);
      return null;
    }
    this.advance();

    const condition = this.parseExpression();
    if (!condition) {
      this.error('if statement requires a condition expression', loc, 'For example: if |z| < 4');
      return null;
    }

    const thenBranch = this.parseBlock();

    const elseIfBranches: { condition: ASTNode; body: ASTNode[]; loc: SourceLocation }[] = [];
    let elseBranch: ASTNode[] | undefined;

    let sawEndif = false;

    while (this.current().type === 'IDENT') {
      const keyword = this.current().value.toLowerCase();
      
      if (keyword === 'elseif') {
        this.advance();
        const elseifCond = this.parseExpression();
        if (elseifCond) {
          const elseifBody = this.parseBlock();
          elseIfBranches.push({ condition: elseifCond, body: elseifBody, loc: this.current().loc });
        }
      } else if (keyword === 'else') {
        this.advance();
        elseBranch = this.parseBlock();
      } else if (keyword === 'endif') {
        this.advance();
        sawEndif = true;
        break;
      } else {
        break;
      }
    }

    // Check for missing endif
    if (!sawEndif) {
      this.warning('if statement may be missing endif', loc);
    }

    return {
      type: 'if',
      condition,
      then: thenBranch,
      elseIf: elseIfBranches.length > 0 ? elseIfBranches : undefined,
      else: elseBranch,
      loc,
    };
  }

  // Expression parsing with precedence climbing
  private parseExpression(): ASTNode | null {
    return this.parseOr();
  }

  private parseOr(): ASTNode | null {
    let left = this.parseAnd();
    if (!left) return null;

    while (this.match('OR')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parseAnd();
      if (!right) return left;
      left = { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parseAnd(): ASTNode | null {
    let left = this.parseComparison();
    if (!left) return null;

    while (this.match('AND')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parseComparison();
      if (!right) return left;
      left = { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parseComparison(): ASTNode | null {
    let left = this.parseAddSub();
    if (!left) return null;

    while (this.match('LT', 'GT', 'LE', 'GE', 'EQ', 'NE')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parseAddSub();
      if (!right) return left;
      left = { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parseAddSub(): ASTNode | null {
    let left = this.parseMulDiv();
    if (!left) return null;

    while (this.match('PLUS', 'MINUS')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parseMulDiv();
      if (!right) return left;
      left = { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parseMulDiv(): ASTNode | null {
    let left = this.parsePower();
    if (!left) return null;

    while (this.match('STAR', 'SLASH')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parsePower();
      if (!right) return left;
      left = { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parsePower(): ASTNode | null {
    const left = this.parseUnary();
    if (!left) return null;

    // Right-associative: a ^ b ^ c = a ^ (b ^ c)
    if (this.match('CARET')) {
      const op = this.advance().value;
      const loc: SourceLocation = left.loc;
      const right = this.parsePower(); // Recurse for right-associativity
      if (!right) return left;
      return { type: 'binary', op, left, right, loc };
    }
    return left;
  }

  private parseUnary(): ASTNode | null {
    if (this.match('MINUS', 'NOT')) {
      const op = this.advance().value;
      const loc = this.current().loc;
      const operand = this.parseUnary();
      if (!operand) return null;
      return { type: 'unary', op, operand, loc };
    }

    // Magnitude: |expr|
    if (this.match('PIPE')) {
      const loc = this.advance().loc;
      const operand = this.parseExpression();
      if (!operand) return null;
      if (!this.expect('PIPE', 'right pipe "|"')) {
        this.error('Magnitude expression requires a closing "|"', loc, 'For example: |z| < 4');
        return null;
      }
      return { type: 'magnitude', operand, loc };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ASTNode | null {
    const node = this.parsePrimary();
    if (!node) return null;

    // Function call: name(arg1, arg2, ...)
    if (this.match('LPAREN') && node.type === 'ident') {
      const name = (node as { name: string }).name;
      const loc = node.loc;
      this.advance(); // consume '('

      const args: ASTNode[] = [];
      if (!this.match('RPAREN')) {
        do {
          const arg = this.parseExpression();
          if (arg) args.push(arg);
        } while (this.consume('COMMA'));
      }

      if (!this.expect('RPAREN', 'right parenthesis ")"')) {
        this.error('Function call requires a closing parenthesis', loc);
        return null;
      }

      // Check for unknown functions with typo suggestion
      if (!KNOWN_FUNCTIONS.has(name.toLowerCase() as (typeof KNOWN_FUNCTION_NAMES)[number])) {
        const suggestion = this.suggestFunction(name.toLowerCase());
        if (suggestion) {
          this.warning(
            `Unknown function '${name}'`,
            loc,
            `Did you mean '${suggestion}'?`
          );
        }
      }

      return { type: 'call', name, args, loc };
    }

    return node;
  }

  private parsePrimary(): ASTNode | null {
    const token = this.current();
    const loc = token.loc;

    switch (token.type) {
      case 'NUMBER':
        this.advance();
        return { type: 'number', value: parseFloat(token.value), loc };

      case 'COMPLEX': {
        this.advance();
        const [real, imag] = token.value.split(',').map(s => parseFloat(s.trim()));
        return { type: 'complex', real, imag, loc };
      }

      case 'IDENT':
        this.advance();
        return { type: 'ident', name: token.value, loc };

      case 'LPAREN': {
        this.advance();
        const expr = this.parseExpression();
        this.expect('RPAREN', 'right parenthesis ")"');
        return expr;
      }

      default:
        this.error(
          `Unexpected token: ${token.type}`,
          loc,
          'Expected an expression here (number, variable, function call, or parentheses)'
        );
        this.advance();
        return null;
    }
  }
}

export function parse(tokens: Token[]): { ast: FrmAST | null; errors: ParseError[] } {
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, errors: parser.errors };
}

/**
 * Format parse errors for display
 */
export function formatParseErrors(errors: ParseError[]): string[] {
  return errors.map(err => {
    let msg = `${err.severity === 'error' ? '❌' : '⚠️'} Line ${err.line}, column ${err.col}: ${err.message}`;
    if (err.suggestion) {
      msg += `\n  💡 ${err.suggestion}`;
    }
    return msg;
  });
}
