import {
  hashFrmLikeV1,
  validateFrmLikeV1Ir,
  type FrmLikeV1Expression,
  type FrmLikeV1Ir,
  type FrmLikeV1Statement,
} from "../../frm/v1";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1 =
  "fractalpark-julia-pixel-changed-region-analyzer/v1" as const;
export const JULIA_PIXEL_CHANGED_REGION_ANALYZER_VERSION_V1 =
  "source-diff-to-production-ir-node-and-def-use-region/v1" as const;

export type JuliaPixelAnalysisPlaneV1 = "parameter-plane" | "julia-plane";
export type JuliaPixelReachabilityV1 = "reachable" | "unreachable" | "unknown";

export interface JuliaPixelChangedRegionSourceInputV1 {
  readonly formulaId: string;
  readonly source: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly sourceAuthorityContentHash: string;
  readonly ir: FrmLikeV1Ir;
}

export interface JuliaPixelChangedRegionV1 {
  readonly regionId: string;
  readonly nodePath: string;
  readonly sourceSpanRef: string;
  readonly nodeKind: string;
  readonly beforeDigest: string | null;
  readonly afterDigest: string | null;
  readonly parameterPlaneReachability: JuliaPixelReachabilityV1;
  readonly juliaPlaneReachability: JuliaPixelReachabilityV1;
  readonly requiredCoverageModes: readonly JuliaPixelAnalysisPlaneV1[];
}

export interface JuliaPixelChangedRegionAnalysisV1 {
  readonly schema: typeof JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1;
  readonly analyzerVersion: typeof JULIA_PIXEL_CHANGED_REGION_ANALYZER_VERSION_V1;
  readonly unknownTreatment: "reachable";
  readonly formulaId: string;
  readonly beforeSourceRevision: string;
  readonly afterSourceRevision: string;
  readonly beforeSemanticHash: string;
  readonly afterSemanticHash: string;
  readonly beforeSourceAuthorityContentHash: string;
  readonly afterSourceAuthorityContentHash: string;
  readonly regions: readonly JuliaPixelChangedRegionV1[];
  readonly reachableOrUnknownRegionCount: number;
  readonly contentHash: string;
}

export interface JuliaPixelChangedRegionCoverageEntryV1 {
  readonly regionId: string;
  readonly coveredModes: readonly JuliaPixelAnalysisPlaneV1[];
}

export type JuliaPixelChangedRegionAnalysisResultV1 =
  | { readonly ok: true; readonly value: JuliaPixelChangedRegionAnalysisV1 }
  | {
      readonly ok: false;
      readonly code:
        | "julia-pixel-changed-region-ir-invalid"
        | "julia-pixel-changed-region-source-binding-invalid"
        | "julia-pixel-changed-region-analysis-invalid";
    };

export type JuliaPixelChangedRegionCoverageResultV1 =
  | {
      readonly ok: true;
      readonly coveredRegionCount: number;
      readonly uncoveredReachableOrUnknownRegionCount: 0;
    }
  | {
      readonly ok: false;
      readonly code: "julia-pixel-changed-region-coverage-invalid";
      readonly uncoveredReachableOrUnknownRegionCount: number;
    };

type PlaneReachability = Readonly<
  Record<JuliaPixelAnalysisPlaneV1, JuliaPixelReachabilityV1>
>;
type FlatRegion = Readonly<{
  nodePath: string;
  sourceSpanRef: string;
  nodeKind: string;
  digest: string;
  reachability: PlaneReachability;
}>;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function digest(value: unknown): string {
  return sha256HexSyncV1(canonicalJsonV1(value, 32_768));
}

function joinReachability(
  left: JuliaPixelReachabilityV1,
  right: JuliaPixelReachabilityV1,
): JuliaPixelReachabilityV1 {
  if (left === "unreachable" && right === "unreachable") return "unreachable";
  if (left === "reachable" || right === "reachable") return "reachable";
  return "unknown";
}

function childReachability(
  parent: JuliaPixelReachabilityV1,
  condition: boolean | undefined,
  branchTakenWhenTrue: boolean,
): JuliaPixelReachabilityV1 {
  if (parent === "unreachable") return "unreachable";
  if (condition === undefined) return "unknown";
  return condition === branchTakenWhenTrue ? parent : "unreachable";
}

function numberValue(
  expression: FrmLikeV1Expression,
  ismand: boolean,
): number | undefined {
  if (expression.kind === "number") return Math.fround(expression.value);
  if (expression.kind === "identifier" && expression.name === "ismand")
    return ismand ? 1 : 0;
  if (expression.kind === "unary" && expression.operator === "-") {
    const operand = numberValue(expression.operand, ismand);
    return operand === undefined ? undefined : Math.fround(-operand);
  }
  if (expression.kind !== "binary") return undefined;
  const left = numberValue(expression.left, ismand);
  const right = numberValue(expression.right, ismand);
  if (left === undefined || right === undefined) return undefined;
  if (expression.operator === "+") return Math.fround(left + right);
  if (expression.operator === "-") return Math.fround(left - right);
  if (expression.operator === "*") return Math.fround(left * right);
  if (expression.operator === "/")
    return right === 0 ? undefined : Math.fround(left / right);
  return undefined;
}

