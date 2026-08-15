/** Isolated FRM-like v1 typed-IR CPU/GLSL backend candidate. */
import { FRM_V1_GLSL_PRELUDE } from "./frm-v1-glsl-prelude";
import {
  FRM_V1_STDLIB_NAMES,
  FRM_V1_UNARY_FUNCTION_NAMES,
  frmV1Classify,
  frmV1QuantizeStandard32,
  type FrmV1Complex,
  type FrmV1StdlibName,
  type FrmV1UnaryFunctionName,
} from "./frm-v1-stdlib";
import type {
  FrmLikeV1Expression,
  FrmLikeV1Ir,
  FrmLikeV1SafetyLimits,
  FrmLikeV1Statement,
  FrmLikeV1ValueType,
} from "./v1";
import { FRM_LIKE_V1_DEFAULT_LIMITS, validateFrmLikeV1Ir } from "./v1";

export type FrmLikeV1BackendFailure = { ok: false; reason: string };
export type FrmLikeV1BackendSuccess = { ok: true; backend: FrmLikeV1Backend };
export type FrmLikeV1BackendResult =
  | FrmLikeV1BackendSuccess
  | FrmLikeV1BackendFailure;
export interface FrmLikeV1BackendOptions {
  readonly limits?: Readonly<
    Pick<FrmLikeV1SafetyLimits, "maxGeneratedShaderBytes">
  >;
}
export interface FrmLikeV1Backend {
  readonly metadata: Readonly<{
    languageVersion: "frm-like/1";
    stdlibVersion: 1;
    numericProfile: "standard32";
    evaluationOrder: "source-order-left-to-right";
    nonFinite: "terminate-with-event";
  }>;
  readonly glsl: Readonly<{
    declarations: string;
    init: string;
    loop: string;
    continuePredicate: string;
    eventFlag: "frmV1NonFiniteEvent";
    functionOptions: readonly FrmV1UnaryFunctionName[];
    functionDefaults: Readonly<Record<string, FrmV1UnaryFunctionName>>;
    classicBindings: Readonly<Record<string, string>>;
    generatedBytes: number;
  }>;
  readonly cpu: Readonly<{
    createState(inputs?: FrmLikeV1CpuInputs): FrmLikeV1CpuState;
    init(state: FrmLikeV1CpuState): FrmLikeV1CpuResult;
    step(state: FrmLikeV1CpuState): FrmLikeV1CpuResult;
    shouldContinue(state: FrmLikeV1CpuState): FrmLikeV1CpuResult;
  }>;
}
export interface FrmLikeV1CpuInputs {
  readonly pixel?: FrmV1Complex;
  readonly c?: FrmV1Complex;
  readonly maxit?: number;
  readonly ismand?: boolean;
  readonly parameters?: Readonly<
    Record<string, number | readonly [number, number] | FrmV1UnaryFunctionName>
  >;
}
export interface FrmLikeV1CpuState {
  readonly values: Record<string, FrmV1Complex>;
  readonly functions: Record<string, FrmV1UnaryFunctionName>;
  readonly booleans: Record<string, boolean>;
  terminated?: "nonFinite";
}
export interface FrmLikeV1CpuResult {
  readonly state: FrmLikeV1CpuState;
  readonly continue?: boolean;
  readonly event?: "nonFinite";
}
type Value =
  | { type: "boolean"; bool: boolean }
  | { type: "real" | "complex"; complex: FrmV1Complex };
