import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as draftDELETE, GET as draftGET, PATCH as draftPATCH } from '@/app/api/creation/drafts/[draftId]/route';
import { GET as draftsGET, POST as draftsPOST } from '@/app/api/creation/drafts/route';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { sealSession } from '@/lib/cloud/session';

const SUPABASE_URL = 'https://project.example.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const DRAFT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const IDEMPOTENCY_KEY = '99999999-8888-7777-6666-555555555555';

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
] as const;

const savedEnv = new Map<string, string | undefined>();

let fetchCalls: Array<{ url: string; method: string; body: string | null }> = [];

function stubFetch(respond: (call: { url: string; method: string; body: string | null }) => Response): void {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : null,
      };
      fetchCalls.push(call);
      return respond(call);
    }),
  );
}

/** Default: everything allowed, empty lists, RPC echoes a created draft. */
function defaultRespond(call: { url: string; method: string; body: string | null }): Response {
  if (call.url.includes('fractalpark_rate_limit_consume')) {
    return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
  }
  if (call.url.includes('/storage/v1/object/')) {
    return new Response(JSON.stringify({ Key: 'draft-thumbnails/x' }), { status: 200 });
  }
  if (call.url.includes('artwork_publications')) {
    return new Response(JSON.stringify([]), { status: 200 });
  }
  if (call.url.includes('rpc/fractalpark_draft_delete')) {
    return new Response(JSON.stringify({ replayed: false, deleted: true }), { status: 200 });
  }
  if (call.url.includes('rpc/fractalpark_draft_create') || call.url.includes('rpc/fractalpark_draft_update')) {
    const body = call.body ? JSON.parse(call.body) : {};
    return new Response(
      JSON.stringify({
        replayed: false,
        draft: {
          id: body.p_draft_id ?? DRAFT_ID,
          owner_id: USER_ID,
          title: body.p_title ?? 'Untitled',
          envelope: body.p_envelope ?? {},
          thumbnail_path: body.p_thumbnail_path ?? null,
          revision: call.url.includes('update') ? 2 : 1,
          remix_source_type: body.p_remix_source_type ?? null,
          remix_source_id: body.p_remix_source_id ?? null,
          config_bytes: body.p_config_bytes ?? 0,
          thumbnail_bytes: body.p_thumbnail_bytes ?? 0,
          created_at: '2026-08-02T00:00:00Z',
          updated_at: '2026-08-02T00:00:00Z',
        },
      }),
      { status: 200 },
    );
  }
  if (call.url.includes('artwork_drafts')) {
    return new Response(JSON.stringify([]), { status: 200 });
  }
  throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
}

function rpcError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ message }), { status });
}

function sessionCookie(): string {
  const sealed = sealSession({
    userId: USER_ID,
    accessToken: 'AT',
    refreshToken: 'RT',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
  return `fp_creation_session=${sealed}`;
}

function envelopeBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { envelope: { envelopeVersion: 1, document: DEFAULT_FRACTAL_DOCUMENT }, ...extra };
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    method: 'POST',
    headers: {
      host: 'fractalpark.com',
      origin: 'https://fractalpark.com',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function authed(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    headers: { host: 'fractalpark.com', cookie: sessionCookie(), ...headers },
  });
}

function patchJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    method: 'PATCH',
    headers: {
      host: 'fractalpark.com',
      origin: 'https://fractalpark.com',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function deleteReq(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    method: 'DELETE',
    headers: { host: 'fractalpark.com', origin: 'https://fractalpark.com', ...headers },
  });
}

function params(id: string): { params: Promise<{ draftId: string }> } {
  return { params: Promise.resolve({ draftId: id }) };
}

const AUTH_HEADERS = () => ({ cookie: sessionCookie(), 'idempotency-key': IDEMPOTENCY_KEY });

