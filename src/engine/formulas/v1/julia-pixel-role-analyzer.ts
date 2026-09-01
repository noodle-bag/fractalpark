/** Browser-safe, conservative Julia/Pixel role discovery over production IR. */
import {
  parseFrmLikeV1,
  validateFrmLikeV1Ir,
  type FrmLikeV1Expression,
  type FrmLikeV1Ir,
  type FrmLikeV1Statement,
} from "../../frm/v1";

export const JULIA_PIXEL_ROLE_ANALYZER_SCHEMA_V1 =
  "fractalpark-julia-pixel-role-analyzer/v1" as const;
export const JULIA_PIXEL_ROLE_ANALYZER_VERSION_V1 =
  "production-frm-like-v1-def-use-source-order-standard32/v1" as const;

export type JuliaPixelRoleV1 =
  | "role:pixel-seed"
  | "role:pixel-constant"
  | "role:julia-constant"
  | "role:derived-pixel-constant"
  | "role:formula-parameter"
  | "role:dynamic-orbit-state"
  | "role:bailout-control"
  | "role:unresolved";
export type JuliaPixelRoleModeV1 =
  "classic-julia" | "generalized-two-plane" | "undetermined";
export type JuliaPixelRoleResultV1 = "held" | "unknown";

export interface JuliaPixelRoleAnalysisV1 {
  readonly schema: typeof JULIA_PIXEL_ROLE_ANALYZER_SCHEMA_V1;
  readonly analyzerVersion: typeof JULIA_PIXEL_ROLE_ANALYZER_VERSION_V1;
  readonly numericProfile: "standard32";
  readonly evaluationOrder: "source-order-left-to-right";
  readonly roles: readonly JuliaPixelRoleV1[];
  readonly modeClass: JuliaPixelRoleModeV1;
  readonly result: JuliaPixelRoleResultV1;
  readonly reasonCodes: readonly string[];
}

type Taint = "pixel" | "derived-pixel" | "other" | "unknown";
type Env = Map<string, Taint>;
const roleOrder: readonly JuliaPixelRoleV1[] = [
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
];

function exprTaint(e: FrmLikeV1Expression, env: Env): Taint {
  if (e.kind === "identifier")
    return e.name === "pixel" ? "pixel" : (env.get(e.name) ?? "other");
  if (e.kind === "number" || e.kind === "complex") return "other";
  if (e.kind === "unary" && e.operator === "-")
    return exprTaint(e.operand, env);
  // Component-preserving wrappers retain taint; constructing a complex value
  // from pixel-derived components remains derived rather than direct.
  if (e.kind === "call" && ["real", "imag", "conj"].includes(e.callee))
    return e.args.length === 1 ? exprTaint(e.args[0]!, env) : "unknown";
  if (e.kind === "call" && e.callee === "complex") {
    const values = e.args.map((x) => exprTaint(x, env));
    if (values.some((value) => value === "unknown")) return "unknown";
    return values.some(
      (value) => value === "pixel" || value === "derived-pixel",
    )
      ? "derived-pixel"
      : "other";
  }
  const children =
    e.kind === "call"
      ? e.args
      : e.kind === "unary" || e.kind === "magnitude"
        ? [e.operand]
        : [e.left, e.right];
  return children.some((x) => {
    const t = exprTaint(x, env);
    return t === "pixel" || t === "derived-pixel";
  })
    ? "derived-pixel"
    : "other";
}
function mentions(e: FrmLikeV1Expression, name: string): boolean {
  if (e.kind === "identifier") return e.name === name;
  if (e.kind === "number" || e.kind === "complex") return false;
  if (e.kind === "call") return e.args.some((x) => mentions(x, name));
  if (e.kind === "unary" || e.kind === "magnitude")
    return mentions(e.operand, name);
  return mentions(e.left, name) || mentions(e.right, name);
}
function isBailoutControl(e: FrmLikeV1Expression): boolean {
  if (e.kind === "binary") {
    if (["<", ">", "<=", ">=", "==", "!="].includes(e.operator)) return true;
    if (["&&", "||"].includes(e.operator))
      return isBailoutControl(e.left) && isBailoutControl(e.right);
  }
  return e.kind === "unary" && e.operator === "!"
    ? isBailoutControl(e.operand)
    : false;
}
function scan(
  body: readonly FrmLikeV1Statement[],
  env: Env,
  fn: (s: FrmLikeV1Statement, e: Env) => void,
): void {
  for (const s of body) {
    fn(s, env);
    if (s.kind === "assignment") env.set(s.target, exprTaint(s.value, env));
    else if (s.kind === "component-assignment") {
      const previous = env.get(s.target) ?? "other";
      const value = exprTaint(s.value, env);
      env.set(
        s.target,
        previous === "other" && value === "other" ? "other" : "unknown",
      );
    } else {
      // A merge is safe only if every branch assigns the same known value.
      const branches = [
        s.then,
        ...s.elseIf.map((x) => x.body),
        ...(s.else ? [s.else] : []),
      ];
      const before = new Map(env);
      const after = branches.map((b) => {
        const x = new Map(before);
        scan(b, x, fn);
        return x;
      });
      for (const key of new Set(after.flatMap((x) => [...x.keys()]))) {
        const vals = after.map((x) => x.get(key));
        if (vals.some((x) => x === undefined) || new Set(vals).size !== 1)
          env.set(key, "unknown");
        else env.set(key, vals[0]!);
      }
    }
  }
}

