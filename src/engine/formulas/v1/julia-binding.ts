import type {
  FrmLikeV1Expression,
  FrmLikeV1Ir,
  FrmLikeV1Statement,
} from "../../frm/v1";
import { parseFrmLikeV1, validateFrmLikeV1Ir } from "../../frm/v1";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type OrbitConstantBindingV1 =
  | { readonly kind: "system-c" }
  | { readonly kind: "parameter"; readonly slotName: string }
  | { readonly kind: "source-split"; readonly sourceRevision: string }
  | { readonly kind: "none" };

export type JuliaModeClassV1 =
  | "classic-julia"
  | "generalized-two-plane"
  | "unsupported";

export type JuliaSupportLaneV1 =
  | "existing-system-c"
  | "parameter-binding"
  | "source-split"
  | "none";

export type JuliaCandidateKindV1 = "source-split" | "identity-change";
export type JuliaZ0RoleV1 = "pixel-seed" | "parameter" | "zero" | "none";
export type JuliaInvariantV1 =
  | "parameter-plane-bit-identical"
  | "semantic-extension";

export interface JuliaBindingContractV1 {
  readonly binding: OrbitConstantBindingV1;
  readonly modeClass: JuliaModeClassV1;
  readonly supportLane: JuliaSupportLaneV1;
  readonly candidateKind?: JuliaCandidateKindV1;
  readonly z0Role: JuliaZ0RoleV1;
  readonly invariant: JuliaInvariantV1;
}

export type JuliaBindingContractParseResultV1 =
  | { readonly ok: true; readonly value: JuliaBindingContractV1 }
  | { readonly ok: false; readonly code: "julia-binding-contract-invalid" };

export interface JuliaSourceBindingV1 {
  readonly source: string;
  readonly sourceRevision: string;
}

export type JuliaSourceBindingParseResultV1 =
  | { readonly ok: true; readonly ir: FrmLikeV1Ir; readonly sourceRevision: string }
  | { readonly ok: false; readonly code: "julia-source-binding-invalid" };

export type JuliaBindingClassifierReasonV1 =
  | "binding-none-requires-independent-review"
  | "binding-parameter-missing"
  | "binding-parameter-not-complex"
  | "binding-source-revision-invalid"
  | "binding-not-live-in-loop"
  | "julia-z0-role-ambiguous"
  | "julia-binding-ir-invalid";

export type JuliaBindingClassificationV1 =
  | {
      readonly ok: true;
      readonly evidenceClass: "static-candidate-only";
      readonly contract: JuliaBindingContractV1;
      readonly requiresCpuEvidence: true;
    }
  | {
      readonly ok: false;
      readonly evidenceClass: "fail-closed";
      readonly reasonCode: JuliaBindingClassifierReasonV1;
    };

type JsonRecord = Record<string, unknown>;
type Dependency = Readonly<{
  names: ReadonlySet<string>;
  definitelyZero: boolean;
}>;
type Environment = Map<string, Dependency>;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Reflect.ownKeys(value);
  if (!keys.every((key) => typeof key === "string")) return false;
  const strings = keys as string[];
  if (required.some((key) => !Object.hasOwn(value, key))) return false;
  return strings.every((key) => required.includes(key) || optional.includes(key));
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    const clone: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) clone[key] = immutable(child);
    return Object.freeze(clone) as T;
  }
  return value;
}

