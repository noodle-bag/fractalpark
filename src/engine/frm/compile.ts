/**
 * FRM Parser - Compiler Entry Point
 * M4.2 Phase 2.1 + M4.4 Enhanced Error Reporting
 * 
 * Full compilation pipeline: source -> AST -> GLSL with source map support
 */

import type { CanonicalFormula, FrmAST } from './ast';
import { createCanonicalFormula } from './ast';
import type { FormulaPlugin } from '../plugins/types';
import { tokenize, formatLexerErrors, type LexerError } from './lexer';
import { parse, formatParseErrors, type ParseError } from './parser';
import { validate } from './validator';
import { generateGLSL } from './codegen';
import { FRMSourceMap } from './sourcemap';
import { frmParserCache } from './cache';
import { scanFrmEntries, selectFrmEntry, FRM_BLOCKING_DIAGNOSTICS, type FrmEntry, type FrmSourceRange } from './scanner';

export interface CompileResult {
  success: boolean;
  plugin?: FormulaPlugin;
  errors: string[];
  warnings: string[];
  ast?: FrmAST;
  canonicalFormula?: CanonicalFormula;
  glsl?: string;
  sourceMap?: FRMSourceMap;
}

/**
 * Compile FRM source code to a FormulaPlugin
 * Results are cached for unchanged sources
 */
export function compileFrm(source: string, id?: string): CompileResult {
  // Check cache first
  const cached = frmParserCache.get(source);
  if (cached) {
    // If a specific ID is requested, update the cached plugin's ID
    if (id && cached.plugin) {
      return {
        ...cached,
        plugin: { ...cached.plugin, id },
      };
    }
    return cached;
  }

  // Perform full compilation
  const result = compileFrmUncached(source, id);
  
  // Cache successful results
  if (result.success) {
    frmParserCache.set(source, result);
  }
  
  return result;
}

function compileFrmUncached(source: string, id?: string): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Step 1: Tokenize (with enhanced error reporting)
    const { tokens, errors: lexerErrors } = tokenize(source);

    if (lexerErrors.length > 0) {
      const formattedLexerErrors = formatLexerErrors(lexerErrors);
      errors.push(...formattedLexerErrors);
    }

    // Step 2: Parse
    const { ast, errors: parseErrors } = parse(tokens);
    
    if (parseErrors.length > 0) {
      const formattedParseErrors = formatParseErrors(parseErrors);
      errors.push(...formattedParseErrors);
    }

    if (!ast) {
      return { success: false, errors, warnings };
    }

    // Step 3: Validate
    const { valid, errors: validationErrors } = validate(ast);
    
    for (const err of validationErrors) {
      const msg = `Line ${err.line}, column ${err.col}: ${err.message}`;
      if (err.severity === 'error') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }

    if (!valid) {
      return { success: false, errors, warnings, ast };
    }

    const canonicalFormula = createCanonicalFormula(ast, source);

    // Step 4: Generate GLSL with source map
    const sourceMap = new FRMSourceMap();
    const { glsl, initGlsl, uniforms, bailout } = generateGLSL(ast, sourceMap);

    // Step 5: Create FormulaPlugin
    const pluginUniforms = uniforms.map(u => ({
      name: u.name,
      type: u.type,
      default: u.type === 'vec2' ? [0, 0] : 0,
    }));

    const plugin: FormulaPlugin = {
      id: id ?? `frm-${ast.name.toLowerCase().replace(/\s+/g, '-')}`,
      category: 'formula',
      name: ast.name,
      source: 'frm',
      supportsPower: false, // DEPRECATED per ADR-0007: capability resolves from AST/dataflow, not this flag.
      supportsJulia: true,
      bailout,
      uniforms: pluginUniforms,
      glsl,
      initGlsl,
    };

    return {
      success: true,
      plugin,
      errors,
      warnings,
      ast,
      canonicalFormula,
      glsl,
      sourceMap,
    };

  } catch (e) {
    errors.push(`Compile error: ${e instanceof Error ? e.message : String(e)}`);
    return { success: false, errors, warnings };
  }
}

/**
 * Compile and return just the GLSL (for testing)
 */
export function compileToGLSL(source: string): { glsl?: string; error?: string; sourceMap?: FRMSourceMap } {
  const result = compileFrm(source);
  if (result.success && result.glsl) {
    return { glsl: result.glsl, sourceMap: result.sourceMap };
  }
  return { error: result.errors.join('\n') };
}

/**
 * Map GLSL compilation error back to FRM source location
 * This is the key function for M4.4 Phase 5
 */
export function mapGLSLErrorToFRM(
  glslError: { line: number; col: number; message: string },
  sourceMap: FRMSourceMap,
  frmSource: string
): { 
  frmLine: number; 
  frmCol: number; 
  message: string;
  formatted: string;
} | null {
  const mapping = sourceMap.mapGLError(glslError.line, glslError.col);
  if (!mapping) {
    return null;
  }

  const frmLines = frmSource.split('\n');
  const frmLine = frmLines[mapping.frmLine - 1] || '';
  const pointer = ' '.repeat(Math.max(0, mapping.frmCol - 1)) + '^';

  const formatted = [
    `GLSL Compile error: ${glslError.message}`,
    ``,
    `Location in FRM source: line ${mapping.frmLine}, column ${mapping.frmCol}`,
    `    ${frmLine}`,
    `    ${pointer}`,
    ``,
    `Generated GLSL (line ${glslError.line}):`,
    `    ${mapping.nodeSource.substring(0, 50)}...`,
  ].join('\n');

  return {
    frmLine: mapping.frmLine,
    frmCol: mapping.frmCol,
    message: glslError.message,
    formatted,
  };
}

