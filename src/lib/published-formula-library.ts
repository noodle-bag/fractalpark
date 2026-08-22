import {
  createPublishedFormulaRuntimeLoaderV1,
  type PublishedFormulaRuntimeIndexV1,
  type PublishedFormulaRuntimeLoaderV1,
  type PublishedFormulaRuntimeResultV1,
  type PublishedFormulaPluginArtifactV1,
} from "@/engine/formulas/v1";

export const PUBLISHED_FORMULA_LIBRARY_ROOT_URL =
  "/formula-library/v1/runtime/published" as const;
export const PUBLISHED_FORMULA_LIBRARY_INDEX_URL =
  `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/index.json` as const;
export const PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE = 48;

export type PublishedFormulaLibraryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PublishedFormulaLibraryClient {
  readonly index: PublishedFormulaRuntimeIndexV1;
  get(formulaId: string): PublishedFormulaRuntimeIndexV1["rows"][number] | undefined;
  load(
    formulaId: string,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>>;
}

export type PublishedFormulaLibraryClientResult =
  | { readonly ok: true; readonly value: PublishedFormulaLibraryClient }
  | {
      readonly ok: false;
      readonly code: "library-unavailable" | "index-invalid";
    };

function defaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}

export async function createPublishedFormulaLibraryClient(
  fetcher: PublishedFormulaLibraryFetch = defaultFetch,
): Promise<PublishedFormulaLibraryClientResult> {
  let indexValue: unknown;
  try {
    const response = await fetcher(PUBLISHED_FORMULA_LIBRARY_INDEX_URL, {
      credentials: "same-origin",
    });
    if (!response.ok) return { ok: false, code: "library-unavailable" };
    indexValue = await response.json();
  } catch {
    return { ok: false, code: "library-unavailable" };
  }

  const loaderResult = createPublishedFormulaRuntimeLoaderV1(
    indexValue,
    async (path, signal) => {
      const response = await fetcher(
        `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/${path}`,
        { credentials: "same-origin", signal },
      );
      if (!response.ok) throw new Error("definition-fetch-failed");
      return response.text();
    },
  );
  if (!loaderResult.ok) return { ok: false, code: "index-invalid" };

  const loader: PublishedFormulaRuntimeLoaderV1 = loaderResult.value;
  return {
    ok: true,
    value: Object.freeze({
      index: loader.index,
      get(formulaId: string) {
        return loader.get(formulaId);
      },
      load(formulaId: string, signal?: AbortSignal) {
        return loader.load(formulaId, signal);
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
