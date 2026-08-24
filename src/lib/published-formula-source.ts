export const PUBLISHED_FORMULA_SOURCE_ROOT_URL =
  '/formula-library/v1/runtime/published/definitions' as const;
export const PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1 = 65_536;

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export interface PublishedFormulaSourceReferenceV1 {
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly href: string;
}

export interface PublishedFormulaCanonicalSourceV1
  extends PublishedFormulaSourceReferenceV1 {
  readonly source: string;
  readonly lineCount: number;
  readonly byteLength: number;
}

export type PublishedFormulaSourceLoadResultV1 =
  | { readonly ok: true; readonly value: PublishedFormulaCanonicalSourceV1 }
  | {
      readonly ok: false;
      readonly code:
        | 'invalid-reference'
        | 'source-unavailable'
        | 'source-content-type-invalid'
        | 'source-too-large'
        | 'source-url-invalid'
        | 'source-authority-mismatch'
        | 'source-invalid'
        | 'source-revision-mismatch'
        | 'semantic-hash-mismatch'
        | 'source-aborted';
    };

export type PublishedFormulaSourceFetchV1 = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface PublishedFormulaSourceLoaderV1 {
  load(
    reference: PublishedFormulaSourceReferenceV1,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaSourceLoadResultV1>;
  clear(): void;
}

function freezeResult(
  reference: PublishedFormulaSourceReferenceV1,
  source: string,
  byteLength: number,
): PublishedFormulaSourceLoadResultV1 {
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...reference,
      source,
      byteLength,
      lineCount: source.split(/\r\n?|\n/).length,
    }),
  });
}

export function parsePublishedFormulaSourceReferenceV1(
  value: unknown,
): PublishedFormulaSourceReferenceV1 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.formulaId !== 'string' ||
    !UUID_V5.test(candidate.formulaId) ||
    typeof candidate.sourceRevision !== 'string' ||
    !SHA256.test(candidate.sourceRevision) ||
    typeof candidate.semanticHash !== 'string' ||
    !SHA256.test(candidate.semanticHash) ||
    candidate.href !==
      `${PUBLISHED_FORMULA_SOURCE_ROOT_URL}/${candidate.sourceRevision}.frm`
  ) {
    return undefined;
  }
  return Object.freeze({
    formulaId: candidate.formulaId,
    sourceRevision: candidate.sourceRevision,
    semanticHash: candidate.semanticHash,
    href: candidate.href,
  });
}

export function buildPublishedFormulaSourceReferenceV1(input: {
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly definitionPath?: string;
  readonly href?: string;
}): PublishedFormulaSourceReferenceV1 | undefined {
  const href =
    input.href ??
    (input.definitionPath
      ? `/formula-library/v1/runtime/published/${input.definitionPath}`
      : undefined);
  return parsePublishedFormulaSourceReferenceV1({
    formulaId: input.formulaId,
    sourceRevision: input.sourceRevision,
    semanticHash: input.semanticHash,
    href,
  });
}

type BoundedSourceReadResult =
  | { readonly ok: true; readonly source: string; readonly byteLength: number }
  | Extract<PublishedFormulaSourceLoadResultV1, { readonly ok: false }>;

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readBoundedSource(
  response: Response,
  signal?: AbortSignal,
): Promise<BoundedSourceReadResult> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await cancelResponseBody(response);
      return { ok: false, code: 'source-unavailable' };
    }
    if (Number(contentLength) > PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1) {
      await cancelResponseBody(response);
      return { ok: false, code: 'source-too-large' };
    }
  }
  if (!response.body) return { ok: false, code: 'source-unavailable' };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, code: 'source-too-large' };
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    return {
      ok: false,
      code:
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
          ? 'source-aborted'
          : 'source-unavailable',
    };
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      source: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      byteLength,
    };
  } catch {
    return { ok: false, code: 'source-invalid' };
  }
}

