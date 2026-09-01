import type { FrmV1UnaryFunctionName } from "../../frm/frm-v1-stdlib";
import type {
  FrmLikeV1Expression,
  FrmLikeV1Ir,
  FrmLikeV1Statement,
} from "../../frm/v1";
import {
  compileFrmLikeV1Backend,
  type FrmLikeV1CpuResult,
  type FrmLikeV1CpuState,
} from "../../frm/v1-backend";
import {
  JULIA_CPU_HARNESS_CONSTANTS_V1,
  JULIA_CPU_HARNESS_DEPTHS_V1,
  JULIA_CPU_HARNESS_POINTS_V1,
  type JuliaCpuComplexV1,
} from "./julia-cpu-harness";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_MUTABLE_STATE_ADJUDICATION_SCHEMA_V1 =
  "fractalpark-julia-mutable-state-adjudication/v1" as const;
export const JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1 = Object.freeze([
  "5a5062e4-635e-5569-8be7-bed7c3a05365",
  "6e987df6-9931-5242-9f83-80ebb0c922be",
  "7c45552a-cb92-5510-a7bb-25dbd60a8ff3",
  "9eca49f4-3219-5791-99fb-395ce7646f7c",
  "c45604cb-3319-59e7-b1a4-aca549ee25c2",
  "c64fd5e1-77f7-5b37-bafa-e5da99a5e22d",
  "c698d9dd-78c0-5478-8aa2-0230a9728ca8",
  "cca1c833-de83-5b34-9aa8-cd1750b28354",
  "ecabbf7e-6f47-5335-9dea-4584fef5607c",
] as const);

type Taint = "pixel" | "derived-pixel" | "other" | "unknown";
type Env = Map<string, Taint>;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function exprTaint(expression: FrmLikeV1Expression, env: Env): Taint {
  if (expression.kind === "identifier")
    return expression.name === "pixel" ? "pixel" : (env.get(expression.name) ?? "other");
  if (expression.kind === "number" || expression.kind === "complex") return "other";
  if (expression.kind === "unary" && expression.operator === "-")
    return exprTaint(expression.operand, env);
  if (expression.kind === "call" && ["real", "imag", "conj"].includes(expression.callee))
    return expression.args.length === 1 ? exprTaint(expression.args[0]!, env) : "unknown";
  if (expression.kind === "call" && expression.callee === "complex") {
    const values = expression.args.map((value) => exprTaint(value, env));
    if (values.some((value) => value === "unknown")) return "unknown";
    return values.some((value) => value === "pixel" || value === "derived-pixel")
      ? "derived-pixel"
      : "other";
  }
  const children = expression.kind === "call"
    ? expression.args
    : expression.kind === "unary" || expression.kind === "magnitude"
      ? [expression.operand]
      : [expression.left, expression.right];
  return children.some((child) => {
    const value = exprTaint(child, env);
    return value === "pixel" || value === "derived-pixel";
  }) ? "derived-pixel" : "other";
}

function scan(
  statements: readonly FrmLikeV1Statement[],
  env: Env,
  visit: (statement: FrmLikeV1Statement, env: Env) => void,
): void {
  for (const statement of statements) {
    visit(statement, env);
    if (statement.kind === "assignment") {
      env.set(statement.target, exprTaint(statement.value, env));
      continue;
    }
    if (statement.kind === "component-assignment") {
      const previous = env.get(statement.target) ?? "other";
      const value = exprTaint(statement.value, env);
      env.set(statement.target, previous === "other" && value === "other" ? "other" : "unknown");
      continue;
    }
    const branches = [
      statement.then,
      ...statement.elseIf.map((branch) => branch.body),
      ...(statement.else ? [statement.else] : []),
    ];
    const before = new Map(env);
    const after = branches.map((branch) => {
      const branchEnv = new Map(before);
      scan(branch, branchEnv, visit);
      return branchEnv;
    });
    for (const key of new Set(after.flatMap((branch) => [...branch.keys()]))) {
      const values = after.map((branch) => branch.get(key));
      env.set(key, values.some((value) => value === undefined) || new Set(values).size !== 1
        ? "unknown"
        : values[0]!);
    }
  }
}

