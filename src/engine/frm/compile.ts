/**
 * FRM Parser - Compiler Entry Point
 * M4.2 Phase 2.1 + M4.4 Enhanced Error Reporting
 * 
 * Full compilation pipeline: source -> AST -> GLSL with source map support
 */

import type { ASTNode, CanonicalFormula, FormulaDialect, FrmAST } from './ast';
import { createCanonicalFormula } from './ast';
import { sequenceAssignmentExpressions } from './assign-expr';
import type { FormulaPlugin } from '../plugins/types';
import { tokenize, formatLexerErrors, type LexerError } from './lexer';
import { parse, formatParseErrors, type ParseError } from './parser';
import { validate } from './validator';
import { generateC2ThresholdGLSL, generateGLSL } from './codegen';
import { resolveSmoothCapability } from './smooth-capability';
import {
  extractBailoutDescriptor,
  type BailoutDescriptor,
  type BailoutRejectReason,
} from './bailout-descriptor';
import { PARAMETER_NAMES, FN_SLOT_OPTIONS } from './builtins';
import { FRMSourceMap } from './sourcemap';
import { frmParserCache } from './cache';
import { scanFrmEntries, selectFrmEntry, FRM_BLOCKING_DIAGNOSTICS, type FrmEntry, type FrmScanDiagnostic, type FrmScanResult, type FrmSourceRange } from './scanner';
import {
  lowerClassicEntryToNative,
  type ClassicSourceLocation,
  type LoweringNote,
} from './classic-frontend';
import {
  remapFormattedFrmDiagnostic,
  type FrmDiagnosticLocation,
} from './diagnostic-format';

/** fn-slot option key (`sqr`) → uniform value, for fnDefaults consumption. */
const FN_SLOT_KEY_TO_VALUE = new Map(FN_SLOT_OPTIONS.map((o) => [o.key, o.value]));
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
 * Return only aliases that are demonstrably refreshed from the completed
 * orbit on every body run. This deliberately recognizes the four corpus
 * rows' narrow shape and does not turn general mutable variables into
 * magnitude forms.
 */
/** Last statement is exactly `x = |z|` → returns x, else null. */
const finalZMagTarget = (stmt: ASTNode | undefined): string | null =>
  stmt?.type === 'assignment' &&
  !stmt.component &&
  stmt.value.type === 'magnitude' &&
  stmt.value.operand.type === 'ident' &&
  stmt.value.operand.name === 'z'
    ? stmt.target
    : null;

function collectFinalMagnitudeAliases(loopBlock: readonly ASTNode[]): Set<string> {
  const final = loopBlock[loopBlock.length - 1];
  const direct = finalZMagTarget(final);
  if (direct) return new Set([direct]);
  // Branch-uniform refresh (inandout02 evidence): the final top-level loop
  // statement is an if/else whose EVERY branch ends with the same
  // `x = |z|`, so x still holds the completed round's magnitude no matter
  // which branch ran. else-if chains are covered; a missing else is not
  // (the stale value would leak through).
  if (final?.type === 'if' && final.else) {
    const bodies: Array<readonly ASTNode[]> = [
      final.then,
      ...(final.elseIf ?? []).map((b) => b.body),
      final.else,
    ];
    const targets = bodies.map((b) => finalZMagTarget(b[b.length - 1]));
    if (targets[0] && targets.every((t) => t === targets[0])) {
      return new Set([targets[0]]);
    }
  }
  return new Set();
}

/**
 * Compile FRM source code to a FormulaPlugin
 * Results are cached for unchanged sources
 */
