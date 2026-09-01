import {
  canonicalizeFrmLikeV1,
  parseFrmLikeV1,
  validateFrmLikeV1Ir,
  type FrmLikeV1Expression,
  type FrmLikeV1Ir,
  type FrmLikeV1Statement,
} from "../../frm/v1";
import { sha256HexSyncV1 } from "./revisions";

export type JuliaSourceSplitRewriteKindV1 =
  | "direct-pixel"
  | "pixel-alias"
  | "combined";

export type JuliaSourceSplitReasonV1 =
  | "julia-source-split-ir-invalid"
  | "julia-source-split-no-mechanical-role"
  | "julia-source-split-mutable-pixel-alias"
  | "julia-source-split-local-name-exhausted";

export type JuliaSourceSplitProposalResultV1 =
  | Readonly<{
      ok: true;
      schema: "fractalpark-julia-source-split-proposal/v1";
      evidenceClass: "static-candidate-only";
      rewriteKind: JuliaSourceSplitRewriteKindV1;
      directPixelReferenceCount: number;
      aliasTargets: readonly string[];
      source: string;
      sourceRevision: string;
      ir: FrmLikeV1Ir;
    }>
  | Readonly<{
      ok: false;
      evidenceClass: "fail-closed";
      reasonCode: JuliaSourceSplitReasonV1;
    }>;

function expressionNames(
  expression: FrmLikeV1Expression,
  names: Set<string>,
): void {
  switch (expression.kind) {
    case "identifier":
      names.add(expression.name);
      return;
    case "call":
      for (const argument of expression.args) expressionNames(argument, names);
      return;
    case "unary":
    case "magnitude":
      expressionNames(expression.operand, names);
      return;
    case "binary":
      expressionNames(expression.left, names);
      expressionNames(expression.right, names);
      return;
    case "number":
    case "complex":
      return;
  }
}

function statementNames(statement: FrmLikeV1Statement, names: Set<string>): void {
  if (statement.kind === "assignment" || statement.kind === "component-assignment") {
    expressionNames(statement.value, names);
    return;
  }
  expressionNames(statement.condition, names);
  for (const child of statement.then) statementNames(child, names);
  for (const branch of statement.elseIf) {
    expressionNames(branch.condition, names);
    for (const child of branch.body) statementNames(child, names);
  }
  for (const child of statement.else ?? []) statementNames(child, names);
}

function cloneExpression(
  expression: FrmLikeV1Expression,
  directPixelLocal?: string,
): FrmLikeV1Expression {
  switch (expression.kind) {
    case "number":
      return { kind: "number", value: expression.value };
    case "complex":
      return {
        kind: "complex",
        real: expression.real,
        imaginary: expression.imaginary,
      };
    case "identifier":
      return {
        kind: "identifier",
        name:
          directPixelLocal && expression.name === "pixel"
            ? directPixelLocal
            : expression.name,
      };
    case "call":
      return {
        kind: "call",
        callee: expression.callee,
        args: expression.args.map((argument) =>
          cloneExpression(argument, directPixelLocal),
        ),
      };
    case "unary":
      return {
        kind: "unary",
        operator: expression.operator,
        operand: cloneExpression(expression.operand, directPixelLocal),
      };
    case "magnitude":
      return {
        kind: "magnitude",
        operand: cloneExpression(expression.operand, directPixelLocal),
      };
    case "binary":
      return {
        kind: "binary",
        operator: expression.operator,
        left: cloneExpression(expression.left, directPixelLocal),
        right: cloneExpression(expression.right, directPixelLocal),
      };
  }
}