async function loadUncached(
  referenceValue: PublishedFormulaSourceReferenceV1,
  fetcher: PublishedFormulaSourceFetchV1,
  signal?: AbortSignal,
): Promise<PublishedFormulaSourceLoadResultV1> {
  const reference = parsePublishedFormulaSourceReferenceV1(referenceValue);
  if (!reference) return { ok: false, code: 'invalid-reference' };
  if (signal?.aborted) return { ok: false, code: 'source-aborted' };

  let source: string;
  let byteLength: number;
  try {
    const response = await fetcher(reference.href, {
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      return { ok: false, code: 'source-unavailable' };
    }
    const mediaType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== 'text/plain' && mediaType !== 'application/octet-stream') {
      await cancelResponseBody(response);
      return { ok: false, code: 'source-content-type-invalid' };
    }
    const bounded = await readBoundedSource(response, signal);
    if (!bounded.ok) return bounded;
    source = bounded.source;
    byteLength = bounded.byteLength;
  } catch (error) {
    return {
      ok: false,
      code:
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
          ? 'source-aborted'
          : 'source-unavailable',
    };
  }

  try {
    // The parser/compiler surface is intentionally split out of the initial
    // Explore bundle and loaded only after a canonical source is requested.
    const { hashFrmLikeV1, parseFrmLikeV1 } = await import('@/engine/frm/v1');
    const parsed = parseFrmLikeV1(source);
    if (!parsed.ok) return { ok: false, code: 'source-invalid' };
    const hashes = await hashFrmLikeV1(source, parsed.ir);
    if (hashes.sourceRevision !== reference.sourceRevision) {
      return { ok: false, code: 'source-revision-mismatch' };
    }
    if (hashes.semanticHash !== reference.semanticHash) {
      return { ok: false, code: 'semantic-hash-mismatch' };
    }
  } catch {
    return { ok: false, code: 'source-invalid' };
  }

  return freezeResult(reference, source, byteLength);
}

function defaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}

function referenceKey(reference: PublishedFormulaSourceReferenceV1): string {
  return [
    reference.formulaId,
    reference.sourceRevision,
    reference.semanticHash,
    reference.href,
  ].join(':');
}

function awaitWithSignal(
  request: Promise<PublishedFormulaSourceLoadResultV1>,
  signal?: AbortSignal,
): Promise<PublishedFormulaSourceLoadResultV1> {
  if (!signal) return request;
  if (signal.aborted) {
    return Promise.resolve({ ok: false, code: 'source-aborted' });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PublishedFormulaSourceLoadResultV1) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish({ ok: false, code: 'source-aborted' });
    signal.addEventListener('abort', abort, { once: true });
    void request.then(finish);
  });
}

export function createPublishedFormulaSourceLoaderV1(
  fetcher: PublishedFormulaSourceFetchV1 = defaultFetch,
): PublishedFormulaSourceLoaderV1 {
  const successful = new Map<string, PublishedFormulaSourceLoadResultV1>();
  const inFlight = new Map<
    string,
    Promise<PublishedFormulaSourceLoadResultV1>
  >();

  return {
    async load(referenceValue, signal) {
      const reference = parsePublishedFormulaSourceReferenceV1(referenceValue);
      if (!reference) return { ok: false, code: 'invalid-reference' };
      if (signal?.aborted) return { ok: false, code: 'source-aborted' };
      const key = referenceKey(reference);
      const cached = successful.get(key);
      if (cached) return cached;

      // One content-addressed request is shared across runtime compile, preview,
      // and full workspaces. Each caller can still cancel its own wait without
      // aborting another consumer or poisoning the verified cache.
      let request = inFlight.get(key);
      if (!request) {
        request = loadUncached(reference, fetcher).then((result) => {
          inFlight.delete(key);
          if (result.ok) successful.set(key, result);
          return result;
        });
        inFlight.set(key, request);
      }
      return awaitWithSignal(request, signal);
    },
    clear() {
      successful.clear();
      inFlight.clear();
    },
  };
}
