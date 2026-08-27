import {
  canonicalizeFrmLikeV1,
  parseFrmLikeV1,
  validateFrmLikeV1Ir,
  type FrmLikeV1Expression,
  type FrmLikeV1Ir,
  type FrmLikeV1Statement,
} from "../../frm/v1";
import { sha256HexSyncV1 } from "./revisions";

export const JULIA_PIXEL_RECOVERY_CANDIDATE_SCHEMA_V1 =
  "fractalpark-julia-pixel-recovery-candidate/v1" as const;
export const JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1 =
  "production-ir-unique-recurrence-constant-source-order/v1" as const;

export type JuliaPixelRecoveryCandidateRewriteKindV1 =
  | "direct-pixel-constant"
  | "transitive-pixel-constant";

export type JuliaPixelRecoveryCandidateHoldReasonV1 =
  | "generalized-two-plane-held"
  | "mutable-pixel-alias-held"
  | "constant-role-not-proven"
  | "constant-role-not-unique"
  | "constant-role-outside-recurrence"
  | "constant-definition-not-unique"
  | "constant-initialization-control-not-proven"
  | "constant-target-not-complex"
  | "constant-target-written-after-initialization"
  | "constant-target-used-by-bailout"
  | "candidate-local-name-exhausted"
  | "candidate-ir-invalid";

export interface JuliaPixelRecoveryCandidateRoleAuthorityV1 {
  readonly roles: readonly string[];
  readonly modeClass: "classic-julia" | "generalized-two-plane" | "undetermined";
  readonly reasonCodes: readonly string[];
}

export type JuliaPixelRecoveryCandidateProposalV1 =
  | Readonly<{
      ok: true;
      schema: typeof JULIA_PIXEL_RECOVERY_CANDIDATE_SCHEMA_V1;
      analyzerVersion: typeof JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1;
      evidenceClass: "E0-candidate-only";
      rewriteKind: JuliaPixelRecoveryCandidateRewriteKindV1;
      constantTarget: string | null;
      provenanceDepth: number;
      recurrenceReadCount: number;
      source: string;
      sourceRevision: string;
      ir: FrmLikeV1Ir;
    }>
  | Readonly<{
      ok: false;
      evidenceClass: "fail-closed";
      reasonCode: JuliaPixelRecoveryCandidateHoldReasonV1;
    }>;

type Provenance = Readonly<{
  dependsOnPixel: boolean;
  depth: number;
}>;
type ConstantUse = Readonly<{
  name: string;
  context: "z-recurrence-rhs" | "other";
}>;

const MUTABLE_REASONS = Object.freeze([
  "mutable-pixel-alias",
  "component-write",
  "read-then-overwrite",
  "loop-carried-write",
]);

function expressionNames(
  expression: FrmLikeV1Expression,
  output = new Set<string>(),
): Set<string> {
  if (expression.kind === "identifier") output.add(expression.name);
  else if (expression.kind === "call")
    for (const argument of expression.args) expressionNames(argument, output);
  else if (expression.kind === "unary" || expression.kind === "magnitude")
    expressionNames(expression.operand, output);
  else if (expression.kind === "binary") {
    expressionNames(expression.left, output);
    expressionNames(expression.right, output);
  }
  return output;
}

function expressionProvenance(
  expression: FrmLikeV1Expression,
  environment: ReadonlyMap<string, Provenance>,
): Provenance {
  const names = [...expressionNames(expression)];
  const dependsOnPixel =
    names.includes("pixel") ||
    names.some((name) => environment.get(name)?.dependsOnPixel === true);
  if (!dependsOnPixel) return { dependsOnPixel: false, depth: 0 };
  return {
    dependsOnPixel: true,
    depth:
      1 +
      Math.max(
        0,
        ...names.map(
          (name) =>
            environment.get(name)?.depth ?? (name === "pixel" ? 0 : -1),
        ),
      ),
  };
}

function collectConstantUses(
  expression: FrmLikeV1Expression,
  environment: ReadonlyMap<string, Provenance>,
  context: ConstantUse["context"],
  output: ConstantUse[],
): void {
  if (expression.kind === "identifier") {
    if (
      expression.name !== "z" &&
      (expression.name === "pixel" ||
        environment.get(expression.name)?.dependsOnPixel === true)
    )
      output.push({ name: expression.name, context });
    return;
  }
  if (expression.kind === "call") {
    for (const argument of expression.args)
      collectConstantUses(argument, environment, context, output);
    return;
  }
  if (expression.kind === "unary" || expression.kind === "magnitude") {
    collectConstantUses(expression.operand, environment, context, output);
    return;
  }
  if (expression.kind === "binary") {
    collectConstantUses(expression.left, environment, context, output);
    collectConstantUses(expression.right, environment, context, output);
  }
}