beforeEach(() => {
  for (const name of ENV_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 'k'.repeat(32);
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'r'.repeat(32);
  stubFetch(defaultRespond);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

describe('GET /api/creation/drafts', () => {
  it('answers cloud_disabled while the switch is off', async () => {
    // Seal the cookie while the switch is on, then disable: the route must
    // reject before touching any cloud config.
    const cookie = sessionCookie();
    delete process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;
    const res = await draftsGET(
      new Request('https://fractalpark.com/api/creation/drafts', {
        headers: { host: 'fractalpark.com', cookie },
      }),
    );
    expect(res.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });

  it('rejects missing session with 401', async () => {
    const res = await draftsGET(
      new Request('https://fractalpark.com/api/creation/drafts', { headers: { host: 'fractalpark.com' } }),
    );
    expect(res.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
  });

  it('lists owner drafts as summary DTOs with no-store', async () => {
    stubFetch((call) => {
      if (call.url.includes('artwork_drafts')) {
        return new Response(
          JSON.stringify([
            {
              id: DRAFT_ID,
              title: '深空螺旋',
              revision: 3,
              config_bytes: 1234,
              thumbnail_bytes: 5000,
              remix_source_type: 'formula',
              remix_source_id: 'mandelbrot',
              created_at: '2026-08-02T00:00:00Z',
              updated_at: '2026-08-02T01:00:00Z',
            },
          ]),
          { status: 200 },
        );
      }
      return defaultRespond(call);
    });
    const res = await draftsGET(authed('/api/creation/drafts'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { drafts: Array<Record<string, unknown>> };
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({
      id: DRAFT_ID,
      title: '深空螺旋',
      revision: 3,
      configBytes: 1234,
      hasThumbnail: true,
      remixSource: { type: 'formula', id: 'mandelbrot' },
    });
    expect(body.drafts[0].envelope).toBeUndefined();
    expect(fetchCalls[0].url).toContain(`owner_id=eq.${USER_ID}`);
  });
});

describe('POST /api/creation/drafts', () => {
  it('requires the Idempotency-Key header', async () => {
    const res = await draftsPOST(postJson('/api/creation/drafts', envelopeBody(), { cookie: sessionCookie() }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_failed');
    expect(fetchCalls).toHaveLength(0);
  });

  it('rejects cross-site writes', async () => {
    const res = await draftsPOST(
      postJson('/api/creation/drafts', envelopeBody(), {
        cookie: sessionCookie(),
        'idempotency-key': IDEMPOTENCY_KEY,
        origin: 'https://evil.example.com',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('maps envelope rejection to 422 invalid_envelope', async () => {
    const res = await draftsPOST(
      postJson('/api/creation/drafts', { envelope: { envelopeVersion: 1, document: { nope: true } } }, AUTH_HEADERS()),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_envelope');
  });

  it('rejects unknown remix sources before any write', async () => {
    const res = await draftsPOST(
      postJson(
        '/api/creation/drafts',
        envelopeBody({ remixSourceType: 'formula', remixSourceId: 'no-such-formula' }),
        AUTH_HEADERS(),
      ),
    );
    expect(res.status).toBe(400);
    expect(fetchCalls.filter((c) => c.url.includes('rpc/fractalpark_draft'))).toHaveLength(0);
  });

  it('creates a draft with server-canonical envelope and derived title', async () => {
    const named = {
      envelope: {
        envelopeVersion: 1,
        document: { ...DEFAULT_FRACTAL_DOCUMENT, metadata: { name: '深空螺旋' } },
      },
      remixSourceType: 'formula',
      remixSourceId: 'mandelbrot',
    };
    const res = await draftsPOST(postJson('/api/creation/drafts', named, AUTH_HEADERS()));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { draftId: string; revision: number; envelope: unknown };
    expect(body.revision).toBe(1);

    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_draft_create'));
    expect(rpcCall).toBeDefined();
    const args = JSON.parse(rpcCall!.body as string);
    expect(args.p_owner_id).toBe(USER_ID);
    expect(args.p_title).toBe('深空螺旋');
    expect(args.p_remix_source_type).toBe('formula');
    expect(args.p_config_bytes).toBeGreaterThan(0);
    expect(args.p_idempotency_key).toBe(IDEMPOTENCY_KEY);
    expect(args.p_request_hash).toMatch(/^[a-f0-9]{64}$/);
    // The envelope arrives canonically serialized (sorted keys), not client-shaped.
    const keys = Object.keys(args.p_envelope.document.coloring).sort();
    expect(Object.keys(args.p_envelope.document.coloring)).toEqual(keys);
  });

  it('returns 200 with the original result on an idempotent replay', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_draft_create')) {
        return new Response(JSON.stringify({ replayed: true, draft_id: DRAFT_ID, revision: 1 }), { status: 200 });
      }
      return defaultRespond(call);
    });
    const res = await draftsPOST(postJson('/api/creation/drafts', envelopeBody(), AUTH_HEADERS()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draftId: string; revision: number };
    expect(body).toMatchObject({ draftId: DRAFT_ID, revision: 1 });
  });

  it('maps quota and idempotency RPC failures to the frozen codes', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_draft_create')) {
        return rpcError('quota_exceeded: draft count or account storage quota reached');
      }
      return defaultRespond(call);
    });
    const quotaRes = await draftsPOST(postJson('/api/creation/drafts', envelopeBody(), AUTH_HEADERS()));
    expect(quotaRes.status).toBe(422);
    expect(((await quotaRes.json()) as { error: { code: string } }).error.code).toBe('quota_exceeded');

    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_draft_create')) {
        return rpcError('idempotency_conflict: same key with a different request', 400);
      }
      return defaultRespond(call);
    });
    const conflictRes = await draftsPOST(postJson('/api/creation/drafts', envelopeBody(), AUTH_HEADERS()));
    expect(conflictRes.status).toBe(409);
    expect(((await conflictRes.json()) as { error: { code: string } }).error.code).toBe('idempotency_conflict');
  });

  it('stores a thumbnail before the RPC and cleans the orphan when the RPC fails', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64');
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_draft_create')) {
        return rpcError('quota_exceeded: full');
      }
      return defaultRespond(call);
    });
    const res = await draftsPOST(postJson('/api/creation/drafts', envelopeBody({ thumbnail: png }), AUTH_HEADERS()));
    expect(res.status).toBe(422);
    const storagePost = fetchCalls.find((c) => c.url.includes('/storage/v1/object/') && c.method === 'POST');
    expect(storagePost).toBeDefined();
    const orphanDelete = fetchCalls.find((c) => c.url.includes('/storage/v1/object/') && c.method === 'DELETE');
    expect(orphanDelete).toBeDefined();
  });

  it('rejects a thumbnail with invalid magic bytes', async () => {
    const notAnImage = Buffer.from('this is not an image').toString('base64');
    const res = await draftsPOST(
      postJson('/api/creation/drafts', envelopeBody({ thumbnail: notAnImage }), AUTH_HEADERS()),
    );
    expect(res.status).toBe(400);
    expect(fetchCalls.filter((c) => c.url.includes('/storage/'))).toHaveLength(0);
  });
});

describe('GET /api/creation/drafts/[draftId]', () => {
  it('rejects a malformed draft id', async () => {
    const res = await draftGET(authed('/api/creation/drafts/not-a-uuid'), params('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns uniform not_found for unknown or foreign drafts', async () => {
    const res = await draftGET(authed(`/api/creation/drafts/${DRAFT_ID}`), params(DRAFT_ID));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns the full detail DTO', async () => {
    stubFetch((call) => {
      if (call.url.includes('artwork_drafts')) {
        return new Response(
          JSON.stringify([
            {
              id: DRAFT_ID,
              title: '深空螺旋',
              revision: 2,
              config_bytes: 1234,
              thumbnail_bytes: 0,
              remix_source_type: null,
              remix_source_id: null,
              created_at: '2026-08-02T00:00:00Z',
              updated_at: '2026-08-02T01:00:00Z',
              envelope: { envelopeVersion: 1 },
              thumbnail_path: null,
            },
          ]),
          { status: 200 },
        );
      }
      return defaultRespond(call);
    });
    const res = await draftGET(authed(`/api/creation/drafts/${DRAFT_ID}`), params(DRAFT_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: Record<string, unknown> };
    expect(body.draft).toMatchObject({ id: DRAFT_ID, revision: 2, hasThumbnail: false });
    expect(body.draft.envelope).toEqual({ envelopeVersion: 1 });
  });
});

describe('PATCH /api/creation/drafts/[draftId]', () => {
  function currentRow(): Record<string, unknown> {
    return {
      id: DRAFT_ID,
      title: 'old',
      revision: 2,
      config_bytes: 100,
      thumbnail_bytes: 7,
      remix_source_type: null,
      remix_source_id: null,
      created_at: '2026-08-02T00:00:00Z',
      updated_at: '2026-08-02T01:00:00Z',
      envelope: {},
      thumbnail_path: `${USER_ID}/${DRAFT_ID}.png`,
    };
  }

  function stubWithCurrent(): void {
    stubFetch((call) => {
      if (call.url.includes('artwork_drafts') && call.method === 'GET') {
        return new Response(JSON.stringify([currentRow()]), { status: 200 });
      }
      return defaultRespond(call);
    });
  }

  it('requires expectedRevision', async () => {
    stubWithCurrent();
    const res = await draftPATCH(patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody(), AUTH_HEADERS()), params(DRAFT_ID));
    expect(res.status).toBe(400);
    expect(fetchCalls.filter((c) => c.url.includes('rpc/fractalpark_draft_update'))).toHaveLength(0);
  });

  it('consumes the draft save cooldown before writing', async () => {
    stubFetch((call) => {
      if (call.url.includes('fractalpark_rate_limit_consume')) {
        return new Response(JSON.stringify([{ allowed: false, retry_after: 3 }]), { status: 200 });
      }
      return defaultRespond(call);
    });
    const res = await draftPATCH(
      patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody({ expectedRevision: 2 }), AUTH_HEADERS()),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('3');
    expect(fetchCalls.filter((c) => c.url.includes('rpc/fractalpark_draft_update'))).toHaveLength(0);
  });

  it('maps a revision mismatch to 409 revision_conflict', async () => {
    stubFetch((call) => {
      if (call.url.includes('artwork_drafts') && call.method === 'GET') {
        return new Response(JSON.stringify([currentRow()]), { status: 200 });
      }
      if (call.url.includes('rpc/fractalpark_draft_update')) {
        return rpcError('revision_conflict: expected revision mismatch');
      }
      return defaultRespond(call);
    });
    const res = await draftPATCH(
      patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody({ expectedRevision: 1 }), AUTH_HEADERS()),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('revision_conflict');
  });

  it('keeps the current thumbnail when the field is absent', async () => {
    stubWithCurrent();
    const res = await draftPATCH(
      patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody({ expectedRevision: 2 }), AUTH_HEADERS()),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(200);
    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_draft_update'));
    const args = JSON.parse(rpcCall!.body as string);
    expect(args.p_thumbnail_path).toBe(`${USER_ID}/${DRAFT_ID}.png`);
    expect(args.p_thumbnail_bytes).toBe(7);
    expect(args.p_expected_revision).toBe(2);
    expect(fetchCalls.filter((c) => c.url.includes('/storage/'))).toHaveLength(0);
  });

  it('clears the thumbnail with an explicit null', async () => {
    stubWithCurrent();
    const res = await draftPATCH(
      patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody({ expectedRevision: 2, thumbnail: null }), AUTH_HEADERS()),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(200);
    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_draft_update'));
    const args = JSON.parse(rpcCall!.body as string);
    expect(args.p_thumbnail_path).toBeNull();
    expect(args.p_thumbnail_bytes).toBe(0);
  });

  it('replaces the thumbnail and cleans the orphan on RPC failure', async () => {
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]).toString('base64');
    stubFetch((call) => {
      if (call.url.includes('artwork_drafts') && call.method === 'GET') {
        return new Response(JSON.stringify([currentRow()]), { status: 200 });
      }
      if (call.url.includes('rpc/fractalpark_draft_update')) {
        return rpcError('revision_conflict: nope');
      }
      return defaultRespond(call);
    });
    const res = await draftPATCH(
      patchJson(`/api/creation/drafts/${DRAFT_ID}`, envelopeBody({ expectedRevision: 2, thumbnail: webp }), AUTH_HEADERS()),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(409);
    expect(fetchCalls.some((c) => c.url.includes('/storage/v1/object/') && c.method === 'POST')).toBe(true);
    expect(fetchCalls.some((c) => c.url.includes('/storage/v1/object/') && c.method === 'DELETE')).toBe(true);
  });
});

describe('DELETE /api/creation/drafts/[draftId]', () => {
  it('deletes through the owner RPC with idempotency and returns 204', async () => {
    const res = await draftDELETE(deleteReq(`/api/creation/drafts/${DRAFT_ID}`, AUTH_HEADERS()), params(DRAFT_ID));
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_draft_delete'));
    const args = JSON.parse(rpcCall!.body as string);
    expect(args.p_owner_id).toBe(USER_ID);
    expect(args.p_draft_id).toBe(DRAFT_ID);
    expect(args.p_idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it('maps uniform not_found', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_draft_delete')) {
        return rpcError('not_found: draft not found');
      }
      return defaultRespond(call);
    });
    const res = await draftDELETE(deleteReq(`/api/creation/drafts/${DRAFT_ID}`, AUTH_HEADERS()), params(DRAFT_ID));
    expect(res.status).toBe(404);
  });

  it('requires the Idempotency-Key header', async () => {
    const res = await draftDELETE(
      deleteReq(`/api/creation/drafts/${DRAFT_ID}`, { cookie: sessionCookie() }),
      params(DRAFT_ID),
    );
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });
});