export function compileFrm(
  source: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
  options?: { dialect?: FormulaDialect; classicSeedTarget?: string },
): CompileResult {
  const dialect: FormulaDialect = options?.dialect ?? 'myfrac-native';
  // The version and dialect are part of the cache key: a v2 request must
  // never reuse a cached v1 result, and a classic-dialect compile (which
  // may carry after-step timing under v2) must never reuse a native one.
  // The classic seed marker also keys the cache: the same source text
  // compiles differently with and without the provenance marker.
  const cacheKey = `${semanticsVersion}\u0000${dialect}\u0000${options?.classicSeedTarget ?? ''}\u0000${source}`;
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
  const result = compileFrmUncached(source, id, semanticsVersion, {
    dialect,
    ...(options?.classicSeedTarget !== undefined
      ? { classicSeedTarget: options.classicSeedTarget }
      : {}),
  });
  
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
  options?: { dialect?: FormulaDialect; classicSeedTarget?: string },
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
      // Severity discipline (mirrors the validator): severity 'error' is
      // fatal — a malformed token must never compile into a shader that
      // silently dropped the malformed part. Warnings ride along.
      if (lexerErrors.some((e) => e.severity === 'error')) {
        return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
      }
    }

    // Step 2: Parse
    const { ast: parsedAst, errors: parseErrors } = parse(tokens);

    if (parseErrors.length > 0) {
      const formattedParseErrors = formatParseErrors(parseErrors);
      errors.push(...formattedParseErrors);
      // Severity discipline (mirrors the lexer gate): severity 'error' is
      // fatal. Error recovery may still produce a partial AST, but a
      // shader built from recovered fragments is a silent semantics lie —
      // 6b2 found exactly that (assignment expressions shredded into
      // no-op fragments while `success` stayed true).
      if (parseErrors.some((e) => e.severity === 'error')) {
        return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
      }
    }

    if (!parsedAst) {
      return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
    }

    // Step 2.5: sequence assignment expressions (Slice 6b2) — lift nested
    // `ident = expr` writes into explicit left-to-right statements with
    // frmseq<N> temps, so GLSL's unspecified operand order cannot make CPU
    // and GPU disagree. Fail-closed on &&/||-RHS, elseif-condition,
    // component-lvalue, and bailout-predicate assignments.
    const sequenced = sequenceAssignmentExpressions(parsedAst);
    if (sequenced.errors.length > 0) {
      for (const issue of sequenced.errors) {
        errors.push(`Line ${issue.line}, column ${issue.col}: ${issue.message}`);
      }
      return { success: false, errors, warnings, frmSemanticsVersion: semanticsVersion };
    }
    const ast: FrmAST = {
      ...parsedAst,
      initBlock: sequenced.initBlock,
      loopBlock: sequenced.loopBlock,
    };

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
      // Init-bound named constants (`t = p1 + 4` in init, `|z| <= t` in the
      // bailout) are eligible for threshold substitution when assigned
      // exactly once at the top level of init and never inside the loop —
      // a classic idiom for parameterized radii (Jm_* family evidence).
      const initBindings = new Map<string, ASTNode>();
      const multiplyAssigned = new Set<string>();
      // Remaining assignment counts per target, for seed detection.
      const remaining = new Map<string, number>();
      for (const stmt of ast.initBlock) {
        if (stmt.type !== 'assignment') continue;
        if (stmt.component) continue; // lane stores are not whole-var assignments
        remaining.set(stmt.target, (remaining.get(stmt.target) ?? 0) + 1);
      }
      for (const stmt of ast.initBlock) {
        if (stmt.type !== 'assignment') continue;
        // A component store (`real(x) = e`) writes one lane only — it is
        // never a whole-variable binding (Codex 6b3 round-1).
        if (stmt.component) continue;
        remaining.set(stmt.target, (remaining.get(stmt.target) ?? 1) - 1);
        // Seed-transparency, provenance-gated: the classic c-rebinding
        // lowering marks its generated seed target via
        // options.classicSeedTarget — ONLY that exact variable with a
        // seed-shaped RHS (exactly `c` or `pixel`), assigned again later,
        // is transparent. User code can never claim the marker: a
        // hand-written `cclassic = pixel; cclassic = p1` keeps the strict
        // exactly-once treatment (Codex round-3 reproduction).
        if (
          options?.classicSeedTarget !== undefined &&
          stmt.target === options.classicSeedTarget &&
          stmt.value.type === 'ident' &&
          (stmt.value.name === 'c' || stmt.value.name === 'pixel') &&
          (remaining.get(stmt.target) ?? 0) > 0 &&
          !initBindings.has(stmt.target) &&
          !multiplyAssigned.has(stmt.target)
        ) {
          continue;
        }
        // Exactly-once only: a second assignment permanently bans the name
        // (sequential init semantics make later bindings order-dependent).
        if (multiplyAssigned.has(stmt.target)) continue;
        if (initBindings.has(stmt.target)) {
          initBindings.delete(stmt.target);
          multiplyAssigned.add(stmt.target);
        } else {
          initBindings.set(stmt.target, stmt.value);
        }
      }
      // Init if/else single-target bindings (T2 `test` idiom: groucho,
      // inandout01-04, larry, moe, bailout-c). When an init-level if with
      // an exhaustive else assigns the SAME target exactly once in every
      // branch (and nothing else in init assigns it), the post-init value
      // is exactly the right-folded boolean-arithmetic expression
      // `c1*A + (1-c1)*(c2*B + (1-c2)*C)` under classic 0/1 semantics.
      // The downstream invariance check still gates every node inside the
      // synthesized tree, so orbit-state references stay rejected.
      for (const stmt of ast.initBlock) {
        if (stmt.type !== 'if' || !stmt.else) continue;
        const branches: Array<{ cond: ASTNode | null; body: readonly ASTNode[] }> = [
          { cond: stmt.condition, body: stmt.then },
          ...(stmt.elseIf ?? []).map((b) => ({ cond: b.condition as ASTNode | null, body: b.body })),
          { cond: null, body: stmt.else },
        ];
        // Conservative: a nested if inside any branch makes the dataflow
        // non-trivial — skip the whole statement.
        const hasNestedIf = branches.some((b) => b.body.some((s) => s.type === 'if'));
        if (hasNestedIf) continue;
        const maps = branches.map((b) => {
          const m = new Map<string, ASTNode>();
          for (const s of b.body) {
            if (s.type !== 'assignment') return null; // side-effect statements: bail
            if (s.component) return null; // lane stores are not whole-var bindings
            if (m.has(s.target)) return null; // twice in one branch: order-dependent
            m.set(s.target, s.value);
          }
          return m;
        });
        if (maps.some((m) => m === null)) continue;
        // The right-fold `c*A + (1-c)*B` is only exact when every condition
        // is guaranteed 0/1: a comparison or logical root coerces by
        // construction. A bare param/arithmetic condition (`if(p2)`) would
        // smuggle its raw value into the arithmetic (Codex 6b3 round-1).
        const BOOLEAN_ROOT_OPS = new Set(['<', '<=', '>', '>=', '==', '!=', '&&', '||']);
        const conditionsBoolean = branches.every(
          (b) => b.cond === null || (b.cond.type === 'binary' && BOOLEAN_ROOT_OPS.has(b.cond.op)),
        );
        if (!conditionsBoolean) continue;
        const branchMaps = maps as Array<Map<string, ASTNode>>;
        const common = [...branchMaps[0].keys()].filter((t) => branchMaps.every((m) => m.has(t)));
        for (const target of common) {
          if (initBindings.has(target) || multiplyAssigned.has(target)) continue;
          // Right-fold: else value is the innermost fallback.
          let expr: ASTNode = branchMaps[branchMaps.length - 1].get(target)!;
          for (let bi = branches.length - 2; bi >= 0; bi--) {
            const cond = branches[bi].cond!;
            const value = branchMaps[bi].get(target)!;
            expr = {
              type: 'binary',
              op: '+',
              left: { type: 'binary', op: '*', left: cond, right: value, loc: cond.loc },
              right: {
                type: 'binary',
                op: '*',
                left: {
                  type: 'binary',
                  op: '-',
                  left: { type: 'number', value: 1, loc: cond.loc },
                  right: cond,
                  loc: cond.loc,
                },
                right: expr,
                loc: cond.loc,
              },
              loc: cond.loc,
            };
          }
          initBindings.set(target, expr);
        }
      }
      const loopTargets = new Set<string>();
      const collectTargets = (nodes: readonly ASTNode[]): void => {
        for (const n of nodes) {
          if (n.type === 'assignment') loopTargets.add(n.target);
          else if (n.type === 'if') {
            collectTargets(n.then);
            n.elseIf?.forEach((b) => collectTargets(b.body));
            if (n.else) collectTargets(n.else);
          }
        }
      };
      collectTargets(ast.loopBlock);
      for (const t of loopTargets) initBindings.delete(t);
      // A small corpus-proven classic idiom caches the just-computed
      // magnitude in a scalar and uses it as the final predicate:
      // `..., x = |z|, x <= p2`.  It is equivalent to a C1/C2 radial
      // predicate only when the assignment is the final top-level loop
      // statement; branches, stale values, and arbitrary aliases remain
      // outside the contract.
      const magnitudeAliases = collectFinalMagnitudeAliases(ast.loopBlock);
      const extraction = extractBailoutDescriptor(
        ast.bailoutExpr,
        declaredParams,
        initBindings,
        magnitudeAliases,
      );
      if (!extraction.ok) {
        const reasonMessages: Record<BailoutRejectReason, string> = {
          'unknown-magnitude-form':
            'bailout magnitude must be |z|/abs(z)/cabs(z), a proven final |z| alias, LastSqr, |real(z)|, or real(z) under strict v2 semantics',
          'threshold-not-loop-invariant':
            'bailout threshold must be loop-invariant (numbers, declared parameters, and pure arithmetic only — no orbit state) under strict v2 semantics',
          'unknown-predicate':
            'bailout predicate is outside the bounded C1/C2/C4-R/C5 contract under strict v2 semantics',
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

    // Step 4: Generate GLSL with source map. The numeric bailout is the
    // frozen v1 channel for every compiled semantics version; renderer
    // pipeline v2 consumes bailoutDescriptor/c2ThresholdGlsl instead.
    const sourceMap = new FRMSourceMap();
    const { glsl, initGlsl, uniforms, bailout } = generateGLSL(ast, sourceMap);

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

    // Smooth-coloring capability (spec §7): resolved from AST/dataflow plus
    // the bailout descriptor — never from family, name, or a u_power=2
    // guess. Absent without a descriptor (v1 behavior stays frozen).
    const smooth = resolveSmoothCapability(ast, bailoutDescriptor ?? undefined);

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
      frmSemanticsVersion: semanticsVersion,
      supportsPower: false, // DEPRECATED per ADR-0007: capability resolves from AST/dataflow, not this flag.
      supportsJulia: true,
      bailout,
      ...(bailoutDescriptor ? { bailoutDescriptor } : {}),
      // Classic dialect + strict v2 → after-step bailout timing (Fractint
      // evaluates the predicate after each loop step; the native dialect
      // keeps pre-step). v1 never sets this — legacy timing is frozen.
      ...(dialect === 'fractint-compat' && semanticsVersion === 2
        ? { afterStepTiming: true }
        : {}),
      ...(c2ThresholdGlsl ? { c2ThresholdGlsl } : {}),
      ...(smooth ? { smoothCapability: smooth.capability } : {}),
      ...(smooth?.power !== undefined ? { smoothPower: smooth.power } : {}),
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
  options?: { dialect?: FormulaDialect; classicSeedTarget?: string },
): DetailedCompileResult {
  const dialect: FormulaDialect = options?.dialect ?? 'myfrac-native';
  // Run tokenize + parse once to collect structured errors
  const { tokens, errors: lexerErrors } = tokenize(source);
  const { errors: parseErrors } = parse(tokens);

  // Get the full compile result (may use cache)
  const result = compileFrm(source, id, semanticsVersion, {
    dialect,
    ...(options?.classicSeedTarget !== undefined
      ? { classicSeedTarget: options.classicSeedTarget }
      : {}),
  });

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
  /** Per-generated-line anchors back to the full classic source. */
  loweringLocationMap?: Array<
    FrmDiagnosticLocation & {
      generatedCol: number;
      columnMap: FrmDiagnosticLocation[];
    }
  >;
  /** Adaptations applied by the classic frontend. */
  loweringNotes?: LoweringNote[];
  /**
   * Non-blocking scan findings (prose paragraphs, duplicate names) from the
   * source scan. Annotated must never mean invisible — consumers surface
   * these so a malformed intended entry cannot vanish silently.
   */
  scanAnnotations?: FrmScanDiagnostic[];
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
    ...(lowered.cSeedTarget !== undefined
      ? { classicSeedTarget: lowered.cSeedTarget }
      : {}),
  });
  const prefix = source.slice(0, entry.range.startOffset);
  const entryStartLine = prefix.split('\n').length;
  const lastNewline = prefix.lastIndexOf('\n');
  const entryStartCol = entry.range.startOffset - lastNewline;
  const toFullSourceLocation = (
    location: ClassicSourceLocation,
  ): FrmDiagnosticLocation => ({
    line: entryStartLine + location.line - 1,
    col:
      location.line === 1
        ? entryStartCol + location.col - 1
        : location.col,
  });
  const loweringLocationMap = lowered.locationMap.map((location) => ({
    ...toFullSourceLocation(location),
    generatedCol: location.generatedCol,
    columnMap: location.columnMap.map(toFullSourceLocation),
  }));
  const loweringNotes = lowered.notes.map((note) => ({
    ...note,
    line: entryStartLine + note.line - 1,
  }));
  const mapLocation = (line: number, col: number): FrmDiagnosticLocation => {
    const anchor = loweringLocationMap[line - 1];
    if (!anchor) return { line, col };
    const mapped = anchor.columnMap[col - 1];
    if (mapped) return mapped;
    const last = anchor.columnMap.at(-1);
    if (last) {
      return {
        line: last.line,
        col: last.col + Math.max(0, col - anchor.columnMap.length),
      };
    }
    return {
      line: anchor.line,
      col: Math.max(1, anchor.col + Math.max(0, col - anchor.generatedCol)),
    };
  };
  const errors = result.errors.map((message) =>
    remapFormattedFrmDiagnostic(message, mapLocation),
  );
  const warnings = result.warnings.map((message) =>
    remapFormattedFrmDiagnostic(message, mapLocation),
  );
  const lexerErrors = result.lexerErrors.map((issue) => ({
    ...issue,
    ...mapLocation(issue.line, issue.col),
  }));
  const parseErrors = result.parseErrors.map((issue) => ({
    ...issue,
    ...mapLocation(issue.line, issue.col),
  }));
  // fnDefaults consumption (spec §2): known names become the u_fnN uniform
  // descriptor DEFAULTS, so every consumer (renderer default resolution,
  // future descriptor-driven UIs) executes the bracket-specified functions
  // unless the caller overrides them. Unknown names stay raw in
  // plugin.fnDefaults only — their slots keep the engine default.
  const plugin =
    result.plugin && lowered.fnDefaults
      ? {
          ...result.plugin,
          fnDefaults: lowered.fnDefaults,
          uniforms: result.plugin.uniforms.map((u) => {
            const m = /^u_(fn[1-4])$/.exec(u.name);
            const key = m ? lowered.fnDefaults?.[m[1]] : undefined;
            const value = key ? FN_SLOT_KEY_TO_VALUE.get(key) : undefined;
            return value !== undefined ? { ...u, default: value } : u;
          }),
        }
      : result.plugin;
  // Non-blocking scan findings (prose paragraphs, duplicate names) ride
  // along so consumers surface them — annotated must never mean invisible.
  const scanAnnotations = scan.diagnostics.filter((d) => !FRM_BLOCKING_DIAGNOSTICS.has(d.code));
  return {
    ...result,
    errors,
    warnings,
    lexerErrors,
    parseErrors,
    ...(plugin !== result.plugin ? { plugin } : {}),
    entry,
    loweredNative: lowered.native,
    loweringLineMap: loweringLocationMap.map((location) => location.line),
    loweringLocationMap,
    loweringNotes,
    ...(scanAnnotations.length > 0 ? { scanAnnotations } : {}),
  };
}

