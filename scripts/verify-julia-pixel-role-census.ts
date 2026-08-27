/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deliberately independent verifier.  It imports only the production parser;
 * role discovery below is a separate implementation and never imports the
 * role analyzer or the census builder.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hashFrmLikeV1,
  parseFrmLikeV1,
  type FrmLikeV1Expression,
  type FrmLikeV1Statement,
} from "../src/engine/frm/v1";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const root = process.cwd();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const runtimeDigest =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5";
const fileHash = (path: string) => sha(readFileSync(join(root, path), "utf8"));
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const argumentPath = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const rolesOrder = [
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
];
const classicConflictReasons = new Set([
  "mutable-pixel-alias",
  "read-then-overwrite",
  "loop-carried-write",
  "component-write",
  "nontrivial-pixel-seed-not-classic",
]);
function hasClassicContractAuthority(
  final: any,
  sourceRevision: string,
): boolean {
  const contract = final.contract;
  if (
    final.evaluatedSourceRevision !== sourceRevision ||
    final.proofTiers?.tier0 !== true ||
    final.proofTiers?.tier1 !== true ||
    final.proofTiers?.tier2 !== true ||
    !contract ||
    contract.modeClass !== "classic-julia" ||
    contract.z0Role !== "pixel-seed" ||
    !["existing-system-c", "source-split", "parameter-binding"].includes(
      contract.supportLane,
    ) ||
    contract.supportLane !== final.lane ||
    !contract.binding ||
    typeof contract.binding !== "object"
  )
    return false;
  const binding = contract.binding;
  return (
    (binding.kind === "system-c" &&
      contract.supportLane === "existing-system-c") ||
    (binding.kind === "source-split" &&
      contract.supportLane === "source-split" &&
      binding.sourceRevision === sourceRevision) ||
    (binding.kind === "parameter" &&
      contract.supportLane === "parameter-binding" &&
      typeof binding.slotName === "string" &&
      binding.slotName.length > 0)
  );
}
function applyFrozenClassicAuthority(
  analysis: any,
  final: any,
  sourceRevision: string,
) {
  const authority = hasClassicContractAuthority(final, sourceRevision);
  if (!authority) return analysis;
  if (
    analysis.reasonCodes.some((reason: string) =>
      classicConflictReasons.has(reason),
    )
  )
    fail("julia-pixel-role-final-authority-conflict");
  const reasonCodes = analysis.reasonCodes.filter(
    (reason: string) =>
      reason !== "identity-authority-required" &&
      reason !== "direct-pixel-seed-not-proven",
  );
  const roles = new Set<string>(analysis.roles);
  roles.add("role:pixel-seed");
  roles.add("role:julia-constant");
  if (reasonCodes.length === 0) roles.delete("role:unresolved");
  return {
    ...analysis,
    roles: rolesOrder.filter((role) => roles.has(role)),
    modeClass: "classic-julia",
    result: "unknown",
    reasonCodes,
  };
}

