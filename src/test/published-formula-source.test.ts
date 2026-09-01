import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildPublishedFormulaSourceReferenceV1,
  createPublishedFormulaSourceLoaderV1,
  PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1,
  type PublishedFormulaSourceReferenceV1,
} from '@/lib/published-formula-source';

const ROOT = join(
  process.cwd(),
  'public/formula-library/v1/runtime/published',
);

function fixture(): {
  readonly reference: PublishedFormulaSourceReferenceV1;
  readonly source: string;
} {
  const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as {
    rows: Array<{
      formulaId: string;
      sourceRevision: string;
      semanticHash: string;
      definitionPath: string;
    }>;
  };
  const row = index.rows[0];
  const reference = buildPublishedFormulaSourceReferenceV1(row);
  if (!reference) throw new Error('invalid-source-fixture');
  return {
    reference,
    source: readFileSync(join(ROOT, row.definitionPath), 'utf8'),
  };
}

function response(
  source: string,
  contentType = 'text/plain; charset=utf-8',
  headers: Record<string, string> = {},
): Response {
  return new Response(source, {
    status: 200,
    headers: { 'content-type': contentType, ...headers },
  });
}

describe('published canonical source loader', () => {
  it('stays lazy, verifies both content and semantic addresses, and caches successes', async () => {
    const { reference, source } = fixture();
    const fetcher = vi.fn(async () => response(source));
    const loader = createPublishedFormulaSourceLoaderV1(fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    const first = await loader.load(reference);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.source).toBe(source);
    expect(first.value.byteLength).toBe(new TextEncoder().encode(source).byteLength);
    expect(first.value.lineCount).toBe(source.split(/\r\n?|\n/).length);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(reference.href, {
      credentials: 'same-origin',
      signal: undefined,
    });

    expect(await loader.load(reference)).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const abortedCacheConsumer = new AbortController();
    abortedCacheConsumer.abort();
    expect(await loader.load(reference, abortedCacheConsumer.signal)).toEqual({
      ok: false,
      code: 'source-aborted',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed paths before fetch and fails closed on body or semantic tampering', async () => {
    const { reference, source } = fixture();
    const fetcher = vi.fn(async () => response(source));
    const loader = createPublishedFormulaSourceLoaderV1(fetcher);

    const invalid = await loader.load({
      ...reference,
      href: `/formula-library/v1/runtime/published/definitions/${'0'.repeat(64)}.frm`,
    });
    expect(invalid).toEqual({ ok: false, code: 'invalid-reference' });
    expect(fetcher).not.toHaveBeenCalled();

    const tamperedLoader = createPublishedFormulaSourceLoaderV1(
      vi.fn(async () => response(`${source}\n; tampered`)),
    );
    expect(await tamperedLoader.load(reference)).toEqual({
      ok: false,
      code: 'source-revision-mismatch',
    });

    const semanticLoader = createPublishedFormulaSourceLoaderV1(
      vi.fn(async () => response(source)),
    );
    expect(
      await semanticLoader.load({ ...reference, semanticHash: '0'.repeat(64) }),
    ).toEqual({ ok: false, code: 'semantic-hash-mismatch' });

    const contentTypeLoader = createPublishedFormulaSourceLoaderV1(
      vi.fn(async () => response(source, 'text/html; charset=utf-8')),
    );
    expect(await contentTypeLoader.load(reference)).toEqual({
      ok: false,
      code: 'source-content-type-invalid',
    });

    const productionMediaTypeLoader = createPublishedFormulaSourceLoaderV1(
      vi.fn(async () => response(source, 'application/octet-stream')),
    );
    expect((await productionMediaTypeLoader.load(reference)).ok).toBe(true);
  });

  it('enforces the executable source budget, supports abort, and never caches failures', async () => {
    const { reference, source } = fixture();
    const tooLarge = `${' '.repeat(PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1)}x`;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(tooLarge))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(response(source));
    const loader = createPublishedFormulaSourceLoaderV1(fetcher);

    expect(await loader.load(reference)).toEqual({
      ok: false,
      code: 'source-too-large',
    });

    let advertisedBodyCancelled = false;
    const advertisedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(source));
      },
      cancel() {
        advertisedBodyCancelled = true;
      },
    });
    const advertisedOversized = createPublishedFormulaSourceLoaderV1(
      vi.fn(async () =>
        new Response(advertisedBody, {
          status: 200,
          headers: {
            'content-length': String(PUBLISHED_FORMULA_SOURCE_MAX_BYTES_V1 + 1),
            'content-type': 'text/plain',
          },
        }),
      ),
    );
    expect(await advertisedOversized.load(reference)).toEqual({
      ok: false,
      code: 'source-too-large',
    });
    expect(advertisedBodyCancelled).toBe(true);
    expect(await loader.load(reference)).toEqual({
      ok: false,
      code: 'source-unavailable',
    });
    expect((await loader.load(reference)).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);

    const controller = new AbortController();
    controller.abort();
    const abortedLoader = createPublishedFormulaSourceLoaderV1(fetcher);
    expect(await abortedLoader.load(reference, controller.signal)).toEqual({
      ok: false,
      code: 'source-aborted',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent consumers while allowing one caller to abort its wait', async () => {
    const { reference, source } = fixture();
    let resolveFetch!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const loader = createPublishedFormulaSourceLoaderV1(fetcher);
    const controller = new AbortController();
    const cancelled = loader.load(reference, controller.signal);
    const retained = loader.load(reference);

    expect(fetcher).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(await cancelled).toEqual({ ok: false, code: 'source-aborted' });
    resolveFetch(response(source));
    expect((await retained).ok).toBe(true);
    expect((await loader.load(reference)).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
