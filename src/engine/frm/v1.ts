/** Browser-safe, isolated FRM-like v1 semantic front end. */

import {
  FRM_V1_STDLIB_NAMES,
  FRM_V1_UNARY_FUNCTION_NAMES,
} from "./frm-v1-stdlib";

export type FrmLikeV1ValueType = "real" | "complex" | "function" | "boolean";
export type FrmLikeV1ParameterType = Extract<
  FrmLikeV1ValueType,
  "real" | "complex" | "function"
>;
export type FrmLikeV1ClassicBinding =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "fn1"
  | "fn2"
  | "fn3"
  | "fn4";
export type FrmLikeV1Expression =
  | { kind: "number"; value: number }
  | { kind: "complex"; real: number; imaginary: number }
  | { kind: "identifier"; name: string }
  | { kind: "call"; callee: string; args: FrmLikeV1Expression[] }
  | { kind: "unary"; operator: "-" | "!"; operand: FrmLikeV1Expression }
  | { kind: "magnitude"; operand: FrmLikeV1Expression }
  | {
      kind: "binary";
      operator: string;
      left: FrmLikeV1Expression;
      right: FrmLikeV1Expression;
    };
export type FrmLikeV1Statement =
  | { kind: "assignment"; target: string; value: FrmLikeV1Expression }
  | {
      kind: "component-assignment";
      component: "real" | "imag";
      target: string;
      value: FrmLikeV1Expression;
    }
  | {
      kind: "if";
      condition: FrmLikeV1Expression;
      then: FrmLikeV1Statement[];
      elseIf: { condition: FrmLikeV1Expression; body: FrmLikeV1Statement[] }[];
      else?: FrmLikeV1Statement[];
    };
export interface FrmLikeV1Parameter {
  name: string;
  type: FrmLikeV1ParameterType;
  default: number | readonly [number, number] | string;
  hardDomain?: readonly [number, number];
  classicBinding?: FrmLikeV1ClassicBinding;
}
export interface FrmLikeV1Ir {
  languageVersion: "frm-like/1";
  stdlibVersion: 1;
  numericProfile: "standard32";
  formulaName: string;
  parameters: FrmLikeV1Parameter[];
  locals: { name: string; type: FrmLikeV1ValueType }[];
  evaluationOrder: "source-order-left-to-right";
  init: FrmLikeV1Statement[];
  loop: FrmLikeV1Statement[];
  bailout: FrmLikeV1Expression;
}
export interface FrmLikeV1SafetyLimits {
  maxSourceBytes: number;
  maxGeneratedShaderBytes: number;
  maxParameters: number;
  maxLocals: number;
  maxAstNodes: number;
  maxExpressionDepth: number;
  maxStatements: number;
  maxControlFlowNodes: number;
  maxControlFlowDepth: number;
}
export const FRM_LIKE_V1_DEFAULT_LIMITS: Readonly<FrmLikeV1SafetyLimits> =
  Object.freeze({
    maxSourceBytes: 65_536,
    maxGeneratedShaderBytes: 262_144,
    maxParameters: 64,
    maxLocals: 256,
    maxAstNodes: 4_096,
    maxExpressionDepth: 64,
    maxStatements: 1_024,
    maxControlFlowNodes: 128,
    maxControlFlowDepth: 16,
  });
export const FRM_LIKE_V1_NUMERIC_PROFILE = Object.freeze({
  id: "standard32" as const,
  storage: "ieee-754-binary32",
  arithmetic: "ieee-754-binary32",
  reassociation: false,
  evaluationOrder: "source-order-left-to-right" as const,
});
export interface FrmLikeV1Options {
  stdlibNames?: ReadonlySet<string>;
  limits?: Partial<FrmLikeV1SafetyLimits>;
}
export interface FrmLikeV1ParseSuccess {
  ok: true;
  source: string;
  ir: FrmLikeV1Ir;
}
export interface FrmLikeV1ParseFailure {
  ok: false;
  reason: string;
  line?: number;
  column?: number;
}
export type FrmLikeV1ParseResult =
  | FrmLikeV1ParseSuccess
  | FrmLikeV1ParseFailure;

const identifiers = /^[A-Za-z_][A-Za-z0-9_]*$/;
const realLiteral = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;
const sections = new Set(["parameters", "init", "loop", "bailout"]);
const keywords = new Set([
  "parameters",
  "init",
  "loop",
  "bailout",
  "if",
  "elseif",
  "else",
  "endif",
  "real",
  "complex",
  "function",
  "domain",
  "classic",
]);
const systemInputs = new Map<string, FrmLikeV1ValueType>([
  ["pixel", "complex"],
  ["c", "complex"],
  ["zPrev", "complex"],
  ["LastSqr", "real"],
  ["pi", "real"],
  ["e", "real"],
  ["maxit", "real"],
  ["ismand", "boolean"],
  ["p1", "complex"],
  ["p2", "complex"],
  ["p3", "complex"],
  ["p4", "complex"],
  ["p5", "complex"],
  ["fn1", "function"],
  ["fn2", "function"],
  ["fn3", "function"],
  ["fn4", "function"],
]);
const writableSystem = new Map<string, FrmLikeV1ValueType>([["z", "complex"]]);
const standardStdlib = new Set<string>(FRM_V1_STDLIB_NAMES);
const unaryFunctionNames = new Set<string>(FRM_V1_UNARY_FUNCTION_NAMES);
const classicBindings = new Set<FrmLikeV1ClassicBinding>([
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "fn1",
  "fn2",
  "fn3",
  "fn4",
]);
const directiveNames = new Set(["language", "stdlib", "numeric-profile"]);
const binaryPrecedence: Readonly<Record<string, number>> = Object.freeze({
  "||": 1,
  "&&": 2,
  "<": 3,
  ">": 3,
  "<=": 3,
  ">=": 3,
  "==": 3,
  "!=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "^": 6,
});

