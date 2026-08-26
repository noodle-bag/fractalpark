import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import {
  classifyJuliaBindingRolesV1,
  type JuliaBindingContractV1,
} from "../src/engine/formulas/v1/julia-binding";
import {
  JULIA_CPU_HARNESS_CONSTANTS_V1,
  JULIA_CPU_HARNESS_DEPTHS_V1,
  JULIA_CPU_HARNESS_POINTS_V1,
  runJuliaCpuHarnessV1,
  type JuliaCpuComplexV1,
  type JuliaCpuHarnessV1,
} from "../src/engine/formulas/v1/julia-cpu-harness";
import {
  proposeJuliaSourceSplitV1,
  type JuliaSourceSplitRewriteKindV1,
} from "../src/engine/formulas/v1/julia-source-split";
import {
  createPublicationDecisionLedgerV1,
  type PublicationDecisionRowV1,
} from "../src/engine/formulas/v1/publication-decisions";
import type { PublishedFormulaParameterDescriptorV1 } from "../src/engine/formulas/v1/published-adapter";
import {
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "../src/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RESOURCE_ROOT = join(ROOT, "resources/formula-library/v1");
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const PUBLISHED_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const EXISTING_SYSTEM_C_PATH = join(
  RESOURCE_ROOT,
  "julia-existing-system-c-evidence.v1.json",
);
const PARAMETER_BINDING_PATH = join(
  RESOURCE_ROOT,
  "julia-parameter-binding-evidence.v1.json",
);
const OUTPUT_PATH = join(
  RESOURCE_ROOT,
  "julia-source-split-evidence.v1.json",
);
const CANDIDATE_ROOT_RELATIVE =
  "julia-source-split-candidates/definitions" as const;
const CANDIDATE_ROOT = join(RESOURCE_ROOT, CANDIDATE_ROOT_RELATIVE);
const SCHEMA = "fractalpark-julia-source-split-evidence/v1" as const;
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1" as const;
const EVIDENCE_CANONICAL_NODE_BUDGET = 131_072;
const EXPECTED_FORMULAS = 534;
const EXPECTED_EXISTING_SYSTEM_C = 76;
const EXPECTED_PARAMETER_BINDING = 175;
const EXPECTED_PRIOR_LANE = 251;
const EXPECTED_EVALUATED = 283;
const EXPECTED_PROPOSALS = 117;
const EXPECTED_NOT_SELECTED = 166;
const EXPECTED_NO_MECHANICAL_ROLE = 149;
const EXPECTED_MUTABLE_PIXEL_ALIAS = 17;
const EXPECTED_CANDIDATES = 111;
const EXPECTED_BLOCKED = 6;
const EXPECTED_DIRECT_PROPOSALS = 82;
const EXPECTED_ALIAS_PROPOSALS = 35;
const EXPECTED_COMBINED_PROPOSALS = 0;
const EXPECTED_DIRECT_CANDIDATES = 78;
const EXPECTED_ALIAS_CANDIDATES = 33;
const EXPECTED_COMBINED_CANDIDATES = 0;
const EXPECTED_CANDIDATE_DEFINITIONS = 111;
const SOURCE_BINDING_PATHS = Object.freeze([
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
  "resources/formula-library/v1/legacy-formula-aliases.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/standard-formula-ids.json",
  "scripts/build-julia-source-split-evidence.ts",
  "src/engine/formulas/v1/identity.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-source-split.ts",
  "src/engine/formulas/v1/publication-decisions.ts",
  "src/engine/formulas/v1/published-adapter.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "src/engine/formulas/v1/standard-manifest.ts",
  "src/engine/formulas/v1/types.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/v1.ts",
  "src/engine/plugins/types.ts",
  "tsconfig.json",
] as const);

type ExistingSystemCEvidence = Readonly<{
  schema: "fractalpark-julia-existing-system-c-evidence/v1";
  contentHash: string;
  candidateCount: number;
  rows: readonly Readonly<{ formulaId: string }>[];
}>;

type ParameterBindingEvidence = Readonly<{
  schema: "fractalpark-julia-parameter-binding-evidence/v1";
  contentHash: string;
  formulaCount: number;
  staticCandidateFormulaCount: number;
  rows: readonly Readonly<{
    formulaId: string;
    tier0: Readonly<{ status: "passed" | "blocked" | "not-required" }>;
  }>[];
}>;

type PriorLaneRow = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  status: "prior-lane";
  priorLane: "existing-system-c" | "parameter-binding";
}>;

