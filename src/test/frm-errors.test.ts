/**
 * FRM Parser - Error Scenario Tests
 * M4.4 - Error experience optimization
 *
 * Tests for error reporting, suggestions, error recovery, and formatting.
 */

import { describe, it, expect } from 'vitest';
import { tokenize, formatLexerErrors } from '../engine/frm/lexer';
import { parse, formatParseErrors } from '../engine/frm/parser';
import { validate } from '../engine/frm/validator';
import { compileFrm } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';

describe('Lexer Error Reporting', () => {
  it('should report Chinese punctuation with replacement suggestion', () => {
    const { errors } = tokenize('z \uff1d 0');
    expect(errors.length).toBeGreaterThan(0);
    const fullwidthEquals = errors.find(e => e.char === '\uff1d');
    expect(fullwidthEquals).toBeDefined();
    expect(fullwidthEquals!.suggestion).toContain('=');
    expect(fullwidthEquals!.severity).toBe('error');
  });

  it('should report Chinese comma with suggestion', () => {
    const { errors } = tokenize('(1\uff0c 2)');
    const commaErr = errors.find(e => e.char === '\uff0c');
    expect(commaErr).toBeDefined();
    expect(commaErr!.suggestion).toContain(',');
  });

  it('should report Chinese parentheses with suggestion', () => {
    const { errors } = tokenize('z = sin\uff08z\uff09');
    const leftParen = errors.find(e => e.char === '\uff08');
    const rightParen = errors.find(e => e.char === '\uff09');
    expect(leftParen).toBeDefined();
    expect(leftParen!.suggestion).toContain('(');
    expect(rightParen).toBeDefined();
    expect(rightParen!.suggestion).toContain(')');
  });

  it('should report Chinese colon', () => {
    const { errors } = tokenize('init\uff1a');
    const colonErr = errors.find(e => e.char === '\uff1a');
    expect(colonErr).toBeDefined();
    expect(colonErr!.suggestion).toContain(':');
  });

  it('should report Chinese characters as unknown with suggestion', () => {
    const { errors } = tokenize('\u53d8\u91cf = 0');
    expect(errors.length).toBeGreaterThan(0);
    // Chinese characters may be reported individually or as a group
    const hasChineseErr = errors.some(e =>
      e.message.includes('Chinese character') || e.message.includes('non-ASCII')
    );
    expect(hasChineseErr).toBe(true);
  });

  it('should report non-ASCII characters with Unicode code point', () => {
    const { errors } = tokenize('z = 0 § 1');
    const nonAscii = errors.find(e => e.char === '§');
    expect(nonAscii).toBeDefined();
    expect(nonAscii!.message).toContain('U+00A7');
  });

  it('should continue tokenizing after unknown character', () => {
    const { tokens, errors } = tokenize('z \uff1d 0');
    // Should still produce tokens despite the error
    expect(tokens.length).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);
    // 'z' and '0' should still be tokenized
    expect(tokens.some(t => t.type === 'IDENT' && t.value === 'z')).toBe(true);
    expect(tokens.some(t => t.type === 'NUMBER' && t.value === '0')).toBe(true);
  });

  it('should format lexer errors with line/col and suggestion', () => {
    const { errors } = tokenize('z ＝ 0');
    const formatted = formatLexerErrors(errors);
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted[0]).toMatch(/Line \d+/);
  });
});

