import {
  canonicalJsonV1,
  createPublishedFormulaRuntimeLoaderV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_DECISION_REVISION_V1,
  PUBLISHED_FORMULA_ROW_COUNT_V1,
  sha256HexSyncV1,
  type PublishedFormulaRuntimeIndexV1,
  type PublishedFormulaRuntimeLoaderV1,
  type PublishedFormulaRuntimeResultV1,
  type PublishedFormulaPluginArtifactV1,
} from "@/engine/formulas/v1";
import {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
  type PublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryFamilyV1,
} from "@/content/formula-directory-categories";
import type { PublishedFormulaDirectoryRowV1 } from "@/content/published-formula-directory";
import {
  buildPublishedFormulaSourceReferenceV1,
  createPublishedFormulaSourceLoaderV1,
  type PublishedFormulaSourceLoadResultV1,
  type PublishedFormulaSourceReferenceV1,
  type PublishedFormulaSourceLoaderV1,
} from "@/lib/published-formula-source";

export const PUBLISHED_FORMULA_LIBRARY_ROOT_URL =
  "/formula-library/v1/runtime/published" as const;
export const PUBLISHED_FORMULA_LIBRARY_INDEX_URL =
  `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/index.json` as const;
export const PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL =
  "/formula-library/v1/directory/index.json" as const;
export const PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE = 48;
export const PUBLISHED_FORMULA_LIBRARY_DEFAULT_CATEGORY = "classic" as const;

const DIRECTORY_SCHEMA = "fractalpark-published-formula-directory/v1";
const DIRECTORY_REVISION = 1;
const DIRECTORY_CLASSIC_COUNT = 94;
const DIRECTORY_GUIDE_COUNT = 21;
const DIRECTORY_MEMBERSHIP_COUNT = 628;
const DIRECTORY_ALIAS_COUNT = 5;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type PublishedFormulaLibraryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PublishedFormulaLibraryDirectoryV1 {
  readonly rows: readonly PublishedFormulaDirectoryRowV1[];
  readonly categoryCounts: Readonly<
    Record<PublishedFormulaDirectoryCategoryV1, number>
  >;
  readonly runtimeAliasFormulaIds: Readonly<Record<string, string>>;
}

