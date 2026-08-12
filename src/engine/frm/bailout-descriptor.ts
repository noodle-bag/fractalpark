/**
 * Bounded bailout descriptors (v0.4.18 Slice 3; docs/specs/
 * frm-compatibility-v1.md §4).
 *
 * Legacy v1 (`extractBailoutValue` in codegen.ts) is a heuristic: it only
 * understands `<`/`<=`, reads a left-side numeric literal as the threshold
 * while discarding the comparison direction, and silently falls back to
 * `4.0` for anything unrecognized — frozen defects, preserved for legacy
 * content. Strict v2 replaces the heuristic with a bounded, enumerable
 * contract:
 *
 * - **C1 fixed radial**: `|z| <op> R` with a numeric-literal threshold.
 * - **C2 parameterized radial**: `|z| <op> expr` where `expr` is
 *   loop-invariant (numbers, declared parameters, pure arithmetic over
 *   them, and whitelisted pure functions).
 * - **C4-R real projection**: `|real(z)| <op> R` (`abs-real`) or
 *   `real(z) <op> R` (`real`), numeric-literal threshold.
 * - **C5 LastSqr**: `LastSqr <op> R`, where the builtin is the post-step
 *   `|z|²`, so its threshold is deliberately raw.
 *
 * Comparison direction (`<`, `<=`, `>`, `>=`) is preserved exactly; swapped
 * operands are normalized by flipping the operator (`4 < |z|` ≡ `|z| > 4`)
 * so the meaning never changes. Anything outside the bounded forms is
 * rejected with a stable reason — v2 never falls back to 4.0.
 */

import type { ASTNode } from './ast';

export type ComparisonOp = '<' | '<=' | '>' | '>=';

export interface BailoutDescriptorC1 {
  kind: 'C1';
  op: ComparisonOp;
  magnitude: 'z';
  threshold: number;
}

export interface BailoutDescriptorC2 {
  kind: 'C2';
  op: ComparisonOp;
  magnitude: 'z';
  /**
   * The verified loop-invariant threshold AST subtree. When the source
   * used an init-bound named constant (`t = p1 + 4` → `|z| <= t`), this is
   * the SUBSTITUTED pure subtree (init RHS inlined). Consumers must
   * evaluate this through the same expression code path as the compiler
   * (codegen generateExpression) — a re-serialized string could diverge
   * from the compiled dialect (`^` is not exponentiation in GLSL).
   */
  thresholdNode: ASTNode;
  /** Declared parameter names referenced by the expression, sorted. */
  params: string[];
}

export interface BailoutDescriptorC4R {
  kind: 'C4R';
  form: 'abs-real' | 'real';
  op: ComparisonOp;
  threshold: number;
}

/** A raw, already-squared post-step magnitude supplied by LastSqr. */
export interface BailoutDescriptorC5 {
  kind: 'C5';
  magnitude: 'last-sqr';
  op: ComparisonOp;
  threshold: number;
}

export type BailoutDescriptor = BailoutDescriptorC1 | BailoutDescriptorC2 | BailoutDescriptorC4R | BailoutDescriptorC5;

export type BailoutRejectReason =
  /** Magnitude side is not `|z|`, `|real(z)|`, or `real(z)`. */
  | 'unknown-magnitude-form'
  /** Threshold references orbit state (z/c/pixel/iter…) or undeclared names. */
  | 'threshold-not-loop-invariant'
  /** Predicate is not a supported comparison shape at all. */
  | 'unknown-predicate'
  /** `&&`/`||` combined predicates are not yet part of the v2 contract. */
  | 'chained-logical';

export type BailoutExtraction =
  | { ok: true; descriptor: BailoutDescriptor }
  | { ok: false; reason: BailoutRejectReason };

const COMPARISON_OPS = new Set(['<', '<=', '>', '>=']);
const LOGICAL_OPS = new Set(['&&', '||']);

/** Flip an operator for operand swapping; meaning must survive exactly. */
function flipOp(op: ComparisonOp): ComparisonOp {
  switch (op) {
    case '<': return '>';
    case '<=': return '>=';
    case '>': return '<';
    case '>=': return '<=';
  }
}

