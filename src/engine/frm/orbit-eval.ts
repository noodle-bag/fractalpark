/**
 * CPU orbit evaluator for FRM fixtures and diagnostics (v0.4.18 Slice 4).
 *
 * This is ANALYSIS tooling over the production compiler output: it consumes
 * the CanonicalFormula AST and the bailout descriptor produced by
 * `compileFrmDetailed` — it never re-parses source and is never on the
 * render path. It exists to pin orbit goldens for regression fixtures and
 * to cross-check the WebGL smoke path.
 *
 * Type discipline mirrors production EXACTLY: variable types come from the
 * production type system (`collectVariables`/`inferType`), every assignment
 * coerces to the variable's fixed static type (z is always complex), and
 * overload dispatch (`/`, `^`, `sqrt`, `flip`, `atan2`, `==`/`!=`) keys off
 * the STATIC operand types — never off runtime value tags.
 *
 * Other mirrored semantics (src/engine/shaders/complex-math.glsl + codegen):
 *   - `|expr|` is the dialect SQUARED magnitude (dot(z,z) / x*x); the v2
 *     descriptor escape compares dot(z,z) against threshold² (true radius,
 *     the documented v1 radius-compression correction);
 *   - complex `^` is always polar complexPow (r==0 → 0); real^real is
 *     Math.pow; the exponent coerces to real (.x);
 *   - `abs` on a complex is componentwise |re|,|im| (GLSL vec2 abs);
 *   - `sqr` sets the frmLastSqr side channel (dot(z,z) / x*x) — including
 *     inside discarded bare-expression statements;
 *   - `zPrev` inside loop-body iteration n is z as it stood before body
 *     n-1 ran (0 on the first), per framework.frag.glsl;
 *   - truth is `.x != 0`; bailout timing is after-step (loop body first,
 *     then the descriptor escape decides);
 *   - values are float64; the GPU runs float32 — fixture comparisons must
 *     use tolerance and short iteration windows.
 */

import type { ASTNode, FrmAST } from './ast';
import type { BailoutDescriptor } from './bailout-descriptor';
import { collectVariables, inferType, type VarType } from './type-system';
import { FN_SLOT_OPTIONS } from './builtins';
import type { FormulaPlugin } from '../plugins/types';

const FN_VALUE_TO_KEY = new Map(FN_SLOT_OPTIONS.map((o) => [o.value, o.key]));

export interface Complex {
  re: number;
  im: number;
}

/** Runtime value: a complex pair. Static types (not this shape) decide
 * overload semantics; a statically-real value simply carries im === 0. */
type Pair = [number, number];

export interface OrbitOptions {
  /** Pixel (the classic `pixel` / Mandelbrot `c`). */
  pixel: Complex;
  /** Julia mode: the Julia constant for `c` (ismand becomes 0). Omit for
   * Mandelbrot semantics (c ≡ pixel). */
  juliaC?: Complex;
  /** Parameter values p1..p5 (classic default is 0+0i). */
  params?: Record<string, Complex>;
  /** fn slot → builtin function name. When omitted, slots resolve from
   * `plugin`'s u_fnN uniform descriptor defaults (the function= bracket
   * contract); explicit entries override the plugin defaults. */
  fnMap?: Partial<Record<'fn1' | 'fn2' | 'fn3' | 'fn4', string>>;
  /** The compiled plugin — source of the fn slot descriptor defaults. */
  plugin?: FormulaPlugin;
  /** Maximum loop-body executions. */
  maxIterations: number;
  /** Strict-v2 descriptor driving the escape decision. */
  descriptor: BailoutDescriptor;
}

export interface OrbitResult {
  /** z after each loop-body execution (1-based positions). */
  orbit: Complex[];
  /** 1-based iteration at which the descriptor escape fired, else null. */
  escapedAt: number | null;
}

export class OrbitUnsupportedError extends Error {}

/**
 * Numeric value of a descriptor's threshold under the given params (C1/C4-R/C5:
 * the literal; C2: the substituted pure AST with params — defaults 0+0i).
 * Used by the WebGL smoke to hand the GPU the same radius the CPU oracle
 * applied. Throws OrbitUnsupportedError if the C2 expression references
 * something outside the invariant contract (cannot happen post-extraction).
 */