type Typed = { code: string; type: FrmLikeV1ValueType };
const identifiers = /^[A-Za-z_][A-Za-z0-9_]*$/;
const stdlib = new Set<string>(FRM_V1_STDLIB_NAMES);
const unaryStdlib: ReadonlySet<string> = new Set<string>(
  FRM_V1_UNARY_FUNCTION_NAMES,
);
const systems: Readonly<Record<string, FrmLikeV1ValueType>> = Object.freeze({
  pixel: "complex",
  c: "complex",
  zPrev: "complex",
  LastSqr: "real",
  pi: "real",
  e: "real",
  maxit: "real",
  ismand: "boolean",
  p1: "complex",
  p2: "complex",
  p3: "complex",
  p4: "complex",
  p5: "complex",
  fn1: "function",
  fn2: "function",
  fn3: "function",
  fn4: "function",
  z: "complex",
});
const glslFns: Readonly<Record<string, string>> = Object.freeze({
  abs: "frmV1Abs",
  sqr: "frmV1Sqr",
  sqrt: "frmV1Sqrt",
  exp: "frmV1Exp",
  log: "frmV1Log",
  recip: "frmV1Recip",
  conj: "frmV1Conj",
  flip: "frmV1Flip",
  real: "frmV1Real",
  imag: "frmV1Imag",
  cabs: "frmV1Cabs",
  round: "frmV1Round",
  atan2: "frmV1Atan2",
  sin: "frmV1Sin",
  cos: "frmV1Cos",
  tan: "frmV1Tan",
  asin: "frmV1Asin",
  acos: "frmV1Acos",
  atan: "frmV1Atan",
  sinh: "frmV1Sinh",
  cosh: "frmV1Cosh",
  tanh: "frmV1Tanh",
  asinh: "frmV1Asinh",
  acosh: "frmV1Acosh",
  atanh: "frmV1Atanh",
  cotanh: "frmV1Cotanh",
  cosxx: "frmV1Cosxx",
});
function fail(reason: string): never {
  throw new Error(reason);
}
function q(z: FrmV1Complex): FrmV1Complex {
  return frmV1QuantizeStandard32(z);
}
function f32(value: number): number {
  const rounded = Math.fround(value);
  return rounded === 0 ? 0 : rounded;
}
function f32Add(left: number, right: number): number {
  return f32(f32(left) + f32(right));
}
function f32Sub(left: number, right: number): number {
  return f32(f32(left) - f32(right));
}
function f32Mul(left: number, right: number): number {
  return f32(f32(left) * f32(right));
}
function f32Div(left: number, right: number): number {
  return f32(f32(left) / f32(right));
}
function s32Add(left: FrmV1Complex, right: FrmV1Complex): FrmV1Complex {
  return { re: f32Add(left.re, right.re), im: f32Add(left.im, right.im) };
}
function s32Sub(left: FrmV1Complex, right: FrmV1Complex): FrmV1Complex {
  return { re: f32Sub(left.re, right.re), im: f32Sub(left.im, right.im) };
}
function s32Mul(left: FrmV1Complex, right: FrmV1Complex): FrmV1Complex {
  return {
    re: f32Sub(f32Mul(left.re, right.re), f32Mul(left.im, right.im)),
    im: f32Add(f32Mul(left.re, right.im), f32Mul(left.im, right.re)),
  };
}
function s32Div(left: FrmV1Complex, right: FrmV1Complex): FrmV1Complex {
  const denominator = f32Add(
    f32Mul(right.re, right.re),
    f32Mul(right.im, right.im),
  );
  if (denominator === 0 || !Number.isFinite(denominator))
    return { re: Number.NaN, im: Number.NaN };
  return {
    re: f32Div(
      f32Add(f32Mul(left.re, right.re), f32Mul(left.im, right.im)),
      denominator,
    ),
    im: f32Div(
      f32Sub(f32Mul(left.im, right.re), f32Mul(left.re, right.im)),
      denominator,
    ),
  };
}
function standard32Stdlib(
  name: FrmV1StdlibName,
  args: readonly FrmV1Complex[],
  state: FrmLikeV1CpuState,
): FrmV1Complex {
  const first = checkedComplex(
    state,
    args[0] ?? fail("runtime-missing-function-argument"),
  );
  const tracked = (result: FrmV1Complex) => checkedComplex(state, result);
  const one = { re: 1, im: 0 };
  const imaginaryUnit = { re: 0, im: 1 };
  const sinhReal = (value: number) =>
    f32Mul(f32Sub(f32(Math.exp(f32(value))), f32(Math.exp(f32(-value)))), 0.5);
  const coshReal = (value: number) =>
    f32Mul(f32Add(f32(Math.exp(f32(value))), f32(Math.exp(f32(-value)))), 0.5);
  const radiusOf = (value: FrmV1Complex) =>
    f32(
      Math.sqrt(f32Add(f32Mul(value.re, value.re), f32Mul(value.im, value.im))),
    );
  const logarithm = (value: FrmV1Complex) => {
    const radius = radiusOf(value);
    if (radius === 0 || !Number.isFinite(radius))
      return tracked({ re: Number.NaN, im: Number.NaN });
    const imaginary = value.im === 0 ? 0 : value.im;
    const argument =
      imaginary === 0 && value.re < 0
        ? f32(Math.PI)
        : f32(Math.atan2(imaginary, value.re));
    return tracked({ re: f32(Math.log(radius)), im: argument });
  };
  const squareRoot = (value: FrmV1Complex) => {
    const radius = radiusOf(value);
    const real = f32(Math.sqrt(f32Div(f32Add(radius, value.re), 2)));
    const imaginaryMagnitude = f32(
      Math.sqrt(f32Div(f32Sub(radius, value.re), 2)),
    );
    return tracked({
      re: real,
      im: value.im < 0 ? f32(-imaginaryMagnitude) : imaginaryMagnitude,
    });
  };
  const call = (callee: FrmV1StdlibName, values: readonly FrmV1Complex[]) =>
    standard32Stdlib(callee, values, state);

  switch (name) {
    case "abs":
      return tracked({
        re: f32(Math.abs(first.re)),
        im: f32(Math.abs(first.im)),
      });
    case "sqr":
      return tracked(s32Mul(first, first));
    case "sqrt":
      return squareRoot(first);
    case "exp": {
      const magnitude = f32(Math.exp(first.re));
      return tracked({
        re: f32Mul(magnitude, f32(Math.cos(first.im))),
        im: f32Mul(magnitude, f32(Math.sin(first.im))),
      });
    }
    case "log":
      return logarithm(first);
    case "recip":
      return tracked(s32Div(one, first));
    case "conj":
      return tracked({ re: f32(first.re), im: f32(-first.im) });
    case "flip":
      return tracked({ re: f32(-first.im), im: f32(first.re) });
    case "real":
      return tracked({ re: f32(first.re), im: 0 });
    case "imag":
      return tracked({ re: f32(first.im), im: 0 });
    case "cabs":
      return tracked({ re: radiusOf(first), im: 0 });
    case "round": {
      const roundComponent = (value: number) =>
        f32(value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5));
      return tracked({
        re: roundComponent(first.re),
        im: roundComponent(first.im),
      });
    }
    case "atan2": {
      const second = checkedComplex(
        state,
        args[1] ?? fail("runtime-missing-function-argument"),
      );
      const yy = first.re === 0 ? 0 : first.re;
      const xx = second.re === 0 ? 0 : second.re;
      if (yy === 0 && xx === 0) return tracked({ re: 0, im: 0 });
      if (yy === 0 && xx < 0) return tracked({ re: f32(Math.PI), im: 0 });
      return tracked({ re: f32(Math.atan2(yy, xx)), im: 0 });
    }
    case "sin":
      return tracked({
        re: f32Mul(f32(Math.sin(first.re)), coshReal(first.im)),
        im: f32Mul(f32(Math.cos(first.re)), sinhReal(first.im)),
      });
    case "cos":
      return tracked({
        re: f32Mul(f32(Math.cos(first.re)), coshReal(first.im)),
        im: f32(-f32Mul(f32(Math.sin(first.re)), sinhReal(first.im))),
      });
    case "cosxx":
      return tracked({
        re: f32Mul(f32(Math.cos(first.re)), coshReal(first.im)),
        im: f32Mul(f32(Math.sin(first.re)), sinhReal(first.im)),
      });
    case "tan":
      return tracked(s32Div(call("sin", [first]), call("cos", [first])));
    case "sinh":
      return tracked({
        re: f32Mul(sinhReal(first.re), f32(Math.cos(first.im))),
        im: f32Mul(coshReal(first.re), f32(Math.sin(first.im))),
      });
    case "cosh":
      return tracked({
        re: f32Mul(coshReal(first.re), f32(Math.cos(first.im))),
        im: f32Mul(sinhReal(first.re), f32(Math.sin(first.im))),
      });
    case "tanh":
      return tracked(s32Div(call("sinh", [first]), call("cosh", [first])));
    case "cotanh":
      return tracked(s32Div(call("cosh", [first]), call("sinh", [first])));
    case "asin": {
      const iz = tracked(s32Mul(imaginaryUnit, first));
      const radicand = tracked(s32Sub(one, tracked(s32Mul(first, first))));
      return tracked(
        s32Mul(
          { re: 0, im: -1 },
          logarithm(tracked(s32Add(iz, squareRoot(radicand)))),
        ),
      );
    }
    case "acos": {
      const asin = call("asin", [first]);
      return tracked({
        re: f32Sub(f32(Math.PI / 2), asin.re),
        im: f32(-asin.im),
      });
    }
    case "atan": {
      const iz = tracked(s32Mul(imaginaryUnit, first));
      const numerator = tracked(
        s32Sub(
          logarithm(tracked(s32Add(one, iz))),
          logarithm(tracked(s32Sub(one, iz))),
        ),
      );
      return tracked(s32Div(numerator, { re: 0, im: 2 }));
    }
    case "asinh":
      return logarithm(
        tracked(
          s32Add(
            first,
            squareRoot(tracked(s32Add(tracked(s32Mul(first, first)), one))),
          ),
        ),
      );
    case "acosh": {
      const product = tracked(
        s32Mul(
          squareRoot(tracked(s32Sub(first, one))),
          squareRoot(tracked(s32Add(first, one))),
        ),
      );
      return logarithm(tracked(s32Add(first, product)));
    }
    case "atanh": {
      const difference = tracked(
        s32Sub(
          logarithm(tracked(s32Add(one, first))),
          logarithm(tracked(s32Sub(one, first))),
        ),
      );
      return tracked({
        re: f32Mul(difference.re, 0.5),
        im: f32Mul(difference.im, 0.5),
      });
    }
  }
}
function complex(value: number | readonly [number, number]): FrmV1Complex {
  return q(
    Array.isArray(value)
      ? { re: value[0], im: value[1] }
      : { re: value, im: 0 },
  );
}
function bool(v: Value): boolean {
  return v.type === "boolean" ? v.bool : v.complex.re !== 0;
}
function numberText(value: number): string {
  if (!Number.isFinite(value)) fail("unsupported-non-finite-literal");
  const text = String(Object.is(value, -0) ? 0 : value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}
function typeOfExpression(
  expression: FrmLikeV1Expression,
  values: Readonly<Record<string, FrmLikeV1ValueType>>,
): FrmLikeV1ValueType {
  if (expression.kind === "number") return "real";
  if (expression.kind === "complex") return "complex";
  if (expression.kind === "identifier")
    return values[expression.name] ?? fail("unsupported-undeclared-identifier");
  if (expression.kind === "magnitude") return "real";
  if (expression.kind === "unary")
    return expression.operator === "!"
      ? "boolean"
      : typeOfExpression(expression.operand, values) === "boolean"
        ? "real"
        : typeOfExpression(expression.operand, values);
  if (expression.kind === "call") {
    if (
      expression.callee === "real" ||
      expression.callee === "imag" ||
      expression.callee === "cabs" ||
      expression.callee === "atan2"
    )
      return "real";
    return "complex";
  }
  if (
    ["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(expression.operator)
  )
    return "boolean";
  const l = typeOfExpression(expression.left, values),
    r = typeOfExpression(expression.right, values);
  return l === "complex" || r === "complex" ? "complex" : "real";
}
function validate(ir: FrmLikeV1Ir): Record<string, FrmLikeV1ValueType> {
  if (
    ir.languageVersion !== "frm-like/1" ||
    ir.stdlibVersion !== 1 ||
    ir.numericProfile !== "standard32" ||
    ir.evaluationOrder !== "source-order-left-to-right"
  )
    fail("unsupported-ir-version");
  const values: Record<string, FrmLikeV1ValueType> = { ...systems };
  const names = new Set<string>();
  for (const p of ir.parameters) {
    if (
      !identifiers.test(p.name) ||
      names.has(p.name) ||
      systems[p.name] ||
      stdlib.has(p.name)
    )
      fail("unsupported-parameter");
    names.add(p.name);
    values[p.name] = p.type;
    if (p.type === "function" && !unaryStdlib.has(p.default as string))
      fail("unsupported-function-mapping");
  }
  for (const local of ir.locals) {
    if (
      !identifiers.test(local.name) ||
      values[local.name] ||
      local.type === "function"
    )
      fail("unsupported-local");
    values[local.name] = local.type;
  }
  const check = (e: FrmLikeV1Expression): void => {
    if (e.kind === "number" && !Number.isFinite(e.value))
      fail("unsupported-non-finite-literal");
    if (
      e.kind === "complex" &&
      (!Number.isFinite(e.real) || !Number.isFinite(e.imaginary))
    )
      fail("unsupported-non-finite-literal");
    if (e.kind === "identifier" && !values[e.name] && !/^fn[1-4]$/.test(e.name))
      fail("unsupported-undeclared-identifier");
    if (e.kind === "call") {
      if (!stdlib.has(e.callee) && values[e.callee] !== "function")
        fail("unsupported-call");
      if (e.args.length !== (e.callee === "atan2" ? 2 : 1))
        fail("unsupported-call-arity");
      e.args.forEach(check);
    }
    if (e.kind === "unary" || e.kind === "magnitude") check(e.operand);
    if (e.kind === "binary") {
      if (
        ![
          "+",
          "-",
          "*",
          "/",
          "^",
          "<",
          ">",
          "<=",
          ">=",
          "==",
          "!=",
          "&&",
          "||",
        ].includes(e.operator)
      )
        fail("unsupported-operator");
      check(e.left);
      check(e.right);
    }
  };
  const statements = (body: FrmLikeV1Statement[]): void =>
    body.forEach((s) => {
      if (s.kind === "if") {
        check(s.condition);
        statements(s.then);
        s.elseIf.forEach((b) => {
          check(b.condition);
          statements(b.body);
        });
        if (s.else) statements(s.else);
        return;
      }
      if (
        !values[s.target] ||
        (s.target !== "z" && !ir.locals.some((l) => l.name === s.target))
      )
        fail("unsupported-store");
      check(s.value);
    });
  statements(ir.init);
  statements(ir.loop);
  check(ir.bailout);
  return values;
}
function lowerBindingExpression(
  expression: FrmLikeV1Expression,
  aliases: Readonly<Record<string, string>>,
): FrmLikeV1Expression {
  switch (expression.kind) {
    case "number":
    case "complex":
      return expression;
    case "identifier":
      return {
        ...expression,
        name: aliases[expression.name] ?? expression.name,
      };
    case "unary":
    case "magnitude":
      return {
        ...expression,
        operand: lowerBindingExpression(expression.operand, aliases),
      };
    case "call":
      return {
        ...expression,
        callee: aliases[expression.callee] ?? expression.callee,
        args: expression.args.map((argument) =>
          lowerBindingExpression(argument, aliases),
        ),
      };
    case "binary":
      return {
        ...expression,
        left: lowerBindingExpression(expression.left, aliases),
        right: lowerBindingExpression(expression.right, aliases),
      };
  }
}
function lowerBindingStatements(
  statements: FrmLikeV1Statement[],
  aliases: Readonly<Record<string, string>>,
): FrmLikeV1Statement[] {
  return statements.map((statement) => {
    if (
      statement.kind === "assignment" ||
      statement.kind === "component-assignment"
    )
      return {
        ...statement,
        value: lowerBindingExpression(statement.value, aliases),
      };
    return {
      ...statement,
      condition: lowerBindingExpression(statement.condition, aliases),
      then: lowerBindingStatements(statement.then, aliases),
      elseIf: statement.elseIf.map((branch) => ({
        condition: lowerBindingExpression(branch.condition, aliases),
        body: lowerBindingStatements(branch.body, aliases),
      })),
      ...(statement.else
        ? { else: lowerBindingStatements(statement.else, aliases) }
        : {}),
    };
  });
}
function lowerClassicBindings(ir: FrmLikeV1Ir): FrmLikeV1Ir {
  const aliases: Record<string, string> = {};
  for (const parameter of ir.parameters)
    if (parameter.classicBinding)
      aliases[parameter.classicBinding] = parameter.name;
  if (Object.keys(aliases).length === 0) return ir;
  return {
    ...ir,
    init: lowerBindingStatements(ir.init, aliases),
    loop: lowerBindingStatements(ir.loop, aliases),
    bailout: lowerBindingExpression(ir.bailout, aliases),
  };
}
function glslComplex(value: Typed): string {
  if (value.type === "function") fail("unsupported-function-value");
  if (value.type === "boolean") return `vec2((${value.code}) ? 1.0 : 0.0, 0.0)`;
  return value.code;
}
function glslReal(value: Typed): string {
  if (value.type === "function") fail("unsupported-function-value");
  if (value.type === "boolean") return `((${value.code}) ? 1.0 : 0.0)`;
  return `(${value.code}).x`;
}
function glslBoolean(value: Typed): string {
  if (value.type === "function") fail("unsupported-function-value");
  return value.type === "boolean"
    ? value.code
    : `frmV1Truthy(${glslComplex(value)})`;
}
function compileExpression(
  expression: FrmLikeV1Expression,
  values: Readonly<Record<string, FrmLikeV1ValueType>>,
): Typed {
  const type = typeOfExpression(expression, values);
  if (expression.kind === "number")
    return { type, code: `vec2(${numberText(expression.value)}, 0.0)` };
  if (expression.kind === "complex")
    return {
      type,
      code: `vec2(${numberText(expression.real)}, ${numberText(expression.imaginary)})`,
    };
  if (expression.kind === "identifier") return { type, code: expression.name };
  if (expression.kind === "magnitude") {
    const operand = compileExpression(expression.operand, values);
    return {
      type,
      code: `frmV1Checked(vec2(length(${glslComplex(operand)}), 0.0))`,
    };
  }
  if (expression.kind === "unary") {
    const operand = compileExpression(expression.operand, values);
    return expression.operator === "!"
      ? { type, code: `(!${glslBoolean(operand)})` }
      : {
          type,
          code: `frmV1Checked(-${glslComplex(operand)})`,
        };
  }
  if (expression.kind === "call") {
    const args = expression.args
      .map((argument) => glslComplex(compileExpression(argument, values)))
      .join(", ");
    const call =
      values[expression.callee] === "function"
        ? `frmV1Dispatch_${expression.callee}(${args})`
        : `${glslFns[expression.callee]}(${args})`;
    return { type, code: `frmV1Checked(${call})` };
  }
  const left = compileExpression(expression.left, values);
  if (expression.operator === "&&") {
    const right = compileExpression(expression.right, values);
    return {
      type,
      code: `(${glslBoolean(left)} && ${glslBoolean(right)})`,
    };
  }
  if (expression.operator === "||") {
    const right = compileExpression(expression.right, values);
    return {
      type,
      code: `(${glslBoolean(left)} || ${glslBoolean(right)})`,
    };
  }
  const right = compileExpression(expression.right, values);
  if (["<", ">", "<=", ">="].includes(expression.operator))
    return {
      type,
      code: `(${glslReal(left)} ${expression.operator} ${glslReal(right)})`,
    };
  if (expression.operator === "==" || expression.operator === "!=") {
    const leftCode = glslComplex(left);
    const rightCode = glslComplex(right);
    const join = expression.operator === "==" ? "&&" : "||";
    return {
      type,
      code: `((${leftCode}).x ${expression.operator} (${rightCode}).x ${join} (${leftCode}).y ${expression.operator} (${rightCode}).y)`,
    };
  }
  const leftCode = glslComplex(left);
  const rightCode = glslComplex(right);
  if (expression.operator === "+")
    return { type, code: `frmV1Checked(frmV1Add(${leftCode}, ${rightCode}))` };
  if (expression.operator === "-")
    return { type, code: `frmV1Checked(frmV1Sub(${leftCode}, ${rightCode}))` };
  if (expression.operator === "*")
    return { type, code: `frmV1Checked(frmV1Mul(${leftCode}, ${rightCode}))` };
  if (expression.operator === "/")
    return { type, code: `frmV1Checked(frmV1Div(${leftCode}, ${rightCode}))` };
  return {
    type,
    code: `frmV1Checked(frmV1Pow(${leftCode}, ${glslReal(right)}))`,
  };
}
interface GlslEmissionContext {
  nextTemporary: number;
}
function nextTemporary(context: GlslEmissionContext): string {
  const name = `frmV1Temporary${context.nextTemporary}`;
  context.nextTemporary += 1;
  return name;
}
function emitStatements(
  body: FrmLikeV1Statement[],
  values: Readonly<Record<string, FrmLikeV1ValueType>>,
  context: GlslEmissionContext,
  indent = "",
): string {
  return body
    .map((statement) => {
      if (statement.kind === "assignment") {
        const value = compileExpression(statement.value, values);
        const targetType =
          values[statement.target] ?? fail("unsupported-store");
        const code =
          targetType === "boolean" ? glslBoolean(value) : glslComplex(value);
        const temporary = nextTemporary(context);
        const temporaryType = targetType === "boolean" ? "bool" : "vec2";
        return [
          `${indent}if (!frmV1NonFiniteEvent) {`,
          `${indent}  ${temporaryType} ${temporary} = ${code};`,
          `${indent}  if (!frmV1NonFiniteEvent) { ${statement.target} = ${temporary}; }`,
          `${indent}}`,
        ].join("\n");
      }
      if (statement.kind === "component-assignment") {
        const value = compileExpression(statement.value, values);
        const temporary = nextTemporary(context);
        return [
          `${indent}if (!frmV1NonFiniteEvent) {`,
          `${indent}  float ${temporary} = ${glslReal(value)};`,
          `${indent}  if (!frmV1NonFiniteEvent) { ${statement.target}.${statement.component === "real" ? "x" : "y"} = ${temporary}; }`,
          `${indent}}`,
        ].join("\n");
      }
      const branches = [
        `${indent}if (!frmV1NonFiniteEvent && ${glslBoolean(compileExpression(statement.condition, values))}) {`,
        emitStatements(statement.then, values, context, `${indent}  `),
        `${indent}}`,
      ];
      for (const branch of statement.elseIf)
        branches.push(
          ` else if (!frmV1NonFiniteEvent && ${glslBoolean(compileExpression(branch.condition, values))}) {`,
          emitStatements(branch.body, values, context, `${indent}  `),
          `${indent}}`,
        );
      if (statement.else)
        branches.push(
          " else {",
          emitStatements(statement.else, values, context, `${indent}  `),
          `${indent}}`,
        );
      return branches.join("\n");
    })
    .join("\n");
}
function dispatchGlsl(name: string): string {
  const names = FRM_V1_STDLIB_NAMES.filter((name) => unaryStdlib.has(name));
  return [
    `vec2 frmV1Dispatch_${name}(vec2 value) {`,
    ...names.map(
      (functionName, index) =>
        `  if (u_frm_${name} == ${index}) return ${glslFns[functionName]}(value);`,
    ),
    "  frmV1NonFiniteEvent = true;",
    "  return vec2(0.0);",
    "}",
  ].join("\n");
}
function asComplex(value: Value): FrmV1Complex {
  return value.type === "boolean"
    ? { re: value.bool ? 1 : 0, im: 0 }
    : value.complex;
}
function checkedComplex(
  state: FrmLikeV1CpuState,
  input: FrmV1Complex,
): FrmV1Complex {
  const value = q(input);
  if (!frmV1Classify(value).finite) state.terminated = "nonFinite";
  return value;
}
function cpuExpression(
  expression: FrmLikeV1Expression,
  state: FrmLikeV1CpuState,
  types: Readonly<Record<string, FrmLikeV1ValueType>>,
): Value {
  const value = (
    input: FrmV1Complex,
    type: "real" | "complex" = "complex",
  ): Value => ({ type, complex: checkedComplex(state, input) });
  if (expression.kind === "number")
    return value({ re: expression.value, im: 0 }, "real");
  if (expression.kind === "complex")
    return value({ re: expression.real, im: expression.imaginary });
  if (expression.kind === "identifier") {
    const type = types[expression.name] ?? fail("runtime-unknown-identifier");
    if (type === "function") fail("runtime-function-value");
    if (type === "boolean")
      return {
        type: "boolean",
        bool:
          state.booleans[expression.name] ??
          fail("runtime-unknown-boolean-identifier"),
      };
    return value(
      state.values[expression.name] ?? fail("runtime-unknown-identifier"),
      type,
    );
  }
  if (expression.kind === "magnitude") {
    const operand = asComplex(cpuExpression(expression.operand, state, types));
    return value(
      { re: f32(Math.hypot(operand.re, operand.im)), im: 0 },
      "real",
    );
  }
  if (expression.kind === "unary") {
    const operand = cpuExpression(expression.operand, state, types);
    if (expression.operator === "!")
      return { type: "boolean", bool: !bool(operand) };
    const numeric = asComplex(operand);
    return value(
      { re: f32(-numeric.re), im: f32(-numeric.im) },
      operand.type === "complex" ? "complex" : "real",
    );
  }
  if (expression.kind === "call") {
    const args = expression.args.map((argument) =>
      asComplex(cpuExpression(argument, state, types)),
    );
    if (state.terminated) return value({ re: Number.NaN, im: 0 });
    const functionName =
      state.functions[expression.callee] ??
      (stdlib.has(expression.callee)
        ? (expression.callee as FrmV1StdlibName)
        : fail("runtime-unknown-function"));
    const output = standard32Stdlib(functionName, args, state);
    return value(
      output,
      ["real", "imag", "cabs", "atan2"].includes(expression.callee)
        ? "real"
        : "complex",
    );
  }
  const left = cpuExpression(expression.left, state, types);
  if (state.terminated) return left;
  if (expression.operator === "&&") {
    if (!bool(left)) return { type: "boolean", bool: false };
    return {
      type: "boolean",
      bool: bool(cpuExpression(expression.right, state, types)),
    };
  }
  if (expression.operator === "||") {
    if (bool(left)) return { type: "boolean", bool: true };
    return {
      type: "boolean",
      bool: bool(cpuExpression(expression.right, state, types)),
    };
  }
  const right = cpuExpression(expression.right, state, types);
  if (state.terminated) return right;
  const leftComplex = asComplex(left);
  const rightComplex = asComplex(right);
  if (expression.operator === "<")
    return { type: "boolean", bool: leftComplex.re < rightComplex.re };
  if (expression.operator === ">")
    return { type: "boolean", bool: leftComplex.re > rightComplex.re };
  if (expression.operator === "<=")
    return { type: "boolean", bool: leftComplex.re <= rightComplex.re };
  if (expression.operator === ">=")
    return { type: "boolean", bool: leftComplex.re >= rightComplex.re };
  if (expression.operator === "==")
    return {
      type: "boolean",
      bool:
        leftComplex.re === rightComplex.re &&
        leftComplex.im === rightComplex.im,
    };
  if (expression.operator === "!=")
    return {
      type: "boolean",
      bool:
        leftComplex.re !== rightComplex.re ||
        leftComplex.im !== rightComplex.im,
    };
  if (expression.operator === "+")
    return value(s32Add(leftComplex, rightComplex));
  if (expression.operator === "-")
    return value(s32Sub(leftComplex, rightComplex));
  if (expression.operator === "*")
    return value(s32Mul(leftComplex, rightComplex));
  if (expression.operator === "/")
    return value(s32Div(leftComplex, rightComplex));
  if (leftComplex.re === 0 && leftComplex.im === 0)
    return value({ re: 0, im: 0 });
  const logarithm = checkedComplex(
    state,
    standard32Stdlib("log", [leftComplex], state),
  );
  if (state.terminated) return value(logarithm);
  const product = checkedComplex(
    state,
    s32Mul({ re: rightComplex.re, im: 0 }, logarithm),
  );
  if (state.terminated) return value(product);
  return value(standard32Stdlib("exp", [product], state));
}
function finite(state: FrmLikeV1CpuState): boolean {
  return Object.values(state.values).every(
    (value) => frmV1Classify(value).finite,
  );
}
function run(
  body: FrmLikeV1Statement[],
  state: FrmLikeV1CpuState,
  types: Readonly<Record<string, FrmLikeV1ValueType>>,
): void {
  for (const statement of body) {
    if (statement.kind === "if") {
      const condition = cpuExpression(statement.condition, state, types);
      if (state.terminated) return;
      if (bool(condition)) run(statement.then, state, types);
      else {
        let selected = false;
        for (const branch of statement.elseIf) {
          const branchCondition = cpuExpression(branch.condition, state, types);
          if (state.terminated) return;
          if (bool(branchCondition)) {
            run(branch.body, state, types);
            selected = true;
            break;
          }
        }
        if (!selected && statement.else) run(statement.else, state, types);
      }
      if (state.terminated) return;
      continue;
    }
    const evaluated = cpuExpression(statement.value, state, types);
    if (state.terminated) return;
    if (statement.kind === "component-assignment") {
      const old =
        state.values[statement.target] ?? fail("runtime-unknown-store");
      const numeric = asComplex(evaluated);
      state.values[statement.target] = checkedComplex(
        state,
        statement.component === "real"
          ? { re: numeric.re, im: old.im }
          : { re: old.re, im: numeric.re },
      );
    } else if (types[statement.target] === "boolean") {
      state.booleans[statement.target] = bool(evaluated);
    } else {
      state.values[statement.target] = checkedComplex(
        state,
        asComplex(evaluated),
      );
    }
    if (state.terminated || !finite(state)) {
      state.terminated = "nonFinite";
      return;
    }
  }
}
export function compileFrmLikeV1Backend(
  ir: FrmLikeV1Ir,
  options: FrmLikeV1BackendOptions = {},
): FrmLikeV1BackendResult {
  try {
    const requestedGeneratedBytes = options.limits?.maxGeneratedShaderBytes;
    if (
      requestedGeneratedBytes !== undefined &&
      (!Number.isInteger(requestedGeneratedBytes) ||
        requestedGeneratedBytes < 0)
    )
      fail("invalid-safety-limit");
    const maxGeneratedShaderBytes = Math.min(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxGeneratedShaderBytes,
      requestedGeneratedBytes ??
        FRM_LIKE_V1_DEFAULT_LIMITS.maxGeneratedShaderBytes,
    );
    const validated = validateFrmLikeV1Ir(ir);
    if (validated.ok === false) fail(validated.reason);
    ir = validated.ir;
    const values = validate(ir);
    ir = lowerClassicBindings(ir);
    const functionParams = ir.parameters.filter((p) => p.type === "function");
    const functionSelectors = functionParams.map((parameter) => parameter.name);
    const classicBindings = Object.fromEntries(
      ir.parameters.flatMap((parameter) =>
        parameter.classicBinding
          ? [[parameter.classicBinding, parameter.name] as const]
          : [],
      ),
    );
    const functionDefaults: Record<string, FrmV1UnaryFunctionName> = {};
    for (const parameter of functionParams) {
      functionDefaults[parameter.name] =
        parameter.default as FrmV1UnaryFunctionName;
    }
    const declarations = [
      "// FRM-like v1 backend candidate.",
      FRM_V1_GLSL_PRELUDE,
      "bool frmV1Truthy(vec2 value) { return value.x != 0.0; }",
      "vec2 frmV1Pow(vec2 base, float exponent) { if (base.x == 0.0 && base.y == 0.0) return vec2(0.0); return frmV1Checked(frmV1Exp(frmV1Mul(vec2(exponent, 0.0), frmV1Log(base)))); }",
      ...ir.parameters
        .filter((parameter) => parameter.type !== "function")
        .map((parameter) => `uniform vec2 ${parameter.name};`),
      ...functionSelectors.map((name) => `uniform int u_frm_${name};`),
      ...Object.entries(systems)
        .filter(
          ([name, type]) =>
            type !== "function" &&
            !["z", "zPrev", "LastSqr", "pi", "e", "ismand"].includes(name) &&
            !(name in classicBindings),
        )
        .map(([name]) => `uniform vec2 ${name};`),
      "uniform bool ismand;",
      "const vec2 pi = vec2(3.14159265358979323846, 0.0);",
      "const vec2 e = vec2(2.71828182845904523536, 0.0);",
      "vec2 z = vec2(0.0);",
      "vec2 zPrev = vec2(0.0);",
      "vec2 LastSqr = vec2(0.0);",
      ...ir.locals.map((local) =>
        local.type === "boolean"
          ? `bool ${local.name} = false;`
          : `vec2 ${local.name} = vec2(0.0);`,
      ),
      ...functionSelectors.map(dispatchGlsl),
    ].join("\n");
    const emissionContext: GlslEmissionContext = { nextTemporary: 0 };
    const initGlsl = emitStatements(ir.init, values, emissionContext);
    const lastSqrTemporary = nextTemporary(emissionContext);
    const loopGlsl = [
      "if (!frmV1NonFiniteEvent) { zPrev = z; }",
      emitStatements(ir.loop, values, emissionContext),
      "if (!frmV1NonFiniteEvent) {",
      `  vec2 ${lastSqrTemporary} = frmV1Checked(vec2(dot(z, z), 0.0));`,
      `  if (!frmV1NonFiniteEvent) { LastSqr = ${lastSqrTemporary}; }`,
      "}",
    ].join("\n");
    const bailout = compileExpression(ir.bailout, values);
    const continuePredicate = `(!frmV1NonFiniteEvent && ${glslBoolean(bailout)} && !frmV1NonFiniteEvent)`;
    const generatedBytes = new TextEncoder().encode(
      [declarations, initGlsl, loopGlsl, continuePredicate].join("\n"),
    ).byteLength;
    if (generatedBytes > maxGeneratedShaderBytes)
      fail("generated-shader-too-large");
    const result: FrmLikeV1Backend = {
      metadata: {
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        numericProfile: "standard32",
        evaluationOrder: "source-order-left-to-right",
        nonFinite: "terminate-with-event",
      },
      glsl: {
        declarations,
        init: initGlsl,
        loop: loopGlsl,
        continuePredicate,
        eventFlag: "frmV1NonFiniteEvent",
        functionOptions: Object.freeze([...FRM_V1_UNARY_FUNCTION_NAMES]),
        functionDefaults: Object.freeze(functionDefaults),
        classicBindings: Object.freeze(classicBindings),
        generatedBytes,
      },
      cpu: {
        createState(inputs = {}) {
          const parameterNames = new Set(
            ir.parameters.map((parameter) => parameter.name),
          );
          for (const suppliedName of Object.keys(inputs.parameters ?? {}))
            if (!parameterNames.has(suppliedName))
              fail("runtime-unknown-parameter");
          const stateValues: Record<string, FrmV1Complex> = {
            pixel: q(inputs.pixel ?? { re: 0, im: 0 }),
            c: q(inputs.c ?? { re: 0, im: 0 }),
            zPrev: complex(0),
            LastSqr: complex(0),
            pi: complex(Math.PI),
            e: complex(Math.E),
            maxit: complex(inputs.maxit ?? 0),
            p1: complex(0),
            p2: complex(0),
            p3: complex(0),
            p4: complex(0),
            p5: complex(0),
            z: complex(0),
          };
          const functions: Record<string, FrmV1UnaryFunctionName> = {};

          for (const parameter of ir.parameters) {
            const supplied = inputs.parameters?.[parameter.name];
            if (parameter.type === "function") {
              const selection = supplied ?? parameter.default;
              if (typeof selection !== "string" || !unaryStdlib.has(selection))
                fail("runtime-invalid-function-selection");
              functions[parameter.name] = selection as FrmV1UnaryFunctionName;
              if (parameter.classicBinding?.startsWith("fn"))
                functions[parameter.classicBinding] =
                  selection as FrmV1UnaryFunctionName;
              continue;
            }
            const resolved = supplied ?? parameter.default;
            if (parameter.type === "real") {
              if (typeof resolved !== "number" || !Number.isFinite(resolved))
                fail("runtime-invalid-real-parameter");
              if (
                parameter.hardDomain &&
                (resolved < parameter.hardDomain[0] ||
                  resolved > parameter.hardDomain[1])
              )
                fail("runtime-parameter-out-of-domain");
              stateValues[parameter.name] = complex(resolved);
            } else {
              if (
                !Array.isArray(resolved) ||
                resolved.length !== 2 ||
                !resolved.every(
                  (component) =>
                    typeof component === "number" && Number.isFinite(component),
                )
              )
                fail("runtime-invalid-complex-parameter");
              stateValues[parameter.name] = complex([
                resolved[0] as number,
                resolved[1] as number,
              ]);
            }
            if (parameter.classicBinding)
              stateValues[parameter.classicBinding] =
                stateValues[parameter.name];
          }
          const booleans: Record<string, boolean> = {
            ismand: inputs.ismand ?? false,
          };
          for (const local of ir.locals) {
            if (local.type === "boolean") booleans[local.name] = false;
            else stateValues[local.name] = complex(0);
          }
          const state: FrmLikeV1CpuState = {
            values: stateValues,
            functions,
            booleans,
          };
          if (!finite(state)) state.terminated = "nonFinite";
          return state;
        },
        init(state) {
          if (!state.terminated) run(ir.init, state, values);
          return {
            state,
            ...(state.terminated ? { event: state.terminated } : {}),
          };
        },
        step(state) {
          if (!state.terminated) {
            state.values.zPrev = q(state.values.z);
            run(ir.loop, state, values);
            if (!state.terminated)
              state.values.LastSqr = checkedComplex(state, {
                re: f32Add(
                  f32Mul(state.values.z.re, state.values.z.re),
                  f32Mul(state.values.z.im, state.values.z.im),
                ),
                im: 0,
              });
          }
          return {
            state,
            ...(state.terminated ? { event: state.terminated } : {}),
          };
        },
        shouldContinue(state) {
          if (state.terminated || !finite(state))
            return { state, event: "nonFinite" };
          const evaluated = cpuExpression(ir.bailout, state, values);
          if (state.terminated) return { state, event: "nonFinite" };
          return { state, continue: bool(evaluated) };
        },
      },
    };
    return { ok: true, backend: result };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unsupported-ir",
    };
  }
}
