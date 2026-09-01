import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import evidenceAsset from "../../resources/formula-library/v1/julia-source-split-evidence.v1.json";
import existingSystemCEvidence from "../../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import parameterBindingEvidence from "../../resources/formula-library/v1/julia-parameter-binding-evidence.v1.json";
import {
  hashFrmLikeV1,
  parseFrmLikeV1,
  type FrmLikeV1Statement,
} from "@/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "@/engine/frm/frm-v1-stdlib";
import {
  classifyJuliaBindingRolesV1,
  type JuliaBindingContractV1,
} from "@/engine/formulas/v1/julia-binding";
import {
  runJuliaCpuHarnessV1,
  type JuliaCpuComplexV1,
} from "@/engine/formulas/v1/julia-cpu-harness";
import { JULIA_CAPABILITY_CENSUS_V1 } from "@/engine/formulas/v1/julia-capability";
import { proposeJuliaSourceSplitV1 } from "@/engine/formulas/v1/julia-source-split";
import { createPublicationDecisionLedgerV1 } from "@/engine/formulas/v1/publication-decisions";
import type { PublishedFormulaParameterDescriptorV1 } from "@/engine/formulas/v1/published-adapter";
import {
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "@/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "@/engine/formulas/v1/safety-envelope";

interface SourceSplitAttemptRow {
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  status: "candidate-only" | "blocked";
  rewrite: {
    kind: "direct-pixel" | "pixel-alias" | "combined";
    directPixelReferenceCount: number;
    aliasTargets: string[];
  };
  identity: {
    formulaIdPreserved: true;
    formulaNamePreserved: true;
    parameterContractPreserved: true;
    candidateSourceRevision: string;
    candidateSemanticHash: string;
  };
  rights: {
    rightsStatus: string;
    publicationDecision: "publish";
    implementationBasis: string;
    leakageScanStatus: "passed";
  };
  isolation: {
    activation: "inactive-candidate";
    publishedRuntimeUnchanged: true;
    candidateDefinitionPath?: string;
  };
  tier0: {
    sourceBound: true;
    rightsBound: true;
    safetyEnvelope: true;
  };
  tier1: {
    bindingRevision: string;
    contract: JuliaBindingContractV1;
    checks: {
      parameterPlaneBitIdentical: boolean;
      deterministic: boolean;
      finiteEvidence: boolean;
      pixelSensitive: boolean;
      constantSensitive: boolean;
    };
    candidatePass: boolean;
    reasonCodes: string[];
  };
  adjudication:
    | {
        status: "candidate-only";
        reasonCode: "source-split-tier0-tier1-passed";
      }
    | {
        status: "blocked";
        reasonCode: "source-split-tier1-cpu-rejected";
      };
}

type EvidenceRow =
  | SourceSplitAttemptRow
  | {
      formulaId: string;
      baselineSourceRevision: string;
      baselineSemanticHash: string;
      status: "prior-lane";
      priorLane: "existing-system-c" | "parameter-binding";
    }
  | {
      formulaId: string;
      baselineSourceRevision: string;
      baselineSemanticHash: string;
      status: "not-selected";
      reasonCode:
        | "julia-source-split-no-mechanical-role"
        | "julia-source-split-mutable-pixel-alias";
    };

interface EvidenceAsset {
  schema: "fractalpark-julia-source-split-evidence/v1";
  revision: 1;
  stage: "tier0-tier1-pre-gpu";
  runtimeIndexCanonicalSha256: string;
  publicationDecisionsContentHash: string;
  existingSystemCEvidenceContentHash: string;
  parameterBindingEvidenceContentHash: string;
  numericProfile: "standard32";
  candidateDefinitionsRoot: string;
  activationStatus: "inactive-candidate-only";
  sourceBindings: Record<string, string>;
  formulaCount: number;
  priorLaneFormulaCount: number;
  evaluatedFormulaCount: number;
  rewriteProposalCount: number;
  notSelectedFormulaCount: number;
  noMechanicalRoleFormulaCount: number;
  mutablePixelAliasFormulaCount: number;
  candidateOnlyFormulaCount: number;
  blockedFormulaCount: number;
  identityChangeCandidateCount: number;
  candidateDefinitionCount: number;
  proposalRewriteCounts: Record<string, number>;
  candidateRewriteCounts: Record<string, number>;
  tier1FailureCounts: Record<string, number>;
  probeGrid: {
    points: number[][];
    constants: number[][];
    depths: number[];
  };
  rows: EvidenceRow[];
  contentHash: string;
}

const artifact = evidenceAsset as EvidenceAsset;
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
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1";
const EVIDENCE_CANONICAL_NODE_BUDGET = 131_072;
const EXPECTED_SOURCE_BINDING_PATHS = [
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
] as const;

function assignedNames(
  statements: readonly FrmLikeV1Statement[],
  names = new Set<string>(),
): Set<string> {
  for (const statement of statements) {
    if (
      statement.kind === "assignment" ||
      statement.kind === "component-assignment"
    ) {
      names.add(statement.target);
      continue;
    }
    assignedNames(statement.then, names);
    for (const branch of statement.elseIf) assignedNames(branch.body, names);
    assignedNames(statement.else ?? [], names);
  }
  return names;
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
  return result;
}

function pairGrid(values: number[][]): JuliaCpuComplexV1[] {
  return values.map((value) => {
    expect(value).toHaveLength(2);
    return [value[0]!, value[1]!] as const;
  });
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

describe("Julia source-split Tier 0-1 evidence", () => {
  it("freezes the exact 534-row isolated candidate surface", () => {
    expect(artifact).toMatchObject({
      schema: "fractalpark-julia-source-split-evidence/v1",
      revision: 1,
      stage: "tier0-tier1-pre-gpu",
      runtimeIndexCanonicalSha256:
        PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
      publicationDecisionsContentHash:
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
      existingSystemCEvidenceContentHash: existingSystemCEvidence.contentHash,
      parameterBindingEvidenceContentHash: parameterBindingEvidence.contentHash,
      numericProfile: "standard32",
      candidateDefinitionsRoot:
        "julia-source-split-candidates/definitions",
      activationStatus: "inactive-candidate-only",
      formulaCount: 534,
      priorLaneFormulaCount: 251,
      evaluatedFormulaCount: 283,
      rewriteProposalCount: 117,
      notSelectedFormulaCount: 166,
      noMechanicalRoleFormulaCount: 149,
      mutablePixelAliasFormulaCount: 17,
      candidateOnlyFormulaCount: 111,
      blockedFormulaCount: 6,
      identityChangeCandidateCount: 0,
      candidateDefinitionCount: 111,
      proposalRewriteCounts: {
        "direct-pixel": 82,
        "pixel-alias": 35,
        combined: 0,
      },
      candidateRewriteCounts: {
        "direct-pixel": 78,
        "pixel-alias": 33,
        combined: 0,
      },
      tier1FailureCounts: {
        "pixel-insensitive": 5,
        "constant-insensitive": 2,
      },
    });
    expect(artifact.rows).toHaveLength(534);
    expect(new Set(artifact.rows.map((row) => row.formulaId)).size).toBe(534);
    expect(
      artifact.rows.every(
        (row, index) =>
          index === 0 || artifact.rows[index - 1]!.formulaId < row.formulaId,
      ),
    ).toBe(true);
    expect(artifact.probeGrid.points).toHaveLength(3);
    expect(artifact.probeGrid.constants).toHaveLength(3);
    expect(artifact.probeGrid.depths).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128,
    ]);
    expect(Object.keys(artifact.sourceBindings)).toEqual(
      EXPECTED_SOURCE_BINDING_PATHS,
    );
    for (const relativePath of EXPECTED_SOURCE_BINDING_PATHS)
      expect(artifact.sourceBindings[relativePath]).toBe(
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      );
    const unhashed = structuredClone(artifact) as EvidenceAsset;
    delete (unhashed as Partial<EvidenceAsset>).contentHash;
    expect(
      sha256HexSyncV1(
        canonicalJsonV1(unhashed, EVIDENCE_CANONICAL_NODE_BUDGET),
      ),
    ).toBe(artifact.contentHash);
    expect(JULIA_CAPABILITY_CENSUS_V1.rows).toHaveLength(534);
    expect(
      JULIA_CAPABILITY_CENSUS_V1.rows.every((row) => row.status === "unknown"),
    ).toBe(true);
  });

  it("keeps only passing revisions in the isolated exact output set", () => {
    const candidateRows = artifact.rows.filter(
      (row): row is SourceSplitAttemptRow => row.status === "candidate-only",
    );
    const blockedRows = artifact.rows.filter(
      (row): row is SourceSplitAttemptRow => row.status === "blocked",
    );
    const expectedPaths = candidateRows
      .map((row) => row.isolation.candidateDefinitionPath)
      .filter((path): path is string => path !== undefined)
      .sort();
    expect(expectedPaths).toHaveLength(111);
    expect(new Set(expectedPaths).size).toBe(111);
    expect(
      blockedRows.every(
        (row) => row.isolation.candidateDefinitionPath === undefined,
      ),
    ).toBe(true);
    const actualNames = readdirSync(
      join(RESOURCE_ROOT, artifact.candidateDefinitionsRoot),
    ).sort();
    expect(actualNames).toEqual(
      expectedPaths.map((path) => path.split("/").at(-1)!).sort(),
    );
    for (const row of candidateRows) {
      const path = row.isolation.candidateDefinitionPath;
      expect(path).toBeDefined();
      if (!path) continue;
      expect(path.startsWith("julia-source-split-candidates/definitions/")).toBe(
        true,
      );
      expect(path.startsWith("public/")).toBe(false);
      const source = readFileSync(join(RESOURCE_ROOT, path), "utf8");
      expect(sha256HexSyncV1(source)).toBe(
        row.identity.candidateSourceRevision,
      );
    }
  });

  it("independently replays every lane decision, identity gate, and CPU result", async () => {
    const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(parsedIndex.ok).toBe(true);
    if (!parsedIndex.ok) return;
    const publication = createPublicationDecisionLedgerV1();
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;
    const rowById = new Map(
      artifact.rows.map((row) => [row.formulaId, row] as const),
    );
    const existingIds = new Set(
      existingSystemCEvidence.rows.map((row) => row.formulaId),
    );
    const parameterIds = new Set(
      parameterBindingEvidence.rows
        .filter((row) => row.tier0.status !== "not-required")
        .map((row) => row.formulaId),
    );
    expect([...existingIds].every((formulaId) => !parameterIds.has(formulaId))).toBe(
      true,
    );
    expect(existingIds.size + parameterIds.size).toBe(251);
    const points = pairGrid(artifact.probeGrid.points);
    const constants = pairGrid(artifact.probeGrid.constants);

    for (const runtimeRow of parsedIndex.value.rows) {
      const row = rowById.get(runtimeRow.formulaId);
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.baselineSourceRevision).toBe(runtimeRow.sourceRevision);
      expect(row.baselineSemanticHash).toBe(runtimeRow.semanticHash);
      if (existingIds.has(runtimeRow.formulaId)) {
        expect(row).toMatchObject({
          status: "prior-lane",
          priorLane: "existing-system-c",
        });
        continue;
      }
      if (parameterIds.has(runtimeRow.formulaId)) {
        expect(row).toMatchObject({
          status: "prior-lane",
          priorLane: "parameter-binding",
        });
        continue;
      }

      const baselineSource = readFileSync(
        join(PUBLISHED_ROOT, runtimeRow.definitionPath),
        "utf8",
      );
      expect(sha256HexSyncV1(baselineSource)).toBe(runtimeRow.sourceRevision);
      const baselineParsed = parseFrmLikeV1(baselineSource);
      expect(baselineParsed.ok).toBe(true);
      if (!baselineParsed.ok) continue;
      const proposal = proposeJuliaSourceSplitV1(baselineParsed.ir);
      if (!proposal.ok) {
        expect([
          "julia-source-split-no-mechanical-role",
          "julia-source-split-mutable-pixel-alias",
        ]).toContain(proposal.reasonCode);
        expect(row).toEqual({
          formulaId: runtimeRow.formulaId,
          baselineSourceRevision: runtimeRow.sourceRevision,
          baselineSemanticHash: runtimeRow.semanticHash,
          status: "not-selected",
          reasonCode: proposal.reasonCode,
        });
        continue;
      }
      expect(row.status === "candidate-only" || row.status === "blocked").toBe(
        true,
      );
      if (row.status !== "candidate-only" && row.status !== "blocked") continue;
      expect(row.rewrite).toEqual({
        kind: proposal.rewriteKind,
        directPixelReferenceCount: proposal.directPixelReferenceCount,
        aliasTargets: proposal.aliasTargets,
      });
      const loopWrites = assignedNames(proposal.ir.loop);
      expect(
        proposal.aliasTargets.every((target) => !loopWrites.has(target)),
      ).toBe(true);
      const hashes = await hashFrmLikeV1(proposal.source, proposal.ir);
      expect(hashes.sourceRevision).toBe(proposal.sourceRevision);
      expect(hashes.semanticHash).not.toBe(runtimeRow.semanticHash);
      expect(row.identity).toEqual({
        formulaIdPreserved: true,
        formulaNamePreserved: true,
        parameterContractPreserved: true,
        candidateSourceRevision: proposal.sourceRevision,
        candidateSemanticHash: hashes.semanticHash,
      });
      expect(proposal.ir.formulaName).toBe(baselineParsed.ir.formulaName);
      expect(canonicalJsonV1(proposal.ir.parameters)).toBe(
        canonicalJsonV1(baselineParsed.ir.parameters),
      );
      const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
      expect(decision).toBeDefined();
      expect(row.rights).toMatchObject({
        rightsStatus: decision?.rightsStatus,
        publicationDecision: decision?.publicationDecision,
        implementationBasis: decision?.implementationBasis,
        leakageScanStatus: decision?.leakageScanStatus,
      });
      const safety = await validateFormulaSafetyEnvelopeV1({
        schemaVersion: 1,
        source: proposal.source,
        sourceRevision: proposal.sourceRevision,
        semanticHash: hashes.semanticHash,
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
      expect(safety.ok).toBe(true);
      expect(row.tier0).toEqual({
        sourceBound: true,
        rightsBound: true,
        safetyEnvelope: true,
      });
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
      expect(classified).toMatchObject({
        ok: true,
        contract: {
          modeClass: "classic-julia",
          supportLane: "source-split",
          candidateKind: "source-split",
          z0Role: "pixel-seed",
        },
      });
      const harness = runJuliaCpuHarnessV1(proposal.ir, binding, {
        sourceBinding,
        parameterPlaneBaseline: {
          source: baselineSource,
          sourceRevision: runtimeRow.sourceRevision,
        },
        points,
        constants,
        depths: artifact.probeGrid.depths,
        parameters: runtimeParameters(runtimeRow.parameters),
      });
      expect(harness.ok).toBe(true);
      if (!harness.ok) continue;
      expect(row.tier1).toEqual({
        bindingRevision: bindingRevision(
          runtimeRow.formulaId,
          proposal.sourceRevision,
          harness.value.contract,
        ),
        contract: harness.value.contract,
        checks: harness.value.checks,
        candidatePass: harness.value.candidatePass,
        reasonCodes: harness.value.reasonCodes,
      });
      expect(harness.value.checks.parameterPlaneBitIdentical).toBe(true);
      if (harness.value.candidatePass) {
        expect(row.status).toBe("candidate-only");
        expect(row.adjudication).toEqual({
          status: "candidate-only",
          reasonCode: "source-split-tier0-tier1-passed",
        });
        const path = row.isolation.candidateDefinitionPath;
        expect(path).toBeDefined();
        if (path)
          expect(readFileSync(join(RESOURCE_ROOT, path), "utf8")).toBe(
            proposal.source,
          );
      } else {
        expect(row.status).toBe("blocked");
        expect(row.isolation.candidateDefinitionPath).toBeUndefined();
        expect(row.adjudication).toEqual({
          status: "blocked",
          reasonCode: "source-split-tier1-cpu-rejected",
        });
      }
    }
    expect(artifact.rows.map((row) => row.formulaId)).toEqual(
      parsedIndex.value.rows.map((row) => row.formulaId),
    );
  }, 180_000);
});