export function evalDescriptorThreshold(
  descriptor: BailoutDescriptor,
  params: Record<string, Complex> = {},
): number {
  if (descriptor.kind !== 'C2') return descriptor.threshold;
  // Minimal pure-evaluator for the substituted C2 threshold subtree:
  // numbers, params, unary -, arithmetic, whitelisted pure calls.
  const evalPure = (node: ASTNode): number => {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'ident': {
        const p = params[node.name];
        if (p) return p.re;
        if (/^p[1-5]$/.test(node.name)) return 0;
        if (node.name === 'pi') return Math.PI;
        if (node.name === 'e') return Math.E;
        throw new OrbitUnsupportedError(`threshold ident ${node.name}`);
      }
      case 'unary':
        if (node.op === '-') return -evalPure(node.operand);
        throw new OrbitUnsupportedError(`threshold unary ${node.op}`);
      case 'binary': {
        const l = evalPure(node.left);
        const r = evalPure(node.right);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '^': return Math.pow(l, r);
          default: throw new OrbitUnsupportedError(`threshold op ${node.op}`);
        }
      }
      case 'call': {
        const args = node.args.map(evalPure);
        switch (node.name) {
          case 'sqrt': return Math.sqrt(args[0]);
          case 'abs': return Math.abs(args[0]);
          case 'sqr': return args[0] * args[0];
          case 'exp': return Math.exp(args[0]);
          case 'log': return Math.log(args[0]);
          case 'sin': return Math.sin(args[0]);
          case 'cos': return Math.cos(args[0]);
          case 'cosxx': return Math.cos(args[0]); // real input: imag term vanishes
          case 'cotanh': return args[0] === 0 ? 0 : 1 / Math.tanh(args[0]);
          case 'tan': return Math.tan(args[0]);
          case 'sinh': return Math.sinh(args[0]);
          case 'cosh': return Math.cosh(args[0]);
          case 'tanh': return Math.tanh(args[0]);
          default: throw new OrbitUnsupportedError(`threshold call ${node.name}`);
        }
      }
      default:
        throw new OrbitUnsupportedError(`threshold node ${node.type}`);
    }
  };
  return evalPure(descriptor.thresholdNode);
}

const clampSinhCosh = (x: number) => Math.max(-80, Math.min(80, x));
const sinhClamped = (x: number) => Math.sinh(clampSinhCosh(x));
const coshClamped = (x: number) => Math.cosh(clampSinhCosh(x));

/** Value-level helpers — tan/tanh must evaluate their AST argument ONCE
 * (a side-channel call inside it, e.g. sqr → frmLastSqr, would otherwise
 * be observed twice with mutated state). */
const sinOf = ([re, im]: Pair): Pair => [
  Math.sin(re) * coshClamped(im),
  Math.cos(re) * sinhClamped(im),
];
const cosOf = ([re, im]: Pair): Pair => [
  Math.cos(re) * coshClamped(im),
  -Math.sin(re) * sinhClamped(im),
];
// FractInt truth: cosxx = the pre-v16 cos() sign bug — imaginary term PLUS
// (fractint.hlp: cos(x)cosh(y) + i sin(x)sinh(y)), i.e. conj(cos(z)).
// Numeric limitation (intentional, matches cos/sin): hyperbolic inputs are
// clamped to ±80 — classic overflowed instead; |Im| beyond that diverges
// from classic behavior. Documented as a renderer limitation, not a truth
// claim.
const cosxxOf = ([re, im]: Pair): Pair => [
  Math.cos(re) * coshClamped(im),
  Math.sin(re) * sinhClamped(im),
];
const sinhOf = ([re, im]: Pair): Pair => [
  sinhClamped(re) * Math.cos(im),
  coshClamped(re) * Math.sin(im),
];
const coshOf = ([re, im]: Pair): Pair => [
  coshClamped(re) * Math.cos(im),
  sinhClamped(re) * Math.sin(im),
];
const divGuarded = (s: Pair, c: Pair): Pair => {
  const d = c[0] * c[0] + c[1] * c[1];
  if (d === 0) return [0, 0];
  return [(s[0] * c[0] + s[1] * c[1]) / d, (s[1] * c[0] - s[0] * c[1]) / d];
};