type NotSelectedRow = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  status: "not-selected";
  reasonCode:
    | "julia-source-split-no-mechanical-role"
    | "julia-source-split-mutable-pixel-alias";
}>;

type SourceSplitAttemptRow = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  status: "candidate-only" | "blocked";
  rewrite: Readonly<{
    kind: JuliaSourceSplitRewriteKindV1;
    directPixelReferenceCount: number;
    aliasTargets: readonly string[];
  }>;
  identity: Readonly<{
    formulaIdPreserved: true;
    formulaNamePreserved: true;
    parameterContractPreserved: true;
    candidateSourceRevision: string;
    candidateSemanticHash: string;
  }>;
  rights: Readonly<{
    rightsStatus: PublicationDecisionRowV1["rightsStatus"];
    publicationDecision: "publish";
    implementationBasis: NonNullable<
      PublicationDecisionRowV1["implementationBasis"]
    >;
    leakageScanStatus: "passed";
  }>;
  isolation: Readonly<{
    activation: "inactive-candidate";
    publishedRuntimeUnchanged: true;
    candidateDefinitionPath?: string;
  }>;
  tier0: Readonly<{
    sourceBound: true;
    rightsBound: true;
    safetyEnvelope: true;
  }>;
  tier1: Readonly<{
    bindingRevision: string;
    contract: JuliaBindingContractV1;
    checks: JuliaCpuHarnessV1["checks"];
    candidatePass: boolean;
    reasonCodes: JuliaCpuHarnessV1["reasonCodes"];
  }>;
  adjudication:
    | Readonly<{
        status: "candidate-only";
        reasonCode: "source-split-tier0-tier1-passed";
      }>
    | Readonly<{
        status: "blocked";
        reasonCode: "source-split-tier1-cpu-rejected";
      }>;
}>;

type EvidenceRow = PriorLaneRow | NotSelectedRow | SourceSplitAttemptRow;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runtimeParameters(
  parameters: readonly PublishedFormulaParameterDescriptorV1[],
): Readonly<
  Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>
> {
  const result: Record<
    string,
    number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName
  > = {};
  for (const parameter of parameters) {
    if (parameter.type === "function") {
      result[parameter.slotName] = parameter.default as FrmV1UnaryFunctionName;
    } else if (parameter.type === "complex") {
      const value = parameter.default as readonly [number, number];
      result[parameter.slotName] = [value[0], value[1]];
    } else {
      result[parameter.slotName] = parameter.default as number;
    }
  }
  return Object.freeze(result);
}

function bindingRevision(
  formulaId: string,
  sourceRevision: string,
  contract: JuliaBindingContractV1,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({
      schema: BINDING_SCHEMA,
      formulaId,
      sourceRevision,
      binding: contract.binding,
      modeClass: contract.modeClass,
      supportLane: contract.supportLane,
      z0Role: contract.z0Role,
    }),
  );
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      SOURCE_BINDING_PATHS.map((relativePath) => [
        relativePath,
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      ]),
    ),
  );
}

function countByRewriteKind(
  rows: readonly SourceSplitAttemptRow[],
): Readonly<Record<JuliaSourceSplitRewriteKindV1, number>> {
  return Object.freeze({
    "direct-pixel": rows.filter((row) => row.rewrite.kind === "direct-pixel")
      .length,
    "pixel-alias": rows.filter((row) => row.rewrite.kind === "pixel-alias")
      .length,
    combined: rows.filter((row) => row.rewrite.kind === "combined").length,
  });
}