type Line = { text: string; number: number };
type Token = { value: string; column: number };
class Failure extends Error {
  constructor(
    readonly reason: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(reason);
  }
}
function fail(reason: string, line?: number, column?: number): never {
  throw new Failure(reason, line, column);
}
function assertValidUnicodeSource(source: string): void {
  for (let index = 0; index < source.length; index++) {
    const unit = source.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) fail("invalid-unicode-source");
      index++;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) fail("invalid-unicode-source");
  }
}
function resolveSafetyLimits(
  overrides: Partial<FrmLikeV1SafetyLimits> | undefined,
): FrmLikeV1SafetyLimits {
  const resolved = { ...FRM_LIKE_V1_DEFAULT_LIMITS };
  for (const key of Object.keys(resolved) as Array<
    keyof FrmLikeV1SafetyLimits
  >) {
    const requested = overrides?.[key];
    if (requested === undefined) continue;
    if (!Number.isSafeInteger(requested) || requested < 0)
      fail("invalid-safety-limit");
    resolved[key] = Math.min(resolved[key], requested);
  }
  return resolved;
}
function finiteReal(raw: string, line: number): number {
  if (!realLiteral.test(raw.trim())) fail("invalid-real-literal", line);
  const value = Number(raw);
  if (!Number.isFinite(value)) fail("invalid-real-literal", line);
  return Object.is(value, -0) ? 0 : value;
}
function forbiddenName(name: string, stdlib: ReadonlySet<string>): boolean {
  return (
    systemInputs.has(name) ||
    writableSystem.has(name) ||
    sections.has(name) ||
    keywords.has(name) ||
    stdlib.has(name)
  );
}
function stripLine(raw: string, number: number, preamble: boolean): string {
  if (/^[ \t]*;/.test(raw)) return "";
  const comment = /[ \t]+;/.exec(raw);
  const text = comment ? raw.slice(0, comment.index) : raw;
  if (text.includes(";"))
    fail("residual-semicolon", number, text.indexOf(";") + 1);
  if (!preamble && /^[ \t]*;[ \t]*@/.test(raw))
    fail("misplaced-semantic-directive", number);
  return text.trimEnd();
}
function lexExpression(text: string, line: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/[ \t]/.test(c)) {
      i++;
      continue;
    }
    const column = i + 1;
    if (/[A-Za-z_]/.test(c)) {
      let end = i + 1;
      while (/[A-Za-z0-9_]/.test(text[end] ?? "")) end++;
      tokens.push({ value: text.slice(i, end), column });
      i = end;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      const match = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
        text.slice(i),
      );
      if (!match) fail("invalid-expression-token", line, column);
      tokens.push({ value: match[0], column });
      i += match[0].length;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      tokens.push({ value: two, column });
      i += 2;
      continue;
    }
    if ("+-*/^()|,<>!".includes(c)) {
      tokens.push({ value: c, column });
      i++;
      continue;
    }
    fail("unsupported-punctuation", line, column);
  }
  return tokens;
}
class ExpressionParser {
  private index = 0;
  private readonly depths = new WeakMap<object, number>();
  constructor(
    private readonly tokens: Token[],
    private readonly line: number,
    private readonly limits: FrmLikeV1SafetyLimits,
    private readonly counter: Counter,
  ) {}
  parse(): FrmLikeV1Expression {
    const expression = this.binary(0, 1);
    if (this.peek())
      fail("trailing-expression-tokens", this.line, this.peek()!.column);
    return expression;
  }
  private peek() {
    return this.tokens[this.index];
  }
  private take() {
    return this.tokens[this.index++];
  }
  private binary(min: number, depth: number): FrmLikeV1Expression {
    this.ensureDepth(depth);
    let left = this.unary(depth);
    while (true) {
      const op = this.peek()?.value;
      const level = op ? binaryPrecedence[op] : undefined;
      if (level === undefined || level < min) break;
      this.take();
      const right = this.binary(op === "^" ? level : level + 1, depth + 1);
      left = this.node({ kind: "binary", operator: op!, left, right }, depth);
    }
    return left;
  }
  private unary(depth: number): FrmLikeV1Expression {
    this.ensureDepth(depth);
    const token = this.peek();
    if (!token) fail("missing-expression", this.line);
    if (token.value === "-" || token.value === "!") {
      this.take();
      return this.node(
        {
          kind: "unary",
          operator: token.value,
          operand: this.unary(depth + 1),
        },
        depth,
      );
    }
    if (token.value === "|") {
      this.take();
      const operand = this.binary(0, depth + 1);
      if (this.take()?.value !== "|")
        fail("unclosed-magnitude", this.line, token.column);
      return this.node({ kind: "magnitude", operand }, depth);
    }
    return this.primary(depth);
  }
  private primary(depth: number): FrmLikeV1Expression {
    this.ensureDepth(depth);
    const token = this.take();
    if (!token) fail("missing-expression", this.line);
    if (realLiteral.test(token.value)) {
      return this.node(
        { kind: "number", value: finiteReal(token.value, this.line) },
        depth,
      );
    }
    if (identifiers.test(token.value)) {
      if (this.peek()?.value === "(") {
        this.take();
        const args: FrmLikeV1Expression[] = [];
        if (this.peek()?.value !== ")") {
          do {
            args.push(this.binary(0, depth + 1));
            if (this.peek()?.value !== ",") break;
            this.take();
          } while (true);
        }
        if (this.take()?.value !== ")")
          fail("unclosed-call", this.line, token.column);
        return this.node({ kind: "call", callee: token.value, args }, depth);
      }
      return this.node({ kind: "identifier", name: token.value }, depth);
    }
    if (token.value === "(") {
      const checkpoint = this.index;
      const real = this.takeSignedNumber();
      if (real !== undefined && this.peek()?.value === ",") {
        this.take();
        const imaginary = this.takeSignedNumber();
        if (imaginary === undefined || this.take()?.value !== ")")
          fail("invalid-complex-literal", this.line, token.column);
        return this.node({ kind: "complex", real, imaginary }, depth);
      }
      this.index = checkpoint;
      const first = this.binary(0, depth + 1);
      if (this.peek()?.value === ",") {
        fail("invalid-complex-literal", this.line, token.column);
      }
      if (this.take()?.value !== ")")
        fail("unclosed-parenthesis", this.line, token.column);
      return first;
    }
    fail("invalid-expression-token", this.line, token.column);
  }
  private takeSignedNumber(): number | undefined {
    const checkpoint = this.index;
    let sign = "";
    if (this.peek()?.value === "-") {
      sign = "-";
      this.take();
    }
    const token = this.peek();
    if (!token || !realLiteral.test(token.value)) {
      this.index = checkpoint;
      return undefined;
    }
    this.take();
    return finiteReal(`${sign}${token.value}`, this.line);
  }
  private node<T extends FrmLikeV1Expression>(node: T, depth: number): T {
    this.ensureDepth(depth);
    const children =
      node.kind === "binary"
        ? [node.left, node.right]
        : node.kind === "unary" || node.kind === "magnitude"
          ? [node.operand]
          : node.kind === "call"
            ? node.args
            : [];
    const structuralDepth =
      1 + Math.max(0, ...children.map((child) => this.depths.get(child) ?? 1));
    if (structuralDepth > this.limits.maxExpressionDepth)
      fail("expression-depth-exceeded", this.line);
    this.depths.set(node, structuralDepth);
    this.counter.nodes++;
    if (this.counter.nodes > this.limits.maxAstNodes)
      fail("ast-node-limit-exceeded", this.line);
    return node;
  }
  private ensureDepth(depth: number): void {
    if (depth > this.limits.maxExpressionDepth)
      fail("expression-depth-exceeded", this.line);
  }
}
type Counter = { nodes: number; statements: number; controls: number };
function parseExpression(
  text: string,
  line: number,
  limits: FrmLikeV1SafetyLimits,
  counter: Counter,
) {
  return new ExpressionParser(
    lexExpression(text, line),
    line,
    limits,
    counter,
  ).parse();
}
function parseParameter(
  text: string,
  line: number,
  reservedNames: ReadonlySet<string>,
  callableStdlib: ReadonlySet<string>,
): FrmLikeV1Parameter {
  const match =
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(real|complex|function)\s*=\s*(.*?)\s*$/.exec(
      text,
    );
  if (!match) fail("invalid-parameter-declaration", line);
  const [, name, type, tail] = match;
  if (forbiddenName(name, reservedNames)) fail("reserved-name", line);
  const bindingMatch = /\s+classic\s+(p[1-5]|fn[1-4])\s*$/.exec(tail);
  const withoutBinding = bindingMatch
    ? tail.slice(0, bindingMatch.index).trimEnd()
    : tail;
  const domainMatch = /\s+domain\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]\s*$/.exec(
    withoutBinding,
  );
  const rawDefault = (
    domainMatch ? withoutBinding.slice(0, domainMatch.index) : withoutBinding
  ).trim();
  if (type === "real") {
    const value = finiteReal(rawDefault, line);
    let hardDomain: readonly [number, number] | undefined;
    if (domainMatch) {
      const min = finiteReal(domainMatch[1], line);
      const max = finiteReal(domainMatch[2], line);
      if (min > max) fail("invalid-domain", line);
      if (value < min || value > max) fail("default-out-of-domain", line);
      hardDomain = [min, max];
    }
    if (bindingMatch?.[1]?.startsWith("fn"))
      fail("invalid-classic-binding", line);
    return {
      name,
      type: type as FrmLikeV1ParameterType,
      default: value,
      ...(hardDomain ? { hardDomain } : {}),
      ...(bindingMatch
        ? { classicBinding: bindingMatch[1] as FrmLikeV1ClassicBinding }
        : {}),
    };
  }
  if (type === "complex") {
    if (domainMatch) fail("complex-domain-not-supported", line);
    const complex = /^\(\s*(.*?)\s*,\s*(.*?)\s*\)$/.exec(rawDefault);
    if (!complex) fail("invalid-complex-default", line);
    if (bindingMatch?.[1]?.startsWith("fn"))
      fail("invalid-classic-binding", line);
    return {
      name,
      type: type as FrmLikeV1ParameterType,
      default: [finiteReal(complex[1], line), finiteReal(complex[2], line)],
      ...(bindingMatch
        ? { classicBinding: bindingMatch[1] as FrmLikeV1ClassicBinding }
        : {}),
    };
  }
  if (domainMatch) fail("function-domain-not-supported", line);
  if (!callableStdlib.has(rawDefault)) fail("unknown-stdlib-function", line);
  if (bindingMatch && !bindingMatch[1].startsWith("fn"))
    fail("invalid-classic-binding", line);
  return {
    name,
    type: type as FrmLikeV1ParameterType,
    default: rawDefault,
    ...(bindingMatch
      ? { classicBinding: bindingMatch[1] as FrmLikeV1ClassicBinding }
      : {}),
  };
}
function formatNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("non-finite IR value");
  return Object.is(value, -0) ? "0" : String(value);
}
function formatExpression(expression: FrmLikeV1Expression, parent = 0): string {
  switch (expression.kind) {
    case "number":
      return formatNumber(expression.value);
    case "complex":
      return `(${formatNumber(expression.real)}, ${formatNumber(expression.imaginary)})`;
    case "identifier":
      return expression.name;
    case "call":
      return `${expression.callee}(${expression.args.map((arg) => formatExpression(arg)).join(", ")})`;
    case "unary":
      return `${expression.operator}${formatExpression(expression.operand, 7)}`;
    case "magnitude": {
      const operand = formatExpression(expression.operand);
      return expression.operand.kind === "magnitude"
        ? `|(${operand})|`
        : `|${operand}|`;
    }
    case "binary": {
      const current = binaryPrecedence[expression.operator];
      const left = formatExpression(
        expression.left,
        expression.operator === "^" ? current + 1 : current,
      );
      const right = formatExpression(
        expression.right,
        expression.operator === "^" ? current : current + 1,
      );
      const value = `${left} ${expression.operator} ${right}`;
      return current < parent ? `(${value})` : value;
    }
  }
}
function formatStatements(
  statements: FrmLikeV1Statement[],
  indent: string,
): string[] {
  const lines: string[] = [];
  for (const statement of statements) {
    if (statement.kind === "assignment")
      lines.push(
        `${indent}${statement.target} = ${formatExpression(statement.value)}`,
      );
    else if (statement.kind === "component-assignment")
      lines.push(
        `${indent}${statement.component}(${statement.target}) = ${formatExpression(statement.value)}`,
      );
    else {
      lines.push(
        `${indent}if ${formatExpression(statement.condition)}`,
        ...formatStatements(statement.then, `${indent}  `),
      );
      for (const branch of statement.elseIf)
        lines.push(
          `${indent}elseif ${formatExpression(branch.condition)}`,
          ...formatStatements(branch.body, `${indent}  `),
        );
      if (statement.else)
        lines.push(
          `${indent}else`,
          ...formatStatements(statement.else, `${indent}  `),
        );
      lines.push(`${indent}endif`);
    }
  }
  return lines;
}
export function canonicalizeFrmLikeV1(ir: FrmLikeV1Ir): string {
  const lines = [
    "; @language: frm-like/1",
    "; @stdlib: 1",
    "; @numeric-profile: standard32",
    `${ir.formulaName} {`,
  ];
  if (ir.parameters.length) {
    lines.push("  parameters:");
    for (const parameter of ir.parameters) {
      let text = `    ${parameter.name}: ${parameter.type} = `;
      text +=
        parameter.type === "real"
          ? formatNumber(parameter.default as number)
          : parameter.type === "complex"
            ? `(${formatNumber((parameter.default as readonly [number, number])[0])}, ${formatNumber((parameter.default as readonly [number, number])[1])})`
            : parameter.default;
      if (parameter.hardDomain)
        text += ` domain [${formatNumber(parameter.hardDomain[0])}, ${formatNumber(parameter.hardDomain[1])}]`;
      if (parameter.classicBinding)
        text += ` classic ${parameter.classicBinding}`;
      lines.push(text);
    }
  }
  lines.push(
    "  init:",
    ...formatStatements(ir.init, "    "),
    "  loop:",
    ...formatStatements(ir.loop, "    "),
    "  bailout:",
    `    ${formatExpression(ir.bailout)}`,
    "}",
  );
  return lines.join("\n");
}
interface SemanticEncodingContext {
  nodes: number;
  statements: number;
  readonly active: WeakSet<object>;
}
function canonicalNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail("invalid-semantic-ir");
  return Object.is(value, -0) ? 0 : value;
}
function canonicalIdentifier(value: unknown): string {
  if (typeof value !== "string" || !identifiers.test(value))
    fail("invalid-semantic-ir");
  return value;
}
function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function encodeExpression(
  expression: FrmLikeV1Expression,
  context: SemanticEncodingContext,
  depth = 1,
): unknown {
  if (
    !expression ||
    typeof expression !== "object" ||
    depth > FRM_LIKE_V1_DEFAULT_LIMITS.maxExpressionDepth ||
    context.active.has(expression)
  )
    fail("invalid-semantic-ir");
  context.nodes++;
  if (context.nodes > FRM_LIKE_V1_DEFAULT_LIMITS.maxAstNodes)
    fail("invalid-semantic-ir");
  context.active.add(expression);
  try {
    switch (expression.kind) {
      case "number":
        return { kind: "number", value: canonicalNumber(expression.value) };
      case "complex":
        return {
          kind: "complex",
          real: canonicalNumber(expression.real),
          imaginary: canonicalNumber(expression.imaginary),
        };
      case "identifier":
        return {
          kind: "identifier",
          name: canonicalIdentifier(expression.name),
        };
      case "call":
        if (!Array.isArray(expression.args)) fail("invalid-semantic-ir");
        return {
          kind: "call",
          callee: canonicalIdentifier(expression.callee),
          args: expression.args.map((argument) =>
            encodeExpression(argument, context, depth + 1),
          ),
        };
      case "unary":
        if (expression.operator !== "-" && expression.operator !== "!")
          fail("invalid-semantic-ir");
        return {
          kind: "unary",
          operator: expression.operator,
          operand: encodeExpression(expression.operand, context, depth + 1),
        };
      case "magnitude":
        return {
          kind: "magnitude",
          operand: encodeExpression(expression.operand, context, depth + 1),
        };
      case "binary":
        if (!(expression.operator in binaryPrecedence))
          fail("invalid-semantic-ir");
        return {
          kind: "binary",
          operator: expression.operator,
          left: encodeExpression(expression.left, context, depth + 1),
          right: encodeExpression(expression.right, context, depth + 1),
        };
      default:
        fail("invalid-semantic-ir");
    }
  } finally {
    context.active.delete(expression);
  }
}
function encodeStatements(
  statements: readonly FrmLikeV1Statement[],
  context: SemanticEncodingContext,
  controlDepth = 0,
): unknown[] {
  if (
    !Array.isArray(statements) ||
    controlDepth > FRM_LIKE_V1_DEFAULT_LIMITS.maxControlFlowDepth
  )
    fail("invalid-semantic-ir");
  return statements.map((statement) => {
    context.statements++;
    if (context.statements > FRM_LIKE_V1_DEFAULT_LIMITS.maxStatements)
      fail("invalid-semantic-ir");
    if (!statement || typeof statement !== "object")
      fail("invalid-semantic-ir");
    switch (statement.kind) {
      case "assignment":
        return {
          kind: "assignment",
          target: canonicalIdentifier(statement.target),
          value: encodeExpression(statement.value, context),
        };
      case "component-assignment":
        if (statement.component !== "real" && statement.component !== "imag")
          fail("invalid-semantic-ir");
        return {
          kind: "component-assignment",
          component: statement.component,
          target: canonicalIdentifier(statement.target),
          value: encodeExpression(statement.value, context),
        };
      case "if":
        if (!Array.isArray(statement.elseIf)) fail("invalid-semantic-ir");
        return {
          kind: "if",
          condition: encodeExpression(statement.condition, context),
          then: encodeStatements(statement.then, context, controlDepth + 1),
          elseIf: statement.elseIf.map(
            (branch: (typeof statement.elseIf)[number]) => ({
              condition: encodeExpression(branch.condition, context),
              body: encodeStatements(branch.body, context, controlDepth + 1),
            }),
          ),
          ...(statement.else
            ? {
                else: encodeStatements(
                  statement.else,
                  context,
                  controlDepth + 1,
                ),
              }
            : {}),
        };
      default:
        fail("invalid-semantic-ir");
    }
  });
}
function encodeParameter(parameter: FrmLikeV1Parameter): unknown {
  const name = canonicalIdentifier(parameter.name);
  if (forbiddenName(name, standardStdlib)) fail("invalid-semantic-ir");
  const classicBinding = parameter.classicBinding;
  if (classicBinding && !classicBindings.has(classicBinding))
    fail("invalid-semantic-ir");
  const domain = parameter.hardDomain;
  if (
    domain &&
    (!Array.isArray(domain) ||
      domain.length !== 2 ||
      canonicalNumber(domain[0]) > canonicalNumber(domain[1]))
  )
    fail("invalid-semantic-ir");
  if (parameter.type === "real") {
    if (classicBinding?.startsWith("fn")) fail("invalid-semantic-ir");
    const value = canonicalNumber(parameter.default);
    if (domain && (value < domain[0] || value > domain[1]))
      fail("invalid-semantic-ir");
    return {
      name,
      type: "real",
      default: value,
      ...(domain
        ? {
            hardDomain: [
              canonicalNumber(domain[0]),
              canonicalNumber(domain[1]),
            ],
          }
        : {}),
      ...(classicBinding ? { classicBinding } : {}),
    };
  }
  if (parameter.type === "complex") {
    if (classicBinding?.startsWith("fn")) fail("invalid-semantic-ir");
    if (
      !Array.isArray(parameter.default) ||
      parameter.default.length !== 2 ||
      domain
    )
      fail("invalid-semantic-ir");
    return {
      name,
      type: "complex",
      default: [
        canonicalNumber(parameter.default[0]),
        canonicalNumber(parameter.default[1]),
      ],
      ...(classicBinding ? { classicBinding } : {}),
    };
  }
  if (
    parameter.type !== "function" ||
    typeof parameter.default !== "string" ||
    !unaryFunctionNames.has(parameter.default) ||
    domain ||
    (classicBinding && !classicBinding.startsWith("fn"))
  )
    fail("invalid-semantic-ir");
  return {
    name,
    type: "function",
    default: parameter.default,
    ...(classicBinding ? { classicBinding } : {}),
  };
}
function semanticProjection(ir: FrmLikeV1Ir) {
  if (
    !ir ||
    typeof ir !== "object" ||
    ir.languageVersion !== "frm-like/1" ||
    ir.stdlibVersion !== 1 ||
    ir.numericProfile !== "standard32" ||
    ir.evaluationOrder !== "source-order-left-to-right" ||
    !Array.isArray(ir.parameters) ||
    !Array.isArray(ir.locals)
  )
    fail("invalid-semantic-ir");
  const formulaName = canonicalIdentifier(ir.formulaName);
  if (forbiddenName(formulaName, standardStdlib)) fail("invalid-semantic-ir");
  if (ir.parameters.length > FRM_LIKE_V1_DEFAULT_LIMITS.maxParameters)
    fail("invalid-semantic-ir");
  if (ir.locals.length > FRM_LIKE_V1_DEFAULT_LIMITS.maxLocals)
    fail("invalid-semantic-ir");
  const parameters = ir.parameters
    .map(encodeParameter)
    .sort((left, right) =>
      compareAscii(
        String((left as { name: string }).name),
        String((right as { name: string }).name),
      ),
    );
  const seenNames = new Set<string>();
  const seenBindings = new Set<string>();
  for (const parameter of parameters) {
    const name = (parameter as { name: string }).name;
    if (seenNames.has(name)) fail("invalid-semantic-ir");
    seenNames.add(name);
    const binding = (parameter as { classicBinding?: string }).classicBinding;
    if (binding && seenBindings.has(binding)) fail("invalid-semantic-ir");
    if (binding) seenBindings.add(binding);
  }
  const locals = ir.locals
    .map((local) => {
      const name = canonicalIdentifier(local.name);
      if (forbiddenName(name, standardStdlib)) fail("invalid-semantic-ir");
      if (!["real", "complex", "boolean"].includes(local.type))
        fail("invalid-semantic-ir");
      if (seenNames.has(name)) fail("invalid-semantic-ir");
      seenNames.add(name);
      return { name, type: local.type };
    })
    .sort((left, right) => compareAscii(left.name, right.name));
  const context: SemanticEncodingContext = {
    nodes: 0,
    statements: 0,
    active: new WeakSet(),
  };
  return {
    format: "frm-like/1-semantic-ir/1",
    languageVersion: ir.languageVersion,
    stdlibVersion: ir.stdlibVersion,
    numericProfile: ir.numericProfile,
    evaluationOrder: ir.evaluationOrder,
    parameters,
    locals,
    init: encodeStatements(ir.init, context),
    loop: encodeStatements(ir.loop, context),
    bailout: encodeExpression(ir.bailout, context),
  };
}
function semanticSerialization(ir: FrmLikeV1Ir) {
  return JSON.stringify(semanticProjection(ir));
}
export function validateFrmLikeV1Ir(ir: FrmLikeV1Ir): FrmLikeV1ParseResult {
  try {
    const semantic = semanticSerialization(ir);
    const canonicalSource = canonicalizeFrmLikeV1(ir);
    const reparsed = parseFrmLikeV1(canonicalSource);
    if (reparsed.ok === false) return reparsed;
    if (
      reparsed.ir.formulaName !== ir.formulaName ||
      semanticSerialization(reparsed.ir) !== semantic
    )
      fail("invalid-semantic-ir");
    return reparsed;
  } catch (error) {
    return error instanceof Failure
      ? {
          ok: false,
          reason: error.reason,
          line: error.line,
          column: error.column,
        }
      : { ok: false, reason: "invalid-semantic-ir" };
  }
}
async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("Web Crypto SubtleCrypto is required");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashFrmLikeV1(
  source: string,
  ir: FrmLikeV1Ir,
): Promise<{ sourceRevision: string; semanticHash: string }> {
  assertValidUnicodeSource(source);
  const validated = validateFrmLikeV1Ir(ir);
  if (validated.ok === false) fail(validated.reason);
  const semantic = semanticSerialization(validated.ir);
  const parsed = parseFrmLikeV1(source);
  if (parsed.ok === false) fail(`invalid-hash-source:${parsed.reason}`);
  if (
    parsed.ir.formulaName !== validated.ir.formulaName ||
    semanticSerialization(parsed.ir) !== semantic
  )
    fail("source-ir-mismatch");
  return {
    sourceRevision: await sha256(source),
    semanticHash: await sha256(semantic),
  };
}