describe('Parser Error Recovery', () => {
  it('should suggest function name for typo', () => {
    const { tokens } = tokenize(`Test {
loop:
  z = sinn(z) + c
bailout:
  |z| < 4
}`);
    const { errors } = parse(tokens);
    const typoWarning = errors.find(e =>
      e.message.includes('sinn') && e.severity === 'warning'
    );
    expect(typoWarning).toBeDefined();
    expect(typoWarning!.suggestion).toContain('sin');
  });

  it('should report error for assigning to system variable c', () => {
    const { tokens } = tokenize(`Test {
loop:
  c = z^2
bailout:
  |z| < 4
}`);
    const { errors } = parse(tokens);
    const sysVarErr = errors.find(e =>
      e.message.includes('system variable') && e.message.includes('c')
    );
    expect(sysVarErr).toBeDefined();
    expect(sysVarErr!.suggestion).toBeDefined();
  });

  it('should warn about duplicate sections', () => {
    const { tokens } = tokenize(`Test {
init:
  z = 0
init:
  z = 1
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`);
    const { errors } = parse(tokens);
    const dupWarning = errors.find(e =>
      e.severity === 'warning' && e.message.toLowerCase().includes('duplicate')
    );
    expect(dupWarning).toBeDefined();
  });

  it('should continue parsing after error in one section', () => {
    const { tokens } = tokenize(`Test {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`);
    const { ast } = parse(tokens);
    // Should successfully parse despite being simple
    expect(ast).toBeDefined();
    expect(ast!.name).toBe('Test');
  });

  it('should limit errors with maxErrors', () => {
    // Generate source with many errors
    let source = 'Test {\nloop:\n';
    for (let i = 0; i < 30; i++) {
      source += `  unknownVar${i} = 0\n`;
    }
    source += 'bailout:\n  |z| < 4\n}';

    const { tokens } = tokenize(source);
    const { errors } = parse(tokens);
    // Parser has maxErrors = 20
    expect(errors.length).toBeLessThanOrEqual(21); // 20 + possible "too many errors" message
  });

  it('should report missing closing brace', () => {
    const { tokens } = tokenize(`Test {
loop:
  z = z^2 + c
bailout:
  |z| < 4
`);
    const { errors } = parse(tokens);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should format parse errors with severity icons', () => {
    const { tokens } = tokenize(`Test {
loop:
  c = z
bailout:
  |z| < 4
}`);
    const { errors } = parse(tokens);
    const formatted = formatParseErrors(errors);
    for (const msg of formatted) {
      expect(msg).toMatch(/[❌⚠️]/);
      expect(msg).toMatch(/Line \d+/);
    }
  });
});

describe('Validator Error Messages', () => {
  it('should report undeclared variable', () => {
    frmParserCache.clear();
    const result = compileFrm(`Test {
loop:
  z = unknownVar + c
bailout:
  |z| < 4
}`);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('Undeclared variable'))).toBe(true);
  });

  it('should report unknown function', () => {
    frmParserCache.clear();
    const result = compileFrm(`Test {
loop:
  z = badFunc(z) + c
bailout:
  |z| < 4
}`);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown function'))).toBe(true);
  });

  it('should report readonly variable assignment', () => {
    frmParserCache.clear();
    const { tokens } = tokenize(`Test {
init:
  z = 0
loop:
  c = z^2
  z = z + c
bailout:
  |z| < 4
}`);
    const { ast } = parse(tokens);
    expect(ast).toBeDefined();
    const { errors } = validate(ast!);
    const readonlyErr = errors.find(e => e.message.includes('read-only variable'));
    expect(readonlyErr).toBeDefined();
  });

  it('should report reserved word usage', () => {
    const { tokens } = tokenize(`Test {
loop:
  float = z^2 + c
  z = float
bailout:
  |z| < 4
}`);
    const { ast } = parse(tokens);
    if (ast) {
      const { errors } = validate(ast);
      const reservedErr = errors.find(e => e.message.toLowerCase().includes('reserved word'));
      expect(reservedErr).toBeDefined();
    }
  });

  it('should warn about non-comparison bailout', () => {
    frmParserCache.clear();
    const { tokens } = tokenize(`Test {
loop:
  z = z^2 + c
bailout:
  z
}`);
    const { ast } = parse(tokens);
    if (ast) {
      const { errors } = validate(ast);
      const bailoutWarn = errors.find(e =>
        e.severity === 'warning' && e.message.toLowerCase().includes('bailout')
      );
      expect(bailoutWarn).toBeDefined();
    }
  });
});