async function buildArtifact() {
  const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  invariant(parsedIndex.ok, "julia-source-split-runtime-index-invalid");
  const publication = createPublicationDecisionLedgerV1();
  invariant(publication.ok, "julia-source-split-publication-ledger-invalid");
  const existing = JSON.parse(
    readFileSync(EXISTING_SYSTEM_C_PATH, "utf8"),
  ) as ExistingSystemCEvidence;
  const parameter = JSON.parse(
    readFileSync(PARAMETER_BINDING_PATH, "utf8"),
  ) as ParameterBindingEvidence;
  invariant(
    existing.schema === "fractalpark-julia-existing-system-c-evidence/v1" &&
      existing.candidateCount === EXPECTED_EXISTING_SYSTEM_C &&
      existing.rows.length === EXPECTED_EXISTING_SYSTEM_C &&
      /^[a-f0-9]{64}$/.test(existing.contentHash),
    "julia-source-split-existing-evidence-invalid",
  );
  invariant(
    parameter.schema === "fractalpark-julia-parameter-binding-evidence/v1" &&
      parameter.formulaCount === EXPECTED_FORMULAS &&
      parameter.staticCandidateFormulaCount === EXPECTED_PARAMETER_BINDING &&
      parameter.rows.length === EXPECTED_FORMULAS &&
      /^[a-f0-9]{64}$/.test(parameter.contentHash),
    "julia-source-split-parameter-evidence-invalid",
  );
  const existingIds = new Set(existing.rows.map((row) => row.formulaId));
  const parameterIds = new Set(
    parameter.rows
      .filter((row) => row.tier0.status !== "not-required")
      .map((row) => row.formulaId),
  );
  invariant(
    [...existingIds].every((formulaId) => !parameterIds.has(formulaId)) &&
      existingIds.size + parameterIds.size === EXPECTED_PRIOR_LANE,
    "julia-source-split-prior-lane-overlap",
  );

  const rows: EvidenceRow[] = [];
  const candidateDefinitions = new Map<string, string>();
  for (const runtimeRow of parsedIndex.value.rows) {
    const baselineSource = readFileSync(
      join(PUBLISHED_ROOT, runtimeRow.definitionPath),
      "utf8",
    );
    invariant(
      sha256HexSyncV1(baselineSource) === runtimeRow.sourceRevision,
      `julia-source-split-baseline-source-drift:${runtimeRow.formulaId}`,
    );
    const baselineParsed = parseFrmLikeV1(baselineSource);
    invariant(
      baselineParsed.ok,
      `julia-source-split-baseline-invalid:${runtimeRow.formulaId}`,
    );
    if (existingIds.has(runtimeRow.formulaId)) {
      rows.push({
        formulaId: runtimeRow.formulaId,
        baselineSourceRevision: runtimeRow.sourceRevision,
        baselineSemanticHash: runtimeRow.semanticHash,
        status: "prior-lane",
        priorLane: "existing-system-c",
      });
      continue;
    }
    if (parameterIds.has(runtimeRow.formulaId)) {
      rows.push({
        formulaId: runtimeRow.formulaId,
        baselineSourceRevision: runtimeRow.sourceRevision,
        baselineSemanticHash: runtimeRow.semanticHash,
        status: "prior-lane",
        priorLane: "parameter-binding",
      });
      continue;
    }

    const proposal = proposeJuliaSourceSplitV1(baselineParsed.ir);
    if (!proposal.ok) {
      invariant(
        proposal.reasonCode === "julia-source-split-no-mechanical-role" ||
          proposal.reasonCode === "julia-source-split-mutable-pixel-alias",
        `julia-source-split-unexpected-static-failure:${runtimeRow.formulaId}:${proposal.reasonCode}`,
      );
      rows.push({
        formulaId: runtimeRow.formulaId,
        baselineSourceRevision: runtimeRow.sourceRevision,
        baselineSemanticHash: runtimeRow.semanticHash,
        status: "not-selected",
        reasonCode: proposal.reasonCode,
      });
      continue;
    }

    invariant(
      proposal.sourceRevision !== runtimeRow.sourceRevision,
      `julia-source-split-source-revision-not-new:${runtimeRow.formulaId}`,
    );
    const candidateHashes = await hashFrmLikeV1(proposal.source, proposal.ir);
    invariant(
      candidateHashes.sourceRevision === proposal.sourceRevision &&
        candidateHashes.semanticHash !== runtimeRow.semanticHash,
      `julia-source-split-candidate-hash-invalid:${runtimeRow.formulaId}`,
    );
    invariant(
      proposal.ir.formulaName === baselineParsed.ir.formulaName &&
        canonicalJsonV1(proposal.ir.parameters) ===
          canonicalJsonV1(baselineParsed.ir.parameters),
      `julia-source-split-identity-drift:${runtimeRow.formulaId}`,
    );
    const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
    invariant(
      decision &&
        decision.publicationDecision === "publish" &&
        decision.implementationBasis === runtimeRow.implementationBasis &&
        decision.leakageScanStatus === "passed",
      `julia-source-split-rights-invalid:${runtimeRow.formulaId}`,
    );
    const safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: proposal.source,
      sourceRevision: proposal.sourceRevision,
      semanticHash: candidateHashes.semanticHash,
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      supportedNumericProfiles: ["standard32"],
      parameters: proposal.ir.parameters,
      programModel: "orbit",
      termination: {
        predicateMeaning: "continue-iteration",
        nonFinite: "terminate-with-event",
        maximumIterations: "profile-resolved",
      },
      channels: [],
      capabilities: [],
    });
    invariant(
      safety.ok,
      `julia-source-split-safety-invalid:${runtimeRow.formulaId}:${safety.ok ? "unknown" : safety.code}`,
    );
    const binding = {
      kind: "source-split" as const,
      sourceRevision: proposal.sourceRevision,
    };
    const sourceBinding = {
      source: proposal.source,
      sourceRevision: proposal.sourceRevision,
    };
    const classified = classifyJuliaBindingRolesV1(
      proposal.ir,
      binding,
      sourceBinding,
    );
    invariant(
      classified.ok &&
        classified.contract.modeClass === "classic-julia" &&
        classified.contract.supportLane === "source-split" &&
        classified.contract.candidateKind === "source-split" &&
        classified.contract.z0Role === "pixel-seed",
      `julia-source-split-static-contract-invalid:${runtimeRow.formulaId}`,
    );
    const harness = runJuliaCpuHarnessV1(proposal.ir, binding, {
      sourceBinding,
      parameterPlaneBaseline: {
        source: baselineSource,
        sourceRevision: runtimeRow.sourceRevision,
      },
      parameters: runtimeParameters(runtimeRow.parameters),
    });
    invariant(
      harness.ok,
      `julia-source-split-harness-failed:${runtimeRow.formulaId}`,
    );
    invariant(
      harness.value.checks.parameterPlaneBitIdentical &&
        harness.value.contract.invariant === "parameter-plane-bit-identical",
      `julia-source-split-parameter-plane-drift:${runtimeRow.formulaId}`,
    );
    const candidatePass = harness.value.candidatePass;
    const candidateDefinitionPath = candidatePass
      ? `${CANDIDATE_ROOT_RELATIVE}/${proposal.sourceRevision}.frm`
      : undefined;
    if (candidatePass) {
      const previous = candidateDefinitions.get(proposal.sourceRevision);
      invariant(
        previous === undefined || previous === proposal.source,
        `julia-source-split-definition-collision:${runtimeRow.formulaId}`,
      );
      candidateDefinitions.set(proposal.sourceRevision, proposal.source);
    }
    rows.push({
      formulaId: runtimeRow.formulaId,
      baselineSourceRevision: runtimeRow.sourceRevision,
      baselineSemanticHash: runtimeRow.semanticHash,
      status: candidatePass ? "candidate-only" : "blocked",
      rewrite: {
        kind: proposal.rewriteKind,
        directPixelReferenceCount: proposal.directPixelReferenceCount,
        aliasTargets: proposal.aliasTargets,
      },
      identity: {
        formulaIdPreserved: true,
        formulaNamePreserved: true,
        parameterContractPreserved: true,
        candidateSourceRevision: proposal.sourceRevision,
        candidateSemanticHash: candidateHashes.semanticHash,
      },
      rights: {
        rightsStatus: decision.rightsStatus,
        publicationDecision: decision.publicationDecision,
        implementationBasis: decision.implementationBasis,
        leakageScanStatus: decision.leakageScanStatus,
      },
      isolation: {
        activation: "inactive-candidate",
        publishedRuntimeUnchanged: true,
        ...(candidateDefinitionPath ? { candidateDefinitionPath } : {}),
      },
      tier0: {
        sourceBound: true,
        rightsBound: true,
        safetyEnvelope: true,
      },
      tier1: {
        bindingRevision: bindingRevision(
          runtimeRow.formulaId,
          proposal.sourceRevision,
          harness.value.contract,
        ),
        contract: harness.value.contract,
        checks: harness.value.checks,
        candidatePass,
        reasonCodes: harness.value.reasonCodes,
      },
      adjudication: candidatePass
        ? {
            status: "candidate-only",
            reasonCode: "source-split-tier0-tier1-passed",
          }
        : {
            status: "blocked",
            reasonCode: "source-split-tier1-cpu-rejected",
          },
    });
  }

  invariant(rows.length === EXPECTED_FORMULAS, "julia-source-split-row-count-drift");
  invariant(
    rows.every(
      (row, index) => index === 0 || rows[index - 1]!.formulaId < row.formulaId,
    ),
    "julia-source-split-row-order-drift",
  );
  const attempts = rows.filter(
    (row): row is SourceSplitAttemptRow =>
      row.status === "candidate-only" || row.status === "blocked",
  );
  const candidates = attempts.filter((row) => row.status === "candidate-only");
  const blocked = attempts.filter((row) => row.status === "blocked");
  const notSelected = rows.filter((row) => row.status === "not-selected");
  const proposalRewriteCounts = countByRewriteKind(attempts);
  const candidateRewriteCounts = countByRewriteKind(candidates);
  const tier1FailureCounts = Object.freeze({
    "pixel-insensitive": blocked.filter((row) =>
      row.tier1.reasonCodes.includes("pixel-insensitive"),
    ).length,
    "constant-insensitive": blocked.filter((row) =>
      row.tier1.reasonCodes.includes("constant-insensitive"),
    ).length,
  });
  const counts = {
    formulaCount: rows.length,
    priorLaneFormulaCount: rows.filter((row) => row.status === "prior-lane")
      .length,
    evaluatedFormulaCount: rows.filter((row) => row.status !== "prior-lane")
      .length,
    rewriteProposalCount: attempts.length,
    notSelectedFormulaCount: notSelected.length,
    noMechanicalRoleFormulaCount: notSelected.filter(
      (row) => row.reasonCode === "julia-source-split-no-mechanical-role",
    ).length,
    mutablePixelAliasFormulaCount: notSelected.filter(
      (row) => row.reasonCode === "julia-source-split-mutable-pixel-alias",
    ).length,
    candidateOnlyFormulaCount: candidates.length,
    blockedFormulaCount: blocked.length,
    identityChangeCandidateCount: 0,
    candidateDefinitionCount: candidateDefinitions.size,
  };
  invariant(
    counts.formulaCount === EXPECTED_FORMULAS &&
      counts.priorLaneFormulaCount === EXPECTED_PRIOR_LANE &&
      counts.evaluatedFormulaCount === EXPECTED_EVALUATED &&
      counts.rewriteProposalCount === EXPECTED_PROPOSALS &&
      counts.notSelectedFormulaCount === EXPECTED_NOT_SELECTED &&
      counts.noMechanicalRoleFormulaCount === EXPECTED_NO_MECHANICAL_ROLE &&
      counts.mutablePixelAliasFormulaCount === EXPECTED_MUTABLE_PIXEL_ALIAS &&
      counts.candidateOnlyFormulaCount === EXPECTED_CANDIDATES &&
      counts.blockedFormulaCount === EXPECTED_BLOCKED &&
      counts.identityChangeCandidateCount === 0 &&
      counts.candidateDefinitionCount === EXPECTED_CANDIDATE_DEFINITIONS &&
      proposalRewriteCounts["direct-pixel"] === EXPECTED_DIRECT_PROPOSALS &&
      proposalRewriteCounts["pixel-alias"] === EXPECTED_ALIAS_PROPOSALS &&
      proposalRewriteCounts.combined === EXPECTED_COMBINED_PROPOSALS &&
      candidateRewriteCounts["direct-pixel"] === EXPECTED_DIRECT_CANDIDATES &&
      candidateRewriteCounts["pixel-alias"] === EXPECTED_ALIAS_CANDIDATES &&
      candidateRewriteCounts.combined === EXPECTED_COMBINED_CANDIDATES &&
      tier1FailureCounts["pixel-insensitive"] === 5 &&
      tier1FailureCounts["constant-insensitive"] === 2 &&
      EXPECTED_PRIOR_LANE + EXPECTED_EVALUATED === EXPECTED_FORMULAS &&
      EXPECTED_PROPOSALS + EXPECTED_NOT_SELECTED === EXPECTED_EVALUATED &&
      EXPECTED_NO_MECHANICAL_ROLE + EXPECTED_MUTABLE_PIXEL_ALIAS ===
        EXPECTED_NOT_SELECTED &&
      EXPECTED_CANDIDATES + EXPECTED_BLOCKED === EXPECTED_PROPOSALS,
    `julia-source-split-count-drift:proposals=${counts.rewriteProposalCount}:not-selected=${counts.notSelectedFormulaCount}:no-mechanical=${counts.noMechanicalRoleFormulaCount}:mutable-alias=${counts.mutablePixelAliasFormulaCount}:candidates=${counts.candidateOnlyFormulaCount}:blocked=${counts.blockedFormulaCount}:definitions=${counts.candidateDefinitionCount}:proposal-direct=${proposalRewriteCounts["direct-pixel"]}:proposal-alias=${proposalRewriteCounts["pixel-alias"]}:proposal-combined=${proposalRewriteCounts.combined}:candidate-direct=${candidateRewriteCounts["direct-pixel"]}:candidate-alias=${candidateRewriteCounts["pixel-alias"]}:candidate-combined=${candidateRewriteCounts.combined}:pixel-insensitive=${tier1FailureCounts["pixel-insensitive"]}:constant-insensitive=${tier1FailureCounts["constant-insensitive"]}`,
  );

  const body = {
    schema: SCHEMA,
    revision: 1,
    stage: "tier0-tier1-pre-gpu",
    runtimeIndexCanonicalSha256:
      PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    publicationDecisionsContentHash:
      PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
    existingSystemCEvidenceContentHash: existing.contentHash,
    parameterBindingEvidenceContentHash: parameter.contentHash,
    numericProfile: "standard32" as const,
    candidateDefinitionsRoot: CANDIDATE_ROOT_RELATIVE,
    activationStatus: "inactive-candidate-only" as const,
    sourceBindings: sourceBindings(),
    ...counts,
    proposalRewriteCounts,
    candidateRewriteCounts,
    tier1FailureCounts,
    probeGrid: {
      points: JULIA_CPU_HARNESS_POINTS_V1,
      constants: JULIA_CPU_HARNESS_CONSTANTS_V1,
      depths: JULIA_CPU_HARNESS_DEPTHS_V1,
    },
    rows,
  };
  return {
    artifact: {
      ...body,
      contentHash: sha256HexSyncV1(
        canonicalJsonV1(body, EVIDENCE_CANONICAL_NODE_BUDGET),
      ),
    },
    candidateDefinitions,
  };
}