function mutableSurface(ir: FrmLikeV1Ir): Readonly<{
  targets: readonly string[];
  componentTargets: readonly string[];
  reasonCodes: readonly string[];
}> {
  const env: Env = new Map();
  scan(ir.init, env, () => undefined);
  env.set("z", "other");
  const targets = new Set<string>();
  const componentTargets = new Set<string>();
  const reasons = new Set<string>();
  let aliasRead = false;
  scan(ir.loop, env, (statement, current) => {
    if (statement.kind !== "assignment" && statement.kind !== "component-assignment") return;
    const prior = current.get(statement.target);
    if (
      statement.target !== "z" &&
      (prior === "pixel" || prior === "derived-pixel" || prior === "unknown")
    ) {
      targets.add(statement.target);
      if (statement.kind === "component-assignment") componentTargets.add(statement.target);
      reasons.add(statement.kind === "component-assignment"
        ? "component-write"
        : aliasRead
          ? "read-then-overwrite"
          : "loop-carried-write");
    }
    const value = statement.value;
    if (statement.target !== "z" && exprTaint(value, current) === "pixel") aliasRead = true;
  });
  return Object.freeze({
    targets: Object.freeze([...targets].sort()),
    componentTargets: Object.freeze([...componentTargets].sort()),
    reasonCodes: Object.freeze([...reasons].sort()),
  });
}

function assignedNames(statements: readonly FrmLikeV1Statement[], names = new Set<string>()): Set<string> {
  for (const statement of statements) {
    if (statement.kind === "assignment" || statement.kind === "component-assignment") {
      names.add(statement.target);
      continue;
    }
    assignedNames(statement.then, names);
    for (const branch of statement.elseIf) assignedNames(branch.body, names);
    assignedNames(statement.else ?? [], names);
  }
  return names;
}

function countIdentifierExpression(expression: FrmLikeV1Expression, name: string): number {
  if (expression.kind === "identifier") return expression.name === name ? 1 : 0;
  if (expression.kind === "number" || expression.kind === "complex") return 0;
  if (expression.kind === "call")
    return expression.args.reduce((count, value) => count + countIdentifierExpression(value, name), 0);
  if (expression.kind === "unary" || expression.kind === "magnitude")
    return countIdentifierExpression(expression.operand, name);
  return countIdentifierExpression(expression.left, name) + countIdentifierExpression(expression.right, name);
}

function countIdentifierStatements(statements: readonly FrmLikeV1Statement[], name: string): number {
  let count = 0;
  for (const statement of statements) {
    if (statement.kind === "assignment" || statement.kind === "component-assignment") {
      count += countIdentifierExpression(statement.value, name);
      continue;
    }
    count += countIdentifierExpression(statement.condition, name);
    count += countIdentifierStatements(statement.then, name);
    for (const branch of statement.elseIf) {
      count += countIdentifierExpression(branch.condition, name);
      count += countIdentifierStatements(branch.body, name);
    }
    count += countIdentifierStatements(statement.else ?? [], name);
  }
  return count;
}

function sameNumber(left: number, right: number): boolean {
  return Object.is(left, right);
}

function sameComplex(left: { re: number; im: number } | undefined, right: { re: number; im: number } | undefined): boolean {
  return left !== undefined && right !== undefined && sameNumber(left.re, right.re) && sameNumber(left.im, right.im);
}

function sameRecordKeys(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(Object.keys(left).sort()) === JSON.stringify(Object.keys(right).sort());
}

function sameStateExact(left: FrmLikeV1CpuState, right: FrmLikeV1CpuState): boolean {
  if (!sameRecordKeys(left.values, right.values)) return false;
  if (!sameRecordKeys(left.functions, right.functions)) return false;
  if (!sameRecordKeys(left.booleans, right.booleans)) return false;
  for (const key of Object.keys(left.values))
    if (!sameComplex(left.values[key], right.values[key])) return false;
  for (const key of Object.keys(left.functions))
    if (left.functions[key] !== right.functions[key]) return false;
  for (const key of Object.keys(left.booleans))
    if (left.booleans[key] !== right.booleans[key]) return false;
  return left.terminated === right.terminated && JSON.stringify(left.guards ?? []) === JSON.stringify(right.guards ?? []);
}

function sameBaselineProjection(baseline: FrmLikeV1CpuState, candidate: FrmLikeV1CpuState): boolean {
  for (const key of Object.keys(baseline.values))
    if (!sameComplex(baseline.values[key], candidate.values[key])) return false;
  if (!sameRecordKeys(baseline.functions, candidate.functions)) return false;
  if (!sameRecordKeys(baseline.booleans, candidate.booleans)) return false;
  for (const key of Object.keys(baseline.functions))
    if (baseline.functions[key] !== candidate.functions[key]) return false;
  for (const key of Object.keys(baseline.booleans))
    if (baseline.booleans[key] !== candidate.booleans[key]) return false;
  return baseline.terminated === candidate.terminated &&
    JSON.stringify(baseline.guards ?? []) === JSON.stringify(candidate.guards ?? []);
}

