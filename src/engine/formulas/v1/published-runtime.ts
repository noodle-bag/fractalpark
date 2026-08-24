import {
  compilePublishedFormulaPluginV1,
  PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1,
  type PublishedFormulaParameterDescriptorV1,
  type PublishedFormulaPluginArtifactV1,
} from "./published-adapter";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const SHA256 = /^[a-f0-9]{64}$/;
const FORMULA_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DEFINITION_PATH = /^definitions\/([a-f0-9]{64})\.frm$/;

export const PUBLISHED_FORMULA_RUNTIME_INDEX_SCHEMA_V1 =
  "fractalpark-published-formula-runtime-index/v1" as const;
export const PUBLISHED_FORMULA_PROFILE_SCHEMA_V1 =
  "fractalpark-published-formula-profile/v1" as const;
export const PUBLISHED_FORMULA_DECISION_REVISION_V1 = 4 as const;
export const PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1 =
  "cac35a05d2d0c219b4f5ac00f3dea5b5fbb2b9c6b2fc15ea3383ef0f62d6031d" as const;
export const PUBLISHED_FORMULA_ROW_COUNT_V1 = 534 as const;
export const PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5" as const;

const PUBLISHED_FORMULA_INDEX_CANONICAL_NODE_BUDGET_V1 = 131_072;

export type PublishedFormulaProfileQualityV1 = "mechanical" | "family" | "none";

export interface PublishedFormulaProfileV1 {
  readonly schema: typeof PUBLISHED_FORMULA_PROFILE_SCHEMA_V1;
  readonly quality: PublishedFormulaProfileQualityV1;
  readonly mode: "parameter-plane" | "julia";
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly rotation: number;
  readonly iterations: number;
  readonly juliaC?: readonly [number, number];
  readonly probe?: Readonly<{
    escapeRatio: number;
    iterationVariance: number;
  }>;
}

export interface PublishedFormulaRuntimeIndexRowV1 {
  readonly formulaId: string;
  readonly displayName: string;
  readonly family: string;
  readonly implementationBasis:
    | "direct-adaptation"
    | "project-owned"
    | "separated-independent-rewrite";
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly definitionPath: string;
  readonly descriptorSchema: typeof PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1;
  readonly parameters: readonly PublishedFormulaParameterDescriptorV1[];
  readonly profile: PublishedFormulaProfileV1;
}

export interface PublishedFormulaRuntimeIndexV1 {
  readonly schema: typeof PUBLISHED_FORMULA_RUNTIME_INDEX_SCHEMA_V1;
  readonly decisionRevision: number;
  readonly publicationDecisionsContentHash: string;
  readonly rowCount: number;
  readonly rows: readonly PublishedFormulaRuntimeIndexRowV1[];
}

export type PublishedFormulaRuntimeResultV1<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code:
        | "index-invalid"
        | "formula-not-published"
        | "definition-fetch-failed"
        | "definition-compile-failed"
        | "descriptor-mismatch";
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function immutableJson(value: unknown): unknown {
  if (Array.isArray(value))
    return Object.freeze(value.map((entry) => immutableJson(entry)));
  if (isRecord(value))
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, immutableJson(entry)]),
      ),
    );
  return value;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    finiteNumber(value[0]) &&
    finiteNumber(value[1])
  );
}

function validParameter(value: unknown): value is PublishedFormulaParameterDescriptorV1 {
  if (!isRecord(value)) return false;
  if (
    typeof value.slotName !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.slotName) ||
    !["real", "complex", "function"].includes(String(value.type)) ||
    typeof value.uniformName !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.uniformName)
  )
    return false;
  if (
    value.hardDomain !== undefined &&
    (!pair(value.hardDomain) || value.hardDomain[0] > value.hardDomain[1])
  )
    return false;
  if (value.classicBinding !== undefined && typeof value.classicBinding !== "string")
    return false;
  if (value.type === "real" && !finiteNumber(value.default)) return false;
  if (value.type === "complex" && !pair(value.default)) return false;
  if (
    value.type === "function" &&
    (typeof value.default !== "string" ||
      !Array.isArray(value.options) ||
      !value.options.every((option) => typeof option === "string") ||
      !value.options.includes(value.default))
  )
    return false;
  if (value.type !== "function" && value.options !== undefined) return false;
  return true;
}

function validProfile(value: unknown): value is PublishedFormulaProfileV1 {
  if (!isRecord(value)) return false;
  if (
    value.schema !== PUBLISHED_FORMULA_PROFILE_SCHEMA_V1 ||
    !["mechanical", "family", "none"].includes(String(value.quality)) ||
    !["parameter-plane", "julia"].includes(String(value.mode)) ||
    !pair(value.center) ||
    !finiteNumber(value.zoom) ||
    value.zoom <= 0 ||
    !finiteNumber(value.rotation) ||
    !Number.isInteger(value.iterations) ||
    (value.iterations as number) <= 0
  )
    return false;
  if (value.mode === "julia" && !pair(value.juliaC)) return false;
  if (value.mode === "parameter-plane" && value.juliaC !== undefined) return false;
  if (value.probe !== undefined) {
    if (!isRecord(value.probe)) return false;
    if (
      !finiteNumber(value.probe.escapeRatio) ||
      value.probe.escapeRatio < 0 ||
      value.probe.escapeRatio > 1 ||
      !finiteNumber(value.probe.iterationVariance) ||
      value.probe.iterationVariance < 0
    )
      return false;
  }
  return true;
}

