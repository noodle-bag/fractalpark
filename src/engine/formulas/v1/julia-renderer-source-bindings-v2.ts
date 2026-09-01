import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_RENDERER_SOURCE_BINDING_PATHS_V2 = Object.freeze([
  "package-lock.json",
  "package.json",
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-pixel-candidate-manifest.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json",
  "scripts/build-julia-renderer-evidence-v2.ts",
  "scripts/build-julia-pixel-holdout-attempt-manifest.ts",
  "scripts/lib/julia-private-evidence-root.ts",
  "scripts/lib/julia-worker-bundle-audit.ts",
  "scripts/run-julia-tier2-webgl-worker-v2.ts",
  "scripts/transition-julia-pixel-holdout-attempt-ledger.ts",
  "scripts/verify-julia-renderer-evidence-v2.ts",
  "scripts/verify-julia-tier2-webgl-v2.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-candidate.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-candidates.ts",
  "src/engine/formulas/v1/julia-pre-gpu-recovery-v2.ts",
  "src/engine/formulas/v1/julia-renderer-evidence-v2.ts",
  "src/engine/formulas/v1/julia-renderer-source-bindings-v2.ts",
  "src/engine/formulas/v1/published-adapter.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/types.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/v1.ts",
  "src/engine/plugins/builtins/coloring/inside-black.ts",
  "src/engine/plugins/builtins/coloring/smooth.ts",
  "src/engine/plugins/builtins/transforms/none.ts",
  "src/engine/plugins/registry.ts",
  "src/engine/plugins/types.ts",
  "src/engine/shaders/assembler.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/shaders/framework.frag.glsl",
  "src/engine/shaders/palettes.glsl",
  "tsconfig.json",
] as const);

const JULIA_RENDERER_CANONICAL_ONLY_SOURCE_BINDINGS_V2 = new Set<string>([
  "scripts/build-julia-renderer-evidence-v2.ts",
  "scripts/build-julia-pixel-holdout-attempt-manifest.ts",
  "scripts/lib/julia-private-evidence-root.ts",
  "scripts/transition-julia-pixel-holdout-attempt-ledger.ts",
  "scripts/verify-julia-renderer-evidence-v2.ts",
]);

export const JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2 = Object.freeze(
  JULIA_RENDERER_SOURCE_BINDING_PATHS_V2.filter(
    (path) => !JULIA_RENDERER_CANONICAL_ONLY_SOURCE_BINDINGS_V2.has(path),
  ),
);

interface RecoveryRowBindingInputV2 {
  readonly formulaId: string;
  readonly status: string;
  readonly supportLane: string;
  readonly evaluatedSourceRevision: string | null;
}

interface RuntimeRowBindingInputV2 {
  readonly formulaId: string;
  readonly definitionPath: string;
  readonly sourceRevision: string;
}

interface CandidateRowBindingInputV2 {
  readonly formulaId: string;
  readonly status: string;
  readonly candidate?: Readonly<{ definitionPath: string }> | null;
}

const RUNTIME_DEFINITION = /^definitions\/([a-f0-9]{64})\.frm$/;
const CANDIDATE_DEFINITION =
  /^julia-pixel-recovery-candidates\/definitions\/([a-f0-9]{64})\.frm$/;

export function buildJuliaRendererDefinitionBindingPathsV2(
  recoveryRows: readonly RecoveryRowBindingInputV2[],
  runtimeRows: readonly RuntimeRowBindingInputV2[],
  candidateRows: readonly CandidateRowBindingInputV2[],
): readonly string[] {
  const queue = recoveryRows.filter((row) => row.status === "tier2-queue");
  if (
    queue.length !== 236 ||
    new Set(queue.map((row) => row.formulaId)).size !== queue.length
  )
    throw new Error("julia-renderer-definition-binding-authority-invalid");
  const runtimeById = new Map(runtimeRows.map((row) => [row.formulaId, row]));
  const candidateById = new Map(candidateRows.map((row) => [row.formulaId, row]));
  const paths = queue.map((row) => {
    if (row.evaluatedSourceRevision === null)
      throw new Error("julia-renderer-definition-binding-revision-invalid");
    if (row.supportLane.startsWith("source-split-")) {
      const candidate = candidateById.get(row.formulaId);
      const relative = candidate?.candidate?.definitionPath;
      const match = relative?.match(CANDIDATE_DEFINITION);
      if (
        candidate?.status !== "candidate" ||
        match?.[1] !== row.evaluatedSourceRevision
      )
        throw new Error("julia-renderer-definition-binding-candidate-invalid");
      return `resources/formula-library/v1/${relative}`;
    }
    const runtime = runtimeById.get(row.formulaId);
    if (runtime === undefined)
      throw new Error("julia-renderer-definition-binding-runtime-invalid");
    const match = runtime.definitionPath.match(RUNTIME_DEFINITION);
    if (
      match?.[1] !== runtime.sourceRevision ||
      (row.supportLane !== "parameter-binding" &&
        runtime.sourceRevision !== row.evaluatedSourceRevision)
    )
      throw new Error("julia-renderer-definition-binding-runtime-invalid");
    return `public/formula-library/v1/runtime/published/${runtime.definitionPath}`;
  });
  const unique = [...new Set(paths)].sort();
  if (unique.length !== queue.length)
    throw new Error("julia-renderer-definition-binding-path-duplicate");
  return Object.freeze(unique);
}

function combineBindingPaths(
  staticPaths: readonly string[],
  definitionPaths: readonly string[],
): readonly string[] {
  if (definitionPaths.length !== 236)
    throw new Error("julia-renderer-definition-binding-count-invalid");
  const combined = [...staticPaths, ...definitionPaths].sort();
  if (new Set(combined).size !== combined.length)
    throw new Error("julia-renderer-source-binding-path-duplicate");
  return Object.freeze(combined);
}

export function buildJuliaRendererExecutionSourceBindingPathsV2(
  definitionPaths: readonly string[],
): readonly string[] {
  return combineBindingPaths(
    JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2,
    definitionPaths,
  );
}

export function buildJuliaRendererFullSourceBindingPathsV2(
  definitionPaths: readonly string[],
): readonly string[] {
  return combineBindingPaths(
    JULIA_RENDERER_SOURCE_BINDING_PATHS_V2,
    definitionPaths,
  );
}

export function buildJuliaRendererSourceBindingMapV2(
  paths: readonly string[],
  readText: (path: string) => string,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      paths.map((path) => [path, sha256HexSyncV1(readText(path))]),
    ),
  );
}

export function buildJuliaRendererSourceBindingContentHashV2(
  paths: readonly string[],
  readText: (path: string) => string,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1(buildJuliaRendererSourceBindingMapV2(paths, readText), 65_536),
  );
}

export function verifyJuliaRendererSourceBindingMapV2(
  bindings: Readonly<Record<string, string>>,
  paths: readonly string[],
  readText: (path: string) => string,
): void {
  const actualPaths = Object.keys(bindings).sort();
  if (
    actualPaths.length !== paths.length ||
    actualPaths.some((path, index) => path !== paths[index])
  )
    throw new Error("julia-renderer-source-binding-set-invalid");
  for (const path of paths) {
    if (bindings[path] !== sha256HexSyncV1(readText(path)))
      throw new Error(`julia-renderer-source-binding-invalid:${path}`);
  }
}