type Taint = "pixel" | "derived" | "other" | "unknown";
type Environment = Map<string, Taint>;
function taint(
  expression: FrmLikeV1Expression,
  environment: Environment,
): Taint {
  if (expression.kind === "identifier")
    return expression.name === "pixel"
      ? "pixel"
      : (environment.get(expression.name) ?? "other");
  if (expression.kind === "number" || expression.kind === "complex")
    return "other";
  if (expression.kind === "unary" && expression.operator === "-")
    return taint(expression.operand, environment);
  if (
    expression.kind === "call" &&
    ["real", "imag", "conj"].includes(expression.callee)
  )
    return expression.args.length === 1
      ? taint(expression.args[0]!, environment)
      : "unknown";
  if (expression.kind === "call" && expression.callee === "complex") {
    const values = expression.args.map((arg) => taint(arg, environment));
    if (values.some((value) => value === "unknown")) return "unknown";
    return values.some((value) => value === "pixel" || value === "derived")
      ? "derived"
      : "other";
  }
  const children =
    expression.kind === "call"
      ? expression.args
      : expression.kind === "unary" || expression.kind === "magnitude"
        ? [expression.operand]
        : [expression.left, expression.right];
  return children.some((child) =>
    ["pixel", "derived"].includes(taint(child, environment)),
  )
    ? "derived"
    : "other";
}
function mentions(expression: FrmLikeV1Expression, name: string): boolean {
  if (expression.kind === "identifier") return expression.name === name;
  if (expression.kind === "number" || expression.kind === "complex")
    return false;
  if (expression.kind === "call")
    return expression.args.some((arg) => mentions(arg, name));
  if (expression.kind === "unary" || expression.kind === "magnitude")
    return mentions(expression.operand, name);
  return mentions(expression.left, name) || mentions(expression.right, name);
}
function isBailoutControl(expression: FrmLikeV1Expression): boolean {
  if (expression.kind === "binary") {
    if (["<", ">", "<=", ">=", "==", "!="].includes(expression.operator))
      return true;
    if (["&&", "||"].includes(expression.operator))
      return (
        isBailoutControl(expression.left) && isBailoutControl(expression.right)
      );
  }
  return expression.kind === "unary" && expression.operator === "!"
    ? isBailoutControl(expression.operand)
    : false;
}
function visit(
  statements: readonly FrmLikeV1Statement[],
  environment: Environment,
  callback: (statement: FrmLikeV1Statement, environment: Environment) => void,
): void {
  for (const statement of statements) {
    callback(statement, environment);
    if (statement.kind === "assignment")
      environment.set(statement.target, taint(statement.value, environment));
    else if (statement.kind === "component-assignment") {
      const previous = environment.get(statement.target) ?? "other";
      const value = taint(statement.value, environment);
      environment.set(
        statement.target,
        previous === "other" && value === "other" ? "other" : "unknown",
      );
    } else {
      const before = new Map(environment);
      const branches = [
        statement.then,
        ...statement.elseIf.map((branch) => branch.body),
        ...(statement.else ? [statement.else] : []),
      ];
      const after = branches.map((branch) => {
        const next = new Map(before);
        visit(branch, next, callback);
        return next;
      });
      for (const key of new Set(after.flatMap((entry) => [...entry.keys()]))) {
        const values = after.map((entry) => entry.get(key));
        environment.set(
          key,
          values.some((value) => value === undefined) ||
            new Set(values).size !== 1
            ? "unknown"
            : values[0]!,
        );
      }
    }
  }
}
function independentlyClassify(source: string): any {
  const parsed = parseFrmLikeV1(source);
  if (!parsed.ok) throw new Error("julia-pixel-role-production-parse-invalid");
  const env: Environment = new Map();
  const roles = new Set<string>();
  const reasons = new Set<string>();
  const parameters = new Set(
    parsed.ir.parameters.map((parameter) => parameter.name),
  );
  let direct = false;
  let derived = false;
  let copied = false;
  let transitive = false;
  let mutable = false;
  let aliasRead = false;
  visit(parsed.ir.init, env, (statement, current) => {
    if (statement.kind !== "assignment") return;
    const value = taint(statement.value, current);
    if (statement.target === "z") {
      direct ||= value === "pixel";
      derived ||= value === "derived";
    } else {
      const isDirectPixel =
        statement.value.kind === "identifier" &&
        statement.value.name === "pixel";
      copied ||= value === "pixel" && isDirectPixel;
      transitive ||=
        (value === "pixel" && !isDirectPixel) || value === "derived";
    }
  });
  env.set("z", "other");
  visit(parsed.ir.loop, env, (statement, current) => {
    const value = statement.kind === "if" ? undefined : statement.value;
    if (value && mentions(value, "c")) roles.add("role:julia-constant");
    if (
      value &&
      [...current].some(
        ([name, valueTaint]) =>
          name !== "z" &&
          (valueTaint === "pixel" || valueTaint === "derived") &&
          mentions(value, name),
      )
    )
      roles.add("role:julia-constant");
    if (value && [...parameters].some((name) => mentions(value, name)))
      roles.add("role:formula-parameter");
    if (
      statement.kind === "assignment" ||
      statement.kind === "component-assignment"
    ) {
      const previous = current.get(statement.target);
      if (
        statement.target !== "z" &&
        ["pixel", "derived", "unknown"].includes(previous ?? "other")
      ) {
        mutable = true;
        reasons.add(
          statement.kind === "component-assignment"
            ? "component-write"
            : aliasRead
              ? "read-then-overwrite"
              : "loop-carried-write",
        );
      }
      if (value) {
        const valueTaint = taint(value, current);
        if (statement.target !== "z" && valueTaint === "pixel")
          aliasRead = true;
        copied ||=
          valueTaint === "pixel" &&
          value.kind === "identifier" &&
          value.name === "pixel";
        transitive ||=
          (valueTaint === "pixel" &&
            !(value.kind === "identifier" && value.name === "pixel")) ||
          valueTaint === "derived";
      }
    }
  });
  if (direct || copied) roles.add("role:pixel-seed");
  if (copied) roles.add("role:pixel-constant");
  if (derived || transitive) roles.add("role:derived-pixel-constant");
  if (derived) reasons.add("nontrivial-pixel-seed-not-classic");
  if (
    parsed.ir.loop.some((statement) =>
      JSON.stringify(statement).includes('"target":"z"'),
    )
  )
    roles.add("role:dynamic-orbit-state");
  if (isBailoutControl(parsed.ir.bailout)) roles.add("role:bailout-control");
  else {
    roles.add("role:unresolved");
    reasons.add("bailout-control-not-proven");
  }
  let modeClass =
    (direct || copied || transitive) && !derived && !mutable
      ? "classic-julia"
      : derived
        ? "generalized-two-plane"
        : "undetermined";
  if (mutable) {
    roles.add("role:unresolved");
    reasons.add("mutable-pixel-alias");
    modeClass = "undetermined";
  }
  if (!direct && !copied && !transitive && !derived) {
    roles.add("role:unresolved");
    reasons.add("direct-pixel-seed-not-proven");
  }
  if (!roles.has("role:julia-constant") && modeClass === "classic-julia") {
    roles.add("role:unresolved");
    reasons.add("identity-authority-required");
    modeClass = "undetermined";
  }
  return {
    parsed,
    analysis: {
      schema: "fractalpark-julia-pixel-role-analyzer/v1",
      analyzerVersion:
        "production-frm-like-v1-def-use-source-order-standard32/v1",
      numericProfile: parsed.ir.numericProfile,
      evaluationOrder: parsed.ir.evaluationOrder,
      roles: rolesOrder.filter((role) => roles.has(role)),
      modeClass,
      result: modeClass === "generalized-two-plane" ? "held" : "unknown",
      reasonCodes: [...reasons].sort(),
    },
  };
}
function bindings(): Record<string, string> {
  const paths = [
    "public/formula-library/v1/runtime/published/index.json",
    "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
    "resources/formula-library/v1/julia-final-capability-census.v1.json",
    "resources/formula-library/v1/julia-renderer-evidence.v1.json",
    "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
    "resources/formula-library/v1/julia-source-split-evidence.v1.json",
    "scripts/build-julia-pixel-role-census.ts",
    "scripts/verify-julia-pixel-role-census.ts",
    "src/engine/formulas/v1/julia-pixel-role-analyzer.ts",
    "src/engine/formulas/v1/julia-pixel-changed-region.ts",
    "src/engine/frm/v1.ts",
    "src/engine/formulas/v1/revisions.ts",
  ];
  return Object.fromEntries(paths.sort().map((path) => [path, fileHash(path)]));
}
function fail(code: string): never {
  throw new Error(code);
}

