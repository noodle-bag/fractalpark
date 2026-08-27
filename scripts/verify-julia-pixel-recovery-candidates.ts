import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import {
  runJuliaCpuHarnessV1,
  type JuliaCpuComplexV1,
} from "../src/engine/formulas/v1/julia-cpu-harness";
import { parseJuliaParameterAuthorityAssetV1 } from "../src/engine/formulas/v1/julia-parameter-authority";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import { proposeJuliaPixelRecoveryCandidateV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-candidate";
import {
  JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
  JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1,
  parseJuliaPixelRecoveryCandidatesV1,
} from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const PUBLISHED = join(ROOT, "public/formula-library/v1/runtime/published");
const OUTPUT = join(RESOURCE, "julia-pixel-recovery-candidates.v1.json");
const DEFINITION_ROOT = join(
  RESOURCE,
  JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
);
const fail = (message: string): never => {
  throw new Error(`verify-julia-pixel-recovery-candidates: ${message}`);
};
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;
const same = (left: unknown, right: unknown): boolean =>
  canonicalJsonV1(left, 10_000_000) === canonicalJsonV1(right, 10_000_000);
const fileHash = (relative: string): string =>
  sha256HexSyncV1(readFileSync(join(ROOT, relative), "utf8"));
const regularSingleLinkFile = (path: string): boolean => {
  const status = lstatSync(path);
  return status.isFile() && !status.isSymbolicLink() && status.nlink === 1;
};

type RoleRow = Readonly<{
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  sourceAuthority: string;
  recoveryContractContentHash: string;
  roles: readonly string[];
  modeClass: "classic-julia" | "generalized-two-plane" | "undetermined";
  reasonCodes: readonly string[];
  authorityEvidence: Readonly<{ authorityLane: string | null }>;
  roleReceipt: string;
}>;
type RoleAsset = Readonly<{
  schema: string;
  revision: number;
  runtimeIndexCanonicalSha256: string;
  recoveryContractContentHash: string;
  rowCount: number;
  rows: readonly RoleRow[];
  contentHash: string;
}>;

function verifyRoleAsset(value: unknown): RoleAsset {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).schema !==
      "fractalpark-julia-pixel-role-census/v1" ||
    (value as Record<string, unknown>).revision !== 2 ||
    !Array.isArray((value as Record<string, unknown>).rows) ||
    (value as Record<string, unknown>).rowCount !== 534 ||
    typeof (value as Record<string, unknown>).contentHash !== "string"
  )
    fail("role-census-shape");
  const asset = value as RoleAsset;
  const content = Object.fromEntries(
    Object.entries(asset).filter(([key]) => key !== "contentHash"),
  );
  if (
    asset.rows.length !== 534 ||
    asset.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, 1_048_576))
  )
    fail("role-census-content-hash");
  for (const row of asset.rows) {
    const receipt = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "roleReceipt"),
    );
    if (
      row.roleReceipt !==
      `sha256:${sha256HexSyncV1(canonicalJsonV1(receipt, 65_536))}`
    )
      fail(`role-receipt:${row.formulaId}`);
  }
  return asset;
}

function runtimeParameters(
  parameters: readonly {
    slotName: string;
    type: string;
    default: unknown;
  }[],
): Readonly<
  Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>
> {
  return Object.freeze(
    Object.fromEntries(
      parameters.map((parameter) => {
        if (parameter.type !== "complex")
          return [
            parameter.slotName,
            parameter.default as number | FrmV1UnaryFunctionName,
          ];
        const value = parameter.default as readonly number[];
        return [
          parameter.slotName,
          [value[0]!, value[1]!] as JuliaCpuComplexV1,
        ];
      }),
    ),
  );
}

