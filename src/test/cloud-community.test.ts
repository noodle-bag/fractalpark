import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMMUNITY_DEFAULT_PAGE,
  COMMUNITY_MAX_PAGE,
  decodeCommunityCursor,
  encodeCommunityCursor,
  getCommunityPublication,
  listCommunity,
} from '@/lib/cloud/community';

const ROW = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Nebula',
  description: null,
  author_display_name: 'A',
  license: 'CC-BY-4.0',
  license_scope: 'artwork_image',
  thumbnail_status: 'pending' as const,
  remix_source_type: null,
  remix_source_id: null,
  published_at: '2026-08-02T08:00:00.000Z',
};

function stubRows(rows: Array<typeof ROW>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })),
  );
}

describe('community cursor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function enableCloud(): void {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.SUPABASE_URL = 'http://127.0.0.1:9';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  }

  it('round-trips an encoded cursor', () => {
    const encoded = encodeCommunityCursor({ published_at: ROW.published_at, id: ROW.id });
    expect(decodeCommunityCursor(encoded)).toEqual({ publishedAt: ROW.published_at, id: ROW.id });
  });

  it('rejects malformed cursors instead of guessing', () => {
    expect(decodeCommunityCursor('not-base64-json')).toBeNull();
    expect(decodeCommunityCursor(Buffer.from('["not-a-date","x"]').toString('base64url'))).toBeNull();
    expect(decodeCommunityCursor(Buffer.from('{"a":1}').toString('base64url'))).toBeNull();
    // Parseable-but-hostile shapes (Date.parse is lenient; PostgREST is not).
    expect(decodeCommunityCursor(Buffer.from('["Aug 02, 2026","x"]').toString('base64url'))).toBeNull();
    expect(
      decodeCommunityCursor(
        Buffer.from('["2026-08-02T08:00:00.000Z","not-a-uuid"]').toString('base64url'),
      ),
    ).toBeNull();
  });

  it('pages with a +1 lookahead and emits the next cursor only when more rows exist', async () => {
    enableCloud();
    const full = Array.from({ length: COMMUNITY_DEFAULT_PAGE + 1 }, (_, index) => ({
      ...ROW,
      id: `pub-${index}`,
    }));
    stubRows(full);
    const page = await listCommunity(null, COMMUNITY_DEFAULT_PAGE);
    expect(page.items).toHaveLength(COMMUNITY_DEFAULT_PAGE);
    // The cursor encodes the LAST row of the truncated page, not the +1
    // lookahead row.
    const lastItem = page.items[page.items.length - 1];
    expect(page.nextCursor).toBe(
      encodeCommunityCursor({ published_at: lastItem.publishedAt, id: lastItem.id }),
    );
    // The PostgREST query pins the published-only filter and the stable order.
    const url = String((vi.mocked(fetch).mock.calls[0] as unknown[])[0]);
    expect(url).toContain('status=eq.published');
    expect(url).toContain('order=published_at.desc,id.desc');

    stubRows(full.slice(0, 3));
    const tail = await listCommunity(null, COMMUNITY_DEFAULT_PAGE);
    expect(tail.items).toHaveLength(3);
    expect(tail.nextCursor).toBeNull();
  });

  it('caps the page size at the hard limit', async () => {
    enableCloud();
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await listCommunity(null, COMMUNITY_MAX_PAGE + 500);
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain(`limit=${COMMUNITY_MAX_PAGE + 1}`);
  });

  it('rejects an invalid cursor as validation_failed', async () => {
    enableCloud();
    stubRows([]);
    await expect(listCommunity('garbage', 10)).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('maps the independent formula-source legal snapshot on detail reads', async () => {
    enableCloud();
    const fetchSpy = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(
        JSON.stringify([
          {
            ...ROW,
            envelope: { envelopeVersion: 1 },
            formula_license: 'MIT',
            formula_license_scope: 'formula_source',
            formula_source_attestation_version: '2026-08-08.v1',
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const detail = await getCommunityPublication(ROW.id);
    expect(detail).toMatchObject({
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      formulaLicense: 'MIT',
      formulaLicenseScope: 'formula_source',
      formulaSourceAttestationVersion: '2026-08-08.v1',
    });
    const requestUrl = fetchSpy.mock.calls[0]?.[0];
    expect(String(requestUrl)).toContain('formula_license');
  });
});
