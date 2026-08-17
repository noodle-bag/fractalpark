import type { FrmLikeV1Backend } from "@/engine/frm/v1-backend";
import type { ASTNode, FrmAST } from "@/engine/frm/ast";
import type { FrmEntry } from "@/engine/frm/scanner";
import { FRM_V1_UNARY_FUNCTION_NAMES } from "@/engine/frm/frm-v1-stdlib";
import { BUILTIN_TYPES, collectVariables, inferType, type TypeContext } from "@/engine/frm/type-system";
import type {
  FrmLikeV1Expression,
  FrmLikeV1Ir,
  FrmLikeV1Parameter,
  FrmLikeV1Statement,
  FrmLikeV1ValueType,
} from "@/engine/frm/v1";

export const FORMULA_LIBRARY_BULK_REASON_CODES = Object.freeze([
  "missing-input",
  "identity-or-alias-mismatch",
  "classic-lowering-failed",
  "v1-projection-unsupported",
  "v1-parse-failed",
  "canonical-roundtrip-failed",
  "safety-envelope-failed",
  "backend-compile-failed",
  "cpu-runtime-failed",
  "release-oracle-mismatch",
  "webgl-compile-link-draw-failed",
  "webgl-cpu-mismatch",
  "nondeterministic-output",
  "controller-internal-error",
] as const);

export type FormulaLibraryBulkReasonCode =
  (typeof FORMULA_LIBRARY_BULK_REASON_CODES)[number];

export type FormulaLibraryBulkFailureStage =
  | "input"
  | "classic-lowering"
  | "v1-projection"
  | "v1-parse"
  | "canonical-roundtrip"
  | "safety-envelope"
  | "backend-compile"
  | "cpu-runtime"
  | "release-oracle"
  | "webgl-compile-link-draw"
  | "controller";

export interface ClassicAstProjectionInput {
  readonly formulaId: string;
  readonly ast: FrmAST;
  readonly functionDefaults?: Readonly<Record<string, string>>;
}

export type ClassicAstProjectionResult =
  | { readonly ok: true; readonly ir: FrmLikeV1Ir }
  | {
      readonly ok: false;
      readonly reasonCode: "v1-projection-unsupported";
    };

export interface FormulaLibraryCpuSmokeSnapshot {
  readonly event: "nonFinite" | null;
  readonly iterations: number;
  readonly continueValue: boolean | null;
  readonly z: readonly [number | "non-finite", number | "non-finite"];
}

