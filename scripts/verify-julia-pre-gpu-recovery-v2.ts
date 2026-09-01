import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import candidateAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import parameterAsset from "../resources/formula-library/v1/julia-parameter-authority.v1.json";
import existingAsset from "../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import {
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import { classifyJuliaBindingRolesV1, type OrbitConstantBindingV1 } from "../src/engine/formulas/v1/julia-binding";
import { runJuliaCpuHarnessV1, type JuliaCpuComplexV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import { parseJuliaParameterAuthorityAssetV1 } from "../src/engine/formulas/v1/julia-parameter-authority";
import { parseJuliaPixelRecoveryCandidatesV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import {
  JULIA_PIXEL_CANDIDATE_MANIFEST_SCHEMA_V1,
  JULIA_PRE_GPU_RECOVERY_CENSUS_SCHEMA_V2,
  juliaPreGpuCandidateContentHashV2,
  juliaPreGpuRowReceiptV2,
  parseJuliaPixelCandidateManifestV1,
  parseJuliaPreGpuRecoveryCensusV2,
  type JuliaPreGpuRecoveryRowV2,
} from "../src/engine/formulas/v1/julia-pre-gpu-recovery-v2";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const RUNTIME = join(ROOT, "public/formula-library/v1/runtime/published");
const OUTPUT = join(RESOURCE, "julia-pre-gpu-recovery-census.v2.json");
const MANIFEST_OUTPUT = join(RESOURCE, "julia-pixel-candidate-manifest.v1.json");
const FAILURE_DIAGNOSIS_MANIFEST_CONTENT_HASH =
  "7d02687cc7a1bbf714af6da97f7f99cd55d07e1a9b6e2367edda095219409785";
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v2" as const;
const fail = (code: string): never => { throw new Error(`verify-julia-pre-gpu-recovery:${code}`); };
const same = (left: unknown, right: unknown): boolean => canonicalJsonV1(left, 10_000_000) === canonicalJsonV1(right, 10_000_000);
const fileHash = (relative: string): string => sha256HexSyncV1(readFileSync(join(ROOT, relative), "utf8"));

type RuntimeParameter = number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName;
function runtimeParameters(parameters: readonly { slotName: string; type: string; default: unknown }[]): Readonly<Record<string, RuntimeParameter>> {
  return Object.freeze(Object.fromEntries(parameters.map((parameter) => {
    if (parameter.type !== "complex") return [parameter.slotName, parameter.default as number | FrmV1UnaryFunctionName];
    const value = parameter.default as readonly number[];
    return [parameter.slotName, [value[0]!, value[1]!] as JuliaCpuComplexV1];
  })));
}

const SOURCE_BINDING_PATHS = Object.freeze([
  "package-lock.json",
  "package.json",
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/julia-parameter-authority.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "scripts/build-julia-pre-gpu-recovery-v2.ts",
  "scripts/verify-julia-pre-gpu-recovery-v2.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-parameter-authority.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-candidates.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/julia-pre-gpu-recovery-v2.ts",
  "src/engine/formulas/v1/publication-decisions.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/v1.ts",
  "tsconfig.json",
] as const);

function bindingRevision(
  formulaId: string,
  sourceRevision: string,
  binding: OrbitConstantBindingV1,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({ schema: BINDING_SCHEMA, formulaId, sourceRevision, binding }),
  );
}

function sourceBindings(dynamic: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    [...new Set([...SOURCE_BINDING_PATHS, ...dynamic])]
      .sort()
      .map((path) => [path, fileHash(path)]),
  );
}

function nonCandidateRow(input: {
  formulaId: string;
  baselineSourceRevision: string;
  status: "blocked" | "held" | "unknown";
  reasonCodes: readonly string[];
  tier0: "fail" | "pending";
}): JuliaPreGpuRecoveryRowV2 {
  const base = {
    formulaId: input.formulaId,
    baselineSourceRevision: input.baselineSourceRevision,
    evaluatedSourceRevision: null,
    evaluatedSemanticHash: null,
    binding: null,
    bindingRevision: null,
    supportLane: "none" as const,
    rewriteClass: null,
    status: input.status,
    reasonCodes: [...input.reasonCodes],
    tier0: input.tier0,
    tier1: "pending" as const,
    candidateContentHash: null,
  };
  return { ...base, rowReceipt: juliaPreGpuRowReceiptV2(base) };
}