function isIdent(node: ASTNode, name: string): boolean {
  return node.type === 'ident' && node.name === name;
}

type MagnitudeForm = { magnitude: 'z' } | { c4r: 'abs-real' | 'real' } | { lastSqr: true };

/** Classify the magnitude side: radial forms, projections, or LastSqr. */
function classifyMagnitude(node: ASTNode, magnitudeAliases: ReadonlySet<string>): MagnitudeForm | null {
  // Corpus evidence: classic `abs(z)` and `cabs(z)` in a bailout are both
  // true-modulus spellings. Normalize them to C1 so renderer and CPU follow
  // the exact same threshold-squaring path as bars magnitude.
  if (
    node.type === 'call' &&
    (node.name === 'abs' || node.name === 'cabs') &&
    node.args.length === 1 &&
    isIdent(node.args[0], 'z')
  ) return { magnitude: 'z' };
  if (node.type === 'ident' && node.name === 'LastSqr') return { lastSqr: true };
  if (node.type === 'ident' && magnitudeAliases.has(node.name)) return { magnitude: 'z' };
  if (node.type === 'magnitude') {
    const inner = node.operand;
    if (isIdent(inner, 'z')) return { magnitude: 'z' };
    if (inner.type === 'call' && inner.name === 'real' && inner.args.length === 1 && isIdent(inner.args[0], 'z')) {
      return { c4r: 'abs-real' };
    }
    return null;
  }
  if (node.type === 'call' && node.name === 'real' && node.args.length === 1 && isIdent(node.args[0], 'z')) {
    return { c4r: 'real' };
  }
  return null;
}

/** Evaluate a numeric literal, accepting unary minus (`-1` parses as unary). */
function evalNumericLiteral(node: ASTNode): number | null {
  if (node.type === 'number') return node.value;
  if (node.type === 'unary' && node.op === '-' && node.operand.type === 'number') {
    return -node.operand.value;
  }
  return null;
}

/** Pure functions allowed inside a C2 threshold expression. */
const PURE_THRESHOLD_FUNCTIONS = new Set(['sqrt', 'abs', 'sqr', 'exp', 'log', 'sin', 'cos', 'cosxx', 'cotanh', 'tan', 'sinh', 'cosh', 'tanh', 'real']);
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '^']);
/** Boolean-arithmetic ops over invariant operands are themselves invariant
 * (classic 0/1 semantics; T2 `test=(4*(p2<=0))+...` idiom). `imag` stays
 * out: the scalar evaluators track real defaults only. */
const INVARIANT_BOOL_OPS = new Set(['<', '<=', '>', '>=', '==', '!=', '&&', '||']);

/**
 * Substitute init-bound identifiers with structural copies of their init
 * RHS (fresh node objects; `loc` references are shared — consumers treat
 * nodes as read-only). `initBindings` is pre-filtered by the caller to
 * variables assigned exactly once in init and never in the loop, so the
 * substitution is semantics-preserving and the result is a self-contained
 * pure subtree (no variable scoping questions for numeric eval or GLSL
 * emission). Cycles (`t = t + 1`) resolve to the identifier left in place,
 * which the invariance check then rejects.
 */
function substituteInitIdents(
  node: ASTNode,
  bindings: ReadonlyMap<string, ASTNode>,
  active: ReadonlySet<string> = new Set(),
): ASTNode {
  switch (node.type) {
    case 'ident': {
      const bound = bindings.get(node.name);
      if (!bound || active.has(node.name)) return { ...node };
      const next = new Set(active);
      next.add(node.name);
      return substituteInitIdents(bound, bindings, next);
    }
    case 'binary':
      return {
        ...node,
        left: substituteInitIdents(node.left, bindings, active),
        right: substituteInitIdents(node.right, bindings, active),
      };
    case 'unary':
      return { ...node, operand: substituteInitIdents(node.operand, bindings, active) };
    case 'call':
      return {
        ...node,
        args: node.args.map((a) => substituteInitIdents(a, bindings, active)),
      };
    default:
      return { ...node };
  }
}