function booleanValue(
  expression: FrmLikeV1Expression,
  ismand: boolean,
): boolean | undefined {
  if (expression.kind === "identifier" && expression.name === "ismand") return ismand;
  if (expression.kind === "unary" && expression.operator === "!") {
    const operand = booleanValue(expression.operand, ismand);
    return operand === undefined ? undefined : !operand;
  }
  if (expression.kind !== "binary") return undefined;
  const left = numberValue(expression.left, ismand);
  const right = numberValue(expression.right, ismand);
  if (left === undefined || right === undefined) return undefined;
  if (expression.operator === "<") return left < right;
  if (expression.operator === "<=") return left <= right;
  if (expression.operator === ">") return left > right;
  if (expression.operator === ">=") return left >= right;
  if (expression.operator === "==") return left === right;
  if (expression.operator === "!=") return left !== right;
  return undefined;
}

function addRegion(
  output: FlatRegion[],
  nodePath: string,
  nodeKind: string,
  value: unknown,
  reachability: PlaneReachability,
): void {
  output.push(
    immutable({
      nodePath,
      sourceSpanRef: `canonical-ir:${nodePath}`,
      nodeKind,
      digest: digest(value),
      reachability,
    }),
  );
}

function expressionShell(expression: FrmLikeV1Expression): unknown {
  if (
    expression.kind === "number" ||
    expression.kind === "complex" ||
    expression.kind === "identifier"
  )
    return expression;
  if (expression.kind === "call")
    return {
      kind: expression.kind,
      callee: expression.callee,
      arity: expression.args.length,
    };
  if (expression.kind === "unary")
    return { kind: expression.kind, operator: expression.operator };
  if (expression.kind === "magnitude") return { kind: expression.kind };
  return { kind: expression.kind, operator: expression.operator };
}

function statementShell(statement: FrmLikeV1Statement): unknown {
  if (statement.kind === "assignment")
    return { kind: statement.kind, target: statement.target };
  if (statement.kind === "component-assignment")
    return {
      kind: statement.kind,
      component: statement.component,
      target: statement.target,
    };
  return {
    kind: statement.kind,
    elseIfCount: statement.elseIf.length,
    hasElse: statement.else !== undefined,
  };
}

function flattenExpression(
  expression: FrmLikeV1Expression,
  path: string,
  reachability: PlaneReachability,
  output: FlatRegion[],
): void {
  addRegion(
    output,
    path,
    `expression:${expression.kind}`,
    expressionShell(expression),
    reachability,
  );
  if (expression.kind === "call")
    expression.args.forEach((child, index) =>
      flattenExpression(child, `${path}/args/${index}`, reachability, output),
    );
  else if (expression.kind === "unary" || expression.kind === "magnitude")
    flattenExpression(expression.operand, `${path}/operand`, reachability, output);
  else if (expression.kind === "binary") {
    flattenExpression(expression.left, `${path}/left`, reachability, output);
    flattenExpression(expression.right, `${path}/right`, reachability, output);
  }
}

function branchReachability(
  condition: FrmLikeV1Expression,
  parent: PlaneReachability,
  branchTakenWhenTrue: boolean,
): PlaneReachability {
  return {
    "parameter-plane": childReachability(
      parent["parameter-plane"],
      booleanValue(condition, true),
      branchTakenWhenTrue,
    ),
    "julia-plane": childReachability(
      parent["julia-plane"],
      booleanValue(condition, false),
      branchTakenWhenTrue,
    ),
  };
}

