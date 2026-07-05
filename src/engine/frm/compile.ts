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
      supportsPower: false,
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
