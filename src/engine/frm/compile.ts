/**
 * FRM Parser - Compiler Entry Point
 * M4.2 Phase 2.1 + M4.4 Enhanced Error Reporting
 * 
 * Full compilation pipeline: source -> AST -> GLSL with source map support
 */

import type { CanonicalFormula, FormulaDialect, FrmAST } from './ast';
import { createCanonicalFormula } from './ast';
import type { FormulaPlugin } from '../plugins/types';
import { tokenize, formatLexerErrors, type LexerError } from './lexer';
import { parse, formatParseErrors, type ParseError } from './parser';
import { validate } from './validator';
import { generateC2ThresholdGLSL, generateGLSL } from './codegen';
import {
  evaluateC2Threshold,
  extractBailoutDescriptor,
  type BailoutDescriptor,
  type BailoutRejectReason,
} from './bailout-descriptor';
import { PARAMETER_NAMES } from './builtins';
import { FRMSourceMap } from './sourcemap';
import { frmParserCache } from './cache';
import { scanFrmEntries, selectFrmEntry, FRM_BLOCKING_DIAGNOSTICS, type FrmEntry, type FrmScanResult, type FrmSourceRange } from './scanner';
import { lowerClassicEntryToNative, type LoweringNote } from './classic-frontend';
import { DEFAULT_FRM_SEMANTICS_VERSION, type FrmSemanticsVersion } from './semantics-version';

export interface CompileResult {
  success: boolean;
  plugin?: FormulaPlugin;
  errors: string[];
  warnings: string[];
  ast?: FrmAST;
  canonicalFormula?: CanonicalFormula;
  glsl?: string;
  sourceMap?: FRMSourceMap;
  /** Compile-semantics contract of the source (spec §3); mechanism-layer metadata, read back as-is. */
  frmSemanticsVersion: FrmSemanticsVersion;
  /**
   * Strict-v2 bounded bailout descriptor (spec §4). Present only when the
   * source was compiled under semanticsVersion 2 and the bailout predicate
   * matched the bounded C1/C2/C4-R contract. The numeric `plugin.bailout`
   * field keeps the legacy v1 channel semantics unchanged; renderer-pipeline
   * v2 consumes this descriptor instead (renderer wiring lands in the
   * coloring-pipeline slice).
   */
  bailoutDescriptor?: BailoutDescriptor;
}

/**
 * Compile FRM source code to a FormulaPlugin
 * Results are cached for unchanged sources
 */
export function compileFrm(
  source: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
  options?: { dialect?: FormulaDialect },
): CompileResult {
  const dialect: FormulaDialect = options?.dialect ?? 'myfrac-native';
  // The version and dialect are part of the cache key: a v2 request must
  // never reuse a cached v1 result, and a classic-dialect compile (which
  // may carry after-step timing under v2) must never reuse a native one.
  const cacheKey = `${semanticsVersion}\u0000${dialect}\u0000${source}`;
  // Check cache first
  const cached = frmParserCache.get(cacheKey);
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
  const result = compileFrmUncached(source, id, semanticsVersion, { dialect });
  
  // Cache successful results
  if (result.success) {
    frmParserCache.set(cacheKey, result);
  }
  
  return result;
}