interface InvarianceResult {
  invariant: boolean;
  params: string[];
}

/**
 * Loop-invariance check for threshold expressions: numbers, declared
 * parameters, arithmetic over them, unary minus, and whitelisted pure
 * functions. Orbit state (`z`, `c`, `pixel`, `iter`, …) and undeclared
 * identifiers are rejected.
 */
function checkLoopInvariance(node: ASTNode, declaredParams: Set<string>): InvarianceResult {
  switch (node.type) {
    case 'number':
      return { invariant: true, params: [] };
    case 'ident':
      if (declaredParams.has(node.name)) {
        return { invariant: true, params: [node.name] };
      }
      return { invariant: false, params: [] };
    case 'unary':
      if (node.op === '-') return checkLoopInvariance(node.operand, declaredParams);
      return { invariant: false, params: [] };
    case 'binary': {
      if (!ARITHMETIC_OPS.has(node.op) && !INVARIANT_BOOL_OPS.has(node.op)) {
        return { invariant: false, params: [] };
      }
      const left = checkLoopInvariance(node.left, declaredParams);
      const right = checkLoopInvariance(node.right, declaredParams);
      if (!left.invariant || !right.invariant) return { invariant: false, params: [] };
      return { invariant: true, params: [...new Set([...left.params, ...right.params])] };
    }
    case 'call': {
      if (!PURE_THRESHOLD_FUNCTIONS.has(node.name)) return { invariant: false, params: [] };
      const params: string[] = [];
      for (const arg of node.args) {
        const r = checkLoopInvariance(arg, declaredParams);
        if (!r.invariant) return { invariant: false, params: [] };
        params.push(...r.params);
      }
      return { invariant: true, params: [...new Set(params)] };
    }
    default:
      return { invariant: false, params: [] };
  }
}

/**
 * Extract a bounded bailout descriptor from a parsed bailout expression.
 * `declaredParams` are the formula's declared parameter names (p1–p5 plus
 * params-block entries). Never throws; every failure is a stable reason.
 */
/**
 * Evaluate a C2 threshold expression against concrete parameter values.
 * Returns null when a referenced parameter has no known default — the
 * caller must not guess.
 */
export function evaluateC2Threshold(
  descriptor: BailoutDescriptorC2,
  paramDefaults: ReadonlyMap<string, number>,
): number | null {
  const evaluate = (node: ASTNode): number | null => {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'ident':
        return paramDefaults.get(node.name) ?? null;
      case 'unary':
        if (node.op !== '-') return null;
        const v = evaluate(node.operand);
        return v === null ? null : -v;
      case 'binary': {
        const l = evaluate(node.left);
        const r = evaluate(node.right);
        if (l === null || r === null) return null;
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return r === 0 ? null : l / r;
          case '^': return Math.pow(l, r);
          // Classic boolean arithmetic: 0/1 values, non-short-circuit.
          case '<': return l < r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>': return l > r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          case '==': return l === r ? 1 : 0;
          case '!=': return l !== r ? 1 : 0;
          case '&&': return l !== 0 && r !== 0 ? 1 : 0;
          case '||': return l !== 0 || r !== 0 ? 1 : 0;
          default: return null;
        }
      }
      case 'call': {
        const args = node.args.map(evaluate);
        if (args.some((a) => a === null)) return null;
        const [a] = args as number[];
        switch (node.name) {
          case 'real': return a; // scalar evaluator tracks real parts only
          case 'sqrt': return a < 0 ? null : Math.sqrt(a);
          case 'abs': return Math.abs(a);
          case 'sqr': return a * a;
          case 'exp': return Math.exp(a);
          case 'log': return a <= 0 ? null : Math.log(a);
          case 'sin': return Math.sin(a);
          case 'cos': return Math.cos(a);
          case 'cosxx': return Math.cos(a); // real input: imag term vanishes
          case 'cotanh': return a === 0 ? null : 1 / Math.tanh(a);
          case 'tan': return Math.tan(a);
          case 'sinh': return Math.sinh(a);
          case 'cosh': return Math.cosh(a);
          case 'tanh': return Math.tanh(a);
          default: return null;
        }
      }
      default:
        return null;
    }
  };
  return evaluate(descriptor.thresholdNode);
}

