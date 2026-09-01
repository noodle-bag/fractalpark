import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
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
  JULIA_PIXEL_RECOVERY_CANDIDATES_SCHEMA_V1,
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
  throw new Error(`julia-pixel-recovery-candidates: ${message}`);
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

function roleAsset(value: unknown): RoleAsset {
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
    const receiptContent = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "roleReceipt"),
    );
    if (
      typeof row.formulaId !== "string" ||
      !Array.isArray(row.roles) ||
      !Array.isArray(row.reasonCodes) ||
      row.roleReceipt !==
        `sha256:${sha256HexSyncV1(canonicalJsonV1(receiptContent, 65_536))}`
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

function sourceBindings(): Record<string, string> {
  return Object.fromEntries(
    [...JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1]
      .sort()
      .map((relative) => [relative, fileHash(relative)]),
  );
}

function countBy(
  rows: readonly Record<string, unknown>[],
  selector: (row: Record<string, unknown>) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = selector(row);
    if (key !== undefined) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function build(): Promise<{
  asset: Record<string, unknown>;
  definitions: ReadonlyMap<string, string>;
}> {
  const runtimePath = join(PUBLISHED, "index.json");
  const contractPath = join(RESOURCE, "julia-pixel-recovery-contract.v1.json");
  const rolePath = join(RESOURCE, "julia-pixel-role-census.v1.json");
  const parameterPath = join(RESOURCE, "julia-parameter-authority.v1.json");
  const runtimeRaw = readJson(runtimePath);
  const contractRaw = readJson(contractPath);
  const roleRaw = readJson(rolePath);
  const parameterRaw = readJson(parameterPath);
  const runtimeResult = parsePublishedFormulaRuntimeIndexV1(runtimeRaw);
  const runtime = runtimeResult.ok
    ? runtimeResult.value
    : fail("runtime-index-invalid");
  const contractResult = parseJuliaPixelRecoveryContractV1(contractRaw);
  const contract = contractResult.ok
    ? contractResult.value
    : fail("recovery-contract-invalid");
  const roles = roleAsset(roleRaw);
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
    roles.runtimeIndexCanonicalSha256 !== runtimeDigest ||
    roles.recoveryContractContentHash !== contract.contentHash ||
    contract.lineage.runtimeIndexCanonicalSha256 !== runtimeDigest
  )
    fail("input-lineage-invalid");
  const roleById = new Map(roles.rows.map((row) => [row.formulaId, row]));
  if (roleById.size !== 534) fail("role-id-cardinality");

  const rows: Record<string, unknown>[] = [];
  const definitions = new Map<string, string>();
  for (const item of runtime.rows) {
    const role = roleById.get(item.formulaId) ?? fail(`role:${item.formulaId}`);
    const right = ledger.decisionFor(item.formulaId) ??
      fail(`rights:${item.formulaId}`);
    if (
      right.publicationDecision !== "publish" ||
      right.implementationBasis !== item.implementationBasis ||
      right.leakageScanStatus !== "passed"
    )
      fail(`rights-invalid:${item.formulaId}`);
    const source = readFileSync(join(PUBLISHED, item.definitionPath), "utf8");
    const parsedResult = parseFrmLikeV1(source);
    const baselineIr = parsedResult.ok
      ? parsedResult.ir
      : fail(`source-parse:${item.formulaId}`);
    const baseline = await hashFrmLikeV1(source, baselineIr);
    if (
      baseline.sourceRevision !== item.sourceRevision ||
      baseline.semanticHash !== item.semanticHash ||
      role.sourceRevision !== baseline.sourceRevision ||
      role.semanticHash !== baseline.semanticHash ||
      role.sourceAuthority !== "production-runtime-published" ||
      role.recoveryContractContentHash !== contract.contentHash
    )
      fail(`source-binding:${item.formulaId}`);

    if (
      role.authorityEvidence.authorityLane === "existing-system-c" ||
      role.authorityEvidence.authorityLane === "parameter-binding"
    ) {
      rows.push({
        formulaId: item.formulaId,
        baselineSourceRevision: baseline.sourceRevision,
        baselineSemanticHash: baseline.semanticHash,
        roleReceipt: role.roleReceipt,
        status: "prior-lane",
        priorLane: role.authorityEvidence.authorityLane,
      });
      continue;
    }

    const proposal = proposeJuliaPixelRecoveryCandidateV1(baselineIr, role);
    if (!proposal.ok) {
      rows.push({
        formulaId: item.formulaId,
        baselineSourceRevision: baseline.sourceRevision,
        baselineSemanticHash: baseline.semanticHash,
        roleReceipt: role.roleReceipt,
        status: "held",
        reasonCode: proposal.reasonCode,
      });
      continue;
    }

    const candidateHash = await hashFrmLikeV1(proposal.source, proposal.ir);
    if (
      candidateHash.sourceRevision !== proposal.sourceRevision ||
      proposal.source.endsWith("\n") ||
      parseFrmLikeV1(proposal.source).ok === false
    )
      fail(`candidate-source:${item.formulaId}`);
    const safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: proposal.source,
      sourceRevision: candidateHash.sourceRevision,
      semanticHash: candidateHash.semanticHash,
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
    if (
      !safety.ok ||
      !same(safety.ir, proposal.ir) ||
      baselineIr.formulaName !== proposal.ir.formulaName ||
      !same(baselineIr.parameters, proposal.ir.parameters) ||
      !same(baselineIr.bailout, proposal.ir.bailout)
    )
      fail(`candidate-invariant:${item.formulaId}`);
    const binding = {
      kind: "source-split",
      sourceRevision: candidateHash.sourceRevision,
    } as const;
    const sourceBinding = {
      source: proposal.source,
      sourceRevision: candidateHash.sourceRevision,
    };
    const classified = classifyJuliaBindingRolesV1(
      proposal.ir,
      binding,
      sourceBinding,
    );
    if (
      !classified.ok ||
      classified.contract.modeClass !== "classic-julia" ||
      classified.contract.supportLane !== "source-split" ||
      classified.contract.z0Role !== "pixel-seed"
    )
      fail(`candidate-classifier:${item.formulaId}`);
    const harnessResult = runJuliaCpuHarnessV1(proposal.ir, binding, {
      sourceBinding,
      parameterPlaneBaseline: {
        source,
        sourceRevision: baseline.sourceRevision,
      },
      parameters: runtimeParameters(item.parameters),
    });
    const harness = harnessResult.ok
      ? harnessResult.value
      : fail(`candidate-harness:${item.formulaId}`);
    if (harness.checks.parameterPlaneBitIdentical !== true)
      fail(`candidate-e0:${item.formulaId}`);

    const changedResult = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId: item.formulaId,
        source,
        ...baseline,
        sourceAuthorityContentHash: contract.contentHash,
        ir: baselineIr,
      },
      {
        formulaId: item.formulaId,
        source: proposal.source,
        ...candidateHash,
        sourceAuthorityContentHash: contract.contentHash,
        ir: proposal.ir,
      },
    );
    const changed = changedResult.ok
      ? changedResult.value
      : fail(`changed-region:${item.formulaId}`);
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
      : fail(`changed-region-coverage:${item.formulaId}`);
    if (coverage.uncoveredReachableOrUnknownRegionCount !== 0)
      fail(`changed-region-coverage:${item.formulaId}`);

    const definitionPath = `${JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1}/${candidateHash.sourceRevision}.frm`;
    const priorSource = definitions.get(candidateHash.sourceRevision);
    if (priorSource !== undefined && priorSource !== proposal.source)
      fail(`candidate-revision-collision:${item.formulaId}`);
    definitions.set(candidateHash.sourceRevision, proposal.source);
    rows.push({
      formulaId: item.formulaId,
      baselineSourceRevision: baseline.sourceRevision,
      baselineSemanticHash: baseline.semanticHash,
      roleReceipt: role.roleReceipt,
      status: "candidate",
      rewrite: {
        kind: proposal.rewriteKind,
        constantTarget: proposal.constantTarget,
        provenanceDepth: proposal.provenanceDepth,
        recurrenceReadCount: proposal.recurrenceReadCount,
        analyzerVersion: proposal.analyzerVersion,
      },
      candidate: {
        sourceRevision: candidateHash.sourceRevision,
        semanticHash: candidateHash.semanticHash,
        definitionPath,
        binding,
        sourceAuthority: "isolated-content-addressed-draft",
        activation: "inactive-candidate",
      },
      identity: {
        formulaNamePreserved: true,
        parameterSchemaPreserved: true,
        terminationPreserved: true,
      },
      rights: {
        rightsStatus: right.rightsStatus,
        publicationDecision: "publish",
        implementationBasis: right.implementationBasis,
        leakageScanStatus: "passed",
      },
      e0: {
        evidenceClass: "E0-parameter-plane-bit-identity",
        parameterPlaneBitIdentical: true,
        changedRegionAnalyzerRevision:
          contract.changedRegionAnalyzer.revision,
        analysisContentHash: changed.contentHash,
        coverageContentHash: sha256HexSyncV1(
          canonicalJsonV1(coverageEntries, 131_072),
        ),
        changedRegionCount: changed.regions.length,
        reachableOrUnknownRegionCount:
          changed.reachableOrUnknownRegionCount,
        coveredRegionCount,
        uncoveredReachableOrUnknownRegionCount: 0,
        coverageBasis: "static-role-plus-E0-parameter-identity",
      },
      authority: {
        authorityState: "draft",
        supersededBy: null,
        withdrawnBy: null,
      },
    });
  }
  rows.sort((left, right) =>
    String(left.formulaId).localeCompare(String(right.formulaId)),
  );
  const status = countBy(rows, (row) => String(row.status));
  const rewrite = countBy(rows, (row) => {
    if (row.status !== "candidate") return undefined;
    const value = row.rewrite as Record<string, unknown>;
    return `${value.kind}:${value.provenanceDepth}`;
  });
  const held = countBy(rows, (row) =>
    row.status === "held" ? String(row.reasonCode) : undefined,
  );
  if (
    !same(status, { "prior-lane": 251, candidate: 159, held: 124 }) ||
    !same(rewrite, {
      "direct-pixel-constant:0": 61,
      "transitive-pixel-constant:1": 95,
      "transitive-pixel-constant:2": 3,
    }) ||
    !same(held, {
      "generalized-two-plane-held": 27,
      "mutable-pixel-alias-held": 30,
      "constant-role-not-proven": 49,
      "constant-role-outside-recurrence": 11,
      "constant-definition-not-unique": 6,
      "constant-initialization-control-not-proven": 1,
    }) ||
    definitions.size !== 159
  )
    fail(`partition:${JSON.stringify({ status, rewrite, held, definitions: definitions.size })}`);

  const content: Record<string, unknown> = {
    schema: JULIA_PIXEL_RECOVERY_CANDIDATES_SCHEMA_V1,
    revision: 1,
    stage: "candidate-generation",
    authority: {
      authorityState: "draft",
      supersededBy: null,
      withdrawnBy: null,
    },
    activationStatus: "inactive-candidate-only",
    candidateSetState: "draft-not-wave-frozen",
    waveId: null,
    candidateDefinitionsRoot:
      JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
    runtimeIndexCanonicalSha256: runtimeDigest,
    recoveryContractContentHash: contract.contentHash,
    roleCensusContentHash: roles.contentHash,
    parameterAuthorityContentHash: parameter.contentHash,
    sourceBindings: sourceBindings(),
    rowCount: 534,
    counts: {
      priorLaneFormulaCount: 251,
      candidateFormulaCount: 159,
      heldFormulaCount: 124,
      candidateDefinitionCount: 159,
      stateSeparatedCandidateCount: 0,
      literalCandidateCount: 0,
      e1ReviewPackageCount: 0,
    },
    rewriteCounts: {
      directPixelConstant: 61,
      transitivePixelConstant: 98,
      transitiveDepthOne: 95,
      transitiveDepthTwo: 3,
    },
    heldReasonCounts: {
      generalizedTwoPlane: 27,
      mutablePixelAlias: 30,
      constantRoleNotProven: 49,
      constantRoleOutsideRecurrence: 11,
      constantDefinitionNotUnique: 6,
      constantInitializationControlNotProven: 1,
    },
    rows,
  };
  const asset = {
    ...content,
    contentHash: sha256HexSyncV1(canonicalJsonV1(content, 1_048_576)),
  };
  if (!parseJuliaPixelRecoveryCandidatesV1(asset).ok)
    fail("self-parse");
  return { asset, definitions };
}