function compileFrmUncached(
  source: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
  options?: { dialect?: FormulaDialect },
): CompileResult {
  const dialect: FormulaDialect = options?.dialect ?? 'myfrac-native';
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
      return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
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
      return { success: false, errors, warnings, ast, frmSemanticsVersion: semanticsVersion };
    }

    const canonicalFormula = createCanonicalFormula(ast, source);

    // Strict v2: bounded bailout descriptor extraction (spec §4). Unknown
    // or out-of-contract predicates fail with a stable reason — the v2
    // pipeline never falls back to a default radius. The v1 heuristic
    // (extractBailoutValue in codegen) is untouched and still drives the
    // numeric plugin.bailout field for both versions.
    let bailoutDescriptor: BailoutDescriptor | undefined;
    if (semanticsVersion === 2) {
      const declaredParams = new Set<string>(ast.params.map((p) => p.name));
      for (const pn of PARAMETER_NAMES) declaredParams.add(pn);
      const extraction = extractBailoutDescriptor(ast.bailoutExpr, declaredParams);
      if (!extraction.ok) {
        const reasonMessages: Record<BailoutRejectReason, string> = {
          'unknown-magnitude-form':
            'bailout magnitude must be |z|, |real(z)|, or real(z) under strict v2 semantics',
          'threshold-not-loop-invariant':
            'bailout threshold must be loop-invariant (numbers, declared parameters, and pure arithmetic only — no orbit state) under strict v2 semantics',
          'unknown-predicate':
            'bailout predicate is outside the bounded C1/C2/C4-R contract under strict v2 semantics',
          'chained-logical':
            'bailout predicates combined with && or || are not part of the strict v2 contract yet',
        };
        errors.push(
          `Line ${ast.bailoutExpr.loc.line}, column ${ast.bailoutExpr.loc.col}: ${reasonMessages[extraction.reason]} [${extraction.reason}]`,
        );
        return { success: false, errors, warnings, ast, frmSemanticsVersion: semanticsVersion };
      }
      bailoutDescriptor = extraction.descriptor;
    }

    // Step 4: Generate GLSL with source map
    const sourceMap = new FRMSourceMap();
    const { glsl, initGlsl, uniforms, bailout } = generateGLSL(ast, sourceMap);

    // C2 interim rendering: a parameterized radial descriptor evaluates
    // its threshold against declared parameter defaults so the legacy
    // numeric channel carries a correct default zz threshold (magnitude²)
    // instead of the v1 4.0 fallback. Parameter changes still need the
    // GLSL-inlining slice; an unevaluable expression keeps the v1 value.
    let effectiveBailout = bailout;
    if (bailoutDescriptor?.kind === 'C2') {
      const defaults = new Map<string, number>();
      for (const p of ast.params) {
        if (typeof p.default === 'number') defaults.set(p.name, p.default);
      }
      for (const pn of PARAMETER_NAMES) {
        if (!defaults.has(pn)) defaults.set(pn, 0);
      }
      const evaluated = evaluateC2Threshold(bailoutDescriptor, defaults);
      if (evaluated !== null) {
        effectiveBailout = evaluated ** 2;
      }
    }

    // C2 GLSL inlining: serialize the verified threshold AST through the
    // compiler's own expression pipeline. Parameters map to u_p* uniforms —
    // parameter edits update the uniform only, never recompile.
    let c2ThresholdGlsl: string | undefined;
    if (bailoutDescriptor?.kind === 'C2') {
      c2ThresholdGlsl = generateC2ThresholdGLSL(bailoutDescriptor, ast);
      // Parameters are complex (vec2) uniforms whose imaginary components
      // feed the expression's real result too (complexMul ac-bd), but the
      // escape test keeps only the threshold's FINAL real part (.x
      // coercion). Say so instead of staying quiet — and without claiming
      // each parameter's imaginary part is dropped, which is wrong.
      if (bailoutDescriptor.params.length > 0) {
        warnings.push(
          `C2 bailout threshold coerces to real (.x): the escape test uses only the real part of ` +
            `the threshold expression; its final imaginary component (computed over parameter(s) ` +
            `${bailoutDescriptor.params.join(', ')}) is discarded.`,
        );
      }
    }

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
      bailout: effectiveBailout,
      ...(bailoutDescriptor ? { bailoutDescriptor } : {}),
      // Classic dialect + strict v2 → after-step bailout timing (Fractint
      // evaluates the predicate after each loop step; the native dialect
      // keeps pre-step). v1 never sets this — legacy timing is frozen.
      ...(dialect === 'fractint-compat' && semanticsVersion === 2
        ? { afterStepTiming: true }
        : {}),
      ...(c2ThresholdGlsl ? { c2ThresholdGlsl } : {}),
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
      frmSemanticsVersion: semanticsVersion,
      ...(bailoutDescriptor ? { bailoutDescriptor } : {}),
    };

  } catch (e) {
    errors.push(`Compile error: ${e instanceof Error ? e.message : String(e)}`);
    return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
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
export function compileFrmDetailed(
  source: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
  options?: { dialect?: FormulaDialect },
): DetailedCompileResult {
  const dialect: FormulaDialect = options?.dialect ?? 'myfrac-native';
  // Run tokenize + parse once to collect structured errors
  const { tokens, errors: lexerErrors } = tokenize(source);
  const { errors: parseErrors } = parse(tokens);

  // Get the full compile result (may use cache)
  const result = compileFrm(source, id, semanticsVersion, { dialect });

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
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
): EntryCompileResult {
  return {
    success: false,
    errors: [message],
    warnings: [],
    lexerErrors: [],
    parseErrors: [],
    selectionError: { code, message, entryKeys },
    frmSemanticsVersion: semanticsVersion,
  };
}

/**
 * Compile the entry matching an exact scanner-produced source range (spec
 * §2's range-based selection path). The range must equal one scanned
 * entry's full range — arbitrary slices are rejected so callers cannot
 * bypass the authoritative entry contract.
 */
export function compileFrmRange(
  source: string,
  range: FrmSourceRange,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
): EntryCompileResult {
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
      semanticsVersion,
    );
  }
  return compileSelectedEntry(source, scan, entry, id, semanticsVersion);
}