async function attemptedRow(input: {
  formulaId: string;
  baselineSource: string;
  source: string;
  expectedSourceRevision: string;
  expectedSemanticHash: string;
  binding: OrbitConstantBindingV1;
  supportLane:
    | "existing-system-c"
    | "parameter-binding"
    | "source-split-direct"
    | "source-split-transitive";
  parameters: readonly { slotName: string; type: string; default: unknown }[];
}): Promise<JuliaPreGpuRecoveryRowV2> {
  const parsed = parseFrmLikeV1(input.source);
  const ir = parsed.ok ? parsed.ir : fail(`source-parse:${input.formulaId}`);
  const revision = await hashFrmLikeV1(input.source, ir);
  const baselineParsed = parseFrmLikeV1(input.baselineSource);
  const baselineIr = baselineParsed.ok ? baselineParsed.ir : fail(`baseline-parse:${input.formulaId}`);
  const baseline = await hashFrmLikeV1(input.baselineSource, baselineIr);
  if (
    revision.sourceRevision !== input.expectedSourceRevision ||
    revision.semanticHash !== input.expectedSemanticHash
  )
    fail(`source-binding:${input.formulaId}`);
  const ledger = createPublicationDecisionLedgerV1();
  const right = ledger.ok ? ledger.ledger.decisionFor(input.formulaId) : null;
  if (!right || right.publicationDecision !== "publish" || right.leakageScanStatus !== "passed")
    fail(`rights:${input.formulaId}`);
  const safety = await validateFormulaSafetyEnvelopeV1({
    schemaVersion: 1,
    source: input.source,
    sourceRevision: revision.sourceRevision,
    semanticHash: revision.semanticHash,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: ir.parameters,
    programModel: "orbit",
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [],
    capabilities: [],
  });
  if (!safety.ok || !same(safety.ir, ir)) fail(`safety:${input.formulaId}`);
  const sourceBinding =
    input.binding.kind === "source-split"
      ? { source: input.source, sourceRevision: revision.sourceRevision }
      : undefined;
  const classified = classifyJuliaBindingRolesV1(ir, input.binding, sourceBinding);
  if (
    !classified.ok ||
    classified.contract.modeClass !== "classic-julia" ||
    classified.contract.z0Role !== "pixel-seed"
  )
    fail(`classifier-${input.supportLane}:${input.formulaId}`);
  const harnessResult = runJuliaCpuHarnessV1(ir, input.binding, {
    ...(sourceBinding
      ? {
          sourceBinding,
          parameterPlaneBaseline: {
            source: input.baselineSource,
            sourceRevision: baseline.sourceRevision,
          },
        }
      : {}),
    parameters: runtimeParameters(input.parameters),
  });
  const harness = harnessResult.ok ? harnessResult.value : fail(`harness:${input.formulaId}`);
  const status = harness.candidatePass ? "tier2-queue" : "blocked";
  const bindingHash = bindingRevision(input.formulaId, revision.sourceRevision, input.binding);
  const evidence: Omit<
    JuliaPreGpuRecoveryRowV2,
    "candidateContentHash" | "rowReceipt"
  > = {
    formulaId: input.formulaId,
    baselineSourceRevision: baseline.sourceRevision,
    evaluatedSourceRevision: revision.sourceRevision,
    evaluatedSemanticHash: revision.semanticHash,
    binding: input.binding,
    bindingRevision: bindingHash,
    supportLane: input.supportLane,
    rewriteClass: "E0-operational-equivalence" as const,
    status,
    reasonCodes: [...harness.reasonCodes],
    tier0: "pass" as const,
    tier1: harness.candidatePass ? ("pass" as const) : ("fail" as const),
  };
  const candidateContentHash = juliaPreGpuCandidateContentHashV2(evidence);
  const withoutReceipt: Omit<JuliaPreGpuRecoveryRowV2, "rowReceipt"> = {
    ...evidence,
    candidateContentHash,
  };
  return {
    ...withoutReceipt,
    rowReceipt: juliaPreGpuRowReceiptV2(withoutReceipt),
  };
}