function flattenStatements(
  statements: readonly FrmLikeV1Statement[],
  path: string,
  reachability: PlaneReachability,
  output: FlatRegion[],
): void {
  statements.forEach((statement, index) => {
    const statementPath = `${path}/${index}`;
    addRegion(
      output,
      statementPath,
      `statement:${statement.kind}`,
      statementShell(statement),
      reachability,
    );
    if (statement.kind === "assignment" || statement.kind === "component-assignment") {
      flattenExpression(
        statement.value,
        `${statementPath}/value`,
        reachability,
        output,
      );
      return;
    }
    flattenExpression(
      statement.condition,
      `${statementPath}/condition`,
      reachability,
      output,
    );
    const thenReachability = branchReachability(
      statement.condition,
      reachability,
      true,
    );
    flattenStatements(
      statement.then,
      `${statementPath}/then`,
      thenReachability,
      output,
    );
    let priorCouldMatch: PlaneReachability = reachability;
    const firstCondition = statement.condition;
    priorCouldMatch = branchReachability(firstCondition, priorCouldMatch, false);
    statement.elseIf.forEach((branch, branchIndex) => {
      const branchPath = `${statementPath}/elseIf/${branchIndex}`;
      flattenExpression(
        branch.condition,
        `${branchPath}/condition`,
        priorCouldMatch,
        output,
      );
      const current = branchReachability(branch.condition, priorCouldMatch, true);
      flattenStatements(branch.body, `${branchPath}/body`, current, output);
      priorCouldMatch = branchReachability(branch.condition, priorCouldMatch, false);
    });
    if (statement.else)
      flattenStatements(
        statement.else,
        `${statementPath}/else`,
        priorCouldMatch,
        output,
      );
  });
}

function flattenIr(ir: FrmLikeV1Ir): Map<string, FlatRegion> {
  const output: FlatRegion[] = [];
  const reachable: PlaneReachability = {
    "parameter-plane": "reachable",
    "julia-plane": "reachable",
  };
  addRegion(output, "metadata/formulaName", "metadata", ir.formulaName, reachable);
  addRegion(output, "metadata/evaluationOrder", "metadata", ir.evaluationOrder, reachable);
  addRegion(
    output,
    "metadata/classicGuards",
    "metadata",
    ir.classicGuards ?? [],
    reachable,
  );
  ir.parameters.forEach((parameter, index) =>
    addRegion(output, `parameters/${index}`, "parameter", parameter, reachable),
  );
  ir.locals.forEach((local, index) =>
    addRegion(output, `locals/${index}`, "local", local, reachable),
  );
  flattenStatements(ir.init, "init", reachable, output);
  flattenStatements(ir.loop, "loop", reachable, output);
  flattenExpression(ir.bailout, "bailout", reachable, output);
  return new Map(output.map((entry) => [entry.nodePath, entry]));
}

function effectiveReachability(
  before: JuliaPixelReachabilityV1 | undefined,
  after: JuliaPixelReachabilityV1 | undefined,
): JuliaPixelReachabilityV1 {
  if (before === undefined) return after ?? "unknown";
  if (after === undefined) return before;
  return joinReachability(before, after);
}

function analyzeUnchecked(
  before: JuliaPixelChangedRegionSourceInputV1,
  after: JuliaPixelChangedRegionSourceInputV1,
): JuliaPixelChangedRegionAnalysisV1 {
  const beforeRegions = flattenIr(before.ir);
  const afterRegions = flattenIr(after.ir);
  const paths = [...new Set([...beforeRegions.keys(), ...afterRegions.keys()])].sort();
  const regions: JuliaPixelChangedRegionV1[] = [];
  for (const nodePath of paths) {
    const previous = beforeRegions.get(nodePath);
    const next = afterRegions.get(nodePath);
    if (previous?.digest === next?.digest) continue;
    const parameterPlaneReachability = effectiveReachability(
      previous?.reachability["parameter-plane"],
      next?.reachability["parameter-plane"],
    );
    const juliaPlaneReachability = effectiveReachability(
      previous?.reachability["julia-plane"],
      next?.reachability["julia-plane"],
    );
    const requiredCoverageModes = (
      [
        ["parameter-plane", parameterPlaneReachability],
        ["julia-plane", juliaPlaneReachability],
      ] as const
    )
      .filter(([, reachability]) => reachability !== "unreachable")
      .map(([plane]) => plane);
    const regionIdentity = {
      nodePath,
      beforeDigest: previous?.digest ?? null,
      afterDigest: next?.digest ?? null,
    };
    regions.push(
      immutable({
        regionId: sha256HexSyncV1(canonicalJsonV1(regionIdentity)),
        nodePath,
        sourceSpanRef: previous?.sourceSpanRef ?? next!.sourceSpanRef,
        nodeKind: previous?.nodeKind ?? next!.nodeKind,
        beforeDigest: previous?.digest ?? null,
        afterDigest: next?.digest ?? null,
        parameterPlaneReachability,
        juliaPlaneReachability,
        requiredCoverageModes,
      }),
    );
  }
  const content = {
    schema: JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1,
    analyzerVersion: JULIA_PIXEL_CHANGED_REGION_ANALYZER_VERSION_V1,
    unknownTreatment: "reachable" as const,
    formulaId: before.formulaId,
    beforeSourceRevision: before.sourceRevision,
    afterSourceRevision: after.sourceRevision,
    beforeSemanticHash: before.semanticHash,
    afterSemanticHash: after.semanticHash,
    beforeSourceAuthorityContentHash: before.sourceAuthorityContentHash,
    afterSourceAuthorityContentHash: after.sourceAuthorityContentHash,
    regions,
    reachableOrUnknownRegionCount: regions.filter(
      (region) => region.requiredCoverageModes.length > 0,
    ).length,
  };
  return immutable({
    ...content,
    contentHash: sha256HexSyncV1(canonicalJsonV1(content, 131_072)),
  });
}

