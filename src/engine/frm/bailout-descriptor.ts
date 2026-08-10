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
   * The verified loop-invariant threshold AST subtree. Consumers must
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

export type BailoutDescriptor = BailoutDescriptorC1 | BailoutDescriptorC2 | BailoutDescriptorC4R;

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

type MagnitudeForm = { magnitude: 'z' } | { c4r: 'abs-real' | 'real' };

/** Classify the magnitude side: `|z|`, `|real(z)|`, or `real(z)`. */
function classifyMagnitude(node: ASTNode): MagnitudeForm | null {
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
const PURE_THRESHOLD_FUNCTIONS = new Set(['sqrt', 'abs', 'sqr', 'exp', 'log', 'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh']);
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '^']);

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
      if (!ARITHMETIC_OPS.has(node.op)) return { invariant: false, params: [] };
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
export function extractBailoutDescriptor(
  node: ASTNode,
  declaredParams: Set<string>,
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

  const leftForm = classifyMagnitude(node.left);
  const rightForm = classifyMagnitude(node.right);

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