function baselinePlusExpectedValueKeys(
  baseline: FrmLikeV1CpuState,
  candidate: FrmLikeV1CpuState,
  expectedExtraValueKeys: readonly string[],
): boolean {
  const baselineKeys = new Set(Object.keys(baseline.values));
  const candidateKeys = new Set(Object.keys(candidate.values));
  if ([...baselineKeys].some((key) => !candidateKeys.has(key))) return false;
  const actualExtras = [...candidateKeys]
    .filter((key) => !baselineKeys.has(key))
    .sort();
  return (
    JSON.stringify(actualExtras) ===
      JSON.stringify([...expectedExtraValueKeys].sort()) &&
    sameRecordKeys(baseline.functions, candidate.functions) &&
    sameRecordKeys(baseline.booleans, candidate.booleans)
  );
}

function sameResult(left: FrmLikeV1CpuResult, right: FrmLikeV1CpuResult): boolean {
  return left.event === right.event && left.continue === right.continue;
}

function frozenChannelMatches(state: FrmLikeV1CpuState, targets: readonly string[], expectedName: "pixel" | "c"): boolean {
  const expected = state.values[expectedName];
  return expected !== undefined && targets.every((target) => sameComplex(state.values[target], expected));
}

function compareParameterPlane(
  baselineIr: FrmLikeV1Ir,
  candidateIr: FrmLikeV1Ir,
  targets: readonly string[],
  expectedExtraValueKeys: readonly string[],
  parameters: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>,
): Readonly<{
  passed: boolean;
  snapshotComparisons: number;
  frozenChannelComparisons: number;
  stateShapeComparisons: number;
}> {
  const baseline = compileFrmLikeV1Backend(baselineIr);
  const candidate = compileFrmLikeV1Backend(candidateIr);
  invariant(baseline.ok && candidate.ok, "parameter-plane-backend-failed");
  let passed = true;
  let snapshotComparisons = 0;
  let frozenChannelComparisons = 0;
  let stateShapeComparisons = 0;
  for (const point of JULIA_CPU_HARNESS_POINTS_V1) {
    for (const depth of JULIA_CPU_HARNESS_DEPTHS_V1) {
      const input = {
        pixel: { re: point[0], im: point[1] },
        c: { re: point[0], im: point[1] },
        ismand: true,
        maxit: depth,
        parameters,
      };
      const left = baseline.backend.cpu.createState(input);
      const right = candidate.backend.cpu.createState(input);
      passed =
        passed &&
        baselinePlusExpectedValueKeys(left, right, expectedExtraValueKeys);
      stateShapeComparisons += 1;
      const leftInit = baseline.backend.cpu.init(left);
      const rightInit = candidate.backend.cpu.init(right);
      passed = passed && sameResult(leftInit, rightInit) && sameBaselineProjection(left, right);
      snapshotComparisons += 1;
      passed = passed && frozenChannelMatches(right, targets, "pixel");
      frozenChannelComparisons += 1;
      for (let step = 1; step <= depth; step += 1) {
        const leftStep = baseline.backend.cpu.step(left);
        const rightStep = candidate.backend.cpu.step(right);
        passed = passed && sameResult(leftStep, rightStep) && sameBaselineProjection(left, right);
        snapshotComparisons += 1;
        passed = passed && frozenChannelMatches(right, targets, "pixel");
        frozenChannelComparisons += 1;
        if (leftStep.event || rightStep.event) break;
        const leftContinue = baseline.backend.cpu.shouldContinue(left);
        const rightContinue = candidate.backend.cpu.shouldContinue(right);
        passed = passed && sameResult(leftContinue, rightContinue) && sameBaselineProjection(left, right);
        snapshotComparisons += 1;
        passed = passed && frozenChannelMatches(right, targets, "pixel");
        frozenChannelComparisons += 1;
        if (leftContinue.continue === false || rightContinue.continue === false || leftContinue.event || rightContinue.event) break;
      }
    }
  }
  return Object.freeze({
    passed,
    snapshotComparisons,
    frozenChannelComparisons,
    stateShapeComparisons,
  });
}