function collectLoopFacts(
  statement: FrmLikeV1Statement,
  environment: ReadonlyMap<string, Provenance>,
  uses: ConstantUse[],
  writes: Set<string>,
): void {
  if (
    statement.kind === "assignment" ||
    statement.kind === "component-assignment"
  ) {
    writes.add(statement.target);
    collectConstantUses(
      statement.value,
      environment,
      statement.kind === "assignment" && statement.target === "z"
        ? "z-recurrence-rhs"
        : "other",
      uses,
    );
    return;
  }
  collectConstantUses(statement.condition, environment, "other", uses);
  for (const child of statement.then)
    collectLoopFacts(child, environment, uses, writes);
  for (const branch of statement.elseIf) {
    collectConstantUses(branch.condition, environment, "other", uses);
    for (const child of branch.body)
      collectLoopFacts(child, environment, uses, writes);
  }
  for (const child of statement.else ?? [])
    collectLoopFacts(child, environment, uses, writes);
}

function cloneExpression(
  expression: FrmLikeV1Expression,
  directPixelLocal?: string,
): FrmLikeV1Expression {
  if (expression.kind === "number")
    return { kind: "number", value: expression.value };
  if (expression.kind === "complex")
    return {
      kind: "complex",
      real: expression.real,
      imaginary: expression.imaginary,
    };
  if (expression.kind === "identifier")
    return {
      kind: "identifier",
      name:
        directPixelLocal && expression.name === "pixel"
          ? directPixelLocal
          : expression.name,
    };
  if (expression.kind === "call")
    return {
      kind: "call",
      callee: expression.callee,
      args: expression.args.map((argument) =>
        cloneExpression(argument, directPixelLocal),
      ),
    };
  if (expression.kind === "unary")
    return {
      kind: "unary",
      operator: expression.operator,
      operand: cloneExpression(expression.operand, directPixelLocal),
    };
  if (expression.kind === "magnitude")
    return {
      kind: "magnitude",
      operand: cloneExpression(expression.operand, directPixelLocal),
    };
  return {
    kind: "binary",
    operator: expression.operator,
    left: cloneExpression(expression.left, directPixelLocal),
    right: cloneExpression(expression.right, directPixelLocal),
  };
}

function cloneStatement(
  statement: FrmLikeV1Statement,
  directPixelLocal?: string,
): FrmLikeV1Statement {
  if (statement.kind === "assignment")
    return {
      kind: "assignment",
      target: statement.target,
      value: cloneExpression(
        statement.value,
        statement.target === "z" ? directPixelLocal : undefined,
      ),
    };
  if (statement.kind === "component-assignment")
    return {
      kind: "component-assignment",
      component: statement.component,
      target: statement.target,
      value: cloneExpression(statement.value),
    };
  return {
    kind: "if",
    condition: cloneExpression(statement.condition),
    then: statement.then.map((child) =>
      cloneStatement(child, directPixelLocal),
    ),
    elseIf: statement.elseIf.map((branch) => ({
      condition: cloneExpression(branch.condition),
      body: branch.body.map((child) =>
        cloneStatement(child, directPixelLocal),
      ),
    })),
    ...(statement.else
      ? {
          else: statement.else.map((child) =>
            cloneStatement(child, directPixelLocal),
          ),
        }
      : {}),
  };
}

function modeSplitAssignment(
  target: string,
  parameterPlaneValue: FrmLikeV1Expression,
): FrmLikeV1Statement {
  return {
    kind: "if",
    condition: { kind: "identifier", name: "ismand" },
    then: [
      {
        kind: "assignment",
        target,
        value: cloneExpression(parameterPlaneValue),
      },
    ],
    elseIf: [],
    else: [
      {
        kind: "assignment",
        target,
        value: { kind: "identifier", name: "c" },
      },
    ],
  };
}

function juliaSeedAssignment(): FrmLikeV1Statement {
  return {
    kind: "if",
    condition: {
      kind: "unary",
      operator: "!",
      operand: { kind: "identifier", name: "ismand" },
    },
    then: [
      {
        kind: "assignment",
        target: "z",
        value: { kind: "identifier", name: "pixel" },
      },
    ],
    elseIf: [],
  };
}

function availableConstantLocal(ir: FrmLikeV1Ir): string | undefined {
  const occupied = new Set([
    "pixel",
    "c",
    "z",
    "ismand",
    ...ir.parameters.map((parameter) => parameter.name),
    ...ir.locals.map((local) => local.name),
  ]);
  for (let suffix = 0; suffix <= ir.locals.length + 1; suffix++) {
    const name =
      suffix === 0
        ? "juliaOrbitConstant"
        : `juliaOrbitConstant${suffix + 1}`;
    if (!occupied.has(name)) return name;
  }
  return undefined;
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value))
      output[key] = immutable(child);
    return Object.freeze(output) as T;
  }
  return value;
}