function parseBinding(value: unknown): OrbitConstantBindingV1 | undefined {
  if (!record(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "system-c" || value.kind === "none") {
    return exactKeys(value, ["kind"])
      ? ({ kind: value.kind } as OrbitConstantBindingV1)
      : undefined;
  }
  if (value.kind === "parameter") {
    return exactKeys(value, ["kind", "slotName"]) &&
      typeof value.slotName === "string" &&
      IDENTIFIER.test(value.slotName)
      ? { kind: "parameter", slotName: value.slotName }
      : undefined;
  }
  if (value.kind === "source-split") {
    return exactKeys(value, ["kind", "sourceRevision"]) &&
      typeof value.sourceRevision === "string" &&
      SHA256.test(value.sourceRevision)
      ? { kind: "source-split", sourceRevision: value.sourceRevision }
      : undefined;
  }
  return undefined;
}

function parseJuliaBindingContractUncheckedV1(
  value: unknown,
): JuliaBindingContractParseResultV1 {
  if (
    !record(value) ||
    !exactKeys(
      value,
      ["binding", "modeClass", "supportLane", "z0Role", "invariant"],
      ["candidateKind"],
    )
  )
    return { ok: false, code: "julia-binding-contract-invalid" };

  const binding = parseBinding(value.binding);
  const modeClass = value.modeClass;
  const supportLane = value.supportLane;
  const candidateKind = value.candidateKind;
  const z0Role = value.z0Role;
  const invariant = value.invariant;
  if (
    !binding ||
    typeof modeClass !== "string" ||
    !["classic-julia", "generalized-two-plane", "unsupported"].includes(modeClass) ||
    typeof supportLane !== "string" ||
    !["existing-system-c", "parameter-binding", "source-split", "none"].includes(
      supportLane,
    ) ||
    (candidateKind !== undefined &&
      candidateKind !== "source-split" &&
      candidateKind !== "identity-change") ||
    typeof z0Role !== "string" ||
    !["pixel-seed", "parameter", "zero", "none"].includes(z0Role) ||
    (invariant !== "parameter-plane-bit-identical" &&
      invariant !== "semantic-extension")
  )
    return { ok: false, code: "julia-binding-contract-invalid" };

  const expectedLane: JuliaSupportLaneV1 =
    binding.kind === "system-c"
      ? "existing-system-c"
      : binding.kind === "parameter"
        ? "parameter-binding"
        : binding.kind === "source-split"
          ? "source-split"
          : "none";
  if (supportLane !== expectedLane)
    return { ok: false, code: "julia-binding-contract-invalid" };

  const activeBinding = binding.kind !== "none";
  if (
    (modeClass === "classic-julia" &&
      (!activeBinding || z0Role !== "pixel-seed")) ||
    (modeClass === "generalized-two-plane" &&
      (!activeBinding || (z0Role !== "parameter" && z0Role !== "zero"))) ||
    (modeClass === "unsupported" && (activeBinding || z0Role !== "none")) ||
    (candidateKind === "source-split" && binding.kind !== "source-split") ||
    (candidateKind === "identity-change" && modeClass !== "unsupported")
  )
    return { ok: false, code: "julia-binding-contract-invalid" };

  return {
    ok: true,
    value: immutable({
      binding,
      modeClass: modeClass as JuliaModeClassV1,
      supportLane: supportLane as JuliaSupportLaneV1,
      ...(candidateKind ? { candidateKind: candidateKind as JuliaCandidateKindV1 } : {}),
      z0Role: z0Role as JuliaZ0RoleV1,
      invariant: invariant as JuliaInvariantV1,
    }),
  };
}

export function parseJuliaBindingContractV1(
  value: unknown,
): JuliaBindingContractParseResultV1 {
  try {
    return parseJuliaBindingContractUncheckedV1(value);
  } catch {
    return { ok: false, code: "julia-binding-contract-invalid" };
  }
}

function dependency(names: Iterable<string> = [], definitelyZero = false): Dependency {
  return { names: new Set(names), definitelyZero };
}

function union(values: readonly Dependency[]): Dependency {
  const names = new Set<string>();
  for (const value of values) for (const name of value.names) names.add(name);
  return dependency(names, values.length > 0 && values.every((value) => value.definitelyZero));
}

function expressionDependency(expression: FrmLikeV1Expression, env: Environment): Dependency {
  switch (expression.kind) {
    case "number":
      return dependency([], expression.value === 0);
    case "complex":
      return dependency([], expression.real === 0 && expression.imaginary === 0);
    case "identifier":
      return env.get(expression.name) ?? dependency([expression.name]);
    case "call":
      return union(expression.args.map((arg) => expressionDependency(arg, env)));
    case "unary":
    case "magnitude":
      return expressionDependency(expression.operand, env);
    case "binary":
      return union([
        expressionDependency(expression.left, env),
        expressionDependency(expression.right, env),
      ]);
  }
}

function exactIsmandCondition(
  expression: FrmLikeV1Expression,
  ismand: boolean,
): boolean | undefined {
  if (expression.kind === "identifier" && expression.name === "ismand") return ismand;
  if (
    expression.kind === "unary" &&
    expression.operator === "!" &&
    expression.operand.kind === "identifier" &&
    expression.operand.name === "ismand"
  )
    return !ismand;
  return undefined;
}

function cloneEnvironment(env: Environment): Environment {
  return new Map(env);
}

function mergeEnvironments(paths: readonly Environment[]): Environment {
  const keys = new Set<string>();
  for (const path of paths) for (const key of path.keys()) keys.add(key);
  const merged: Environment = new Map();
  for (const key of keys) {
    merged.set(
      key,
      union(paths.map((path) => path.get(key) ?? dependency([`unassigned:${key}`]))),
    );
  }
  return merged;
}

function executeStatements(
  statements: readonly FrmLikeV1Statement[],
  initial: Environment,
  ismand: boolean,
): Environment {
  let env = cloneEnvironment(initial);
  for (const statement of statements) {
    if (statement.kind === "assignment") {
      env.set(statement.target, expressionDependency(statement.value, env));
      continue;
    }
    if (statement.kind === "component-assignment") {
      env.set(
        statement.target,
        union([
          env.get(statement.target) ?? dependency([`unassigned:${statement.target}`]),
          expressionDependency(statement.value, env),
        ]),
      );
      continue;
    }
    const branches = [
      { condition: statement.condition, body: statement.then },
      ...statement.elseIf,
    ];
    const paths: Environment[] = [];
    let unresolvedEarlierBranch = false;
    let matched = false;
    for (const branch of branches) {
      const exact = exactIsmandCondition(branch.condition, ismand);
      if (exact === false) continue;
      paths.push(executeStatements(branch.body, env, ismand));
      if (exact === true) {
        matched = true;
        break;
      }
      unresolvedEarlierBranch = true;
    }
    if (!matched)
      paths.push(
        statement.else
          ? executeStatements(statement.else, env, ismand)
          : cloneEnvironment(env),
      );
    env =
      paths.length === 1 && !unresolvedEarlierBranch
        ? paths[0]!
        : mergeEnvironments(paths);
  }
  return env;
}

function initialEnvironment(ir: FrmLikeV1Ir): Environment {
  const env: Environment = new Map([
    ["pixel", dependency(["pixel"])],
    ["c", dependency(["c"])],
    ["z", dependency([], true)],
    ["zPrev", dependency(["zPrev"])],
    ["LastSqr", dependency(["LastSqr"])],
    ["maxit", dependency(["maxit"])],
    ["ismand", dependency(["ismand"])],
  ]);
  for (const parameter of ir.parameters) env.set(parameter.name, dependency([parameter.name]));
  for (const local of ir.locals) env.set(local.name, dependency([`unassigned:${local.name}`]));
  return env;
}

function classifyZ0(value: Dependency, complexParameters: ReadonlySet<string>): JuliaZ0RoleV1 {
  const names = [...value.names];
  if (names.length === 0 && value.definitelyZero) return "zero";
  if (names.length === 1 && names[0] === "pixel") return "pixel-seed";
  if (names.length === 1 && complexParameters.has(names[0]!)) return "parameter";
  return "none";
}

export function parseJuliaSourceBindingV1(
  value: unknown,
): JuliaSourceBindingParseResultV1 {
  try {
    if (
      !record(value) ||
      !exactKeys(value, ["source", "sourceRevision"]) ||
      typeof value.source !== "string" ||
      typeof value.sourceRevision !== "string" ||
      !SHA256.test(value.sourceRevision) ||
      sha256HexSyncV1(value.source) !== value.sourceRevision
    )
      return { ok: false, code: "julia-source-binding-invalid" };
    const parsed = parseFrmLikeV1(value.source);
    if (!parsed.ok)
      return { ok: false, code: "julia-source-binding-invalid" };
    return {
      ok: true,
      ir: parsed.ir,
      sourceRevision: value.sourceRevision,
    };
  } catch {
    return { ok: false, code: "julia-source-binding-invalid" };
  }
}

function sameIr(left: FrmLikeV1Ir, right: FrmLikeV1Ir): boolean {
  try {
    return canonicalJsonV1(left) === canonicalJsonV1(right);
  } catch {
    return false;
  }
}

export function classifyJuliaBindingRolesV1(
  ir: FrmLikeV1Ir,
  binding: OrbitConstantBindingV1,
  sourceBinding?: JuliaSourceBindingV1,
): JuliaBindingClassificationV1 {
  if (!validateFrmLikeV1Ir(ir).ok)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-binding-ir-invalid",
    };
  if (binding.kind === "none")
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "binding-none-requires-independent-review",
    };
  if (binding.kind === "source-split") {
    const parsedSource = parseJuliaSourceBindingV1(sourceBinding);
    if (
      !parsedSource.ok ||
      parsedSource.sourceRevision !== binding.sourceRevision ||
      !sameIr(ir, parsedSource.ir)
    )
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "binding-source-revision-invalid",
      };
  }

  const complexParameters = new Set(
    ir.parameters
      .filter((parameter) => parameter.type === "complex")
      .map((parameter) => parameter.name),
  );
  if (binding.kind === "parameter") {
    const parameter = ir.parameters.find((entry) => entry.name === binding.slotName);
    if (!parameter)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "binding-parameter-missing",
      };
    if (parameter.type !== "complex")
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "binding-parameter-not-complex",
      };
  }

  const juliaInit = executeStatements(ir.init, initialEnvironment(ir), false);
  const z0Role = classifyZ0(
    juliaInit.get("z") ?? dependency(["unassigned:z"]),
    complexParameters,
  );
  if (z0Role === "none")
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-z0-role-ambiguous",
    };

  const afterLoop = executeStatements(ir.loop, juliaInit, false);
  const recurrence = afterLoop.get("z") ?? dependency(["unassigned:z"]);
  const bindingName = binding.kind === "parameter" ? binding.slotName : "c";
  if (!recurrence.names.has(bindingName))
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "binding-not-live-in-loop",
    };

  const modeClass: JuliaModeClassV1 =
    z0Role === "pixel-seed" ? "classic-julia" : "generalized-two-plane";
  const supportLane: JuliaSupportLaneV1 =
    binding.kind === "system-c"
      ? "existing-system-c"
      : binding.kind === "parameter"
        ? "parameter-binding"
        : "source-split";
  const parsed = parseJuliaBindingContractV1({
    binding,
    modeClass,
    supportLane,
    ...(binding.kind === "source-split" ? { candidateKind: "source-split" } : {}),
    z0Role,
    invariant: "semantic-extension",
  });
  if (!parsed.ok)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-binding-ir-invalid",
    };
  return {
    ok: true,
    evidenceClass: "static-candidate-only",
    contract: parsed.value,
    requiresCpuEvidence: true,
  };
}