function compareJuliaDeterminism(
  candidateIr: FrmLikeV1Ir,
  targets: readonly string[],
  parameters: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>,
): Readonly<{ passed: boolean; snapshotComparisons: number; frozenChannelComparisons: number }> {
  const candidate = compileFrmLikeV1Backend(candidateIr);
  invariant(candidate.ok, "julia-backend-failed");
  let passed = true;
  let snapshotComparisons = 0;
  let frozenChannelComparisons = 0;
  for (const point of JULIA_CPU_HARNESS_POINTS_V1) {
    for (const constant of JULIA_CPU_HARNESS_CONSTANTS_V1) {
      for (const depth of JULIA_CPU_HARNESS_DEPTHS_V1) {
        const input = {
          pixel: { re: point[0], im: point[1] },
          c: { re: constant[0], im: constant[1] },
          ismand: false,
          maxit: depth,
          parameters,
        };
        const left = candidate.backend.cpu.createState(input);
        const right = candidate.backend.cpu.createState(input);
        const leftInit = candidate.backend.cpu.init(left);
        const rightInit = candidate.backend.cpu.init(right);
        passed = passed && sameResult(leftInit, rightInit) && sameStateExact(left, right);
        passed = passed && sameComplex(left.values.z, left.values.pixel);
        snapshotComparisons += 1;
        passed = passed && frozenChannelMatches(left, targets, "c") && frozenChannelMatches(right, targets, "c");
        frozenChannelComparisons += 2;
        for (let step = 1; step <= depth; step += 1) {
          const leftStep = candidate.backend.cpu.step(left);
          const rightStep = candidate.backend.cpu.step(right);
          passed = passed && sameResult(leftStep, rightStep) && sameStateExact(left, right);
          snapshotComparisons += 1;
          passed = passed && frozenChannelMatches(left, targets, "c") && frozenChannelMatches(right, targets, "c");
          frozenChannelComparisons += 2;
          if (leftStep.event || rightStep.event) break;
          const leftContinue = candidate.backend.cpu.shouldContinue(left);
          const rightContinue = candidate.backend.cpu.shouldContinue(right);
          passed = passed && sameResult(leftContinue, rightContinue) && sameStateExact(left, right);
          snapshotComparisons += 1;
          passed = passed && frozenChannelMatches(left, targets, "c") && frozenChannelMatches(right, targets, "c");
          frozenChannelComparisons += 2;
          if (leftContinue.continue === false || rightContinue.continue === false || leftContinue.event || rightContinue.event) break;
        }
      }
    }
  }
  return Object.freeze({ passed, snapshotComparisons, frozenChannelComparisons });
}

export interface JuliaMutableStateEvaluationV1 {
  readonly structural: Readonly<{
    frozenTargetCount: number;
    baselineMutableTargetCount: number;
    baselineComponentTargetCount: number;
    candidateMutableTargetCount: number;
    candidateComponentTargetCount: number;
    frozenTargetsNotWritten: boolean;
    frozenTargetsLiveInLoop: boolean;
    baselineMutableSurfaceDisjointFromFrozenTargets: boolean;
    candidateMutableSurfaceDisjointFromFrozenTargets: boolean;
    systemCNotWrittenInLoop: boolean;
    passed: boolean;
  }>;
  readonly parameterPlane: Readonly<{
    passed: boolean;
    snapshotComparisons: number;
    frozenChannelComparisons: number;
    stateShapeComparisons: number;
  }>;
  readonly juliaDeterminism: Readonly<{
    passed: boolean;
    snapshotComparisons: number;
    frozenChannelComparisons: number;
  }>;
  readonly passed: boolean;
}