export function analyzeJuliaPixelRolesV1(
  input: FrmLikeV1Ir | string,
): JuliaPixelRoleAnalysisV1 {
  const parsed =
    typeof input === "string"
      ? parseFrmLikeV1(input)
      : validateFrmLikeV1Ir(input);
  if (!parsed.ok)
    return Object.freeze({
      schema: JULIA_PIXEL_ROLE_ANALYZER_SCHEMA_V1,
      analyzerVersion: JULIA_PIXEL_ROLE_ANALYZER_VERSION_V1,
      numericProfile: "standard32",
      evaluationOrder: "source-order-left-to-right",
      roles: Object.freeze<JuliaPixelRoleV1[]>(["role:unresolved"]),
      modeClass: "undetermined",
      result: "unknown",
      reasonCodes: Object.freeze(["production-ir-invalid"]),
    });
  const ir = parsed.ir;
  const roles = new Set<JuliaPixelRoleV1>();
  const reasons = new Set<string>();
  const env: Env = new Map();
  let directSeed = false,
    derivedSeed = false,
    pixelConstant = false,
    derivedConstant = false,
    mutableAlias = false,
    aliasRead = false;
  const parameters = new Set(ir.parameters.map((p) => p.name));
  scan(ir.init, env, (s, current) => {
    if (s.kind !== "assignment") return;
    const t = exprTaint(s.value, current);
    if (s.target === "z") {
      if (t === "pixel") directSeed = true;
      if (t === "derived-pixel") derivedSeed = true;
    } else {
      const isDirectPixel =
        s.value.kind === "identifier" && s.value.name === "pixel";
      if (t === "pixel" && isDirectPixel) pixelConstant = true;
      if ((t === "pixel" && !isDirectPixel) || t === "derived-pixel")
        derivedConstant = true;
    }
  });
  env.set("z", "other");
  scan(ir.loop, env, (s, current) => {
    const value = s.kind === "if" ? undefined : s.value;
    if (value && mentions(value, "c")) roles.add("role:julia-constant");
    if (
      value &&
      [...current].some(
        ([name, taint]) =>
          name !== "z" &&
          (taint === "pixel" || taint === "derived-pixel") &&
          mentions(value, name),
      )
    )
      roles.add("role:julia-constant");
    if (value && [...parameters].some((p) => mentions(value, p)))
      roles.add("role:formula-parameter");
    if (s.kind === "assignment" || s.kind === "component-assignment") {
      const prior = current.get(s.target);
      if (
        s.target !== "z" &&
        (prior === "pixel" || prior === "derived-pixel" || prior === "unknown")
      ) {
        mutableAlias = true;
        reasons.add(
          s.kind === "component-assignment"
            ? "component-write"
            : aliasRead
              ? "read-then-overwrite"
              : "loop-carried-write",
        );
      }
      if (value) {
        const t = exprTaint(value, current);
        if (s.target !== "z" && t === "pixel") aliasRead = true;
        // A copied alias is still a direct pixel value for seed purposes, but
        // is explicitly reported as a transitive constant for remediation.
        const isDirectPixel =
          value.kind === "identifier" && value.name === "pixel";
        if (t === "pixel" && isDirectPixel) pixelConstant = true;
        if ((t === "pixel" && !isDirectPixel) || t === "derived-pixel")
          derivedConstant = true;
      }
    }
  });
  if (directSeed || pixelConstant) roles.add("role:pixel-seed");
  if (derivedSeed) {
    roles.add("role:derived-pixel-constant");
    reasons.add("nontrivial-pixel-seed-not-classic");
  }
  if (pixelConstant) roles.add("role:pixel-constant");
  if (derivedConstant) roles.add("role:derived-pixel-constant");
  if (ir.loop.some((s) => JSON.stringify(s).includes('"target":"z"')))
    roles.add("role:dynamic-orbit-state");
  if (isBailoutControl(ir.bailout)) roles.add("role:bailout-control");
  else {
    roles.add("role:unresolved");
    reasons.add("bailout-control-not-proven");
  }
  let modeClass: JuliaPixelRoleModeV1 =
    (directSeed || pixelConstant || derivedConstant) &&
    !derivedSeed &&
    !mutableAlias
      ? "classic-julia"
      : derivedSeed
        ? "generalized-two-plane"
        : "undetermined";
  if (mutableAlias) {
    roles.add("role:unresolved");
    reasons.add("mutable-pixel-alias");
    modeClass = "undetermined";
  }
  if (!directSeed && !pixelConstant && !derivedConstant && !derivedSeed) {
    roles.add("role:unresolved");
    reasons.add("direct-pixel-seed-not-proven");
  }
  if (!roles.has("role:julia-constant") && modeClass === "classic-julia") {
    roles.add("role:unresolved");
    reasons.add("identity-authority-required");
    modeClass = "undetermined";
  }
  // Bailout literals are control data.  In particular, their magnitude says
  // nothing about whether the recurrence has a Julia constant.
  const ordered = roleOrder.filter((x) => roles.has(x));
  return Object.freeze({
    schema: JULIA_PIXEL_ROLE_ANALYZER_SCHEMA_V1,
    analyzerVersion: JULIA_PIXEL_ROLE_ANALYZER_VERSION_V1,
    numericProfile: ir.numericProfile,
    evaluationOrder: ir.evaluationOrder,
    roles: Object.freeze(ordered),
    modeClass,
    result: modeClass === "generalized-two-plane" ? "held" : "unknown",
    reasonCodes: Object.freeze([...reasons].sort()),
  });
}