async function build(): Promise<{
  census: Record<string, unknown>;
  manifest: Record<string, unknown>;
}> {
  const runtimeRaw = JSON.parse(readFileSync(join(RUNTIME, "index.json"), "utf8")) as unknown;
  const runtimeResult = parsePublishedFormulaRuntimeIndexV1(runtimeRaw);
  const contractResult = parseJuliaPixelRecoveryContractV1(contractAsset);
  const parameterResult = parseJuliaParameterAuthorityAssetV1(parameterAsset);
  const candidateResult = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  const runtime = runtimeResult.ok ? runtimeResult.value : fail("runtime-invalid");
  const contract = contractResult.ok ? contractResult.value : fail("contract-invalid");
  const parameter = parameterResult.ok ? parameterResult.value : fail("parameter-invalid");
  const candidates = candidateResult.ok ? candidateResult.value : fail("candidates-invalid");
  if (runtime.rows.length !== 534) fail("runtime-count");
  const existingById = new Map(existingAsset.rows.map((row) => [row.formulaId, row]));
  const parameterById = new Map(parameter.rows.map((row) => [row.formulaId, row]));
  const candidateById = new Map(candidates.rows.map((row) => [row.formulaId, row]));
  if (existingById.size !== 76 || parameterById.size !== 175 || candidateById.size !== 534)
    fail("input-cardinality");
  const rows: JuliaPreGpuRecoveryRowV2[] = [];
  const dynamicPaths = new Set<string>();
  for (const runtimeRow of runtime.rows) {
    const runtimeRelative = `public/formula-library/v1/runtime/published/${runtimeRow.definitionPath}`;
    const baselineSource = readFileSync(join(ROOT, runtimeRelative), "utf8");
    const existing = existingById.get(runtimeRow.formulaId);
    const parameterRow = parameterById.get(runtimeRow.formulaId);
    const dRow = candidateById.get(runtimeRow.formulaId) ?? fail("d-row-missing");
    if (existing) {
      dynamicPaths.add(runtimeRelative);
      rows.push(
        await attemptedRow({
          formulaId: runtimeRow.formulaId,
          baselineSource,
          source: baselineSource,
          expectedSourceRevision: existing.sourceRevision,
          expectedSemanticHash: existing.semanticHash,
          binding: { kind: "system-c" },
          supportLane: "existing-system-c",
          parameters: runtimeRow.parameters,
        }),
      );
      continue;
    }
    if (parameterRow) {
      if (parameterRow.authorityDecision === "canonical-authority-recovered") {
        const baselineParsed = parseFrmLikeV1(baselineSource);
        const baselineIr = baselineParsed.ok
          ? baselineParsed.ir
          : fail(`parameter-baseline:${runtimeRow.formulaId}`);
        const canonicalSource = canonicalizeFrmLikeV1(baselineIr);
        const slotName =
          parameterRow.slotResolution.status === "unique"
            ? parameterRow.slotResolution.selectedSlotName
            : undefined;
        const selectedSlot = slotName ??
          fail(`parameter-slot:${runtimeRow.formulaId}`);
        const selectedAttempt = parameterRow.attempts.find(
          (attempt) => attempt.slotName === selectedSlot,
        );
        const selectedContract =
          selectedAttempt && selectedAttempt.status !== "static-rejected"
            ? selectedAttempt.contract
            : null;
        const authoritativeContract = selectedContract ??
          fail(`parameter-contract:${runtimeRow.formulaId}`);
        if (
          authoritativeContract.modeClass !== "classic-julia" ||
          authoritativeContract.z0Role !== "pixel-seed"
        ) {
          rows.push(
            nonCandidateRow({
              formulaId: runtimeRow.formulaId,
              baselineSourceRevision: runtimeRow.sourceRevision,
              status: "held",
              tier0: "pending",
              reasonCodes: ["recovered-authority-generalized-held"],
            }),
          );
          continue;
        }
        dynamicPaths.add(runtimeRelative);
        rows.push(
          await attemptedRow({
            formulaId: runtimeRow.formulaId,
            baselineSource,
            source: canonicalSource,
            expectedSourceRevision: parameterRow.candidateSourceRevision,
            expectedSemanticHash: parameterRow.baselineSemanticHash,
            binding: {
              kind: "parameter",
              slotName: selectedSlot,
            },
            supportLane: "parameter-binding",
            parameters: runtimeRow.parameters,
          }),
        );
      } else {
        const mapping = {
          "no-passing-blocked": {
            status: "blocked" as const,
            tier0: "fail" as const,
          },
          "generalized-held": {
            status: "held" as const,
            tier0: "pending" as const,
          },
          "multiple-held": {
            status: "held" as const,
            tier0: "pending" as const,
          },
          "undetermined-unknown": {
            status: "unknown" as const,
            tier0: "pending" as const,
          },
        }[parameterRow.authorityDecision];
        rows.push(
          nonCandidateRow({
            formulaId: runtimeRow.formulaId,
            baselineSourceRevision: runtimeRow.sourceRevision,
            status: mapping.status,
            tier0: mapping.tier0,
            reasonCodes: [parameterRow.authorityDecision],
          }),
        );
      }
      continue;
    }
    if (dRow.status === "candidate") {
      const relative = `resources/formula-library/v1/${dRow.candidate.definitionPath}`;
      dynamicPaths.add(runtimeRelative);
      dynamicPaths.add(relative);
      rows.push(
        await attemptedRow({
          formulaId: runtimeRow.formulaId,
          baselineSource,
          source: readFileSync(join(ROOT, relative), "utf8"),
          expectedSourceRevision: dRow.candidate.sourceRevision,
          expectedSemanticHash: dRow.candidate.semanticHash,
          binding: {
            kind: "source-split",
            sourceRevision: dRow.candidate.sourceRevision,
          },
          supportLane:
            dRow.rewrite.kind === "direct-pixel-constant"
              ? "source-split-direct"
              : "source-split-transitive",
          parameters: runtimeRow.parameters,
        }),
      );
      continue;
    }
    const heldRow = dRow.status === "held" ? dRow : fail("unclassified-row");
    rows.push(
      nonCandidateRow({
        formulaId: runtimeRow.formulaId,
        baselineSourceRevision: runtimeRow.sourceRevision,
        status: "held",
        tier0: "pending",
        reasonCodes: [heldRow.reasonCode],
      }),
    );
  }
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  const statusCounts = Object.fromEntries(
    ["tier2-queue", "blocked", "held", "unknown"].map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  );
  const queue = rows.filter((row) => row.status === "tier2-queue");
  const laneCounts = {
    existingSystemC: queue.filter((row) => row.supportLane === "existing-system-c").length,
    parameterBinding: queue.filter((row) => row.supportLane === "parameter-binding").length,
    sourceSplit: queue.filter((row) => row.supportLane.startsWith("source-split-")).length,
  };
  const blockedStageCounts = {
    tier0: rows.filter((row) => row.status === "blocked" && row.tier0 === "fail").length,
    tier1: rows.filter((row) => row.status === "blocked" && row.tier1 === "fail").length,
  };
  if (
    !same(statusCounts, {
      "tier2-queue": 236,
      blocked: 15,
      held: 167,
      unknown: 116,
    }) ||
    !same(laneCounts, {
      existingSystemC: 74,
      parameterBinding: 7,
      sourceSplit: 155,
    }) ||
    !same(blockedStageCounts, { tier0: 9, tier1: 6 })
  )
    fail(`partition:${JSON.stringify({ statusCounts, laneCounts, blockedStageCounts })}`);
  const bindings = sourceBindings([...dynamicPaths]);
  const runtimeDigest = sha256HexSyncV1(canonicalJsonV1(runtimeRaw, 131_072));
  const censusBody = {
    schema: JULIA_PRE_GPU_RECOVERY_CENSUS_SCHEMA_V2,
    revision: 2,
    stage: "pre-gpu-v2-closure",
    authority: {
      authorityState: "sealed",
      supersededBy: null,
      withdrawnBy: null,
    },
    activationStatus: "inactive-evidence-only",
    contractContentHash: contract.contentHash,
    runtimeIndexCanonicalSha256: runtimeDigest,
    parameterAuthorityContentHash: parameter.contentHash,
    recoveryCandidatesContentHash: candidates.contentHash,
    failureDiagnosisManifestContentHash:
      FAILURE_DIAGNOSIS_MANIFEST_CONTENT_HASH,
    sourceBindings: bindings,
    rowCount: 534,
    statusCounts: {
      tier2Queue: 236,
      blocked: 15,
      held: 167,
      unknown: 116,
    },
    queueLaneCounts: laneCounts,
    blockedStageCounts,
    rows,
  };
  const census = {
    ...censusBody,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(censusBody, 1_048_576),
    ),
  };
  const parsedCensus = parseJuliaPreGpuRecoveryCensusV2(census);
  const preGpu = parsedCensus.ok ? parsedCensus.value : fail("census-self-parse");
  const manifestRows = queue.map((row) => ({
    formulaId: row.formulaId,
    rewriteClass: "E0-operational-equivalence" as const,
    candidateContentHash: row.candidateContentHash!,
    sourceRevision: row.evaluatedSourceRevision!,
    semanticHash: row.evaluatedSemanticHash!,
  }));
  const manifestBase = {
    schema: JULIA_PIXEL_CANDIDATE_MANIFEST_SCHEMA_V1,
    revision: 1,
    authority: {
      authorityState: "sealed",
      supersededBy: null,
      withdrawnBy: null,
    },
    contractContentHash: contract.contentHash,
    rowCount: manifestRows.length,
    rows: manifestRows,
  };
  const waveId = sha256HexSyncV1(
    canonicalJsonV1(manifestBase, 1_048_576),
  );
  const manifest = { ...manifestBase, waveId, contentHash: waveId };
  if (!parseJuliaPixelCandidateManifestV1(manifest, preGpu).ok)
    fail("manifest-self-parse");
  return { census, manifest };
}

void build()
  .then(({ census, manifest }) => {
    const censusBytes = `${JSON.stringify(census, null, 2)}\n`;
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    if (
      !existsSync(OUTPUT) ||
      !existsSync(MANIFEST_OUTPUT) ||
      readFileSync(OUTPUT, "utf8") !== censusBytes ||
      readFileSync(MANIFEST_OUTPUT, "utf8") !== manifestBytes
    )
      fail("output-drift");
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        preGpuContentHash: census.contentHash,
        waveId: manifest.waveId,
        queueCount: 236,
        blockedCount: 15,
        heldCount: 167,
        unknownCount: 116,
        independentlyReplayed: true,
      })}\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code:
          error instanceof Error
            ? error.message.split(":", 2).join(":")
            : "julia-pre-gpu-recovery-failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