export function evaluateJuliaMutableStateSeparationV1(
  baselineIr: FrmLikeV1Ir,
  candidateIr: FrmLikeV1Ir,
  frozenTargets: readonly string[],
  parameters: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>,
): Readonly<JuliaMutableStateEvaluationV1> {
  const baselineMutation = mutableSurface(baselineIr);
  const candidateMutation = mutableSurface(candidateIr);
  const baselineLocals = new Set(baselineIr.locals.map((local) => local.name));
  const expectedExtraValueKeys = candidateIr.locals
    .map((local) => local.name)
    .filter((name) => !baselineLocals.has(name))
    .sort();
  const loopWrites = assignedNames(candidateIr.loop);
  const frozenTargetsNotWritten = frozenTargets.every((target) => !loopWrites.has(target));
  const frozenTargetsLiveInLoop = frozenTargets.every(
    (target) => countIdentifierStatements(candidateIr.loop, target) > 0,
  );
  const baselineMutableSurfaceDisjointFromFrozenTargets = baselineMutation.targets.every(
    (target) => !frozenTargets.includes(target),
  );
  const candidateMutableSurfaceDisjointFromFrozenTargets = candidateMutation.targets.every(
    (target) => !frozenTargets.includes(target),
  );
  const structuralPassed =
    frozenTargets.length === 1 &&
    frozenTargetsNotWritten &&
    frozenTargetsLiveInLoop &&
    baselineMutableSurfaceDisjointFromFrozenTargets &&
    candidateMutableSurfaceDisjointFromFrozenTargets &&
    !loopWrites.has("c");
  const parameterPlane = compareParameterPlane(
    baselineIr,
    candidateIr,
    frozenTargets,
    expectedExtraValueKeys,
    parameters,
  );
  const juliaDeterminism = compareJuliaDeterminism(candidateIr, frozenTargets, parameters);
  return Object.freeze({
    structural: Object.freeze({
      frozenTargetCount: frozenTargets.length,
      baselineMutableTargetCount: baselineMutation.targets.length,
      baselineComponentTargetCount: baselineMutation.componentTargets.length,
      candidateMutableTargetCount: candidateMutation.targets.length,
      candidateComponentTargetCount: candidateMutation.componentTargets.length,
      frozenTargetsNotWritten,
      frozenTargetsLiveInLoop,
      baselineMutableSurfaceDisjointFromFrozenTargets,
      candidateMutableSurfaceDisjointFromFrozenTargets,
      systemCNotWrittenInLoop: !loopWrites.has("c"),
      passed: structuralPassed,
    }),
    parameterPlane,
    juliaDeterminism,
    passed: structuralPassed && parameterPlane.passed && juliaDeterminism.passed,
  });
}

