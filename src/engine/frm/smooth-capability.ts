/**
 * Smooth-coloring capability (v0.4.18 commit 8d; docs/specs/
 * frm-compatibility-v1.md §7).
 *
 * Capability derives from AST/dataflow plus the bailout descriptor — never
 * from family, name, `supportsPower`, or a default `u_power=2` guess:
 *
 * - `supported`: the loop recurrence is a polynomial in the orbit variable
 *   with leading degree >= 2 and the escape is a forward radial comparison
 *   (C1/C2 `<`/`<=`) — the classic smooth iteration formula is proven.
 * - `adapted`: forward radial escape but a non-polynomial loop — the same
 *   radial-crossing formula is emitted as the explicitly labeled
 *   `radial-crossing-v1` approximation.
 * - `unavailable`: C4-R real projection (not radial by default) or an
 *   inverse-direction radial escape (inside-out) — the assembler emits
 *   SMOOTH_ESCAPE_TIME and the shader degrades to deterministic Escape
 *   Time. The requested preference is preserved upstream and restored
 *   when the capability returns.
 */

import type { ASTNode, FrmAST } from './ast';
import { isFnSlotName, isParameterName } from './builtins';
import type { BailoutDescriptor } from './bailout-descriptor';
import type { SmoothCapability } from '../plugins/types';

export interface SmoothResolution {
  capability: SmoothCapability;
  /** Leading polynomial degree; present only when capability is 'supported'. */
  power?: number;
  reason: 'polynomial' | 'non-polynomial-radial' | 'inverse-direction' | 'non-radial-projection';
}

/**
 * Degree of an expression as a polynomial in `orbitVar`, or null when the
 * expression is not a polynomial (transcendental call, fn slot, z-dependent
 * denominator or exponent, magnitude, conditional). `env` tracks the
 * polynomial degree of previously assigned loop variables; entries set to
 * null mark non-polynomial or unknown dependencies.
 */
function polynomialDegreeOf(
  node: ASTNode,
  orbitVar: string,
  env: ReadonlyMap<string, number | null>,
): number | null {
  switch (node.type) {
    case 'number':
    case 'complex':
      return 0;
    case 'ident': {
      if (node.name === orbitVar) return 1;
      // Parameters, the pixel variable and loop-invariant idents are z-free.
      if (isParameterName(node.name) || node.name === 'c' || node.name === 'pixel') return 0;
      const known = env.get(node.name);
      return known === undefined ? null : known;
    }
    case 'unary':
      return polynomialDegreeOf(node.operand, orbitVar, env);
    case 'binary': {
      const left = polynomialDegreeOf(node.left, orbitVar, env);
      const right = polynomialDegreeOf(node.right, orbitVar, env);
      switch (node.op) {
        case '+':
        case '-':
          if (left === null || right === null) return null;
          return Math.max(left, right);
        case '*':
          if (left === null || right === null) return null;
          return left + right;
        case '/':
          // Conservative: the denominator must be z-free.
          if (left === null || right !== 0) return null;
          return left;
        case '^': {
          if (left === null) return null;
          if (left === 0) return 0;
          // Exponent must be a z-free constant integer >= 0.
          if (right !== 0 || node.right.type !== 'number') return null;
          const exp = node.right.value;
          if (!Number.isInteger(exp) || exp < 0) return null;
          return left * exp;
        }
        default:
          return null;
      }
    }
    case 'call': {
      // sqr(z) is the complex square — a polynomial of doubled degree.
      if (node.name === 'sqr' && node.args.length === 1) {
        const inner = polynomialDegreeOf(node.args[0], orbitVar, env);
        return inner === null ? null : inner * 2;
      }
      // fn slots and transcendental builtins on z-dependent arguments are
      // not polynomials; z-free calls do not affect the degree.
      const argDegrees = node.args.map((arg) => polynomialDegreeOf(arg, orbitVar, env));
      if (argDegrees.every((d) => d === 0)) return 0;
      if (isFnSlotName(node.name)) return null;
      return null;
    }
    case 'magnitude':
    case 'if':
    case 'assignment':
      return null;
  }
}

/**
 * Extract the leading polynomial degree of the loop recurrence in `orbitVar`
 * (default `z`). Returns null when the loop is not provably polynomial:
 * conditional branches, non-polynomial operations, or a final degree < 2.
 */
export function extractPolynomialDegree(ast: FrmAST, orbitVar = 'z'): number | null {
  const env = new Map<string, number | null>();
  let degree: number | null = null;
  for (const stmt of ast.loopBlock) {
    if (stmt.type !== 'assignment') return null; // conditional dataflow
    const stmtDegree = polynomialDegreeOf(stmt.value, orbitVar, env);
    env.set(stmt.target, stmtDegree);
    if (stmt.target === orbitVar) degree = stmtDegree;
  }
  if (degree === null || degree < 2) return null;
  return degree;
}

/**
 * Resolve the three-tier smooth capability from AST/dataflow plus the
 * bailout descriptor. Returns undefined when no descriptor exists (v1 /
 * legacy paths never set the field — the v1 behavior is frozen).
 */
export function resolveSmoothCapability(
  ast: FrmAST,
  descriptor: BailoutDescriptor | undefined,
): SmoothResolution | undefined {
  if (!descriptor) return undefined;
  if (descriptor.kind === 'C4R') {
    // C4-R is a real projection, not a radial crossing — no reuse by default.
    return { capability: 'unavailable', reason: 'non-radial-projection' };
  }
  if (descriptor.op === '>' || descriptor.op === '>=') {
    // Inside-out escapes make the radial smooth formula meaningless.
    return { capability: 'unavailable', reason: 'inverse-direction' };
  }
  const degree = extractPolynomialDegree(ast, 'z');
  if (degree !== null) {
    return { capability: 'supported', power: degree, reason: 'polynomial' };
  }
  // Forward radial escape over a non-polynomial loop: the radial-crossing
  // formula stays available as the labeled radial-crossing-v1 approximation.
  return { capability: 'adapted', reason: 'non-polynomial-radial' };
}
