/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import { analyzeJuliaPixelRolesV1 } from "../src/engine/formulas/v1/julia-pixel-role-analyzer";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const root = process.cwd();
const runtimeRelative =
  "public/formula-library/v1/runtime/published/index.json";
const output = join(
  root,
  "resources/formula-library/v1/julia-pixel-role-census.v1.json",
);
const runtimeDigest =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const fileHash = (relative: string) =>
  sha(readFileSync(join(root, relative), "utf8"));
const json = (relative: string) =>
  JSON.parse(readFileSync(join(root, relative), "utf8"));
const contentHash = (asset: Record<string, unknown>) => {
  const content = { ...asset };
  delete content.contentHash;
  return sha(canonicalJsonV1(content, 1_048_576));
};
const orderedRoles = [
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
];

function roleSet(...groups: readonly (readonly string[])[]): string[] {
  const roles = new Set(groups.flat());
  return orderedRoles.filter((role) => roles.has(role));
}

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
  generic: any,
  final: any,
  sourceRevision: string,
) {
  const authority = hasClassicContractAuthority(final, sourceRevision);
  if (!authority) return generic;
  if (
    generic.reasonCodes.some((reason: string) =>
      classicConflictReasons.has(reason),
    )
  )
    throw new Error("julia-pixel-role-final-authority-conflict");
  const reasonCodes = generic.reasonCodes.filter(
    (reason: string) =>
      reason !== "identity-authority-required" &&
      reason !== "direct-pixel-seed-not-proven",
  );
  const roles = new Set<string>(generic.roles);
  roles.add("role:pixel-seed");
  roles.add("role:julia-constant");
  if (reasonCodes.length === 0) roles.delete("role:unresolved");
  return {
    ...generic,
    roles: roleSet([...roles]),
    modeClass: "classic-julia",
    result: "unknown",
    reasonCodes,
  };
}

function sourceBindings(): Record<string, string> {
  const paths = [
    runtimeRelative,
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

async function main(): Promise<void> {
  const runtime = json(runtimeRelative);
  const contract = json(
    "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  );
  const finalCensus = json(
    "resources/formula-library/v1/julia-final-capability-census.v1.json",
  );
  const renderer = json(
    "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  );
  const parameter = json(
    "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
  );
  const sourceSplit = json(
    "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  );
  if (
    !Array.isArray(runtime.rows) ||
    runtime.rows.length !== 534 ||
    sha(canonicalJsonV1(runtime, 131_072)) !== runtimeDigest
  )
    throw new Error("julia-pixel-role-runtime-index-invalid");
  if (
    contract.contentHash !== contentHash(contract) ||
    contract.lineage.runtimeIndexCanonicalSha256 !== runtimeDigest
  )
    throw new Error("julia-pixel-role-contract-invalid");
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
  if ([finalById, parameterById, splitById].some((map) => map.size !== 534))
    throw new Error("julia-pixel-role-authority-cardinality-invalid");
  if (
    renderer.rows.filter((row: any) => row.status === "blocked").length !==
      15 ||
    renderer.rows.filter(
      (row: any) =>
        row.status === "blocked" && row.lane === "existing-system-c",
    ).length !== 2 ||
    sourceSplit.rows.filter((row: any) => row.status === "blocked").length !== 6
  )
    throw new Error("julia-pixel-role-known-lane-authority-invalid");
  const bindings = sourceBindings();
  const rows = [] as Record<string, unknown>[];
  for (const item of runtime.rows) {
    const source = readFileSync(
      join(
        root,
        "public/formula-library/v1/runtime/published",
        item.definitionPath,
      ),
      "utf8",
    );
    const parsed = parseFrmLikeV1(source);
    if (!parsed.ok)
      throw new Error("julia-pixel-role-production-parse-invalid");
    const hashes = await hashFrmLikeV1(source, parsed.ir);
    if (
      hashes.sourceRevision !== item.sourceRevision ||
      hashes.semanticHash !== item.semanticHash
    )
      throw new Error("julia-pixel-role-source-binding-invalid");
    const generic = analyzeJuliaPixelRolesV1(parsed.ir);
    const final = finalById.get(item.formulaId)!;
    const parameterRow = parameterById.get(item.formulaId)!;
    const split = splitById.get(item.formulaId)!;
    const rendererRow = rendererById.get(item.formulaId)!;
    const authorityLane = final.lane === "none" ? null : final.lane;
    const frozen = applyFrozenClassicAuthority(
      generic,
      final,
      hashes.sourceRevision,
    );
    const changed = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId: item.formulaId,
        source,
        ...hashes,
        sourceAuthorityContentHash: contract.contentHash,
        ir: parsed.ir,
      },
      {
        formulaId: item.formulaId,
        source,
        ...hashes,
        sourceAuthorityContentHash: contract.contentHash,
        ir: parsed.ir,
      },
    );
    if (!changed.ok) throw new Error(changed.code);
    const coverage = verifyJuliaPixelChangedRegionCoverageV1(changed.value, []);
    if (!coverage.ok || changed.value.reachableOrUnknownRegionCount !== 0)
      throw new Error("julia-pixel-role-unchanged-coverage-invalid");
    const evidence = {
      finalStatus: final.status,
      evaluatedSourceRevision: final.evaluatedSourceRevision,
      contractAppliesToCurrentSource: hasClassicContractAuthority(
        final,
        hashes.sourceRevision,
      ),
      authorityLane,
      authorityModeClass: final.modeClass,
      rendererLane: rendererRow?.lane ?? "not-evaluated",
      rendererStatus: rendererRow?.status ?? "not-evaluated",
      parameterBindingEvidence:
        parameterRow.formulaId === item.formulaId &&
        final.lane === "parameter-binding",
      sourceSplitStatus: split.status,
    };
    const row = {
      formulaId: item.formulaId,
      sourceRevision: hashes.sourceRevision,
      semanticHash: hashes.semanticHash,
      sourceAuthority: "production-runtime-published",
      recoveryContractContentHash: contract.contentHash,
      analyzerRevision:
        bindings["src/engine/formulas/v1/julia-pixel-role-analyzer.ts"],
      ...frozen,
      authorityEvidence: evidence,
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
    rows.push({
      ...row,
      roleReceipt: `sha256:${sha(canonicalJsonV1(row, 65_536))}`,
    });
  }
  const content = {
    schema: "fractalpark-julia-pixel-role-census/v1",
    revision: 2,
    stage: "role-discovery",
    runtimeIndexCanonicalSha256: runtimeDigest,
    recoveryContractContentHash: contract.contentHash,
    recoveryContractWholeFileSha256: fileHash(
      "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
    ),
    analyzerRevision:
      bindings["src/engine/formulas/v1/julia-pixel-role-analyzer.ts"],
    builderRevision: bindings["scripts/build-julia-pixel-role-census.ts"],
    verifierRevision: bindings["scripts/verify-julia-pixel-role-census.ts"],
    sourceBindings: bindings,
    rowCount: rows.length,
    rows,
  };
  const document = {
    ...content,
    contentHash: sha(canonicalJsonV1(content, 1_048_576)),
  };
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temp = `${output}.tmp-${process.pid}`;
    rmSync(temp, { force: true });
    writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 });
    renameSync(temp, output);
  }
  const actual = readFileSync(output, "utf8");
  console.log(
    JSON.stringify({
      ok: actual === bytes,
      rowCount: rows.length,
      contentHash: document.contentHash,
    }),
  );
  if (actual !== bytes) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "julia-pixel-role-build-failed",
    }),
  );
  process.exitCode = 1;
});