export function evaluateOrbit(ast: FrmAST, opts: OrbitOptions): OrbitResult {
  // Production static types: builtins + per-variable fixed types inferred
  // from the assignment structure (first assignment wins, see type-system).
  const varTypes = collectVariables(ast.initBlock, ast.loopBlock);
  const typeCtx = { getVariableType: (name: string) => varTypes.get(name) };
  const nodeType = (node: ASTNode): VarType => inferType(node, typeCtx);

  const vars = new Map<string, Pair>();
  const params = opts.params ?? {};
  // fn slots: explicit fnMap wins; otherwise resolve from the compiled
  // plugin's u_fnN descriptor defaults (what the renderer would execute).
  const fnMap: Record<string, string> = {};
  for (const u of opts.plugin?.uniforms ?? []) {
    const m = /^u_(fn[1-4])$/.exec(u.name);
    if (!m) continue;
    const key = FN_VALUE_TO_KEY.get(u.default as number);
    if (key) fnMap[m[1]] = key;
  }
  Object.assign(fnMap, opts.fnMap ?? {});
  let lastSqr = 0; // frmLastSqr side channel
  let zPrevValue: Pair = [0, 0];

  /** Evaluate with the statically-known result type; returns the pair. */
  const evalNode = (node: ASTNode): Pair => {
    switch (node.type) {
      case 'number':
        return [node.value, 0];
      case 'complex':
        return [node.real, node.imag];
      case 'ident': {
        const name = node.name;
        if (name === 'pixel') return [opts.pixel.re, opts.pixel.im];
        // Julia mode: c is the Julia constant (opts.juliaC); Mandelbrot
        // (default) keeps c ≡ pixel. The framework's iterateStep does the
        // same split via u_isJulia/u_juliaC.
        if (name === 'c') return opts.juliaC
          ? [opts.juliaC.re, opts.juliaC.im]
          : [opts.pixel.re, opts.pixel.im];
        if (name === 'zPrev') return zPrevValue;
        if (name === 'LastSqr') return [lastSqr, 0];
        if (name === 'pi') return [Math.PI, 0];
        if (name === 'e') return [Math.E, 0];
        if (name === 'maxit') return [opts.maxIterations, 0];
        if (name === 'ismand') return [opts.juliaC ? 0 : 1, 0];
        if (/^p[1-5]$/.test(name)) {
          const p = params[name];
          return p ? [p.re, p.im] : [0, 0]; // classic default param
        }
        const v = vars.get(name);
        if (!v) throw new OrbitUnsupportedError(`unbound ident ${name}`);
        return v;
      }
      case 'unary': {
        const [re, im] = evalNode(node.operand);
        if (node.op === '-') return [-re, -im];
        if (node.op === '!') return [re === 0 ? 1 : 0, 0]; // truth: .x
        throw new OrbitUnsupportedError(`unary ${node.op}`);
      }
      case 'magnitude': {
        const [re, im] = evalNode(node.operand);
        // frmMagnitude: x*x for real, dot(z,z) for complex — identical on
        // a pair carrying im === 0, so the formula is shared.
        return [re * re + im * im, 0];
      }
      case 'binary': {
        const lt = nodeType(node.left).kind;
        const rt = nodeType(node.right).kind;
        // && / || short-circuit like GLSL: the RHS never evaluates when the
        // LHS decides — its side channels (e.g. sqr → frmLastSqr) stay cold.
        if (node.op === '&&' || node.op === '||') {
          const l = evalNode(node.left);
          if (node.op === '&&') {
            // JS && short-circuits too — RHS (and its side channels) stays cold.
            return [l[0] !== 0 && evalNode(node.right)[0] !== 0 ? 1 : 0, 0];
          }
          return [l[0] !== 0 || evalNode(node.right)[0] !== 0 ? 1 : 0, 0];
        }
        const l = evalNode(node.left);
        const r = evalNode(node.right);
        switch (node.op) {
          case '+':
            return [l[0] + r[0], l[1] + r[1]];
          case '-':
            return [l[0] - r[0], l[1] - r[1]];
          case '*':
            return [l[0] * r[0] - l[1] * r[1], l[0] * r[1] + l[1] * r[0]];
          case '/': {
            if (lt === 'real' && rt === 'real') return [l[0] / r[0], 0];
            if (rt === 'real') {
              // codegen emits direct `vec2 / float` — no guard; a zero
              // divisor produces non-finite components like the GPU.
              return [l[0] / r[0], l[1] / r[0]];
            }
            const d = r[0] * r[0] + r[1] * r[1];
            if (d === 0) return [0, 0]; // complexDiv guard
            return [
              (l[0] * r[0] + l[1] * r[1]) / d,
              (l[1] * r[0] - l[0] * r[1]) / d,
            ];
          }
          case '^': {
            if (lt === 'real' && rt === 'real') return [Math.pow(l[0], r[0]), 0];
            const n = r[0]; // exponent coerced to real (.x) per codegen
            const radius = Math.hypot(l[0], l[1]);
            if (radius === 0) return [0, 0]; // complexPow guard
            const rn = Math.pow(radius, n);
            const nt = n * Math.atan2(l[1], l[0]);
            return [rn * Math.cos(nt), rn * Math.sin(nt)];
          }
          case '==':
          case '!=': {
            const eq =
              lt === 'complex' || rt === 'complex'
                ? l[0] === r[0] && l[1] === r[1]
                : l[0] === r[0];
            return [node.op === '==' ? (eq ? 1 : 0) : eq ? 0 : 1, 0];
          }
          case '<':
            return [l[0] < r[0] ? 1 : 0, 0];
          case '<=':
            return [l[0] <= r[0] ? 1 : 0, 0];
          case '>':
            return [l[0] > r[0] ? 1 : 0, 0];
          case '>=':
            return [l[0] >= r[0] ? 1 : 0, 0];
          default:
            throw new OrbitUnsupportedError(`binary op ${node.op}`);
        }
      }
      case 'call': {
        const mapped = fnMap[node.name as keyof typeof fnMap];
        const effective = mapped ?? node.name;
        return applyCall(effective, node, evalNode);
      }
      default:
        throw new OrbitUnsupportedError(`node ${node.type}`);
    }
  };

  /** Builtin call — overload dispatch keys off the STATIC argument type,
   * mirroring generateCallExpression. fn slots always take/return vec2 in
   * production; the pair carrier makes that coercion a no-op. */
  function applyCall(
    name: string,
    node: Extract<ASTNode, { type: 'call' }>,
    evaluate: (n: ASTNode) => Pair,
  ): Pair {
    const argStaticKind = (i: number) =>
      node.args[i] ? nodeType(node.args[i]).kind : 'real';
    const arg = (i: number): Pair => (node.args[i] ? evaluate(node.args[i]) : [0, 0]);
    switch (name) {
      case 'identity':
        return arg(0);
      case 'sin':
        return sinOf(arg(0));
      case 'cos':
        return cosOf(arg(0));
      case 'cosxx':
        return cosxxOf(arg(0));
      case 'cotanh': {
        const v = arg(0); // evaluate the argument once — side channels
        return divGuarded(coshOf(v), sinhOf(v));
      }
      case 'tan': {
        const v = arg(0); // evaluate the argument once — side channels
        return divGuarded(sinOf(v), cosOf(v));
      }
      case 'exp': {
        const [re, im] = arg(0);
        const er = Math.exp(re);
        return [er * Math.cos(im), er * Math.sin(im)];
      }
      case 'log': {
        const [re, im] = arg(0);
        return [Math.log(Math.max(Math.hypot(re, im), 1e-20)), Math.atan2(im, re)];
      }
      case 'sqrt': {
        const [re, im] = arg(0);
        if (argStaticKind(0) === 'real') return [Math.sqrt(re), 0]; // NaN on negative, like GLSL
        // frmComplexSqrt == complexPow(z, 0.5)
        const radius = Math.hypot(re, im);
        if (radius === 0) return [0, 0];
        const rn = Math.sqrt(radius);
        const nt = 0.5 * Math.atan2(im, re);
        return [rn * Math.cos(nt), rn * Math.sin(nt)];
      }
      case 'abs': {
        // GLSL abs: |x| for float, componentwise for vec2 — shared shape.
        const v = arg(0); // single evaluation — side-channel-safe
        return [Math.abs(v[0]), Math.abs(v[1])];
      }
      case 'cabs': {
        const [re, im] = arg(0);
        return argStaticKind(0) === 'real' ? [Math.abs(re), 0] : [Math.hypot(re, im), 0];
      }
      case 'real':
        return [arg(0)[0], 0];
      case 'imag':
        return argStaticKind(0) === 'real' ? [0, 0] : [arg(0)[1], 0];
      case 'conj': {
        const v = arg(0); // single evaluation — side-channel-safe
        return [v[0], -v[1]];
      }
      case 'flip': {
        // frmFlip(float) is the identity; frmFlip(vec2) swaps.
        const [re, im] = arg(0);
        return argStaticKind(0) === 'real' ? [re, 0] : [im, re];
      }
      case 'sqr': {
        const [re, im] = arg(0);
        if (argStaticKind(0) === 'real') {
          lastSqr = re * re;
          return [lastSqr, 0];
        }
        lastSqr = re * re + im * im;
        return [re * re - im * im, 2 * re * im];
      }
      case 'recip': {
        const [re, im] = arg(0);
        if (argStaticKind(0) === 'real') return [re === 0 ? 0 : 1 / re, 0];
        const d = re * re + im * im;
        if (d === 0) return [0, 0];
        return [re / d, -im / d];
      }
      case 'sinh':
        return sinhOf(arg(0));
      case 'cosh':
        return coshOf(arg(0));
      case 'tanh': {
        const v = arg(0); // evaluate the argument once — side channels
        return divGuarded(sinhOf(v), coshOf(v));
      }
      case 'atan2': {
        if (node.args.length >= 2) {
          // GLSL atan(y, x) two-argument form, operands coerced .x.
          return [Math.atan2(arg(0)[0], arg(1)[0]), 0];
        }
        if (argStaticKind(0) === 'real') return [Math.atan(arg(0)[0]), 0];
        const [re, im] = arg(0);
        return [Math.atan2(im, re), 0];
      }
      default:
        throw new OrbitUnsupportedError(`call ${name}`);
    }
  }

  const execBlock = (nodes: readonly ASTNode[]): void => {
    for (const stmt of nodes) {
      if (stmt.type === 'assignment') {
        const value = evalNode(stmt.value);
        // Coerce to the variable's fixed static type, like codegen: a real
        // variable keeps .x; a complex variable promotes (x, 0).
        const fixed = varTypes.get(stmt.target)?.kind ?? nodeType(stmt.value).kind;
        vars.set(stmt.target, fixed === 'real' ? [value[0], 0] : value);
      } else if (stmt.type === 'if') {
        if (evalNode(stmt.condition)[0] !== 0) {
          execBlock(stmt.then);
          continue;
        }
        let taken = false;
        for (const branch of stmt.elseIf ?? []) {
          if (evalNode(branch.condition)[0] !== 0) {
            execBlock(branch.body);
            taken = true;
            break;
          }
        }
        if (!taken && stmt.else) execBlock(stmt.else);
      } else {
        // Bare expression statement: evaluated (side channels like
        // frmLastSqr still fire), value discarded — the native no-op.
        evalNode(stmt);
      }
    }
  };

  // Escape per the strict-v2 descriptor; escape fires when the predicate
  // no longer holds (the assembler's inverted escapeOp is exactly !holds).
  const thresholdSquared = (): number => {
    const d = opts.descriptor;
    if (d.kind === 'C1' || d.kind === 'C4R' || d.kind === 'C5') return d.threshold * d.threshold;
    const t = evalNode(d.thresholdNode);
    return t[0] * t[0];
  };
  const predicateHolds = (z: Pair): boolean => {
    const d = opts.descriptor;
    if (d.kind === 'C4R') {
      // Real-projection: z.x (abs-real: abs(z.x)) against the RAW
      // threshold — never squared (assembler C4R_ESCAPE_CHECK contract).
      const v = d.form === 'abs-real' ? Math.abs(z[0]) : z[0];
      const t = d.threshold;
      switch (d.op) {
        case '<':
          return v < t;
        case '<=':
          return v <= t;
        case '>':
          return v > t;
        case '>=':
          return v >= t;
        default:
          throw new OrbitUnsupportedError(`C4R op ${d.op}`);
      }
    }
    if (d.kind === 'C5') {
      // C5 reads the LastSqr SIDE CHANNEL — the modulus at the last sqr()
      // call's argument (0 before any sqr call), NOT the predicate-time
      // |z|². Mirrors C5_ESCAPE_CHECK(frmLastSqr).
      const v = lastSqr;
      switch (d.op) {
        case '<': return v < d.threshold;
        case '<=': return v <= d.threshold;
        case '>': return v > d.threshold;
        case '>=': return v >= d.threshold;
        default: throw new OrbitUnsupportedError(`C5 op ${d.op}`);
      }
    }
    const mag2 = z[0] * z[0] + z[1] * z[1];
    const t2 = thresholdSquared();
    switch (d.op) {
      case '<':
        return mag2 < t2;
      case '<=':
        return mag2 <= t2;
      case '>':
        return mag2 > t2;
      case '>=':
        return mag2 >= t2;
      default:
        throw new OrbitUnsupportedError(`descriptor op ${d.op}`);
    }
  };

  execBlock(ast.initBlock);
  const orbit: Complex[] = [];
  let escapedAt: number | null = null;
  let zAtStartOfPrevBody: Pair = [0, 0];
  for (let n = 1; n <= opts.maxIterations; n++) {
    zPrevValue = zAtStartOfPrevBody;
    const zBefore = vars.get('z') ?? [0, 0];
    zAtStartOfPrevBody = [zBefore[0], zBefore[1]];
    execBlock(ast.loopBlock);
    const z = vars.get('z') ?? [0, 0];
    orbit.push({ re: z[0], im: z[1] });
    if (!predicateHolds(z)) {
      escapedAt = n;
      break;
    }
  }
  return { orbit, escapedAt };
}