export interface FormulaLibraryOracleRun {
  readonly pixel: readonly [number, number];
  readonly escapedAt: number | null;
  readonly event: "nonFinite" | null;
  readonly orbit: readonly (readonly [
    number | "non-finite",
    number | "non-finite",
  ])[];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CLASSIC_PARAMETERS = ["p1", "p2", "p3", "p4", "p5"] as const;
const CLASSIC_FUNCTIONS = ["fn1", "fn2", "fn3", "fn4"] as const;
const SYSTEM_NAMES = new Set([
  ...Object.keys(BUILTIN_TYPES),
  ...CLASSIC_FUNCTIONS,
  "c",
  "pixel",
  "zPrev",
  "LastSqr",
  "pi",
  "e",
  "maxit",
  "ismand",
]);
const FUNCTION_DEFAULTS = new Set<string>(FRM_V1_UNARY_FUNCTION_NAMES);

class ProjectionFailure extends Error {}

export function selectClassicMigrationEntry(
  entries: readonly FrmEntry[],
  evidenceKey: string,
): FrmEntry | null {
  const expected = evidenceKey.toLowerCase();
  const optionSelector = /^(.*?)\[([^\]]+)\]$/.exec(expected);
  const matches = entries.filter((entry) => {
    if (
      entry.key.toLowerCase() === expected ||
      entry.name.toLowerCase() === expected
    )
      return true;
    if (!optionSelector || entry.name.toLowerCase() !== optionSelector[1])
      return false;
    const expectedOptions = optionSelector[2]
      .split(/\s+/)
      .map((option) => option.trim())
      .filter(Boolean);
    const actualOptions = (entry.options ?? "")
      .toLowerCase()
      .split(/\s+/)
      .map((option) => option.trim())
      .filter(Boolean)
      .sort();
    const normalizedExpected = [...new Set(expectedOptions)].sort();
    return (
      normalizedExpected.length > 0 &&
      normalizedExpected.length === actualOptions.length &&
      normalizedExpected.every((option, index) => option === actualOptions[index])
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

function fail(): never {
  throw new ProjectionFailure("v1-projection-unsupported");
}

function expression(node: ASTNode, typeContext?: TypeContext): FrmLikeV1Expression {
  switch (node.type) {
    case "number":
      if (!Number.isFinite(node.value)) fail();
      return { kind: "number", value: node.value };
    case "complex":
      if (!Number.isFinite(node.real) || !Number.isFinite(node.imag)) fail();
      return { kind: "complex", real: node.real, imaginary: node.imag };
    case "ident":
      if (!IDENTIFIER.test(node.name)) fail();
      return { kind: "identifier", name: node.name };
    case "call": {
      if (!IDENTIFIER.test(node.name)) fail();
      // Classic FRM is statically typed and its overloads key off the
      // argument's static kind: frmFlip(float) is the identity while
      // frmFlip(vec2) swaps (production GLSL + orbit-eval semantics). v1
      // expressions are always complex, so projecting flip(real-typed) as
      // v1 flip would silently move the value into the imaginary slot.
      // Lower the real-typed case to the operand itself, exactly the
      // classic behavior. (sqrt(real) — NaN on negatives vs the v1 complex
      // principal root — is intentionally NOT special-cased: no migrated
      // row uses it; adding it later requires its own evidence pass.)
      if (
        typeContext &&
        node.name === "flip" &&
        node.args.length === 1 &&
        node.args[0] &&
        inferType(node.args[0], typeContext).kind === "real"
      )
        return expression(node.args[0], typeContext);
      return {
        kind: "call",
        callee: node.name,
        args: node.args.map((arg) => expression(arg, typeContext)),
      };
    }
    case "unary":
      if (node.op !== "-" && node.op !== "!") fail();
      return {
        kind: "unary",
        operator: node.op,
        operand: expression(node.operand, typeContext),
      };
    case "magnitude":
      return { kind: "magnitude", operand: expression(node.operand, typeContext) };
    case "binary":
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
        ].includes(node.op)
      )
        fail();
      return {
        kind: "binary",
        operator: node.op,
        left: expression(node.left, typeContext),
        right: expression(node.right, typeContext),
      };
    case "assignment":
    case "if":
      return fail();
  }
}

function statements(nodes: readonly ASTNode[], typeContext?: TypeContext): FrmLikeV1Statement[] {
  return nodes.map((node) => {
    if (node.type === "assignment") {
      if (!IDENTIFIER.test(node.target)) fail();
      if (node.component) {
        return {
          kind: "component-assignment",
          component: node.component,
          target: node.target,
          value: expression(node.value, typeContext),
        };
      }
      return {
        kind: "assignment",
        target: node.target,
        value: expression(node.value, typeContext),
      };
    }
    if (node.type === "if") {
      return {
        kind: "if",
        condition: expression(node.condition, typeContext),
        then: statements(node.then, typeContext),
        elseIf: (node.elseIf ?? []).map((branch) => ({
          condition: expression(branch.condition, typeContext),
          body: statements(branch.body, typeContext),
        })),
        ...(node.else ? { else: statements(node.else, typeContext) } : {}),
      };
    }
    return fail();
  });
}

function collectReferences(ast: FrmAST): ReadonlySet<string> {
  const references = new Set<string>();
  const visit = (node: ASTNode): void => {
    switch (node.type) {
      case "ident":
        references.add(node.name);
        return;
      case "call":
        references.add(node.name);
        node.args.forEach(visit);
        return;
      case "assignment":
        visit(node.value);
        return;
      case "unary":
      case "magnitude":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
      case "if":
        visit(node.condition);
        node.then.forEach(visit);
        node.elseIf?.forEach((branch) => {
          visit(branch.condition);
          branch.body.forEach(visit);
        });
        node.else?.forEach(visit);
        return;
      case "number":
      case "complex":
        return;
    }
  };
  ast.initBlock.forEach(visit);
  ast.loopBlock.forEach(visit);
  visit(ast.bailoutExpr);
  return references;
}

function parameters(
  ast: FrmAST,
  functionDefaults: Readonly<Record<string, string>>,
): FrmLikeV1Parameter[] {
  const output: FrmLikeV1Parameter[] = ast.params.map((parameter) => {
    if (!IDENTIFIER.test(parameter.name) || SYSTEM_NAMES.has(parameter.name)) fail();
    if (parameter.type === "float") {
      if (
        typeof parameter.default !== "number" ||
        !Number.isFinite(parameter.default)
      )
        fail();
      const hardDomain =
        Number.isFinite(parameter.min) && Number.isFinite(parameter.max)
          ? ([parameter.min!, parameter.max!] as const)
          : undefined;
      if (hardDomain && hardDomain[0] > hardDomain[1]) fail();
      return {
        name: parameter.name,
        type: "real",
        default: parameter.default,
        ...(hardDomain ? { hardDomain } : {}),
      };
    }
    if (
      !Array.isArray(parameter.default) ||
      parameter.default.length !== 2 ||
      !parameter.default.every(Number.isFinite)
    )
      fail();
    return {
      name: parameter.name,
      type: "complex",
      default: [parameter.default[0], parameter.default[1]] as const,
    };
  });
  const names = new Set(output.map((parameter) => parameter.name));
  const references = collectReferences(ast);
  for (const binding of CLASSIC_PARAMETERS) {
    if (!references.has(binding)) continue;
    const name = `parameter${binding.slice(1)}`;
    if (names.has(name)) fail();
    names.add(name);
    output.push({
      name,
      type: "complex",
      default: [0, 0],
      classicBinding: binding,
    });
  }
  for (const binding of CLASSIC_FUNCTIONS) {
    if (!references.has(binding)) continue;
    const name = `function${binding.slice(2)}`;
    if (names.has(name)) fail();
    names.add(name);
    const requested = functionDefaults[binding] ?? "identity";
    if (!FUNCTION_DEFAULTS.has(requested)) fail();
    output.push({
      name,
      type: "function",
      default: requested,
      classicBinding: binding,
    });
  }
  return output;
}

function localType(kind: "real" | "complex"): FrmLikeV1ValueType {
  return kind;
}

export function projectClassicAstToFrmLikeV1(
  input: ClassicAstProjectionInput,
): ClassicAstProjectionResult {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.formulaId))
      fail();
    const projectedParameters = parameters(
      input.ast,
      input.functionDefaults ?? {},
    );
    const parameterNames = new Set(
      projectedParameters.map((parameter) => parameter.name),
    );
    const variables = collectVariables(input.ast.initBlock, input.ast.loopBlock);
    // Static-kind context for dialect-faithful lowering (e.g. flip(real) is
    // the identity in classic FRM): the same variable map the classic orbit
    // evaluator uses, with inferType resolving builtins internally.
    const projectionTypeContext: TypeContext = {
      getVariableType: (name: string) => variables.get(name),
    };
    const locals = [...variables]
      .filter(
        ([name]) =>
          !SYSTEM_NAMES.has(name) &&
          name !== "z" &&
          !parameterNames.has(name),
      )
      .map(([name, type]) => {
        if (!IDENTIFIER.test(name)) fail();
        return { name, type: localType(type.kind) };
      })
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
    return {
      ok: true,
      ir: {
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        numericProfile: "standard32",
        formulaName: `Formula_${input.formulaId.replaceAll("-", "_")}`,
        parameters: projectedParameters,
        locals,
        evaluationOrder: "source-order-left-to-right",
        init: statements(input.ast.initBlock, projectionTypeContext),
        loop: statements(input.ast.loopBlock, projectionTypeContext),
        bailout: expression(input.ast.bailoutExpr, projectionTypeContext),
      },
    };
  } catch {
    return { ok: false, reasonCode: "v1-projection-unsupported" };
  }
}