type RecordValue = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ROW_COUNT = 9;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.every((key) => typeof key === "string") &&
    (keys as string[]).sort().join("\u0000") === [...expected].sort().join("\u0000");
}
function deepFrozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFrozen)) as T;
  if (record(value)) return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, deepFrozen(child)]),
  )) as T;
  return value;
}
export function isJuliaMutableStateAdjudicationRelativePathV1(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && !path.startsWith("/") &&
    !path.includes("\\") && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function authorityRowMap(value: unknown): Map<string, RecordValue> {
  const result = new Map<string, RecordValue>();
  if (!record(value) || !Array.isArray(value.rows)) return result;
  for (const row of value.rows) {
    if (!record(row) || typeof row.formulaId !== "string") continue;
    if (result.has(row.formulaId)) return new Map();
    result.set(row.formulaId, row);
  }
  return result;
}

export interface JuliaMutableStateAdjudicationAuthoritiesV1 {
  readonly auditV3: unknown;
  readonly finalV3: unknown;
  readonly roleV1: unknown;
  readonly sourceSplitV1: unknown;
  readonly preGpuV1: unknown;
  readonly rendererV1: unknown;
  readonly finalV1: unknown;
  readonly publicationLedger: unknown;
}

export function deriveJuliaMutableStateAdjudicationIdsV1(
  authorities: JuliaMutableStateAdjudicationAuthoritiesV1,
): readonly string[] {
  if (!record(authorities.auditV3) || !Array.isArray(authorities.auditV3.regressionIds)) return [];
  const finalV3 = authorityRowMap(authorities.finalV3);
  const roles = authorityRowMap(authorities.roleV1);
  const splits = authorityRowMap(authorities.sourceSplitV1);
  const preGpu = authorityRowMap(authorities.preGpuV1);
  const renderer = authorityRowMap(authorities.rendererV1);
  const finalV1 = authorityRowMap(authorities.finalV1);
  const decisions = authorityRowMap(authorities.publicationLedger);
  const result = new Set<string>();
  for (const formulaId of authorities.auditV3.regressionIds) {
    if (typeof formulaId !== "string" || !UUID_V5.test(formulaId)) continue;
    const current = finalV3.get(formulaId);
    const role = roles.get(formulaId);
    const split = splits.get(formulaId);
    const pre = preGpu.get(formulaId);
    const rendered = renderer.get(formulaId);
    const prior = finalV1.get(formulaId);
    const decision = decisions.get(formulaId);
    const identity = record(split?.identity) ? split.identity : undefined;
    const isolation = record(split?.isolation) ? split.isolation : undefined;
    const tier0 = record(split?.tier0) ? split.tier0 : undefined;
    const tier1 = record(split?.tier1) ? split.tier1 : undefined;
    const rights = record(split?.rights) ? split.rights : undefined;
    const reasonCodes = Array.isArray(role?.reasonCodes) ? role.reasonCodes : [];
    if (
      current?.modeClass === "undetermined" && current.supportLane === "none" &&
      current.remediationLane === "mutable-state-separation" && current.finalStatus === "held" &&
      role?.modeClass === "undetermined" && reasonCodes.includes("mutable-pixel-alias") &&
      split?.status === "candidate-only" &&
      (record(split.rewrite) && ["direct-pixel", "pixel-alias"].includes(String(split.rewrite.kind))) &&
      typeof identity?.candidateSourceRevision === "string" &&
      typeof identity?.candidateSemanticHash === "string" &&
      typeof isolation?.candidateDefinitionPath === "string" &&
      isolation.candidateDefinitionPath ===
        `julia-source-split-candidates/definitions/${identity.candidateSourceRevision}.frm` &&
      tier0?.sourceBound === true && tier0.rightsBound === true && tier0.safetyEnvelope === true &&
      tier1?.candidatePass === true && Array.isArray(tier1.reasonCodes) && tier1.reasonCodes.length === 0 &&
      typeof tier1.bindingRevision === "string" &&
      pre?.status === "unknown" && pre.disposition === "tier2-pending" &&
      pre.lane === "source-split" && pre.modeClass === "classic-julia" &&
      pre.evaluatedSourceRevision === identity.candidateSourceRevision &&
      pre.evaluatedSemanticHash === identity.candidateSemanticHash &&
      pre.bindingRevision === tier1.bindingRevision &&
      rendered?.status === "passed" && rendered.lane === "source-split" &&
      rendered.modeClass === "classic-julia" &&
      rendered.evaluatedSourceRevision === identity.candidateSourceRevision &&
      rendered.evaluatedSemanticHash === identity.candidateSemanticHash &&
      rendered.bindingRevision === tier1.bindingRevision &&
      prior?.status === "supported" && prior.lane === "source-split" &&
      prior.modeClass === "classic-julia" &&
      prior.evaluatedSourceRevision === identity.candidateSourceRevision &&
      prior.evaluatedSemanticHash === identity.candidateSemanticHash &&
      prior.bindingRevision === tier1.bindingRevision && prior.profileDigest === rendered.profileDigest &&
      decision?.publicationDecision === "publish" && decision.leakageScanStatus === "passed" &&
      rights?.publicationDecision === decision.publicationDecision &&
      rights.leakageScanStatus === decision.leakageScanStatus &&
      rights.rightsStatus === decision.rightsStatus
    ) result.add(formulaId);
  }
  return Object.freeze([...result].sort());
}

export interface JuliaMutableStateAdjudicationRowV1 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly baselineSemanticHash: string;
  readonly candidatePath: string;
  readonly candidateSourceRevision: string;
  readonly candidateSemanticHash: string;
  readonly binding: Readonly<{ kind: "source-split"; sourceRevision: string }>;
  readonly legacyBindingRevision: string;
  readonly supportLane: "state-separated";
  readonly sourceSplitKind: "direct-pixel" | "pixel-alias";
  readonly reasonCode: "mutable-pixel-alias-held";
  readonly stateSeparation: Readonly<{
    classContract: "frozen-julia-constant-vs-dynamic-orbit-state/v1";
    operationalEquivalence: true;
    frozenTargetCount: 1;
    baselineMutableTargetCount: number;
    baselineComponentTargetCount: number;
    candidateMutableTargetCount: number;
    candidateComponentTargetCount: number;
    frozenTargetsNotWritten: true;
    frozenTargetsLiveInLoop: true;
    baselineMutableSurfaceDisjointFromFrozenTargets: true;
    candidateMutableSurfaceDisjointFromFrozenTargets: true;
    systemCNotWrittenInLoop: true;
    parameterPlaneBitIdentical: true;
    parameterPlaneSnapshotComparisons: number;
    parameterPlaneFrozenChannelComparisons: number;
    candidateStateShapeComparisons: 24;
    juliaFullStateDeterministic: true;
    juliaSnapshotComparisons: number;
    juliaFrozenChannelComparisons: number;
  }>;
  readonly tier0: "pass";
  readonly tier1: "pass";
  readonly tier2: "reused-pass-exact-tuple";
  readonly rendererProfileDigest: string;
  readonly rendererTupleReceipt: string;
  readonly rowReceipt: string;
}
export interface JuliaMutableStateAdjudicationV1 {
  readonly schema: typeof JULIA_MUTABLE_STATE_ADJUDICATION_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "state-separation-adjudication";
  readonly activationStatus: "inactive-evidence-only";
  readonly tier2: "reused-pass-exact-tuple";
  readonly recoveryContractContentHash: string;
  readonly finalV3ContentHash: string;
  readonly finalV3WholeFileSha256: string;
  readonly finalV3AuditContentHash: string;
  readonly sourceSplitContentHash: string;
  readonly preGpuContentHash: string;
  readonly rendererContentHash: string;
  readonly finalV1ContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 9;
  readonly summary: Readonly<{
    directPixelCount: 5;
    pixelAliasCount: 4;
    parameterPlaneSnapshotComparisons: 9490;
    juliaSnapshotComparisons: 27238;
    candidateStateShapeComparisons: 216;
  }>;
  readonly rows: readonly JuliaMutableStateAdjudicationRowV1[];
  readonly contentHash: string;
}