/**
 * Compile with full error mapping support
 * Returns detailed error information with source locations
 */
export interface DetailedCompileResult extends CompileResult {
  lexerErrors: LexerError[];
  parseErrors: ParseError[];
}

export function compileFrmDetailed(source: string, id?: string): DetailedCompileResult {
  // Run tokenize + parse once to collect structured errors
  const { tokens, errors: lexerErrors } = tokenize(source);
  const { errors: parseErrors } = parse(tokens);

  // Get the full compile result (may use cache)
  const result = compileFrm(source, id);

  return {
    ...result,
    lexerErrors,
    parseErrors,
  };
}

export type FrmSelectionErrorCode =
  | 'no-entries'
  | 'selection-required'
  | 'unknown-entry'
  | 'unknown-range'
  | 'invalid-source';

/** Structured selection failure for `compileFrmEntry`. */
export interface FrmSelectionError {
  code: FrmSelectionErrorCode;
  message: string;
  /** Stable keys of every entry in the scanned source. */
  entryKeys: string[];
}

export interface EntryCompileResult extends DetailedCompileResult {
  /** The selected entry; present whenever selection succeeded. */
  entry?: FrmEntry;
  /** Structured selection failure; present when selection could not resolve. */
  selectionError?: FrmSelectionError;
}

/**
 * Compile a single entry of a classic FRM source, selected by stable entry
 * key. The entry text (header included) is sliced from the source and flows
 * through the existing `compileFrmDetailed` pipeline — there is no
 * "take the first entry and compile" fallback (docs/specs/
 * frm-compatibility-v1.md §2).
 *
 * - A single-entry source may be compiled without a key (implicit
 *   selection of the only entry).
 * - A multi-entry source without a key is rejected with a structured
 *   `selection-required` error.
 * - An unknown key is rejected with a structured `unknown-entry` error.
 *
 * `compileFrm` itself is untouched: its legacy whole-source behavior is
 * preserved exactly.
 */
function selectionFailure(
  code: FrmSelectionErrorCode,
  message: string,
  entryKeys: string[],
): EntryCompileResult {
  return {
    success: false,
    errors: [message],
    warnings: [],
    lexerErrors: [],
    parseErrors: [],
    selectionError: { code, message, entryKeys },
  };
}

/**
 * Compile the entry matching an exact scanner-produced source range (spec
 * §2's range-based selection path). The range must equal one scanned
 * entry's full range — arbitrary slices are rejected so callers cannot
 * bypass the authoritative entry contract.
 */
export function compileFrmRange(source: string, range: FrmSourceRange, id?: string): EntryCompileResult {
  const scan = scanFrmEntries(source);
  const entry = scan.entries.find(
    (e) => e.range.startOffset === range.startOffset && e.range.endOffset === range.endOffset,
  );
  if (!entry) {
    const entryKeys = scan.entries.map((e) => e.key);
    return selectionFailure(
      'unknown-range',
      `No formula entry spans exactly [${range.startOffset}, ${range.endOffset}); ` +
        'ranges must come from scanFrmEntries output',
      entryKeys,
    );
  }
  return compileSelectedEntry(source, scan, entry, id);
}

function compileSelectedEntry(
  source: string,
  scan: ReturnType<typeof scanFrmEntries>,
  entry: FrmEntry,
  id?: string,
): EntryCompileResult {
  // Blocking diagnostics (trailing tokens, duplicate names, broken
  // boundaries) must reject compilation consistently across consumers —
  // slicing the entry out must not let invalid sources silently compile.
  const blocking = scan.diagnostics.filter((d) => FRM_BLOCKING_DIAGNOSTICS.has(d.code));
  if (blocking.length > 0) {
    const codes = blocking.map((d) => d.code).join(', ');
    return selectionFailure(
      'invalid-source',
      `Source has blocking diagnostics (${codes}); resolve them before compiling an entry`,
      scan.entries.map((e) => e.key),
    );
  }
  const entrySource = source.slice(entry.range.startOffset, entry.range.endOffset);
  const result = compileFrmDetailed(entrySource, id);
  return { ...result, entry };
}

export function compileFrmEntry(source: string, entryKey?: string, id?: string): EntryCompileResult {
  const scan = scanFrmEntries(source);
  const entry = selectFrmEntry(scan, entryKey);

  if (!entry) {
    const entryKeys = scan.entries.map((e) => e.key);
    let code: FrmSelectionErrorCode;
    let message: string;
    if (scan.entries.length === 0) {
      code = 'no-entries';
      message = 'Source contains no formula entries';
    } else if (!entryKey) {
      code = 'selection-required';
      message =
        `Source contains ${scan.entries.length} formula entries; ` +
        `select one explicitly (entry keys: ${entryKeys.join(', ')})`;
    } else {
      code = 'unknown-entry';
      message = `No formula entry with key "${entryKey}" (available keys: ${entryKeys.join(', ')})`;
    }
    return selectionFailure(code, message, entryKeys);
  }

  return compileSelectedEntry(source, scan, entry, id);
}