function compileSelectedEntry(
  source: string,
  scan: FrmScanResult,
  entry: FrmEntry,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
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
      semanticsVersion,
    );
  }
  const entrySource = source.slice(entry.range.startOffset, entry.range.endOffset);
  const result = compileFrmDetailed(entrySource, id, semanticsVersion);
  return { ...result, entry };
}

/** Classic-path compile result: adds lowering provenance to the compile result. */
export interface ClassicEntryCompileResult extends EntryCompileResult {
  /** The lowered native source that was actually compiled. */
  loweredNative?: string;
  /** `lineMap[nativeLine - 1]` = 1-based classic source line. */
  loweringLineMap?: number[];
  /** Adaptations applied by the classic frontend. */
  loweringNotes?: LoweringNote[];
}

/**
 * Compile one entry of a CLASSIC FRM source: scan, select (same rejection
 * semantics as `compileFrmEntry`), lower the entry to native syntax, then
 * run the untouched `compileFrmDetailed` pipeline. Native sources must use
 * `compileFrmEntry`/`compileFrm` instead — this path exists only for
 * classic body syntax (docs/specs/frm-compatibility-v1.md §1-§2).
 */
export function compileClassicFrmEntry(
  source: string,
  entryKey?: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
): ClassicEntryCompileResult {
  const scan = scanFrmEntries(source);
  const entry = selectFrmEntry(scan, entryKey);
  if (!entry) {
    const entryKeys = scan.entries.map((e) => e.key);
    if (scan.entries.length === 0) {
      return selectionFailure('no-entries', 'Source contains no formula entries', entryKeys, semanticsVersion);
    }
    if (!entryKey) {
      return selectionFailure(
        'selection-required',
        `Source contains ${scan.entries.length} formula entries; ` +
          `select one explicitly (entry keys: ${entryKeys.join(', ')})`,
        entryKeys,
        semanticsVersion,
      );
    }
    return selectionFailure(
      'unknown-entry',
      `No formula entry with key "${entryKey}" (available keys: ${entryKeys.join(', ')})`,
      entryKeys,
      semanticsVersion,
    );
  }

  const blocking = scan.diagnostics.filter((d) => FRM_BLOCKING_DIAGNOSTICS.has(d.code));
  if (blocking.length > 0) {
    const codes = blocking.map((d) => d.code).join(', ');
    return selectionFailure(
      'invalid-source',
      `Source has blocking diagnostics (${codes}); resolve them before compiling an entry`,
      scan.entries.map((e) => e.key),
      semanticsVersion,
    );
  }

  const entrySource = source.slice(entry.range.startOffset, entry.range.endOffset);
  const lowered = lowerClassicEntryToNative(entrySource);
  const result = compileFrmDetailed(lowered.native, id, semanticsVersion, {
    dialect: 'fractint-compat',
  });
  return {
    ...result,
    entry,
    loweredNative: lowered.native,
    loweringLineMap: lowered.lineMap,
    loweringNotes: lowered.notes,
  };
}

export function compileFrmEntry(
  source: string,
  entryKey?: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
): EntryCompileResult {
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
    return selectionFailure(code, message, entryKeys, semanticsVersion);
  }

  return compileSelectedEntry(source, scan, entry, id, semanticsVersion);
}