function cloneStatement(
  statement: FrmLikeV1Statement,
  directPixelLocal?: string,
): FrmLikeV1Statement {
  if (statement.kind === "assignment")
    return {
      kind: "assignment",
      target: statement.target,
      value: cloneExpression(statement.value, directPixelLocal),
    };
  if (statement.kind === "component-assignment")
    return {
      kind: "component-assignment",
      component: statement.component,
      target: statement.target,
      value: cloneExpression(statement.value, directPixelLocal),
    };
  return {
    kind: "if",
    condition: cloneExpression(statement.condition, directPixelLocal),
    then: statement.then.map((child) =>
      cloneStatement(child, directPixelLocal),
    ),
    elseIf: statement.elseIf.map((branch) => ({
      condition: cloneExpression(branch.condition, directPixelLocal),
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

function countDirectPixel(expression: FrmLikeV1Expression): number {
  switch (expression.kind) {
    case "identifier":
      return expression.name === "pixel" ? 1 : 0;
    case "call":
      return expression.args.reduce(
        (sum, argument) => sum + countDirectPixel(argument),
        0,
      );
    case "unary":
    case "magnitude":
      return countDirectPixel(expression.operand);
    case "binary":
      return (
        countDirectPixel(expression.left) + countDirectPixel(expression.right)
      );
    case "number":
    case "complex":
      return 0;
  }
}

function countStatementDirectPixel(statement: FrmLikeV1Statement): number {
  if (statement.kind === "assignment" || statement.kind === "component-assignment")
    return countDirectPixel(statement.value);
  return (
    countDirectPixel(statement.condition) +
    statement.then.reduce(
      (sum, child) => sum + countStatementDirectPixel(child),
      0,
    ) +
    statement.elseIf.reduce(
      (sum, branch) =>
        sum +
        countDirectPixel(branch.condition) +
        branch.body.reduce(
          (childSum, child) => childSum + countStatementDirectPixel(child),
          0,
        ),
      0,
    ) +
    (statement.else?.reduce(
      (sum, child) => sum + countStatementDirectPixel(child),
      0,
    ) ?? 0)
  );
}

function statementAssignedNames(
  statement: FrmLikeV1Statement,
  names: Set<string>,
): void {
  if (statement.kind === "assignment" || statement.kind === "component-assignment") {
    names.add(statement.target);
    return;
  }
  for (const child of statement.then) statementAssignedNames(child, names);
  for (const branch of statement.elseIf)
    for (const child of branch.body) statementAssignedNames(child, names);
  for (const child of statement.else ?? []) statementAssignedNames(child, names);
}

function splitAssignment(target: string): FrmLikeV1Statement {
  return {
    kind: "if",
    condition: { kind: "identifier", name: "ismand" },
    then: [
      {
        kind: "assignment",
        target,
        value: { kind: "identifier", name: "pixel" },
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
    const candidate =
      suffix === 0 ? "juliaOrbitConstant" : `juliaOrbitConstant${suffix + 1}`;
    if (!occupied.has(candidate)) return candidate;
  }
  return undefined;
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) clone[key] = immutable(child);
    return Object.freeze(clone) as T;
  }
  return value;
}

function proposeJuliaSourceSplitUncheckedV1(
  ir: FrmLikeV1Ir,
): JuliaSourceSplitProposalResultV1 {
  if (!validateFrmLikeV1Ir(ir).ok)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-ir-invalid",
    };

  const loopNames = new Set<string>();
  for (const statement of ir.loop) statementNames(statement, loopNames);
  const loopAssignedNames = new Set<string>();
  for (const statement of ir.loop)
    statementAssignedNames(statement, loopAssignedNames);
  const complexLocals = new Set(
    ir.locals
      .filter((local) => local.type === "complex")
      .map((local) => local.name),
  );
  const livePixelAliases = new Set<string>();
  for (const statement of ir.init) {
    if (
      statement.kind === "assignment" &&
      statement.value.kind === "identifier" &&
      statement.value.name === "pixel" &&
      statement.target !== "z" &&
      complexLocals.has(statement.target) &&
      loopNames.has(statement.target)
    )
      livePixelAliases.add(statement.target);
  }
  if ([...livePixelAliases].some((target) => loopAssignedNames.has(target)))
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-mutable-pixel-alias",
    };

  const aliasTargets = new Set(livePixelAliases);
  const init = ir.init.map((statement) => {
    if (
      statement.kind === "assignment" &&
      statement.value.kind === "identifier" &&
      statement.value.name === "pixel" &&
      aliasTargets.has(statement.target)
    ) {
      return splitAssignment(statement.target);
    }
    return cloneStatement(statement);
  });
  const directPixelReferenceCount = ir.loop.reduce(
    (sum, statement) => sum + countStatementDirectPixel(statement),
    0,
  );
  if (directPixelReferenceCount === 0 && aliasTargets.size === 0)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-no-mechanical-role",
    };

  let directPixelLocal: string | undefined;
  const locals = ir.locals.map((local) => ({ ...local }));
  if (directPixelReferenceCount > 0) {
    directPixelLocal = availableConstantLocal(ir);
    if (!directPixelLocal)
      return {
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "julia-source-split-local-name-exhausted",
      };
    locals.push({ name: directPixelLocal, type: "complex" });
    init.push(splitAssignment(directPixelLocal));
  }
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
      reasonCode: "julia-source-split-ir-invalid",
    };
  const source = canonicalizeFrmLikeV1(transformed);
  const reparsed = parseFrmLikeV1(source);
  if (!reparsed.ok || canonicalizeFrmLikeV1(reparsed.ir) !== source)
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-ir-invalid",
    };

  const rewriteKind: JuliaSourceSplitRewriteKindV1 =
    directPixelReferenceCount > 0 && aliasTargets.size > 0
      ? "combined"
      : directPixelReferenceCount > 0
        ? "direct-pixel"
        : "pixel-alias";
  return immutable({
    ok: true,
    schema: "fractalpark-julia-source-split-proposal/v1",
    evidenceClass: "static-candidate-only",
    rewriteKind,
    directPixelReferenceCount,
    aliasTargets: [...aliasTargets].sort(),
    source,
    sourceRevision: sha256HexSyncV1(source),
    ir: reparsed.ir,
  });
}

export function proposeJuliaSourceSplitV1(
  ir: FrmLikeV1Ir,
): JuliaSourceSplitProposalResultV1 {
  try {
    return proposeJuliaSourceSplitUncheckedV1(ir);
  } catch {
    return {
      ok: false,
      evidenceClass: "fail-closed",
      reasonCode: "julia-source-split-ir-invalid",
    };
  }
}