/**
 * Extract a bounded bailout descriptor from a parsed bailout expression.
 * `declaredParams` are the formula's declared parameter names (p1–p5 plus
 * params-block entries). Never throws; every failure is a stable reason.
 */
export function extractBailoutDescriptor(
  node: ASTNode,
  declaredParams: Set<string>,
  initBindings?: ReadonlyMap<string, ASTNode>,
  /** Proven final-loop aliases assigned exactly `name = |z|`; see compile.ts. */
  magnitudeAliases: ReadonlySet<string> = new Set(),
): BailoutExtraction {
  if (node.type !== 'binary') {
    return { ok: false, reason: 'unknown-predicate' };
  }
  if (LOGICAL_OPS.has(node.op)) {
    return { ok: false, reason: 'chained-logical' };
  }
  if (!COMPARISON_OPS.has(node.op)) {
    return { ok: false, reason: 'unknown-predicate' };
  }
  const op = node.op as ComparisonOp;

  // Normalize: magnitude form must sit on one side; if the threshold side
  // holds the magnitude, swap operands and flip the operator.
  let magnitudeNode: ASTNode | null = null;
  let thresholdNode: ASTNode | null = null;
  let effectiveOp: ComparisonOp = op;

  const leftForm = classifyMagnitude(node.left, magnitudeAliases);
  const rightForm = classifyMagnitude(node.right, magnitudeAliases);

  if (leftForm && !rightForm) {
    magnitudeNode = node.left;
    thresholdNode = node.right;
  } else if (rightForm && !leftForm) {
    magnitudeNode = node.right;
    thresholdNode = node.left;
    effectiveOp = flipOp(op);
  } else if (leftForm && rightForm) {
    // |z| < |z| — degenerate self-comparison, outside the contract.
    return { ok: false, reason: 'unknown-predicate' };
  } else {
    return { ok: false, reason: 'unknown-magnitude-form' };
  }

  const form = leftForm ?? rightForm;
  if (!form || !magnitudeNode || !thresholdNode) {
    return { ok: false, reason: 'unknown-magnitude-form' };
  }

  // Init-bound identifiers (`t = p1 + 4` in init, `|z| <= t` bailout) are
  // substituted with their pure init RHS before the invariance check, so a
  // loop-invariant named constant classifies exactly like its inline form.
  if (initBindings && initBindings.size > 0) {
    thresholdNode = substituteInitIdents(thresholdNode, initBindings);
  }

  const invariance = checkLoopInvariance(thresholdNode, declaredParams);
  if (!invariance.invariant) {
    return { ok: false, reason: 'threshold-not-loop-invariant' };
  }

  const numericThreshold = evalNumericLiteral(thresholdNode);

  if ('c4r' in form) {
    // C4-R is numeric-literal only (bounded and enumerable).
    if (numericThreshold === null) {
      return { ok: false, reason: 'threshold-not-loop-invariant' };
    }
    return {
      ok: true,
      descriptor: { kind: 'C4R', form: form.c4r, op: effectiveOp, threshold: numericThreshold },
    };
  }

  if ('lastSqr' in form) {
    // LastSqr is the post-step squared magnitude, not a radius.
    // Parameterized variants are intentionally outside C5's evidence.
    if (numericThreshold === null) {
      return { ok: false, reason: 'threshold-not-loop-invariant' };
    }
    return {
      ok: true,
      descriptor: { kind: 'C5', magnitude: 'last-sqr', op: effectiveOp, threshold: numericThreshold },
    };
  }

  if (numericThreshold !== null) {
    return {
      ok: true,
      descriptor: { kind: 'C1', op: effectiveOp, magnitude: 'z', threshold: numericThreshold },
    };
  }

  return {
    ok: true,
    descriptor: {
      kind: 'C2',
      op: effectiveOp,
      magnitude: 'z',
      thresholdNode,
      params: [...invariance.params].sort(),
    },
  };
}
