/**
 * FRM Parser - Lexer
 * M4.2 Phase 2.1 + M4.4 Error Reporting Enhancement
 * 
 * Character-by-character tokenizer for .frm syntax
 * Enhanced with error reporting and smart suggestions
 */

import type { SourceLocation } from './ast';

export type TokenType =
  | 'IDENT'
  | 'NUMBER'
  | 'COMPLEX'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'CARET'
  | 'LPAREN'
  | 'RPAREN'
  | 'PIPE'
  | 'COMMA'
  | 'EQUALS'
  | 'LT'
  | 'GT'
  | 'LE'
  | 'GE'
  | 'EQ'
  | 'NE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'COLON'
  | 'LBRACE'
  | 'RBRACE'
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
}

/**
 * Lexer error with smart suggestions
 */
export interface LexerError {
  line: number;
  col: number;
  char: string;
  message: string;
  suggestion?: string;
  severity: 'error' | 'warning';
}

/**
 * Tokenize result including errors
 */
export interface TokenizeResult {
  tokens: Token[];
  errors: LexerError[];
}

/**
 * Common character replacements for error suggestions
 */
const CHAR_SUGGESTIONS: Record<string, { replace: string; reason: string }> = {
  '\u2192': { replace: '>=', reason: 'arrow symbol' },
  '\u2190': { replace: '<=', reason: 'arrow symbol' },
  '\u3002': { replace: '.', reason: 'full-width period' },
  '\uff0c': { replace: ',', reason: 'full-width comma' },
  '\uff08': { replace: '(', reason: 'full-width left parenthesis' },
  '\uff09': { replace: ')', reason: 'full-width right parenthesis' },
  '\u3010': { replace: '[', reason: 'full-width square bracket' },
  '\u3011': { replace: ']', reason: 'full-width square bracket' },
  '\uff5b': { replace: '{', reason: 'full-width brace' },
  '\uff5d': { replace: '}', reason: 'full-width brace' },
  '\uff1a': { replace: ':', reason: 'full-width colon' },
  '\uff1b': { replace: ';', reason: 'full-width semicolon' },
  '\uff01': { replace: '!', reason: 'full-width exclamation mark' },
  '\uff1f': { replace: '?', reason: 'full-width question mark' },
  '\uff0b': { replace: '+', reason: 'full-width plus sign' },
  '\uff0d': { replace: '-', reason: 'full-width minus sign' },
  '\uff0a': { replace: '*', reason: 'full-width asterisk' },
  '\uff0f': { replace: '/', reason: 'full-width slash' },
  '\uff1d': { replace: '=', reason: 'full-width equals sign' },
  '\uff1c': { replace: '<', reason: 'full-width less-than sign' },
  '\uff1e': { replace: '>', reason: 'full-width greater-than sign' },
  '\uff05': { replace: '%', reason: 'full-width percent sign' },
  '\uff06': { replace: '&', reason: 'full-width ampersand' },
  '\uff5c': { replace: '|', reason: 'full-width pipe' },
  '\uff3e': { replace: '^', reason: 'full-width caret' },
  '\uff04': { replace: '$', reason: 'full-width dollar sign' },
  '\uff03': { replace: '#', reason: 'full-width hash sign' },
  '\uff20': { replace: '@', reason: 'full-width at sign' },
};

/**
 * Tokenize FRM source code with error reporting
 */
