import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseFrmLikeV1 } from "../src/engine/frm/v1";
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
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const PUBLISHED_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
);
const SCHEMA = "fractalpark-julia-existing-system-c-evidence/v1" as const;
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1" as const;
const EXPECTED_CANDIDATES = 76;
const EXPECTED_TIER1_PASS = 74;
const EXPECTED_TIER1_BLOCKED = 2;
const SOURCE_BINDING_PATHS = Object.freeze([
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/legacy-formula-aliases.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/standard-formula-ids.json",
  "scripts/build-julia-existing-system-c-evidence.ts",
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

type EvidenceRow = Readonly<{
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  bindingRevision: string;
  rightsStatus: PublicationDecisionRowV1["rightsStatus"];
  publicationDecision: "publish";
  implementationBasis: NonNullable<
    PublicationDecisionRowV1["implementationBasis"]
  >;
  leakageScanStatus: "passed";
  contract: JuliaBindingContractV1;
  tier0: Readonly<{
    sourceBound: true;
    rightsBound: true;
    safetyEnvelope: true;
  }>;
  tier1: Readonly<{
    evidenceClass: "tier1-candidate-only";
    status: "tier1-candidate" | "blocked";
    checks: JuliaCpuHarnessV1["checks"];
    reasonCodes: JuliaCpuHarnessV1["reasonCodes"];
  }>;
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

async function buildArtifact() {
  const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  invariant(parsedIndex.ok, "julia-system-c-runtime-index-invalid");
  const publication = createPublicationDecisionLedgerV1();
  invariant(publication.ok, "julia-system-c-publication-ledger-invalid");

  const rows: EvidenceRow[] = [];
  for (const runtimeRow of parsedIndex.value.rows) {
    const source = readFileSync(
      join(PUBLISHED_ROOT, runtimeRow.definitionPath),
      "utf8",
    );
    const parsed = parseFrmLikeV1(source);
    invariant(parsed.ok, `julia-system-c-source-invalid:${runtimeRow.formulaId}`);
    const classified = classifyJuliaBindingRolesV1(parsed.ir, {
      kind: "system-c",
    });
    if (!classified.ok) continue;
    invariant(
      classified.contract.modeClass === "classic-julia" &&
        classified.contract.supportLane === "existing-system-c" &&
        classified.contract.binding.kind === "system-c" &&
        classified.contract.z0Role === "pixel-seed",
      `julia-system-c-static-contract-invalid:${runtimeRow.formulaId}`,
    );

    const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
    invariant(decision, `julia-system-c-decision-missing:${runtimeRow.formulaId}`);
    invariant(
      decision.publicationDecision === "publish" &&
        decision.implementationBasis === runtimeRow.implementationBasis &&
        decision.leakageScanStatus === "passed",
      `julia-system-c-tier0-rights-invalid:${runtimeRow.formulaId}`,
    );

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
    invariant(
      safety.ok,
      `julia-system-c-safety-envelope-invalid:${runtimeRow.formulaId}`,
    );

    const harness = runJuliaCpuHarnessV1(parsed.ir, { kind: "system-c" }, {
      parameters: runtimeParameters(runtimeRow.parameters),
    });
    invariant(
      harness.ok,
      `julia-system-c-harness-failed:${runtimeRow.formulaId}`,
    );
    const tier1Status = harness.value.candidatePass
      ? "tier1-candidate"
      : "blocked";
    rows.push({
      formulaId: runtimeRow.formulaId,
      sourceRevision: runtimeRow.sourceRevision,
      semanticHash: runtimeRow.semanticHash,
      bindingRevision: bindingRevision(
        runtimeRow.formulaId,
        runtimeRow.sourceRevision,
        harness.value.contract,
      ),
      rightsStatus: decision.rightsStatus,
      publicationDecision: decision.publicationDecision,
      implementationBasis: decision.implementationBasis,
      leakageScanStatus: decision.leakageScanStatus,
      contract: harness.value.contract,
      tier0: {
        sourceBound: true,
        rightsBound: true,
        safetyEnvelope: true,
      },
      tier1: {
        evidenceClass: harness.value.evidenceClass,
        status: tier1Status,
        checks: harness.value.checks,
        reasonCodes: harness.value.reasonCodes,
      },
    });
  }

  invariant(rows.length === EXPECTED_CANDIDATES, "julia-system-c-count-drift");
  invariant(
    rows.every(
      (row, index) => index === 0 || rows[index - 1]!.formulaId < row.formulaId,
    ),
    "julia-system-c-order-drift",
  );
  const tier1PassCount = rows.filter(
    (row) => row.tier1.status === "tier1-candidate",
  ).length;
  const tier1BlockedCount = rows.filter(
    (row) => row.tier1.status === "blocked",
  ).length;
  invariant(
    tier1PassCount === EXPECTED_TIER1_PASS &&
      tier1BlockedCount === EXPECTED_TIER1_BLOCKED,
    "julia-system-c-tier1-count-drift",
  );

  const body = {
    schema: SCHEMA,
    revision: 1,
    stage: "tier0-tier1-pre-gpu",
    runtimeIndexCanonicalSha256:
      PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    publicationDecisionsContentHash:
      PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
    numericProfile: "standard32",
    sourceBindings: sourceBindings(),
    candidateCount: rows.length,
    tier1PassCount,
    tier1BlockedCount,
    probeGrid: {
      points: JULIA_CPU_HARNESS_POINTS_V1,
      constants: JULIA_CPU_HARNESS_CONSTANTS_V1,
      depths: JULIA_CPU_HARNESS_DEPTHS_V1,
    },
    rows,
  };
  return {
    ...body,
    contentHash: sha256HexSyncV1(canonicalJsonV1(body)),
  };
}

async function main() {
  const artifact = await buildArtifact();
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temporary = join(dirname(OUTPUT_PATH), ".julia-system-c-evidence.tmp");
    writeFileSync(temporary, bytes, { encoding: "utf8", mode: 0o644 });
    renameSync(temporary, OUTPUT_PATH);
  } else {
    invariant(existsSync(OUTPUT_PATH), "julia-system-c-evidence-missing");
    invariant(
      readFileSync(OUTPUT_PATH, "utf8") === bytes,
      "julia-system-c-evidence-drift",
    );
  }
  console.log(
    `julia_system_c_evidence=ok candidates=${artifact.candidateCount} tier1_pass=${artifact.tier1PassCount} blocked=${artifact.tier1BlockedCount} hash=${artifact.contentHash}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "julia-system-c-unknown-error");
  process.exitCode = 1;
});