/**
 * Compile a single source file supplied through an authoring/import surface.
 * Classic Fractint entries use a bare `:` to move from their init statements
 * into the loop; native MyFrac entries use named `init:`, `loop:`, and
 * `bailout:` sections.  Keep this routing at the import boundary so the
 * lower-level `compileFrm` API remains the explicit native compiler.
 */
export function compileImportedFrm(
  source: string,
  id?: string,
  semanticsVersion: FrmSemanticsVersion = DEFAULT_FRM_SEMANTICS_VERSION,
): CompileResult {
  return isClassicFrmSource(source)
    ? compileClassicFrmEntry(source, undefined, id, semanticsVersion)
    : compileFrm(source, id, semanticsVersion);
}

/**
 * Authoritative import-boundary dialect discriminator. Compiler routing,
 * compatibility status, and Editor gating must share this exact predicate so
 * native section syntax is never fed to the classic lowerer.
 */
export function isClassicFrmSource(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    const statement = line.split(';', 1)[0];
    // A classic init/loop transition is a bare `:` after an expression —
    // it may sit MID-LINE (`z = pixel: z = sqr(z) + c`), so strip the
    // three native section labels and look for any surviving colon.
    const stripped = statement.replace(/\b(init|loop|bailout)\s*:/gi, '');
    return stripped.includes(':');
  });
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