export function juliaMutableStateRendererTupleReceiptV1(value: unknown): string {
  return sha256HexSyncV1(canonicalJsonV1({ domain: "fractalpark/7e-j/renderer-tuple/v1", value }, 16_384));
}
export function juliaMutableStateAdjudicationRowReceiptV1(
  row: Omit<JuliaMutableStateAdjudicationRowV1, "rowReceipt">,
): string {
  return sha256HexSyncV1(canonicalJsonV1({ domain: "fractalpark/7e-j/row/v1", row }, 65_536));
}
export function juliaMutableStateAdjudicationContentHashV1(
  asset: Omit<JuliaMutableStateAdjudicationV1, "contentHash">,
): string {
  return sha256HexSyncV1(canonicalJsonV1({ domain: "fractalpark/7e-j/asset/v1", asset }, 262_144));
}

function stateSeparationValid(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, [
    "classContract", "operationalEquivalence", "frozenTargetCount",
    "baselineMutableTargetCount", "baselineComponentTargetCount",
    "candidateMutableTargetCount", "candidateComponentTargetCount",
    "frozenTargetsNotWritten", "frozenTargetsLiveInLoop",
    "baselineMutableSurfaceDisjointFromFrozenTargets",
    "candidateMutableSurfaceDisjointFromFrozenTargets", "systemCNotWrittenInLoop",
    "parameterPlaneBitIdentical", "parameterPlaneSnapshotComparisons",
    "parameterPlaneFrozenChannelComparisons", "candidateStateShapeComparisons",
    "juliaFullStateDeterministic", "juliaSnapshotComparisons", "juliaFrozenChannelComparisons",
  ])) return false;
  const nonnegative = [
    value.baselineMutableTargetCount, value.baselineComponentTargetCount,
    value.candidateMutableTargetCount, value.candidateComponentTargetCount,
  ];
  const positive = [
    value.parameterPlaneSnapshotComparisons, value.parameterPlaneFrozenChannelComparisons,
    value.candidateStateShapeComparisons, value.juliaSnapshotComparisons,
    value.juliaFrozenChannelComparisons,
  ];
  return value.classContract === "frozen-julia-constant-vs-dynamic-orbit-state/v1" &&
    value.operationalEquivalence === true && value.frozenTargetCount === 1 &&
    nonnegative.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0) &&
    positive.every((entry) => Number.isSafeInteger(entry) && Number(entry) > 0) &&
    value.frozenTargetsNotWritten === true && value.frozenTargetsLiveInLoop === true &&
    value.baselineMutableSurfaceDisjointFromFrozenTargets === true &&
    value.candidateMutableSurfaceDisjointFromFrozenTargets === true &&
    value.systemCNotWrittenInLoop === true && value.parameterPlaneBitIdentical === true &&
    value.candidateStateShapeComparisons === 24 && value.juliaFullStateDeterministic === true;
}