async function verify(): Promise<Record<string, unknown>> {
  if (!existsSync(OUTPUT) || !existsSync(DEFINITION_ROOT))
    fail("output-missing");
  const rootStatus = lstatSync(DEFINITION_ROOT);
  if (
    !regularSingleLinkFile(OUTPUT) ||
    !rootStatus.isDirectory() ||
    rootStatus.isSymbolicLink()
  )
    fail("output-not-regular");
  const assetRaw = readJson(OUTPUT);
  const parsedAsset = parseJuliaPixelRecoveryCandidatesV1(assetRaw);
  const asset = parsedAsset.ok
    ? parsedAsset.value
    : fail("asset-invalid");
  const expectedBindings = Object.fromEntries(
    [...JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1]
      .sort()
      .map((relative) => [relative, fileHash(relative)]),
  );
  if (!same(asset.sourceBindings, expectedBindings))
    fail("source-bindings-invalid");

  const runtimeRaw = readJson(join(PUBLISHED, "index.json"));
  const runtimeResult = parsePublishedFormulaRuntimeIndexV1(runtimeRaw);
  const runtime = runtimeResult.ok
    ? runtimeResult.value
    : fail("runtime-index-invalid");
  const contractRaw = readJson(
    join(RESOURCE, "julia-pixel-recovery-contract.v1.json"),
  );
  const contractResult = parseJuliaPixelRecoveryContractV1(contractRaw);
  const contract = contractResult.ok
    ? contractResult.value
    : fail("contract-invalid");
  const roleRaw = readJson(
    join(RESOURCE, "julia-pixel-role-census.v1.json"),
  );
  const roles = verifyRoleAsset(roleRaw);
  const parameterRaw = readJson(
    join(RESOURCE, "julia-parameter-authority.v1.json"),
  );
  const parameterResult = parseJuliaParameterAuthorityAssetV1(parameterRaw);
  const parameter = parameterResult.ok
    ? parameterResult.value
    : fail("parameter-authority-invalid");
  const ledgerResult = createPublicationDecisionLedgerV1();
  const ledger = ledgerResult.ok
    ? ledgerResult.ledger
    : fail("publication-ledger-invalid");
  const runtimeDigest = sha256HexSyncV1(
    canonicalJsonV1(runtimeRaw, 131_072),
  );
  if (
    runtime.rows.length !== 534 ||
    asset.runtimeIndexCanonicalSha256 !== runtimeDigest ||
    asset.recoveryContractContentHash !== contract.contentHash ||
    asset.roleCensusContentHash !== roles.contentHash ||
    asset.parameterAuthorityContentHash !== parameter.contentHash ||
    roles.runtimeIndexCanonicalSha256 !== runtimeDigest ||
    roles.recoveryContractContentHash !== contract.contentHash
  )
    fail("input-lineage-invalid");

  const roleById = new Map(roles.rows.map((row) => [row.formulaId, row]));
  const runtimeById = new Map(
    runtime.rows.map((row) => [row.formulaId, row]),
  );
  const assetById = new Map(asset.rows.map((row) => [row.formulaId, row]));
  if (
    roleById.size !== 534 ||
    runtimeById.size !== 534 ||
    assetById.size !== 534
  )
    fail("row-cardinality-invalid");
  const expectedDefinitions = new Map<string, string>();

  for (const formulaId of [...runtimeById.keys()].sort()) {
    const item = runtimeById.get(formulaId) ?? fail(`runtime:${formulaId}`);
    const role = roleById.get(formulaId) ?? fail(`role:${formulaId}`);
    const row = assetById.get(formulaId) ?? fail(`asset-row:${formulaId}`);
    const right = ledger.decisionFor(formulaId) ?? fail(`rights:${formulaId}`);
    if (
      right.publicationDecision !== "publish" ||
      right.implementationBasis !== item.implementationBasis ||
      right.leakageScanStatus !== "passed"
    )
      fail(`rights-invalid:${formulaId}`);
    const source = readFileSync(join(PUBLISHED, item.definitionPath), "utf8");
    const parsedSource = parseFrmLikeV1(source);
    const baselineIr = parsedSource.ok
      ? parsedSource.ir
      : fail(`baseline-parse:${formulaId}`);
    const baseline = await hashFrmLikeV1(source, baselineIr);
    if (
      baseline.sourceRevision !== item.sourceRevision ||
      baseline.semanticHash !== item.semanticHash ||
      row.baselineSourceRevision !== baseline.sourceRevision ||
      row.baselineSemanticHash !== baseline.semanticHash ||
      row.roleReceipt !== role.roleReceipt ||
      role.sourceRevision !== baseline.sourceRevision ||
      role.semanticHash !== baseline.semanticHash
    )
      fail(`baseline-binding:${formulaId}`);

    const priorLane = role.authorityEvidence.authorityLane;
    if (priorLane === "existing-system-c" || priorLane === "parameter-binding") {
      if (row.status !== "prior-lane" || row.priorLane !== priorLane)
        fail(`prior-lane:${formulaId}`);
      continue;
    }

    const proposal = proposeJuliaPixelRecoveryCandidateV1(baselineIr, role);
    if (!proposal.ok) {
      if (row.status !== "held" || row.reasonCode !== proposal.reasonCode)
        fail(`held-row:${formulaId}`);
      continue;
    }
    const candidateRow =
      row.status === "candidate"
        ? row
        : fail(`candidate-status:${formulaId}`);
    if (
      candidateRow.rewrite.kind !== proposal.rewriteKind ||
      candidateRow.rewrite.constantTarget !== proposal.constantTarget ||
      candidateRow.rewrite.provenanceDepth !== proposal.provenanceDepth ||
      candidateRow.rewrite.recurrenceReadCount !== proposal.recurrenceReadCount ||
      candidateRow.rewrite.analyzerVersion !== proposal.analyzerVersion
    )
      fail(`candidate-rewrite:${formulaId}`);
    const definitionPath = join(
      RESOURCE,
      candidateRow.candidate.definitionPath,
    );
    if (!existsSync(definitionPath) || !regularSingleLinkFile(definitionPath))
      fail(`candidate-definition-not-regular:${formulaId}`);
    const definition = readFileSync(definitionPath, "utf8");
    if (
      definition !== proposal.source ||
      definition.endsWith("\n") ||
      candidateRow.candidate.sourceRevision === baseline.sourceRevision ||
      candidateRow.candidate.sourceRevision !== proposal.sourceRevision ||
      candidateRow.candidate.binding.kind !== "source-split" ||
      candidateRow.candidate.binding.sourceRevision !== candidateRow.candidate.sourceRevision ||
      candidateRow.candidate.sourceAuthority !== "isolated-content-addressed-draft" ||
      candidateRow.candidate.activation !== "inactive-candidate"
    )
      fail(`candidate-definition:${formulaId}`);
    const candidateParsed = parseFrmLikeV1(definition);
    const candidateIr = candidateParsed.ok
      ? candidateParsed.ir
      : fail(`candidate-parse:${formulaId}`);
    const candidateHash = await hashFrmLikeV1(definition, candidateIr);
    if (
      candidateHash.sourceRevision !== candidateRow.candidate.sourceRevision ||
      candidateHash.semanticHash !== candidateRow.candidate.semanticHash ||
      !same(candidateIr, proposal.ir)
    )
      fail(`candidate-hash:${formulaId}`);
    const safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: definition,
      sourceRevision: candidateHash.sourceRevision,
      semanticHash: candidateHash.semanticHash,
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      supportedNumericProfiles: ["standard32"],
      parameters: candidateIr.parameters,
      programModel: "orbit",
      termination: {
        predicateMeaning: "continue-iteration",
        nonFinite: "terminate-with-event",
        maximumIterations: "profile-resolved",
      },
      channels: [],
      capabilities: [],
    });
    if (
      !safety.ok ||
      baselineIr.formulaName !== candidateIr.formulaName ||
      !same(baselineIr.parameters, candidateIr.parameters) ||
      !same(baselineIr.bailout, candidateIr.bailout) ||
      candidateRow.identity.formulaNamePreserved !== true ||
      candidateRow.identity.parameterSchemaPreserved !== true ||
      candidateRow.identity.terminationPreserved !== true
    )
      fail(`candidate-invariant:${formulaId}`);
    if (
      candidateRow.rights.rightsStatus !== right.rightsStatus ||
      candidateRow.rights.publicationDecision !== "publish" ||
      candidateRow.rights.implementationBasis !== right.implementationBasis ||
      candidateRow.rights.leakageScanStatus !== "passed"
    )
      fail(`candidate-rights:${formulaId}`);

    const binding = {
      kind: "source-split",
      sourceRevision: candidateHash.sourceRevision,
    } as const;
    const sourceBinding = {
      source: definition,
      sourceRevision: candidateHash.sourceRevision,
    };
    const classified = classifyJuliaBindingRolesV1(
      candidateIr,
      binding,
      sourceBinding,
    );
    if (
      !classified.ok ||
      classified.contract.modeClass !== "classic-julia" ||
      classified.contract.supportLane !== "source-split" ||
      classified.contract.z0Role !== "pixel-seed"
    )
      fail(`candidate-classifier:${formulaId}`);
    const harnessResult = runJuliaCpuHarnessV1(candidateIr, binding, {
      sourceBinding,
      parameterPlaneBaseline: {
        source,
        sourceRevision: baseline.sourceRevision,
      },
      parameters: runtimeParameters(item.parameters),
    });
    const harness = harnessResult.ok
      ? harnessResult.value
      : fail(`candidate-harness:${formulaId}`);
    if (
      harness.checks.parameterPlaneBitIdentical !== true ||
      candidateRow.e0.parameterPlaneBitIdentical !== true ||
      candidateRow.e0.evidenceClass !== "E0-parameter-plane-bit-identity"
    )
      fail(`candidate-e0:${formulaId}`);
    const changedResult = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId,
        source,
        ...baseline,
        sourceAuthorityContentHash: contract.contentHash,
        ir: baselineIr,
      },
      {
        formulaId,
        source: definition,
        ...candidateHash,
        sourceAuthorityContentHash: contract.contentHash,
        ir: candidateIr,
      },
    );
    const changed = changedResult.ok
      ? changedResult.value
      : fail(`changed-region:${formulaId}`);
    const coverageEntries = changed.regions.map((region) => ({
      regionId: region.regionId,
      coveredModes: region.requiredCoverageModes,
    }));
    const coverage = verifyJuliaPixelChangedRegionCoverageV1(
      changed,
      coverageEntries,
    );
    const coveredRegionCount = coverage.ok
      ? coverage.coveredRegionCount
      : fail(`changed-region-coverage:${formulaId}`);
    if (
      candidateRow.e0.changedRegionAnalyzerRevision !==
        contract.changedRegionAnalyzer.revision ||
      candidateRow.e0.analysisContentHash !== changed.contentHash ||
      candidateRow.e0.coverageContentHash !==
        sha256HexSyncV1(canonicalJsonV1(coverageEntries, 131_072)) ||
      candidateRow.e0.changedRegionCount !== changed.regions.length ||
      candidateRow.e0.reachableOrUnknownRegionCount !==
        changed.reachableOrUnknownRegionCount ||
      candidateRow.e0.coveredRegionCount !== coveredRegionCount ||
      candidateRow.e0.uncoveredReachableOrUnknownRegionCount !== 0 ||
      candidateRow.e0.coverageBasis !== "static-role-plus-E0-parameter-identity" ||
      candidateRow.authority.authorityState !== "draft" ||
      candidateRow.authority.supersededBy !== null ||
      candidateRow.authority.withdrawnBy !== null
    )
      fail(`candidate-receipt:${formulaId}`);
    expectedDefinitions.set(candidateHash.sourceRevision, definition);
  }

  const expectedNames = [...expectedDefinitions.keys()]
    .map((revision) => `${revision}.frm`)
    .sort();
  const actualNames = readdirSync(DEFINITION_ROOT).sort();
  if (
    !same(expectedNames, actualNames) ||
    expectedDefinitions.size !== 159 ||
    !actualNames.every((name) => {
      const source = expectedDefinitions.get(name.slice(0, -4));
      return source !== undefined &&
        readFileSync(join(DEFINITION_ROOT, name), "utf8") === source;
    })
  )
    fail("candidate-definition-set-invalid");

  return {
    ok: true,
    rowCount: asset.rowCount,
    counts: asset.counts,
    rewriteCounts: asset.rewriteCounts,
    heldReasonCounts: asset.heldReasonCounts,
    candidateDefinitionCount: expectedDefinitions.size,
    contentHash: asset.contentHash,
  };
}

void verify()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