function proposeUnchecked(
  ir: FrmLikeV1Ir,
  authority: JuliaPixelRecoveryCandidateRoleAuthorityV1,
): JuliaPixelRecoveryCandidateProposalV1 {
  if (!validateFrmLikeV1Ir(ir).ok)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "candidate-ir-invalid",
    };
  if (
    authority.modeClass === "generalized-two-plane" ||
    authority.reasonCodes.includes("nontrivial-pixel-seed-not-classic")
  )
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "generalized-two-plane-held",
    };
  if (
    authority.reasonCodes.some((reason) => MUTABLE_REASONS.includes(reason))
  )
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "mutable-pixel-alias-held",
    };

  const environment = new Map<string, Provenance>();
  const definitionCounts = new Map<string, number>();
  const definitionValues = new Map<string, FrmLikeV1Expression>();
  let hasInitializationControl = false;
  for (const statement of ir.init) {
    if (statement.kind !== "assignment") {
      hasInitializationControl = true;
      continue;
    }
    definitionCounts.set(
      statement.target,
      (definitionCounts.get(statement.target) ?? 0) + 1,
    );
    environment.set(
      statement.target,
      expressionProvenance(statement.value, environment),
    );
    definitionValues.set(statement.target, statement.value);
  }

  const uses: ConstantUse[] = [];
  const loopWrites = new Set<string>();
  for (const statement of ir.loop)
    collectLoopFacts(statement, environment, uses, loopWrites);
  if (uses.length === 0)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "constant-role-not-proven",
    };
  if (uses.some((use) => use.context !== "z-recurrence-rhs"))
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "constant-role-outside-recurrence",
    };
  const roleNames = [...new Set(uses.map((use) => use.name))];
  if (roleNames.length !== 1)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "constant-role-not-unique",
    };

  const constantTarget = roleNames[0]!;
  const direct = constantTarget === "pixel";
  const bailoutUses: ConstantUse[] = [];
  collectConstantUses(
    ir.bailout,
    environment,
    "other",
    bailoutUses,
  );
  if (bailoutUses.length > 0)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "constant-target-used-by-bailout",
    };
  let provenanceDepth = 0;
  if (!direct) {
    if (hasInitializationControl)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-initialization-control-not-proven",
      };
    if (definitionCounts.get(constantTarget) !== 1)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-definition-not-unique",
      };
    if (
      !ir.locals.some(
        (local) => local.name === constantTarget && local.type === "complex",
      )
    )
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-target-not-complex",
      };
    if (loopWrites.has(constantTarget))
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-target-written-after-initialization",
      };
    provenanceDepth = environment.get(constantTarget)?.depth ?? 0;
    if (provenanceDepth < 1)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-role-not-proven",
      };
  }

  let directPixelLocal: string | undefined;
  const locals = ir.locals.map((local) => ({ ...local }));
  if (direct) {
    directPixelLocal = availableConstantLocal(ir);
    if (!directPixelLocal)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "candidate-local-name-exhausted",
      };
    locals.push({ name: directPixelLocal, type: "complex" });
  }

  const init = ir.init.map((statement) => {
    if (
      !direct &&
      statement.kind === "assignment" &&
      statement.target === constantTarget
    )
      return modeSplitAssignment(constantTarget, statement.value);
    return cloneStatement(statement);
  });
  if (direct)
    init.push(
      modeSplitAssignment(directPixelLocal!, {
        kind: "identifier",
        name: "pixel",
      }),
    );
  init.push(juliaSeedAssignment());

  const transformed: FrmLikeV1Ir = {
    languageVersion: ir.languageVersion,
    stdlibVersion: ir.stdlibVersion,
    numericProfile: ir.numericProfile,
    formulaName: ir.formulaName,
    parameters: ir.parameters.map((parameter) => ({
      ...parameter,
      ...(parameter.hardDomain
        ? { hardDomain: [...parameter.hardDomain] as [number, number] }
        : {}),
    })),
    locals,
    evaluationOrder: ir.evaluationOrder,
    ...(ir.classicGuards ? { classicGuards: [...ir.classicGuards] } : {}),
    init,
    loop: ir.loop.map((statement) =>
      cloneStatement(statement, directPixelLocal),
    ),
    bailout: cloneExpression(ir.bailout),
  };
  if (!validateFrmLikeV1Ir(transformed).ok)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "candidate-ir-invalid",
    };
  const source = canonicalizeFrmLikeV1(transformed);
  const reparsed = parseFrmLikeV1(source);
  if (!reparsed.ok || canonicalizeFrmLikeV1(reparsed.ir) !== source)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "candidate-ir-invalid",
    };
  return immutable({
    ok: true,
    schema: JULIA_PIXEL_RECOVERY_CANDIDATE_SCHEMA_V1,
    analyzerVersion: JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1,
    evidenceClass: "E0-candidate-only",
    rewriteKind: direct
      ? "direct-pixel-constant"
      : "transitive-pixel-constant",
    constantTarget: direct ? null : constantTarget,
    provenanceDepth,
    recurrenceReadCount: uses.length,
    source,
    sourceRevision: sha256HexSyncV1(source),
    ir: reparsed.ir,
  });
}

export function proposeJuliaPixelRecoveryCandidateV1(
  ir: FrmLikeV1Ir,
  authority: JuliaPixelRecoveryCandidateRoleAuthorityV1,
): JuliaPixelRecoveryCandidateProposalV1 {
  try {
    return proposeUnchecked(ir, authority);
  } catch {
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "candidate-ir-invalid",
    };
  }
}