export function parseFrmLikeV1(
  source: string,
  options: FrmLikeV1Options = {},
): FrmLikeV1ParseResult {
  try {
    assertValidUnicodeSource(source);
    const limits = resolveSafetyLimits(options.limits);
    if (new TextEncoder().encode(source).byteLength > limits.maxSourceBytes)
      fail("source-too-large");
    const reservedNames = new Set([
      ...standardStdlib,
      ...(options.stdlibNames ?? []),
    ]);
    const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
    const directives = new Map<string, string>();
    let index = 0;
    while (index < rawLines.length) {
      const raw = rawLines[index];
      if (raw.trim() === "") {
        index++;
        continue;
      }
      if (!/^[ \t]*;/.test(raw)) break;
      const directive = /^[ \t]*;[ \t]*@([a-z-]+)\s*:\s*(.*?)\s*$/.exec(raw);
      if (directive) {
        if (!directiveNames.has(directive[1]))
          fail("unknown-semantic-directive", index + 1);
        if (directives.has(directive[1]))
          fail("duplicate-semantic-directive", index + 1);
        directives.set(directive[1], directive[2]);
      }
      index++;
    }
    if (
      directives.get("language") !== "frm-like/1" ||
      directives.get("stdlib") !== "1" ||
      directives.get("numeric-profile") !== "standard32" ||
      directives.size !== 3
    )
      fail("invalid-semantic-directives");
    const header = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*$/.exec(
      rawLines[index] ?? "",
    );
    if (!header) fail("invalid-formula-header", index + 1);
    const formulaName = header[1];
    if (forbiddenName(formulaName, reservedNames))
      fail("reserved-name", index + 1);
    index++;
    const lines: Line[] = [];
    let closed = false;
    for (; index < rawLines.length; index++) {
      const raw = rawLines[index];
      if (/^[ \t]*;[ \t]*@/.test(raw))
        fail("misplaced-semantic-directive", index + 1);
      const text = stripLine(raw, index + 1, false);
      if (text.trim() === "}") {
        closed = true;
        index++;
        break;
      }
      lines.push({ text, number: index + 1 });
    }
    if (!closed) fail("missing-formula-close");
    for (; index < rawLines.length; index++) {
      if (/^[ \t]*;[ \t]*@/.test(rawLines[index]))
        fail("misplaced-semantic-directive", index + 1);
      const text = stripLine(rawLines[index], index + 1, false);
      if (text.trim()) fail("trailing-executable-tokens", index + 1);
    }
    const parameterLines: Line[] = [];
    const sectionsBody: Record<"init" | "loop" | "bailout", Line[]> = {
      init: [],
      loop: [],
      bailout: [],
    };
    let section: "parameters" | "init" | "loop" | "bailout" | undefined;
    const seenSections = new Set<string>();
    let order = -1;
    const sectionOrder = { parameters: 0, init: 1, loop: 2, bailout: 3 };
    for (const line of lines) {
      const text = line.text.trim();
      if (!text) continue;
      const sectionMatch = /^(parameters|init|loop|bailout)\s*:\s*$/.exec(text);
      if (sectionMatch) {
        const next = sectionMatch[1] as keyof typeof sectionOrder;
        if (sectionOrder[next] <= order)
          fail(
            order === sectionOrder[next]
              ? "duplicate-section"
              : "invalid-section-order",
            line.number,
          );
        seenSections.add(next);
        section = next;
        order = sectionOrder[next];
        continue;
      }
      if (!section) fail("statement-before-section", line.number);
      if (section === "parameters") parameterLines.push(line);
      else sectionsBody[section].push(line);
    }
    if (!seenSections.has("init")) fail("missing-init-section");
    if (!seenSections.has("loop")) fail("missing-loop-section");
    if (!seenSections.has("bailout") || sectionsBody.bailout.length !== 1)
      fail(
        sectionsBody.bailout.length === 0
          ? "missing-bailout"
          : "invalid-bailout-section",
      );
    const parameters: FrmLikeV1Parameter[] = [];
    const parameterNames = new Set<string>();
    const bindings = new Set<string>();
    for (const line of parameterLines) {
      const parameter = parseParameter(
        line.text,
        line.number,
        reservedNames,
        unaryFunctionNames,
      );
      if (parameterNames.has(parameter.name))
        fail("duplicate-parameter", line.number);
      if (parameter.classicBinding && bindings.has(parameter.classicBinding))
        fail("duplicate-classic-binding", line.number);
      parameterNames.add(parameter.name);
      if (parameter.classicBinding) bindings.add(parameter.classicBinding);
      parameters.push(parameter);
      if (parameters.length > limits.maxParameters)
        fail("parameter-limit-exceeded", line.number);
    }
    const counter: Counter = { nodes: 0, statements: 0, controls: 0 };
    const mappedFunctionSlots = new Set(
      parameters
        .map((parameter) => parameter.classicBinding)
        .filter(
          (binding): binding is FrmLikeV1ClassicBinding =>
            typeof binding === "string" && binding.startsWith("fn"),
        ),
    );
    const locals = new Map<string, FrmLikeV1ValueType>();
    const values = new Map<string, FrmLikeV1ValueType>([
      ...systemInputs,
      ...writableSystem,
      ...parameters.map(
        (parameter) => [parameter.name, parameter.type] as const,
      ),
    ]);
    const realReturningFunctions = new Set(["real", "imag", "cabs", "atan2"]);
    const analyzeExpression = (
      expression: FrmLikeV1Expression,
      line: number,
      definite: ReadonlySet<string>,
    ): FrmLikeV1ValueType => {
      switch (expression.kind) {
        case "number":
          return "real";
        case "complex":
          return "complex";
        case "identifier": {
          const type = values.get(expression.name);
          if (!type) fail("undeclared-read", line);
          if (locals.has(expression.name) && !definite.has(expression.name))
            fail("possibly-uninitialized-read", line);
          return type;
        }
        case "call": {
          if (
            /^fn[1-4]$/.test(expression.callee) &&
            !mappedFunctionSlots.has(
              expression.callee as FrmLikeV1ClassicBinding,
            )
          )
            fail("unmapped-function-slot", line);
          const type = values.get(expression.callee);
          if (type !== "function" && !standardStdlib.has(expression.callee))
            fail("unknown-function", line);
          const expectedArity = expression.callee === "atan2" ? 2 : 1;
          if (expression.args.length !== expectedArity)
            fail("invalid-function-arity", line);
          for (const argument of expression.args) {
            if (analyzeExpression(argument, line, definite) === "function")
              fail("function-value-not-callable", line);
          }
          return realReturningFunctions.has(expression.callee)
            ? "real"
            : "complex";
        }
        case "unary": {
          const operand = analyzeExpression(expression.operand, line, definite);
          if (operand === "function") fail("function-value-not-callable", line);
          return expression.operator === "!"
            ? "boolean"
            : operand === "boolean"
              ? "real"
              : operand;
        }
        case "magnitude":
          if (
            analyzeExpression(expression.operand, line, definite) === "function"
          )
            fail("function-value-not-callable", line);
          return "real";
        case "binary": {
          const left = analyzeExpression(expression.left, line, definite);
          const right = analyzeExpression(expression.right, line, definite);
          if (left === "function" || right === "function")
            fail("function-value-not-callable", line);
          if (
            ["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(
              expression.operator,
            )
          )
            return "boolean";
          return left === "complex" || right === "complex" ? "complex" : "real";
        }
      }
    };
    const parseBlock = (
      body: Line[],
      start: number,
      depth: number,
      terminators: ReadonlySet<string>,
      definite: Set<string>,
    ): {
      statements: FrmLikeV1Statement[];
      index: number;
      definite: Set<string>;
    } => {
      if (depth > limits.maxControlFlowDepth)
        fail("control-flow-depth-exceeded", body[start]?.number);
      const statements: FrmLikeV1Statement[] = [];
      const countStatement = (line: number): void => {
        counter.statements++;
        if (counter.statements > limits.maxStatements)
          fail("statement-limit-exceeded", line);
      };
      let cursor = start;
      while (cursor < body.length) {
        const line = body[cursor];
        const text = line.text.trim();
        const word = /^(elseif|else|endif)\b/.exec(text)?.[1];
        if (word && terminators.has(word))
          return { statements, index: cursor, definite };
        if (/^if\b/.test(text)) {
          counter.controls++;
          if (counter.controls > limits.maxControlFlowNodes)
            fail("control-flow-limit-exceeded", line.number);
          const condition = parseExpression(
            text.replace(/^if\s+/, ""),
            line.number,
            limits,
            counter,
          );
          if (analyzeExpression(condition, line.number, definite) !== "boolean")
            fail("if-condition-not-boolean", line.number);
          const branchInput = new Set(definite);
          const thenResult = parseBlock(
            body,
            cursor + 1,
            depth + 1,
            new Set(["elseif", "else", "endif"]),
            new Set(branchInput),
          );
          cursor = thenResult.index;
          const elseIf: {
            condition: FrmLikeV1Expression;
            body: FrmLikeV1Statement[];
          }[] = [];
          const branchDefinites: Set<string>[] = [thenResult.definite];
          while (/^elseif\b/.test(body[cursor]?.text.trim() ?? "")) {
            const branchLine = body[cursor];
            const branchCondition = parseExpression(
              branchLine.text.trim().replace(/^elseif\s+/, ""),
              branchLine.number,
              limits,
              counter,
            );
            if (
              analyzeExpression(
                branchCondition,
                branchLine.number,
                branchInput,
              ) !== "boolean"
            )
              fail("if-condition-not-boolean", branchLine.number);
            const branch = parseBlock(
              body,
              cursor + 1,
              depth + 1,
              new Set(["elseif", "else", "endif"]),
              new Set(branchInput),
            );
            elseIf.push({
              condition: branchCondition,
              body: branch.statements,
            });
            branchDefinites.push(branch.definite);
            cursor = branch.index;
          }
          let elseBody: FrmLikeV1Statement[] | undefined;
          let elseDefinite: Set<string> | undefined;
          if (/^else\s*$/.test(body[cursor]?.text.trim() ?? "")) {
            const branch = parseBlock(
              body,
              cursor + 1,
              depth + 1,
              new Set(["endif"]),
              new Set(branchInput),
            );
            elseBody = branch.statements;
            elseDefinite = branch.definite;
            cursor = branch.index;
          }
          if (!/^endif\s*$/.test(body[cursor]?.text.trim() ?? ""))
            fail("unterminated-if", line.number);
          statements.push({
            kind: "if",
            condition,
            then: thenResult.statements,
            elseIf,
            ...(elseBody ? { else: elseBody } : {}),
          });
          definite.clear();
          for (const name of branchInput) definite.add(name);
          if (elseDefinite) {
            const exhaustive = [...branchDefinites, elseDefinite];
            for (const name of exhaustive[0]) {
              if (exhaustive.every((branch) => branch.has(name)))
                definite.add(name);
            }
          }
          cursor++;
          countStatement(line.number);
          continue;
        }
        if (/^(elseif|else|endif)\b/.test(text))
          fail("unexpected-control-flow", line.number);
        const component =
          /^(real|imag)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*=\s*(.+)$/.exec(
            text,
          );
        const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(text);
        if (!component && !assignment) fail("invalid-statement", line.number);
        const target = component ? component[2] : assignment![1];
        if (parameterNames.has(target) || systemInputs.has(target))
          fail("immutable-assignment", line.number);
        if (
          sections.has(target) ||
          keywords.has(target) ||
          reservedNames.has(target)
        )
          fail("reserved-assignment", line.number);
        const value = parseExpression(
          component ? component[3] : assignment![2],
          line.number,
          limits,
          counter,
        );
        const type = analyzeExpression(value, line.number, definite);
        if (type === "function")
          fail("function-value-not-callable", line.number);
        if (component) {
          if (!definite.has(target))
            fail("component-target-not-initialized", line.number);
          if (values.get(target) !== "complex")
            fail("component-target-not-complex", line.number);
        }
        if (!writableSystem.has(target)) {
          const assignedType = component ? ("complex" as const) : type;
          const existing = locals.get(target);
          if (existing && existing !== assignedType)
            fail("local-type-mismatch", line.number);
          if (!existing) {
            if (locals.size >= limits.maxLocals)
              fail("local-limit-exceeded", line.number);
            locals.set(target, assignedType);
            values.set(target, assignedType);
          }
          definite.add(target);
        }
        statements.push(
          component
            ? {
                kind: "component-assignment",
                component: component[1] as "real" | "imag",
                target,
                value,
              }
            : { kind: "assignment", target, value },
        );
        cursor++;
        countStatement(line.number);
      }
      return { statements, index: cursor, definite };
    };
    const initiallyDefinite = new Set(values.keys());
    const initResult = parseBlock(
      sectionsBody.init,
      0,
      0,
      new Set(),
      initiallyDefinite,
    );
    if (initResult.index !== sectionsBody.init.length)
      fail("invalid-statement");
    const loopResult = parseBlock(
      sectionsBody.loop,
      0,
      0,
      new Set(),
      initResult.definite,
    );
    if (loopResult.index !== sectionsBody.loop.length)
      fail("invalid-statement");
    const bailoutLine = sectionsBody.bailout[0];
    const bailout = parseExpression(
      bailoutLine.text.trim(),
      bailoutLine.number,
      limits,
      counter,
    );
    if (
      analyzeExpression(bailout, bailoutLine.number, loopResult.definite) !==
      "boolean"
    )
      fail("bailout-not-boolean", bailoutLine.number);
    return {
      ok: true,
      source,
      ir: {
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        numericProfile: "standard32",
        formulaName,
        parameters,
        locals: [...locals].map(([name, type]) => ({ name, type })),
        evaluationOrder: "source-order-left-to-right",
        init: initResult.statements,
        loop: loopResult.statements,
        bailout,
      },
    };
  } catch (error) {
    if (error instanceof Failure)
      return {
        ok: false,
        reason: error.reason,
        ...(error.line ? { line: error.line } : {}),
        ...(error.column ? { column: error.column } : {}),
      };
    throw error;
  }
}