function writeAtomically(path: string, bytes: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, bytes, { encoding: "utf8", mode: 0o644 });
  renameSync(temporary, path);
}

function expectedDefinitionNames(
  definitions: ReadonlyMap<string, string>,
): string[] {
  return [...definitions.keys()].sort().map((revision) => `${revision}.frm`);
}

function writeCandidateDefinitions(
  definitions: ReadonlyMap<string, string>,
): void {
  mkdirSync(CANDIDATE_ROOT, { recursive: true, mode: 0o755 });
  const expected = new Set(expectedDefinitionNames(definitions));
  for (const name of readdirSync(CANDIDATE_ROOT)) {
    invariant(name.endsWith(".frm"), `julia-source-split-unexpected-output:${name}`);
    if (!expected.has(name)) unlinkSync(join(CANDIDATE_ROOT, name));
  }
  for (const [revision, source] of [...definitions.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  ))
    writeAtomically(join(CANDIDATE_ROOT, `${revision}.frm`), source);
}

function verifyCandidateDefinitions(
  definitions: ReadonlyMap<string, string>,
): void {
  invariant(existsSync(CANDIDATE_ROOT), "julia-source-split-candidate-root-missing");
  const actual = readdirSync(CANDIDATE_ROOT).sort();
  const expected = expectedDefinitionNames(definitions);
  invariant(
    canonicalJsonV1(actual) === canonicalJsonV1(expected),
    "julia-source-split-candidate-definition-set-drift",
  );
  for (const [revision, source] of definitions)
    invariant(
      readFileSync(join(CANDIDATE_ROOT, `${revision}.frm`), "utf8") === source,
      `julia-source-split-candidate-definition-drift:${revision}`,
    );
}

async function main() {
  const { artifact, candidateDefinitions } = await buildArtifact();
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    writeCandidateDefinitions(candidateDefinitions);
    writeAtomically(OUTPUT_PATH, bytes);
  } else {
    invariant(existsSync(OUTPUT_PATH), "julia-source-split-evidence-missing");
    invariant(
      readFileSync(OUTPUT_PATH, "utf8") === bytes,
      "julia-source-split-evidence-drift",
    );
    verifyCandidateDefinitions(candidateDefinitions);
  }
  console.log(
    `julia_source_split_evidence=ok formulas=${artifact.formulaCount} evaluated=${artifact.evaluatedFormulaCount} candidates=${artifact.candidateOnlyFormulaCount} blocked=${artifact.blockedFormulaCount} definitions=${artifact.candidateDefinitionCount} hash=${artifact.contentHash}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "julia-source-split-unknown-error",
  );
  process.exitCode = 1;
});