function normalizeNumber(value: number): number | "non-finite" {
  if (!Number.isFinite(value)) return "non-finite";
  return Object.is(value, -0) ? 0 : value;
}

export function runFormulaLibraryOracle(
  backend: FrmLikeV1Backend,
  pixels: readonly (readonly [number, number])[],
  maxIterations: number,
): FormulaLibraryOracleRun[] {
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error("cpu-runtime-failed");
  }
  return pixels.map((pixel) => {
    const state = backend.cpu.createState({
      pixel: { re: pixel[0], im: pixel[1] },
      c: { re: pixel[0], im: pixel[1] },
      maxit: maxIterations,
      ismand: true,
    });
    const initialized = backend.cpu.init(state);
    let event: "nonFinite" | null = initialized.event ?? null;
    let escapedAt: number | null = null;
    const orbit: Array<readonly [
      number | "non-finite",
      number | "non-finite",
    ]> = [];
    for (let index = 0; index < maxIterations && event === null; index++) {
      const stepped = backend.cpu.step(state);
      const z = state.values.z;
      if (!z) throw new Error("cpu-runtime-failed");
      orbit.push([normalizeNumber(z.re), normalizeNumber(z.im)]);
      if (stepped.event) {
        event = stepped.event;
        break;
      }
      const continuation = backend.cpu.shouldContinue(state);
      if (continuation.event) {
        event = continuation.event;
        break;
      }
      if (continuation.continue === false) {
        escapedAt = index + 1;
        break;
      }
    }
    return { pixel, escapedAt, event, orbit };
  });
}

export function runFormulaLibraryCpuSmoke(
  backend: FrmLikeV1Backend,
): FormulaLibraryCpuSmokeSnapshot {
  const state = backend.cpu.createState({
    pixel: { re: 0.25, im: 0.1 },
    c: { re: 0.25, im: 0.1 },
    maxit: 16,
    ismand: true,
  });
  const initialized = backend.cpu.init(state);
  let event: "nonFinite" | null = initialized.event ?? null;
  let continueValue: boolean | null = null;
  let iterations = 0;
  for (; iterations < 4 && event === null; iterations++) {
    const stepped = backend.cpu.step(state);
    if (stepped.event) {
      event = stepped.event;
      break;
    }
    const continuation = backend.cpu.shouldContinue(state);
    if (continuation.event) {
      event = continuation.event;
      break;
    }
    continueValue = continuation.continue ?? null;
    if (continueValue === false) {
      iterations += 1;
      break;
    }
  }
  const z = state.values.z;
  if (!z) throw new Error("cpu-runtime-failed");
  return {
    event,
    iterations,
    continueValue,
    z: [normalizeNumber(z.re), normalizeNumber(z.im)],
  };
}