export function parseJuliaMutableStateAdjudicationV1(input: unknown):
  | { readonly ok: true; readonly value: Readonly<JuliaMutableStateAdjudicationV1> }
  | { readonly ok: false; readonly code: "julia-mutable-state-adjudication-invalid" } {
  try {
    if (!record(input) || !exactKeys(input, [
      "schema", "revision", "stage", "activationStatus", "tier2",
      "recoveryContractContentHash", "finalV3ContentHash", "finalV3WholeFileSha256",
      "finalV3AuditContentHash", "sourceSplitContentHash", "preGpuContentHash",
      "rendererContentHash", "finalV1ContentHash", "sourceBindings", "rowCount",
      "summary", "rows", "contentHash",
    ]) || input.schema !== JULIA_MUTABLE_STATE_ADJUDICATION_SCHEMA_V1 || input.revision !== 1 ||
      input.stage !== "state-separation-adjudication" || input.activationStatus !== "inactive-evidence-only" ||
      input.tier2 !== "reused-pass-exact-tuple" || input.rowCount !== ROW_COUNT ||
      ![input.recoveryContractContentHash, input.finalV3ContentHash, input.finalV3WholeFileSha256,
        input.finalV3AuditContentHash, input.sourceSplitContentHash, input.preGpuContentHash,
        input.rendererContentHash, input.finalV1ContentHash, input.contentHash]
        .every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
      !record(input.sourceBindings) || Object.keys(input.sourceBindings).length === 0 ||
      !Object.entries(input.sourceBindings).every(([path, digest]) =>
        isJuliaMutableStateAdjudicationRelativePathV1(path) && typeof digest === "string" && SHA256.test(digest)) ||
      !record(input.summary) || !exactKeys(input.summary, ["directPixelCount", "pixelAliasCount",
        "parameterPlaneSnapshotComparisons", "juliaSnapshotComparisons", "candidateStateShapeComparisons"]) ||
      input.summary.directPixelCount !== 5 || input.summary.pixelAliasCount !== 4 ||
      input.summary.parameterPlaneSnapshotComparisons !== 9490 ||
      input.summary.juliaSnapshotComparisons !== 27238 ||
      input.summary.candidateStateShapeComparisons !== 216 ||
      !Array.isArray(input.rows) || input.rows.length !== ROW_COUNT) throw Error();
    let previous = "";
    for (const [index, value] of input.rows.entries()) {
      if (!record(value) || !exactKeys(value, [
        "formulaId", "baselineSourceRevision", "baselineSemanticHash", "candidatePath",
        "candidateSourceRevision", "candidateSemanticHash", "binding", "legacyBindingRevision",
        "supportLane", "sourceSplitKind", "reasonCode", "stateSeparation", "tier0", "tier1",
        "tier2", "rendererProfileDigest", "rendererTupleReceipt", "rowReceipt",
      ]) || typeof value.formulaId !== "string" || !UUID_V5.test(value.formulaId) ||
        value.formulaId !== JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1[index] || value.formulaId <= previous ||
        ![value.baselineSourceRevision, value.baselineSemanticHash, value.candidateSourceRevision,
          value.candidateSemanticHash, value.legacyBindingRevision, value.rendererProfileDigest,
          value.rendererTupleReceipt, value.rowReceipt]
          .every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
        !isJuliaMutableStateAdjudicationRelativePathV1(value.candidatePath) ||
        value.candidatePath !== `julia-source-split-candidates/definitions/${value.candidateSourceRevision}.frm` ||
        !record(value.binding) || !exactKeys(value.binding, ["kind", "sourceRevision"]) ||
        value.binding.kind !== "source-split" || value.binding.sourceRevision !== value.candidateSourceRevision ||
        value.supportLane !== "state-separated" ||
        !["direct-pixel", "pixel-alias"].includes(String(value.sourceSplitKind)) ||
        value.reasonCode !== "mutable-pixel-alias-held" || !stateSeparationValid(value.stateSeparation) ||
        value.tier0 !== "pass" || value.tier1 !== "pass" || value.tier2 !== "reused-pass-exact-tuple") throw Error();
      const { rowReceipt, ...withoutReceipt } = value as unknown as JuliaMutableStateAdjudicationRowV1;
      if (juliaMutableStateAdjudicationRowReceiptV1(withoutReceipt) !== rowReceipt) throw Error();
      previous = value.formulaId;
    }
    const direct = input.rows.filter((row) => record(row) && row.sourceSplitKind === "direct-pixel").length;
    if (direct !== 5 || input.rows.length - direct !== 4) throw Error();
    const { contentHash, ...withoutHash } = input as unknown as JuliaMutableStateAdjudicationV1;
    if (juliaMutableStateAdjudicationContentHashV1(withoutHash) !== contentHash) throw Error();
    return { ok: true, value: deepFrozen(input as unknown as JuliaMutableStateAdjudicationV1) };
  } catch {
    return { ok: false, code: "julia-mutable-state-adjudication-invalid" };
  }
}
