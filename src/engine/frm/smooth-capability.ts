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
import { isParameterName } from './builtins';
import type { BailoutDescriptor } from './bailout-descriptor';
import type { SmoothCapability } from '../plugins/types';

export interface SmoothResolution {
  capability: SmoothCapability;
  /** Leading polynomial degree; present only when capability is 'supported'. */
  power?: number;
  reason: 'polynomial' | 'non-polynomial-radial' | 'inverse-direction' | 'non-radial-projection';
}

/**
 * The requested coloring preference and the effective method are separate
 * concerns (spec §7): the document stores what the user asked for; the
 * effective method is derived deterministically from the capability and
 * restored when the capability returns. v1/legacy plugins (no capability
 * field) keep the historical smooth path.
 */
export type EffectiveSmoothMethod = 'smooth' | 'radial-crossing-v1' | 'escape-time';

export function resolveEffectiveSmoothMethod(plugin: {
  smoothCapability?: SmoothCapability;
}): EffectiveSmoothMethod {
  switch (plugin.smoothCapability) {
    case 'supported':
      return 'smooth';
    case 'adapted':
      return 'radial-crossing-v1';
    case 'unavailable':
      return 'escape-time';
    default:
      return 'smooth'; // v1/legacy: frozen historical behavior
  }
}

/**
 * Degree of an expression as a polynomial in `orbitVar`, or null when the
 * expression is not a polynomial (transcendental call, fn slot, z-dependent
 * denominator or exponent, magnitude, logical operator, conditional).
 *
 * EVERY identifier — including the orbit variable itself — resolves through
 * `env`, which tracks the polynomial degree of each variable's CURRENT value
 * within one loop iteration. Seeding decides soundness: at loop start the
 * orbit variable has degree 1 (the recurrence input) and every init-block
 * variable carries its computed (z-free) degree. Resolving `z` through env
 * is what keeps sequential compositions honest:
 *   z = sin(z); z = z^2 + c   → F(z) = sin(z)² + c is NOT polynomial → null
 *   z = z^2; w = z; z = w^2+c → F(z) = z^4 + c, degree 4 (not 2)
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
      // Parameters and the pixel coordinate are uniform inputs — never
      // loop-assigned, always z-free.
      if (isParameterName(node.name) || node.name === 'pixel') return 0;
      const known = env.get(node.name);
      if (known !== undefined) return known;
      // `c` defaults to the pixel coordinate when the formula never assigns
      // it (native dialect has no explicit `c = pixel` init statement).
      // Any other untracked identifier is an unknown dependency → reject.
      return node.name === 'c' ? 0 : null;
    }
    case 'unary':
      // Only arithmetic negation preserves a polynomial; logical operators
      // (e.g. `!`) break it.
      if (node.op !== '-') return null;
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
          // Comparison / logical operators yield boolean values, not
          // polynomial terms.
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
      return null;
    }
    case 'magnitude':
    case 'if':
    case 'assignment':
      return null;
  }
}

/**
 * Extract the leading polynomial degree of the per-iteration recurrence in
 * `orbitVar` (default `z`). Returns null when the loop is not provably
 * polynomial: conditional branches, non-polynomial operations anywhere in
 * the sequential composition, or a final degree < 2.
 */
export function extractPolynomialDegree(ast: FrmAST, orbitVar = 'z'): number | null {
  // Seed from the init block: every init variable is a constant w.r.t. the
  // orbit (the initial orbit value itself is constant), so init expressions
  // evaluate with all idents z-free. Init conditionals leave their targets
  // untracked (unknown → safe rejection downstream).
  const env = new Map<string, number | null>();
  for (const stmt of ast.initBlock) {
    if (stmt.type !== 'assignment') continue;
    env.set(stmt.target, polynomialDegreeOf(stmt.value, orbitVar, env));
  }
  // Loop start: the orbit variable IS the recurrence input — degree 1,
  // regardless of what the init block assigned to it.
  env.set(orbitVar, 1);

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