async function sourceBindingValid(
  input: JuliaPixelChangedRegionSourceInputV1,
): Promise<boolean> {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      input.formulaId,
    ) ||
    !/^[a-f0-9]{64}$/.test(input.sourceRevision) ||
    !/^[a-f0-9]{64}$/.test(input.semanticHash) ||
    !/^[a-f0-9]{64}$/.test(input.sourceAuthorityContentHash) ||
    !validateFrmLikeV1Ir(input.ir).ok
  )
    return false;
  const actual = await hashFrmLikeV1(input.source, input.ir);
  return (
    actual.sourceRevision === input.sourceRevision &&
    actual.semanticHash === input.semanticHash
  );
}

export async function analyzeJuliaPixelChangedRegionsV1(
  before: JuliaPixelChangedRegionSourceInputV1,
  after: JuliaPixelChangedRegionSourceInputV1,
): Promise<JuliaPixelChangedRegionAnalysisResultV1> {
  try {
    if (!validateFrmLikeV1Ir(before.ir).ok || !validateFrmLikeV1Ir(after.ir).ok)
      return { ok: false, code: "julia-pixel-changed-region-ir-invalid" };
    if (
      before.formulaId !== after.formulaId ||
      !(await sourceBindingValid(before)) ||
      !(await sourceBindingValid(after))
    )
      return {
        ok: false,
        code: "julia-pixel-changed-region-source-binding-invalid",
      };
    return { ok: true, value: analyzeUnchecked(before, after) };
  } catch {
    return { ok: false, code: "julia-pixel-changed-region-analysis-invalid" };
  }
}

export function verifyJuliaPixelChangedRegionCoverageV1(
  analysis: JuliaPixelChangedRegionAnalysisV1,
  coverage: readonly JuliaPixelChangedRegionCoverageEntryV1[],
): JuliaPixelChangedRegionCoverageResultV1 {
  try {
    const expectedContent = {
      schema: analysis.schema,
      analyzerVersion: analysis.analyzerVersion,
      unknownTreatment: analysis.unknownTreatment,
      formulaId: analysis.formulaId,
      beforeSourceRevision: analysis.beforeSourceRevision,
      afterSourceRevision: analysis.afterSourceRevision,
      beforeSemanticHash: analysis.beforeSemanticHash,
      afterSemanticHash: analysis.afterSemanticHash,
      beforeSourceAuthorityContentHash:
        analysis.beforeSourceAuthorityContentHash,
      afterSourceAuthorityContentHash: analysis.afterSourceAuthorityContentHash,
      regions: analysis.regions,
      reachableOrUnknownRegionCount: analysis.reachableOrUnknownRegionCount,
    };
    if (
      analysis.schema !== JULIA_PIXEL_CHANGED_REGION_ANALYZER_SCHEMA_V1 ||
      analysis.analyzerVersion !== JULIA_PIXEL_CHANGED_REGION_ANALYZER_VERSION_V1 ||
      analysis.unknownTreatment !== "reachable" ||
      analysis.contentHash !==
        sha256HexSyncV1(canonicalJsonV1(expectedContent, 131_072)) ||
      new Set(analysis.regions.map((region) => region.regionId)).size !==
        analysis.regions.length ||
      new Set(coverage.map((entry) => entry.regionId)).size !== coverage.length
    )
      return {
        ok: false,
        code: "julia-pixel-changed-region-coverage-invalid",
        uncoveredReachableOrUnknownRegionCount:
          analysis.reachableOrUnknownRegionCount,
      };
    const coverageById = new Map(
      coverage.map((entry) => [entry.regionId, new Set(entry.coveredModes)]),
    );
    let uncovered = 0;
    for (const region of analysis.regions) {
      const modes = coverageById.get(region.regionId);
      if (
        region.requiredCoverageModes.some(
          (mode) => !modes?.has(mode),
        )
      )
        uncovered += 1;
    }
    if (uncovered > 0)
      return {
        ok: false,
        code: "julia-pixel-changed-region-coverage-invalid",
        uncoveredReachableOrUnknownRegionCount: uncovered,
      };
    return {
      ok: true,
      coveredRegionCount: analysis.regions.length,
      uncoveredReachableOrUnknownRegionCount: 0,
    };
  } catch {
    return {
      ok: false,
      code: "julia-pixel-changed-region-coverage-invalid",
      uncoveredReachableOrUnknownRegionCount:
        analysis.reachableOrUnknownRegionCount,
    };
  }
}