function validRow(value: unknown): value is PublishedFormulaRuntimeIndexRowV1 {
  if (!isRecord(value)) return false;
  const match =
    typeof value.definitionPath === "string"
      ? DEFINITION_PATH.exec(value.definitionPath)
      : null;
  const structurallyValid =
    typeof value.formulaId === "string" &&
    FORMULA_ID.test(value.formulaId) &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0 &&
    typeof value.family === "string" &&
    value.family.length > 0 &&
    [
      "direct-adaptation",
      "project-owned",
      "separated-independent-rewrite",
    ].includes(String(value.implementationBasis)) &&
    typeof value.sourceRevision === "string" &&
    SHA256.test(value.sourceRevision) &&
    typeof value.semanticHash === "string" &&
    SHA256.test(value.semanticHash) &&
    match !== null &&
    match[1] === value.sourceRevision &&
    value.descriptorSchema === PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1 &&
    Array.isArray(value.parameters) &&
    value.parameters.every(validParameter) &&
    validProfile(value.profile);
  if (!structurallyValid) return false;
  const parameters = value.parameters as PublishedFormulaParameterDescriptorV1[];
  return (
    new Set(parameters.map((parameter) => parameter.slotName)).size ===
      parameters.length &&
    new Set(parameters.map((parameter) => parameter.uniformName)).size ===
      parameters.length
  );
}

export function parsePublishedFormulaRuntimeIndexV1(
  value: unknown,
): PublishedFormulaRuntimeResultV1<PublishedFormulaRuntimeIndexV1> {
  if (
    !isRecord(value) ||
    value.schema !== PUBLISHED_FORMULA_RUNTIME_INDEX_SCHEMA_V1 ||
    value.decisionRevision !== PUBLISHED_FORMULA_DECISION_REVISION_V1 ||
    value.publicationDecisionsContentHash !==
      PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1 ||
    value.rowCount !== PUBLISHED_FORMULA_ROW_COUNT_V1 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.rowCount ||
    !value.rows.every(validRow)
  )
    return { ok: false, code: "index-invalid" };

  const ids = new Set<string>();
  const revisions = new Set<string>();
  const basisCounts = new Map<string, number>();
  for (const row of value.rows) {
    const typed = row as PublishedFormulaRuntimeIndexRowV1;
    if (ids.has(typed.formulaId) || revisions.has(typed.sourceRevision))
      return { ok: false, code: "index-invalid" };
    ids.add(typed.formulaId);
    revisions.add(typed.sourceRevision);
    basisCounts.set(
      typed.implementationBasis,
      (basisCounts.get(typed.implementationBasis) ?? 0) + 1,
    );
  }
  if (
    basisCounts.get("separated-independent-rewrite") !== 339 ||
    basisCounts.get("direct-adaptation") !== 106 ||
    basisCounts.get("project-owned") !== 89 ||
    value.rows.some(
      (row) => (row as PublishedFormulaRuntimeIndexRowV1).profile.quality === "none",
    )
  )
    return { ok: false, code: "index-invalid" };
  try {
    const canonical = canonicalJsonV1(
      value,
      PUBLISHED_FORMULA_INDEX_CANONICAL_NODE_BUDGET_V1,
    );
    if (sha256HexSyncV1(canonical) !== PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1)
      return { ok: false, code: "index-invalid" };
  } catch {
    return { ok: false, code: "index-invalid" };
  }
  return {
    ok: true,
    value: immutableJson(value) as PublishedFormulaRuntimeIndexV1,
  };
}

export interface PublishedFormulaRuntimeLoaderV1 {
  readonly index: PublishedFormulaRuntimeIndexV1;
  get(formulaId: string): PublishedFormulaRuntimeIndexRowV1 | undefined;
  load(
    formulaId: string,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>>;
}

export function createPublishedFormulaRuntimeLoaderV1(
  indexValue: unknown,
  fetchDefinition: (path: string, signal?: AbortSignal) => Promise<string>,
): PublishedFormulaRuntimeResultV1<PublishedFormulaRuntimeLoaderV1> {
  const parsed = parsePublishedFormulaRuntimeIndexV1(indexValue);
  if (!parsed.ok) return parsed;
  const byId = new Map(parsed.value.rows.map((row) => [row.formulaId, row]));
  return {
    ok: true,
    value: {
      index: parsed.value,
      get(formulaId) {
        return byId.get(formulaId);
      },
      async load(formulaId, signal) {
        const row = byId.get(formulaId);
        if (!row) return { ok: false, code: "formula-not-published" };
        let source: string;
        try {
          source = await fetchDefinition(row.definitionPath, signal);
        } catch {
          return { ok: false, code: "definition-fetch-failed" };
        }
        const compiled = await compilePublishedFormulaPluginV1({
          formulaId: row.formulaId,
          displayName: row.displayName,
          family: row.family,
          sourceRevision: row.sourceRevision,
          semanticHash: row.semanticHash,
          source,
        });
        if (!compiled.ok)
          return { ok: false, code: "definition-compile-failed" };
        if (
          compiled.value.descriptor.schema !== row.descriptorSchema ||
          JSON.stringify(compiled.value.descriptor.parameters) !==
            JSON.stringify(row.parameters)
        )
          return { ok: false, code: "descriptor-mismatch" };
        return { ok: true, value: compiled.value };
      },
    },
  };
}