export interface PublishedFormulaLibraryClient {
  readonly index: PublishedFormulaRuntimeIndexV1;
  readonly directory: PublishedFormulaLibraryDirectoryV1;
  get(formulaId: string): PublishedFormulaRuntimeIndexV1["rows"][number] | undefined;
  resolveRuntimeAlias(
    runtimeId: string,
  ): PublishedFormulaRuntimeIndexV1["rows"][number] | undefined;
  load(
    formulaId: string,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>>;
  loadSource(
    reference: PublishedFormulaSourceReferenceV1,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaSourceLoadResultV1>;
}

export type PublishedFormulaLibraryClientResult =
  | { readonly ok: true; readonly value: PublishedFormulaLibraryClient }
  | {
      readonly ok: false;
      readonly code:
        | "library-unavailable"
        | "index-invalid"
        | "directory-invalid";
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFamily(value: unknown): value is PublishedFormulaDirectoryFamilyV1 {
  return (
    typeof value === "string" &&
    (PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1 as readonly string[]).includes(value)
  );
}

function isCategory(
  value: unknown,
): value is PublishedFormulaDirectoryCategoryV1 {
  return (
    typeof value === "string" &&
    (PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1 as readonly string[]).includes(value)
  );
}

function parseDirectory(
  value: unknown,
  runtimeIndex: PublishedFormulaRuntimeIndexV1,
  runtimeFileSha256: string,
): PublishedFormulaLibraryDirectoryV1 | undefined {
  if (!isRecord(value)) return undefined;
  const unsigned = { ...value };
  delete unsigned.contentHash;
  try {
    if (
      value.schema !== DIRECTORY_SCHEMA ||
      value.revision !== DIRECTORY_REVISION ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash) ||
      value.contentHash !== PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1 ||
      sha256HexSyncV1(canonicalJsonV1(unsigned, 262_144)) !== value.contentHash ||
      !isRecord(value.authority) ||
      value.authority.decisionRevision !== PUBLISHED_FORMULA_DECISION_REVISION_V1 ||
      value.authority.publicationDecisionsContentHash !==
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1 ||
      !isRecord(value.sourceBindings) ||
      !isRecord(value.sourceBindings.runtime) ||
      value.sourceBindings.runtime.path !==
        "public/formula-library/v1/runtime/published/index.json" ||
      value.sourceBindings.runtime.sha256 !== runtimeFileSha256 ||
      !isRecord(value.counts) ||
      value.counts.published !== PUBLISHED_FORMULA_ROW_COUNT_V1 ||
      value.counts.classic !== DIRECTORY_CLASSIC_COUNT ||
      value.counts.guides !== DIRECTORY_GUIDE_COUNT ||
      value.counts.categoryMemberships !== DIRECTORY_MEMBERSHIP_COUNT ||
      value.counts.runtimeAliases !== DIRECTORY_CLASSIC_COUNT ||
      !Array.isArray(value.categoryOrder) ||
      JSON.stringify(value.categoryOrder) !==
        JSON.stringify(PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1) ||
      !isRecord(value.categoryCounts) ||
      !Array.isArray(value.rows) ||
      value.rows.length !== PUBLISHED_FORMULA_ROW_COUNT_V1 ||
      !Array.isArray(value.runtimeAliases) ||
      value.runtimeAliases.length !== DIRECTORY_CLASSIC_COUNT ||
      !Array.isArray(value.aliasDeepLinks) ||
      value.aliasDeepLinks.length !== DIRECTORY_ALIAS_COUNT
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const runtimeById = new Map(
    runtimeIndex.rows.map((row) => [row.formulaId, row]),
  );
  const seen = new Set<string>();
  const counted = Object.fromEntries(
    PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((category) => [category, 0]),
  ) as Record<PublishedFormulaDirectoryCategoryV1, number>;
  const categoryCounts = {} as Record<
    PublishedFormulaDirectoryCategoryV1,
    number
  >;
  for (const category of PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1) {
    const count = value.categoryCounts[category];
    if (!Number.isInteger(count) || (count as number) <= 0) return undefined;
    categoryCounts[category] = count as number;
  }
  if (
    categoryCounts.classic !== DIRECTORY_CLASSIC_COUNT ||
    categoryCounts["root-finding"] !== 14 ||
    Object.values(categoryCounts).reduce((total, count) => total + count, 0) !==
      DIRECTORY_MEMBERSHIP_COUNT
  ) {
    return undefined;
  }

  let classicCount = 0;
  let guideCount = 0;
  const rows: PublishedFormulaDirectoryRowV1[] = [];
  for (const candidate of value.rows) {
    if (
      !isRecord(candidate) ||
      typeof candidate.formulaId !== "string" ||
      !UUID_V5.test(candidate.formulaId) ||
      seen.has(candidate.formulaId) ||
      typeof candidate.displayName !== "string" ||
      candidate.displayName.length === 0 ||
      !isFamily(candidate.primaryFamily) ||
      !Array.isArray(candidate.categories) ||
      candidate.categories.length < 1 ||
      candidate.categories.length > 2 ||
      !candidate.categories.every(isCategory) ||
      new Set(candidate.categories).size !== candidate.categories.length ||
      candidate.categories[candidate.categories.length - 1] !==
        candidate.primaryFamily ||
      (candidate.categories.includes("classic") &&
        candidate.categories[0] !== "classic") ||
      candidate.canonicalPath !== `/formulas/${candidate.formulaId}` ||
      (candidate.guideSlug !== null &&
        (typeof candidate.guideSlug !== "string" ||
          candidate.guideSlug.length === 0))
    ) {
      return undefined;
    }
    const runtimeRow = runtimeById.get(candidate.formulaId);
    if (
      !runtimeRow ||
      runtimeRow.displayName !== candidate.displayName ||
      runtimeRow.family !== candidate.primaryFamily
    ) {
      return undefined;
    }
    seen.add(candidate.formulaId);
    for (const category of candidate.categories) counted[category] += 1;
    if (candidate.categories[0] === "classic") classicCount += 1;
    if (candidate.guideSlug !== null) guideCount += 1;
    rows.push(
      Object.freeze({
        formulaId: candidate.formulaId,
        displayName: candidate.displayName,
        primaryFamily: candidate.primaryFamily,
        categories: Object.freeze([...candidate.categories]),
        canonicalPath: candidate.canonicalPath,
        guideSlug: candidate.guideSlug,
      }) as PublishedFormulaDirectoryRowV1,
    );
  }
  if (
    seen.size !== runtimeById.size ||
    classicCount !== DIRECTORY_CLASSIC_COUNT ||
    guideCount !== DIRECTORY_GUIDE_COUNT ||
    PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.some(
      (category) => counted[category] !== categoryCounts[category],
    )
  ) {
    return undefined;
  }

  const runtimeAliasFormulaIds: Record<string, string> = Object.create(null);
  const runtimeAliasTargetIds = new Set<string>();
  for (const candidate of value.runtimeAliases) {
    if (
      !isRecord(candidate) ||
      typeof candidate.runtimeId !== "string" ||
      candidate.runtimeId.length === 0 ||
      Object.hasOwn(runtimeAliasFormulaIds, candidate.runtimeId) ||
      typeof candidate.canonicalFormulaId !== "string" ||
      !runtimeById.has(candidate.canonicalFormulaId)
    ) {
      return undefined;
    }
    runtimeAliasFormulaIds[candidate.runtimeId] = candidate.canonicalFormulaId;
    runtimeAliasTargetIds.add(candidate.canonicalFormulaId);
  }
  if (
    Object.keys(runtimeAliasFormulaIds).length !== DIRECTORY_CLASSIC_COUNT ||
    runtimeAliasTargetIds.size !== 89
  ) {
    return undefined;
  }

  const deepAliasNames = new Set<string>();
  const deepAliasTargetIds = new Set<string>();
  for (const candidate of value.aliasDeepLinks) {
    if (
      !isRecord(candidate) ||
      typeof candidate.legacyRuntimeId !== "string" ||
      candidate.legacyRuntimeId.length === 0 ||
      typeof candidate.canonicalFormulaId !== "string" ||
      !UUID_V5.test(candidate.canonicalFormulaId) ||
      candidate.canonicalPath !== `/formulas/${candidate.canonicalFormulaId}` ||
      runtimeAliasFormulaIds[candidate.legacyRuntimeId] !==
        candidate.canonicalFormulaId ||
      deepAliasNames.has(candidate.legacyRuntimeId) ||
      deepAliasTargetIds.has(candidate.canonicalFormulaId)
    ) {
      return undefined;
    }
    deepAliasNames.add(candidate.legacyRuntimeId);
    deepAliasTargetIds.add(candidate.canonicalFormulaId);
  }

  return Object.freeze({
    rows: Object.freeze(rows),
    categoryCounts: Object.freeze(categoryCounts),
    runtimeAliasFormulaIds: Object.freeze(runtimeAliasFormulaIds),
  });
}

function defaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}

export async function createPublishedFormulaLibraryClient(
  fetcher: PublishedFormulaLibraryFetch = defaultFetch,
): Promise<PublishedFormulaLibraryClientResult> {
  let indexText: string;
  let directoryValue: unknown;
  try {
    const [indexResponse, directoryResponse] = await Promise.all([
      fetcher(PUBLISHED_FORMULA_LIBRARY_INDEX_URL, {
        credentials: "same-origin",
      }),
      fetcher(PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL, {
        credentials: "same-origin",
      }),
    ]);
    if (!indexResponse.ok || !directoryResponse.ok) {
      return { ok: false, code: "library-unavailable" };
    }
    indexText = await indexResponse.text();
    directoryValue = JSON.parse(await directoryResponse.text());
  } catch {
    return { ok: false, code: "library-unavailable" };
  }

  let indexValue: unknown;
  try {
    indexValue = JSON.parse(indexText);
  } catch {
    return { ok: false, code: "index-invalid" };
  }
  const sourceLoader: PublishedFormulaSourceLoaderV1 =
    createPublishedFormulaSourceLoaderV1(fetcher);
  let sourceReferenceByPath = new Map<string, PublishedFormulaSourceReferenceV1>();
  const loaderResult = createPublishedFormulaRuntimeLoaderV1(
    indexValue,
    async (path, signal) => {
      const reference = sourceReferenceByPath.get(path);
      if (!reference) throw new Error("definition-fetch-failed");
      const result = await sourceLoader.load(reference, signal);
      if (!result.ok) throw new Error(result.code);
      return result.value.source;
    },
  );
  if (!loaderResult.ok) return { ok: false, code: "index-invalid" };

  sourceReferenceByPath = new Map(
    loaderResult.value.index.rows.flatMap((row) => {
      const reference = buildPublishedFormulaSourceReferenceV1(row);
      return reference ? [[row.definitionPath, reference] as const] : [];
    }),
  );
  if (sourceReferenceByPath.size !== loaderResult.value.index.rows.length) {
    return { ok: false, code: "index-invalid" };
  }

  const directory = parseDirectory(
    directoryValue,
    loaderResult.value.index,
    sha256HexSyncV1(indexText),
  );
  if (!directory) return { ok: false, code: "directory-invalid" };

  const loader: PublishedFormulaRuntimeLoaderV1 = loaderResult.value;
  return {
    ok: true,
    value: Object.freeze({
      index: loader.index,
      directory,
      get(formulaId: string) {
        return loader.get(formulaId);
      },
      resolveRuntimeAlias(runtimeId: string) {
        const formulaId = directory.runtimeAliasFormulaIds[runtimeId];
        return formulaId ? loader.get(formulaId) : undefined;
      },
      load(formulaId: string, signal?: AbortSignal) {
        return loader.load(formulaId, signal);
      },
      loadSource(reference: PublishedFormulaSourceReferenceV1, signal?: AbortSignal) {
        const row = loader.get(reference.formulaId);
        const authoritative = row
          ? buildPublishedFormulaSourceReferenceV1(row)
          : undefined;
        if (
          !authoritative ||
          authoritative.href !== reference.href ||
          authoritative.sourceRevision !== reference.sourceRevision ||
          authoritative.semanticHash !== reference.semanticHash
        ) {
          return Promise.resolve({
            ok: false as const,
            code: 'source-authority-mismatch' as const,
          });
        }
        return sourceLoader.load(authoritative, signal);
      },
    }),
  };
}

let sharedClient: Promise<PublishedFormulaLibraryClientResult> | undefined;

export function getPublishedFormulaLibraryClient(): Promise<PublishedFormulaLibraryClientResult> {
  if (!sharedClient) {
    sharedClient = createPublishedFormulaLibraryClient().then((result) => {
      if (!result.ok) sharedClient = undefined;
      return result;
    });
  }
  return sharedClient;
}