async function main(): Promise<void> {
  const assetPath = argumentPath(
    "--asset",
    join(root, "resources/formula-library/v1/julia-pixel-role-census.v1.json"),
  );
  const asset = json(assetPath);
  const runtime = json(
    join(root, "public/formula-library/v1/runtime/published/index.json"),
  );
  const contract = json(
    join(
      root,
      "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
    ),
  );
  const finalCensus = json(
    join(
      root,
      "resources/formula-library/v1/julia-final-capability-census.v1.json",
    ),
  );
  const renderer = json(
    join(root, "resources/formula-library/v1/julia-renderer-evidence.v1.json"),
  );
  const parameter = json(
    join(
      root,
      "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
    ),
  );
  const sourceSplit = json(
    join(
      root,
      "resources/formula-library/v1/julia-source-split-evidence.v1.json",
    ),
  );
  const { contentHash, ...content } = asset;
  if (
    sha(canonicalJsonV1(content, 1_048_576)) !== contentHash ||
    asset.rowCount !== 534 ||
    asset.rows.length !== 534 ||
    sha(canonicalJsonV1(runtime, 131_072)) !== runtimeDigest
  )
    fail("julia-pixel-role-census-binding-invalid");
  const expectedBindings = bindings();
  if (
    JSON.stringify(asset.sourceBindings) !== JSON.stringify(expectedBindings) ||
    asset.analyzerRevision !==
      expectedBindings["src/engine/formulas/v1/julia-pixel-role-analyzer.ts"] ||
    asset.builderRevision !==
      expectedBindings["scripts/build-julia-pixel-role-census.ts"] ||
    asset.verifierRevision !== sha(readFileSync(__filename, "utf8")) ||
    asset.recoveryContractWholeFileSha256 !==
      fileHash(
        "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
      ) ||
    asset.recoveryContractContentHash !== contract.contentHash
  )
    fail("julia-pixel-role-source-bindings-invalid");
  const finalById = new Map<string, any>(
    finalCensus.rows.map((row: any) => [row.formulaId, row]),
  );
  const rendererById = new Map<string, any>(
    renderer.rows.map((row: any) => [row.formulaId, row]),
  );
  const parameterById = new Map<string, any>(
    parameter.rows.map((row: any) => [row.formulaId, row]),
  );
  const splitById = new Map<string, any>(
    sourceSplit.rows.map((row: any) => [row.formulaId, row]),
  );
  const ids = new Set<string>();
  if (
    renderer.rows.filter((row: any) => row.status === "blocked").length !==
      15 ||
    renderer.rows.filter(
      (row: any) =>
        row.status === "blocked" && row.lane === "existing-system-c",
    ).length !== 2 ||
    sourceSplit.rows.filter((row: any) => row.status === "blocked").length !== 6
  )
    fail("julia-pixel-role-known-lane-authority-invalid");
  for (let index = 0; index < 534; index += 1) {
    const row = asset.rows[index];
    const item = runtime.rows[index];
    if (!row || ids.has(row.formulaId) || row.formulaId !== item.formulaId)
      fail("julia-pixel-role-row-order-invalid");
    ids.add(row.formulaId);
    const source = readFileSync(
      join(
        root,
        "public/formula-library/v1/runtime/published",
        item.definitionPath,
      ),
      "utf8",
    );
    const independent = independentlyClassify(source);
    const hashes = await hashFrmLikeV1(source, independent.parsed.ir);
    if (
      hashes.sourceRevision !== row.sourceRevision ||
      hashes.semanticHash !== row.semanticHash ||
      hashes.sourceRevision !== item.sourceRevision ||
      hashes.semanticHash !== item.semanticHash
    )
      fail("julia-pixel-role-source-binding-invalid");
    const final = finalById.get(row.formulaId);
    const frozen = applyFrozenClassicAuthority(
      independent.analysis,
      final,
      hashes.sourceRevision,
    );
    const changed = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId: row.formulaId,
        source,
        ...hashes,
        sourceAuthorityContentHash: contract.contentHash,
        ir: independent.parsed.ir,
      },
      {
        formulaId: row.formulaId,
        source,
        ...hashes,
        sourceAuthorityContentHash: contract.contentHash,
        ir: independent.parsed.ir,
      },
    );
    if (!changed.ok) fail(changed.code);
    const coverage = verifyJuliaPixelChangedRegionCoverageV1(changed.value, []);
    if (!coverage.ok || changed.value.reachableOrUnknownRegionCount !== 0)
      fail("julia-pixel-role-unchanged-coverage-invalid");
    const rendererRow = rendererById.get(row.formulaId);
    const parameterRow = parameterById.get(row.formulaId);
    const expected = {
      formulaId: row.formulaId,
      sourceRevision: hashes.sourceRevision,
      semanticHash: hashes.semanticHash,
      sourceAuthority: "production-runtime-published",
      recoveryContractContentHash: contract.contentHash,
      analyzerRevision: asset.analyzerRevision,
      ...frozen,
      authorityEvidence: {
        finalStatus: final.status,
        evaluatedSourceRevision: final.evaluatedSourceRevision,
        contractAppliesToCurrentSource: hasClassicContractAuthority(
          final,
          hashes.sourceRevision,
        ),
        authorityLane: final.lane === "none" ? null : final.lane,
        authorityModeClass: final.modeClass,
        rendererLane: rendererRow?.lane ?? "not-evaluated",
        rendererStatus: rendererRow?.status ?? "not-evaluated",
        parameterBindingEvidence:
          parameterRow?.formulaId === row.formulaId &&
          final.lane === "parameter-binding",
        sourceSplitStatus: splitById.get(row.formulaId).status,
      },
      changedRegionReceipt: {
        analyzerRevision: contract.changedRegionAnalyzer.revision,
        analysisContentHash: changed.value.contentHash,
        changedRegionCount: changed.value.regions.length,
        reachableOrUnknownRegionCount:
          changed.value.reachableOrUnknownRegionCount,
        coveredRegionCount: coverage.coveredRegionCount,
        uncoveredReachableOrUnknownRegionCount:
          coverage.uncoveredReachableOrUnknownRegionCount,
      },
    };
    if (
      JSON.stringify({
        ...expected,
        roleReceipt: `sha256:${sha(canonicalJsonV1(expected, 65_536))}`,
      }) !== JSON.stringify(row)
    )
      fail(`julia-pixel-role-analysis-invalid-${index}`);
  }
  const revisionAlignedRows = asset.rows.filter(
    (row: any) => row.authorityEvidence.contractAppliesToCurrentSource === true,
  );
  if (
    revisionAlignedRows.length === 0 ||
    revisionAlignedRows.some(
      (row: any) =>
        row.modeClass !== "classic-julia" ||
        !row.roles.includes("role:pixel-seed") ||
        !row.roles.includes("role:julia-constant") ||
        row.roles.includes("role:unresolved") ||
        row.reasonCodes.some((reason: string) =>
          classicConflictReasons.has(reason),
        ),
    )
  )
    fail("julia-pixel-role-revision-aligned-authority-crosscheck-invalid");
  console.log(
    JSON.stringify({
      ok: true,
      rowCount: asset.rowCount,
      contentHash: asset.contentHash,
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "julia-pixel-role-verify-failed",
    }),
  );
  process.exitCode = 1;
});