export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: LexerError[] = [];
  let line = 1;
  let col = 1;
  let i = 0;

  function loc(): SourceLocation {
    return { line, col };
  }

  function advance(): string {
    const char = source[i];
    i++;
    if (char === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return char;
  }

  function peek(offset = 0): string {
    return source[i + offset] ?? '\0';
  }

  function skipWhitespace() {
    while (i < source.length && /[ \t\r]/.test(peek())) {
      advance();
    }
  }

  function skipComment() {
    if (peek() === ';') {
      while (i < source.length && peek() !== '\n') {
        advance();
      }
    }
  }

  function readNumber(): string {
    // Digits with at most one dot. A second dot ABUTTING the digits is a
    // malformed number (`1.2.3`, `.5.6`) — error loudly instead of letting
    // parseFloat silently truncate or the tail re-lex as a leading-dot
    // number (Codex 5e round-1).
    let value = '';
    let seenDot = false;
    while (i < source.length) {
      const c = peek();
      if (/[0-9]/.test(c)) {
        value += advance();
      } else if (c === '.' && !seenDot) {
        seenDot = true;
        value += advance();
      } else if (c === '.') {
        const errLoc = loc();
        errors.push({
          line: errLoc.line,
          col: errLoc.col,
          char: c,
          message: "Malformed number: second decimal point",
          severity: 'error',
        });
        // Consume the malformed tail so cascading tokens do not multiply.
        while (i < source.length && /[0-9.]/.test(peek())) advance();
        break;
      } else {
        break;
      }
    }
    // Scientific notation (classic `1e12` / `1e-12`): consume the exponent
    // only when well-formed (`e`/`E`, optional sign, at least one digit);
    // otherwise backtrack so `2e` still reads as `2 * e` (Euler builtin)
    // via implicit multiplication (Codex 6b2 round-1).
    if (i < source.length && (source[i] === 'e' || source[i] === 'E')) {
      const saveI = i;
      const saveLine = line;
      const saveCol = col;
      let exp = advance();
      if (i < source.length && (source[i] === '+' || source[i] === '-')) exp += advance();
      let expDigits = 0;
      while (i < source.length && /[0-9]/.test(source[i])) {
        exp += advance();
        expDigits++;
      }
      if (expDigits > 0) {
        value += exp;
      } else {
        i = saveI;
        line = saveLine;
        col = saveCol;
      }
    }
    return value;
  }

  function readIdent(): string {
    let value = '';
    while (i < source.length && /[a-zA-Z0-9_]/.test(peek())) {
      value += advance();
    }
    return value;
  }

  /**
   * Report an unknown character error with suggestion
   */
  function reportUnknownChar(char: string, startLoc: SourceLocation) {
    const suggestion = CHAR_SUGGESTIONS[char];
    
    if (suggestion) {
      errors.push({
        line: startLoc.line,
        col: startLoc.col,
        char,
        message: `Found ${suggestion.reason} '${char}', which is invalid in FRM syntax`,
        suggestion: `Replace it with '${suggestion.replace}'`,
        severity: 'error',
      });
    } else if (/[\u4e00-\u9fa5]/.test(char)) {
      // Chinese character
      errors.push({
        line: startLoc.line,
        col: startLoc.col,
        char,
        message: `Found Chinese character '${char}', FRM syntax does not support Chinese identifiers`,
        suggestion: 'Use English identifiers',
        severity: 'error',
      });
    } else if (char.charCodeAt(0) > 127) {
      // Other non-ASCII characters
      errors.push({
        line: startLoc.line,
        col: startLoc.col,
        char,
        message: `Found non-ASCII character '${char}' (Unicode: U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
        suggestion: 'Use standard ASCII characters',
        severity: 'error',
      });
    } else {
      errors.push({
        line: startLoc.line,
        col: startLoc.col,
        char,
        message: `Unknown character '${char}'`,
        severity: 'error',
      });
    }
  }

  while (i < source.length) {
    skipWhitespace();
    
    if (peek() === ';') {
      skipComment();
      continue;
    }

    const char = peek();
    const startLoc = loc();

    // End of file
    if (char === '\0') {
      break;
    }

    // Newline
    if (char === '\n') {
      advance();
      tokens.push({ type: 'NEWLINE', value: '\n', loc: startLoc });
      continue;
    }

    // Complex number: (real, imag)
    if (char === '(') {
      const savePos = i;
      const saveLine = line;
      const saveCol = col;
      advance(); // consume '('
      
      let inner = '';
      let parenDepth = 1;
      while (i < source.length && parenDepth > 0) {
        const c = peek();
        if (c === '(') parenDepth++;
        if (c === ')') parenDepth--;
        if (parenDepth > 0) inner += advance();
        else advance(); // consume closing ')'
      }

      // Check if it looks like a complex number: number, number
      // (classic numeric forms: 1, 1., 1.5, and leading-dot .5)
      const NUM = /^-?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/;
      const parts = inner.split(',').map(s => s.trim());
      if (parts.length === 2 && NUM.test(parts[0]) && NUM.test(parts[1])) {
        tokens.push({ type: 'COMPLEX', value: `${parts[0]},${parts[1]}`, loc: startLoc });
      } else {
        // Not a complex number, reset and treat as LPAREN
        i = savePos;
        line = saveLine;
        col = saveCol;
        tokens.push({ type: 'LPAREN', value: '(', loc: startLoc });
        advance();
      }
      continue;
    }

    // Numbers (classic also allows the leading-dot form: .5, .001)
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(peek(1)))) {
      const value = readNumber();
      tokens.push({ type: 'NUMBER', value, loc: startLoc });
      // Classic implicit multiplication: a number IMMEDIATELY followed by
      // an identifier or `(` multiplies (`3z` == `3*z`, rcl_12/rcl_13
      // corpus evidence). Adjacency in the raw source is required — the
      // parser drops NEWLINE tokens before parsing, so a whitespace or
      // line boundary must never turn into a multiplication.
      if (i < source.length && /[a-zA-Z_(]/.test(source[i])) {
        tokens.push({ type: 'STAR', value: '*', loc: { line, col } });
      }
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      const value = readIdent();
      tokens.push({ type: 'IDENT', value, loc: startLoc });
      continue;
    }

    // Two-character operators
    const twoChar = char + peek(1);
    const twoCharOps: Record<string, TokenType> = {
      '<=': 'LE',
      '>=': 'GE',
      '==': 'EQ',
      '!=': 'NE',
      '&&': 'AND',
      '||': 'OR',
    };
    if (twoCharOps[twoChar]) {
      advance();
      advance();
      tokens.push({ type: twoCharOps[twoChar], value: twoChar, loc: startLoc });
      continue;
    }

    // Single-character operators
    const singleCharOps: Record<string, TokenType> = {
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '^': 'CARET',
      ')': 'RPAREN',
      '|': 'PIPE',
      ',': 'COMMA',
      '=': 'EQUALS',
      '<': 'LT',
      '>': 'GT',
      '!': 'NOT',
      ':': 'COLON',
      '{': 'LBRACE',
      '}': 'RBRACE',
    };
    if (singleCharOps[char]) {
      advance();
      tokens.push({ type: singleCharOps[char], value: char, loc: startLoc });
      continue;
    }

    // Unknown character - report error but continue tokenizing
    reportUnknownChar(char, startLoc);
    advance();
    // Still produce a token to allow parser to continue (error recovery)
    tokens.push({ type: 'IDENT', value: char, loc: startLoc });
  }

  tokens.push({ type: 'EOF', value: '', loc: { line, col } });
  return { tokens, errors };
}

/**
 * Format lexer errors for display
 */
export function formatLexerErrors(errors: LexerError[]): string[] {
  return errors.map(err => {
    let msg = `Line ${err.line}, column ${err.col}: ${err.message}`;
    if (err.suggestion) {
      msg += `\n  💡 ${err.suggestion}`;
    }
    return msg;
  });
}
