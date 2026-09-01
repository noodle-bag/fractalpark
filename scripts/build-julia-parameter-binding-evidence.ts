import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  canonicalizeFrmLikeV1,
  parseFrmLikeV1,
} from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import {
  classifyJuliaBindingRolesV1,
  type JuliaBindingClassifierReasonV1,
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
import {
  validateFormulaSafetyEnvelopeV1,
  type SafetyEnvelopeFailureV1,
} from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const PUBLISHED_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const EXISTING_SYSTEM_C_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
);
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
);
const SCHEMA = "fractalpark-julia-parameter-binding-evidence/v1" as const;
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1" as const;
const EVIDENCE_CANONICAL_NODE_BUDGET = 65_536;
const EXPECTED_FORMULAS = 534;
const EXPECTED_FORMULAS_WITH_COMPLEX_PARAMETER = 293;
const EXPECTED_COMPLEX_SLOTS = 371;
const EXPECTED_STATIC_REJECTED_SLOTS = 185;
const EXPECTED_STATIC_CANDIDATE_SLOTS = 186;
const EXPECTED_TIER1_CANDIDATE_SLOTS = 170;
const EXPECTED_TIER1_BLOCKED_SLOTS = 16;
const EXPECTED_STATIC_CANDIDATE_FORMULAS = 175;
const EXPECTED_SINGLE_PASSING_SLOT_FORMULAS = 162;
const EXPECTED_CLASSIC_SINGLE_PASSING_SLOT_FORMULAS = 107;
const EXPECTED_GENERALIZED_SINGLE_PASSING_SLOT_FORMULAS = 55;
const EXPECTED_MULTIPLE_PASSING_SLOT_FORMULAS = 4;
const EXPECTED_NO_PASSING_SLOT_FORMULAS = 368;
const EXPECTED_TIER0_PASSED_FORMULAS = 0;
const EXPECTED_TIER0_BLOCKED_FORMULAS = 175;
const EXPECTED_TERMINAL_NEWLINE_ONLY_FORMULAS = 163;
const EXPECTED_OTHER_CANONICAL_DELTA_FORMULAS = 12;
const EXPECTED_ELIGIBLE_CANDIDATES = 0;
const SOURCE_BINDING_PATHS = Object.freeze([
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/legacy-formula-aliases.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/standard-formula-ids.json",
  "scripts/build-julia-parameter-binding-evidence.ts",
  "src/engine/formulas/v1/identity.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
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

type StaticRejectedAttempt = Readonly<{
  slotName: string;
  status: "static-rejected";
  reasonCode: JuliaBindingClassifierReasonV1;
}>;

type Tier1Attempt = Readonly<{
  slotName: string;
  status: "tier1-candidate" | "blocked";
  bindingRevision: string;
  contract: JuliaBindingContractV1;
  checks: JuliaCpuHarnessV1["checks"];
  reasonCodes: JuliaCpuHarnessV1["reasonCodes"];
}>;

type SlotAttempt = StaticRejectedAttempt | Tier1Attempt;

type SlotResolution =
  | Readonly<{
      status: "single-passing-slot";
      selectedSlotName: string;
      selectedBindingRevision: string;
      modeClass: "classic-julia" | "generalized-two-plane";
    }>
  | Readonly<{
      status: "multiple-passing-slots";
      passingSlotNames: readonly string[];
    }>
  | Readonly<{
      status: "no-passing-slot";
      reasonCode: "no-complex-parameter" | "all-parameter-slots-rejected";
    }>;

type FormulaAdjudication =
  | Readonly<{
      status: "candidate-only";
      selectedSlotName: string;
      selectedBindingRevision: string;
      modeClass: "classic-julia" | "generalized-two-plane";
    }>
  | Readonly<{
      status: "blocked";
      reasonCode:
        | "tier0-safety-envelope-rejected"
        | "multiple-passing-parameter-slots"
        | "no-passing-parameter-slot";
    }>
  | Readonly<{
      status: "not-selected";
      reasonCode: "no-static-parameter-candidate";
    }>;

type Tier0Evidence =
  | Readonly<{
      status: "passed";
      sourceBound: true;
      rightsBound: true;
      safetyEnvelope: true;
    }>
  | Readonly<{
      status: "blocked";
      sourceBound: true;
      rightsBound: true;
      safetyEnvelope: false;
      failureCode: SafetyEnvelopeFailureV1;
      canonicalSourceDelta: "terminal-newline-only" | "other";
    }>
  | Readonly<{
      status: "not-required";
      reasonCode: "no-static-parameter-candidate";
    }>;

type EvidenceRow = Readonly<{
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  rightsStatus: PublicationDecisionRowV1["rightsStatus"];
  publicationDecision: "publish";
  implementationBasis: NonNullable<
    PublicationDecisionRowV1["implementationBasis"]
  >;
  leakageScanStatus: "passed";
  tier0: Tier0Evidence;
  complexSlotCount: number;
  attempts: readonly SlotAttempt[];
  slotResolution: SlotResolution;
  adjudication: FormulaAdjudication;
}>;

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

function isTier1Attempt(attempt: SlotAttempt): attempt is Tier1Attempt {
  return attempt.status !== "static-rejected";
}

function resolveSlots(attempts: readonly SlotAttempt[]): SlotResolution {
  const passing = attempts.filter(
    (attempt): attempt is Tier1Attempt =>
      isTier1Attempt(attempt) && attempt.status === "tier1-candidate",
  );
  if (passing.length === 1) {
    const selected = passing[0]!;
    invariant(
      selected.contract.modeClass === "classic-julia" ||
        selected.contract.modeClass === "generalized-two-plane",
      "julia-parameter-binding-selected-mode-invalid",
    );
    return Object.freeze({
      status: "single-passing-slot",
      selectedSlotName: selected.slotName,
      selectedBindingRevision: selected.bindingRevision,
      modeClass: selected.contract.modeClass,
    });
  }
  if (passing.length > 1)
    return Object.freeze({
      status: "multiple-passing-slots",
      passingSlotNames: Object.freeze(passing.map((attempt) => attempt.slotName)),
    });
  return Object.freeze({
    status: "no-passing-slot",
    reasonCode:
      attempts.length === 0
        ? "no-complex-parameter"
        : "all-parameter-slots-rejected",
  });
}

function adjudicateFormula(
  tier0: Tier0Evidence,
  slotResolution: SlotResolution,
): FormulaAdjudication {
  if (tier0.status === "not-required")
    return Object.freeze({
      status: "not-selected",
      reasonCode: "no-static-parameter-candidate",
    });
  if (tier0.status === "blocked")
    return Object.freeze({
      status: "blocked",
      reasonCode: "tier0-safety-envelope-rejected",
    });
  if (slotResolution.status === "single-passing-slot")
    return Object.freeze({
      status: "candidate-only",
      selectedSlotName: slotResolution.selectedSlotName,
      selectedBindingRevision: slotResolution.selectedBindingRevision,
      modeClass: slotResolution.modeClass,
    });
  return Object.freeze({
    status: "blocked",
    reasonCode:
      slotResolution.status === "multiple-passing-slots"
        ? "multiple-passing-parameter-slots"
        : "no-passing-parameter-slot",
  });
}

async function buildArtifact() {
  const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  invariant(parsedIndex.ok, "julia-parameter-binding-runtime-index-invalid");
  const publication = createPublicationDecisionLedgerV1();
  invariant(publication.ok, "julia-parameter-binding-publication-ledger-invalid");
  const existing = JSON.parse(
    readFileSync(EXISTING_SYSTEM_C_PATH, "utf8"),
  ) as ExistingSystemCEvidence;
  invariant(
    existing.schema === "fractalpark-julia-existing-system-c-evidence/v1" &&
      existing.candidateCount === 76 &&
      existing.rows.length === 76 &&
      /^[a-f0-9]{64}$/.test(existing.contentHash),
    "julia-parameter-binding-existing-system-c-invalid",
  );
  const existingSystemCIds = new Set(
    existing.rows.map((row) => row.formulaId),
  );

  const rows: EvidenceRow[] = [];
  for (const runtimeRow of parsedIndex.value.rows) {
    const source = readFileSync(
      join(PUBLISHED_ROOT, runtimeRow.definitionPath),
      "utf8",
    );
    const parsed = parseFrmLikeV1(source);
    invariant(
      parsed.ok,
      `julia-parameter-binding-source-invalid:${runtimeRow.formulaId}`,
    );
    const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
    invariant(
      decision,
      `julia-parameter-binding-decision-missing:${runtimeRow.formulaId}`,
    );
    invariant(
      decision.publicationDecision === "publish" &&
        decision.implementationBasis === runtimeRow.implementationBasis &&
        decision.leakageScanStatus === "passed",
      `julia-parameter-binding-tier0-rights-invalid:${runtimeRow.formulaId}`,
    );

    const irComplexSlots = parsed.ir.parameters
      .filter((parameter) => parameter.type === "complex")
      .map((parameter) => parameter.name);
    const descriptorComplexSlots = runtimeRow.parameters
      .filter((parameter) => parameter.type === "complex")
      .map((parameter) => parameter.slotName);
    invariant(
      canonicalJsonV1(irComplexSlots) === canonicalJsonV1(descriptorComplexSlots),
      `julia-parameter-binding-complex-slot-drift:${runtimeRow.formulaId}`,
    );
    const hasStaticCandidate = irComplexSlots.some((slotName) =>
      classifyJuliaBindingRolesV1(parsed.ir, {
        kind: "parameter",
        slotName,
      }).ok,
    );
    let tier0: EvidenceRow["tier0"];
    if (hasStaticCandidate) {
      const safety = await validateFormulaSafetyEnvelopeV1({
        schemaVersion: 1,
        source,
        sourceRevision: runtimeRow.sourceRevision,
        semanticHash: runtimeRow.semanticHash,
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        supportedNumericProfiles: ["standard32"],
        parameters: parsed.ir.parameters,
        programModel: "orbit",
        termination: {
          predicateMeaning: "continue-iteration",
          nonFinite: "terminate-with-event",
          maximumIterations: "profile-resolved",
        },
        channels: [],
        capabilities: [],
      });
      tier0 = safety.ok
        ? {
            status: "passed",
            sourceBound: true,
            rightsBound: true,
            safetyEnvelope: true,
          }
        : {
            status: "blocked",
            sourceBound: true,
            rightsBound: true,
            safetyEnvelope: false,
            failureCode: safety.code,
            canonicalSourceDelta:
              source === `${canonicalizeFrmLikeV1(parsed.ir)}\n`
                ? "terminal-newline-only"
                : "other",
          };
    } else {
      tier0 = {
        status: "not-required",
        reasonCode: "no-static-parameter-candidate",
      };
    }
    const parameters = runtimeParameters(runtimeRow.parameters);
    const attempts: SlotAttempt[] = [];
    for (const slotName of irComplexSlots) {
      const binding = { kind: "parameter", slotName } as const;
      const classified = classifyJuliaBindingRolesV1(parsed.ir, binding);
      if (!classified.ok) {
        attempts.push({
          slotName,
          status: "static-rejected",
          reasonCode: classified.reasonCode,
        });
        continue;
      }
      const harness = runJuliaCpuHarnessV1(parsed.ir, binding, { parameters });
      invariant(
        harness.ok,
        `julia-parameter-binding-harness-failed:${runtimeRow.formulaId}:${slotName}`,
      );
      invariant(
        harness.value.contract.supportLane === "parameter-binding" &&
          harness.value.contract.binding.kind === "parameter" &&
          harness.value.contract.binding.slotName === slotName,
        `julia-parameter-binding-contract-invalid:${runtimeRow.formulaId}:${slotName}`,
      );
      attempts.push({
        slotName,
        status: harness.value.candidatePass ? "tier1-candidate" : "blocked",
        bindingRevision: bindingRevision(
          runtimeRow.formulaId,
          runtimeRow.sourceRevision,
          harness.value.contract,
        ),
        contract: harness.value.contract,
        checks: harness.value.checks,
        reasonCodes: harness.value.reasonCodes,
      });
    }
    const slotResolution = resolveSlots(attempts);
    const adjudication = adjudicateFormula(tier0, slotResolution);
    if (slotResolution.status !== "no-passing-slot")
      invariant(
        !existingSystemCIds.has(runtimeRow.formulaId),
        `julia-parameter-binding-lane-overlap:${runtimeRow.formulaId}`,
      );
    rows.push({
      formulaId: runtimeRow.formulaId,
      sourceRevision: runtimeRow.sourceRevision,
      semanticHash: runtimeRow.semanticHash,
      rightsStatus: decision.rightsStatus,
      publicationDecision: decision.publicationDecision,
      implementationBasis: decision.implementationBasis,
      leakageScanStatus: decision.leakageScanStatus,
      tier0,
      complexSlotCount: irComplexSlots.length,
      attempts: Object.freeze(attempts),
      slotResolution,
      adjudication,
    });
  }

  invariant(rows.length === EXPECTED_FORMULAS, "julia-parameter-binding-row-count-drift");
  invariant(
    rows.every(
      (row, index) => index === 0 || rows[index - 1]!.formulaId < row.formulaId,
    ),
    "julia-parameter-binding-order-drift",
  );
  const allAttempts = rows.flatMap((row) => row.attempts);
  const tier1Attempts = allAttempts.filter(isTier1Attempt);
  const singlePassing = rows.filter(
    (row) => row.slotResolution.status === "single-passing-slot",
  );
  const tier0Failures = rows
    .filter(
      (row): row is EvidenceRow & { tier0: Extract<Tier0Evidence, { status: "blocked" }> } =>
        row.tier0.status === "blocked",
    )
    .map((row) => row.tier0.failureCode);
  const tier0FailureCounts = Object.fromEntries(
    [...new Set(tier0Failures)]
      .sort()
      .map((code) => [
        code,
        tier0Failures.filter((failureCode) => failureCode === code).length,
      ]),
  );
  const counts = {
    formulaCount: rows.length,
    formulasWithComplexParameter: rows.filter((row) => row.complexSlotCount > 0).length,
    complexSlotCount: allAttempts.length,
    staticRejectedSlotCount: allAttempts.filter(
      (attempt) => attempt.status === "static-rejected",
    ).length,
    staticCandidateSlotCount: tier1Attempts.length,
    staticCandidateFormulaCount: rows.filter(
      (row) => row.tier0.status !== "not-required",
    ).length,
    tier1CandidateSlotCount: tier1Attempts.filter(
      (attempt) => attempt.status === "tier1-candidate",
    ).length,
    tier1BlockedSlotCount: tier1Attempts.filter(
      (attempt) => attempt.status === "blocked",
    ).length,
    singlePassingSlotFormulaCount: singlePassing.length,
    classicSinglePassingSlotFormulaCount: singlePassing.filter(
      (row) =>
        row.slotResolution.status === "single-passing-slot" &&
        row.slotResolution.modeClass === "classic-julia",
    ).length,
    generalizedSinglePassingSlotFormulaCount: singlePassing.filter(
      (row) =>
        row.slotResolution.status === "single-passing-slot" &&
        row.slotResolution.modeClass === "generalized-two-plane",
    ).length,
    multiplePassingSlotFormulaCount: rows.filter(
      (row) => row.slotResolution.status === "multiple-passing-slots",
    ).length,
    noPassingSlotFormulaCount: rows.filter(
      (row) => row.slotResolution.status === "no-passing-slot",
    ).length,
    tier0PassedFormulaCount: rows.filter((row) => row.tier0.status === "passed").length,
    tier0BlockedFormulaCount: rows.filter((row) => row.tier0.status === "blocked").length,
    terminalNewlineOnlyFormulaCount: rows.filter(
      (row) =>
        row.tier0.status === "blocked" &&
        row.tier0.canonicalSourceDelta === "terminal-newline-only",
    ).length,
    otherCanonicalDeltaFormulaCount: rows.filter(
      (row) =>
        row.tier0.status === "blocked" &&
        row.tier0.canonicalSourceDelta === "other",
    ).length,
    eligibleCandidateCount: rows.filter(
      (row) => row.adjudication.status === "candidate-only",
    ).length,
    blockedFormulaCount: rows.filter((row) => row.adjudication.status === "blocked").length,
    notSelectedFormulaCount: rows.filter(
      (row) => row.adjudication.status === "not-selected",
    ).length,
  };
  invariant(
    counts.formulaCount === EXPECTED_FORMULAS &&
      counts.formulasWithComplexParameter ===
        EXPECTED_FORMULAS_WITH_COMPLEX_PARAMETER &&
      counts.complexSlotCount === EXPECTED_COMPLEX_SLOTS &&
      counts.staticRejectedSlotCount === EXPECTED_STATIC_REJECTED_SLOTS &&
      counts.staticCandidateSlotCount === EXPECTED_STATIC_CANDIDATE_SLOTS &&
      counts.staticCandidateFormulaCount === EXPECTED_STATIC_CANDIDATE_FORMULAS &&
      counts.tier1CandidateSlotCount === EXPECTED_TIER1_CANDIDATE_SLOTS &&
      counts.tier1BlockedSlotCount === EXPECTED_TIER1_BLOCKED_SLOTS &&
      counts.singlePassingSlotFormulaCount ===
        EXPECTED_SINGLE_PASSING_SLOT_FORMULAS &&
      counts.classicSinglePassingSlotFormulaCount ===
        EXPECTED_CLASSIC_SINGLE_PASSING_SLOT_FORMULAS &&
      counts.generalizedSinglePassingSlotFormulaCount ===
        EXPECTED_GENERALIZED_SINGLE_PASSING_SLOT_FORMULAS &&
      counts.multiplePassingSlotFormulaCount ===
        EXPECTED_MULTIPLE_PASSING_SLOT_FORMULAS &&
      counts.noPassingSlotFormulaCount === EXPECTED_NO_PASSING_SLOT_FORMULAS &&
      counts.tier0PassedFormulaCount === EXPECTED_TIER0_PASSED_FORMULAS &&
      counts.tier0BlockedFormulaCount === EXPECTED_TIER0_BLOCKED_FORMULAS &&
      counts.terminalNewlineOnlyFormulaCount ===
        EXPECTED_TERMINAL_NEWLINE_ONLY_FORMULAS &&
      counts.otherCanonicalDeltaFormulaCount ===
        EXPECTED_OTHER_CANONICAL_DELTA_FORMULAS &&
      counts.eligibleCandidateCount === EXPECTED_ELIGIBLE_CANDIDATES &&
      counts.blockedFormulaCount === EXPECTED_TIER0_BLOCKED_FORMULAS &&
      counts.notSelectedFormulaCount ===
        EXPECTED_FORMULAS - EXPECTED_TIER0_BLOCKED_FORMULAS &&
      Object.keys(tier0FailureCounts).length === 1 &&
      tier0FailureCounts["source-not-canonical"] ===
        EXPECTED_TIER0_BLOCKED_FORMULAS,
    "julia-parameter-binding-count-drift",
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
    numericProfile: "standard32",
    sourceBindings: sourceBindings(),
    ...counts,
    tier0FailureCounts,
    probeGrid: {
      points: JULIA_CPU_HARNESS_POINTS_V1,
      constants: JULIA_CPU_HARNESS_CONSTANTS_V1,
      depths: JULIA_CPU_HARNESS_DEPTHS_V1,
    },
    rows,
  };
  return {
    ...body,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(body, EVIDENCE_CANONICAL_NODE_BUDGET),
    ),
  };
}

async function main() {
  const artifact = await buildArtifact();
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temporary = join(dirname(OUTPUT_PATH), ".julia-parameter-binding-evidence.tmp");
    writeFileSync(temporary, bytes, { encoding: "utf8", mode: 0o644 });
    renameSync(temporary, OUTPUT_PATH);
  } else {
    invariant(existsSync(OUTPUT_PATH), "julia-parameter-binding-evidence-missing");
    invariant(
      readFileSync(OUTPUT_PATH, "utf8") === bytes,
      "julia-parameter-binding-evidence-drift",
    );
  }
  console.log(
    `julia_parameter_binding_evidence=ok formulas=${artifact.formulaCount} slots=${artifact.complexSlotCount} tier1_single=${artifact.singlePassingSlotFormulaCount} tier0_blocked=${artifact.tier0BlockedFormulaCount} eligible=${artifact.eligibleCandidateCount} hash=${artifact.contentHash}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "julia-parameter-binding-unknown-error",
  );
  process.exitCode = 1;
});