function definitionBytesMatch(definitions: ReadonlyMap<string, string>): boolean {
  if (!existsSync(DEFINITION_ROOT)) return false;
  const rootStatus = lstatSync(DEFINITION_ROOT);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) return false;
  const expected = [...definitions.keys()].map((revision) => `${revision}.frm`).sort();
  const actual = readdirSync(DEFINITION_ROOT).sort();
  return (
    same(expected, actual) &&
    expected.every((name) => {
      const path = join(DEFINITION_ROOT, name);
      return (
        regularSingleLinkFile(path) &&
        readFileSync(path, "utf8") === definitions.get(name.slice(0, -4))
      );
    })
  );
}

function writeOutputs(
  bytes: string,
  definitions: ReadonlyMap<string, string>,
): void {
  const temporaryRoot = `${DEFINITION_ROOT}.tmp-${process.pid}`;
  const temporaryOutput = `${OUTPUT}.tmp-${process.pid}`;
  if (existsSync(OUTPUT) && !regularSingleLinkFile(OUTPUT))
    fail("candidate-asset-not-regular-file");
  if (existsSync(DEFINITION_ROOT)) {
    const rootStatus = lstatSync(DEFINITION_ROOT);
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink())
      fail("candidate-root-not-regular-directory");
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
  rmSync(temporaryOutput, { force: true });
  mkdirSync(temporaryRoot, { recursive: true, mode: 0o755 });
  for (const [revision, source] of definitions)
    writeFileSync(join(temporaryRoot, `${revision}.frm`), source, {
      flag: "wx",
      mode: 0o644,
    });
  writeFileSync(temporaryOutput, bytes, { flag: "wx", mode: 0o644 });
  if (existsSync(DEFINITION_ROOT))
    rmSync(DEFINITION_ROOT, { recursive: true });
  renameSync(temporaryRoot, DEFINITION_ROOT);
  rmSync(OUTPUT, { force: true });
  renameSync(temporaryOutput, OUTPUT);
}

void build()
  .then(({ asset, definitions }) => {
    const bytes = `${JSON.stringify(asset, null, 2)}\n`;
    if (process.argv.includes("--write")) writeOutputs(bytes, definitions);
    const assetMatches =
      existsSync(OUTPUT) &&
      regularSingleLinkFile(OUTPUT) &&
      readFileSync(OUTPUT, "utf8") === bytes;
    const definitionsMatch = definitionBytesMatch(definitions);
    if (!assetMatches || !definitionsMatch) fail("output-drift");
    console.log(
      JSON.stringify({
        rowCount: asset.rowCount,
        counts: asset.counts,
        rewriteCounts: asset.rewriteCounts,
        heldReasonCounts: asset.heldReasonCounts,
        candidateDefinitionCount: definitions.size,
        contentHash: asset.contentHash,
      }),
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
