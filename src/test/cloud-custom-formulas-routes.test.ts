import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as formulaDELETE, GET as formulaGET, PATCH as formulaPATCH } from '@/app/api/creation/custom-formulas/[formulaId]/route';
import { GET as formulasGET, POST as formulasPOST } from '@/app/api/creation/custom-formulas/route';
import { sealSession } from '@/lib/cloud/session';

const SUPABASE_URL = 'https://project.example.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const FORMULA_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const IDEMPOTENCY_KEY = '99999999-8888-7777-6666-555555555555';

const VALID_SOURCE = `; @mode: native
RouteTest {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const INVALID_SOURCE = 'this is not frm at all {{{';

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
  'FRACTALPARK_MINE_FORMULA_LIFECYCLE_WRITER_ENABLED',
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

function defaultRespond(call: { url: string; method: string; body: string | null }): Response {
  if (call.url.includes('fractalpark_rate_limit_consume')) {
    return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
  }
  if (call.url.includes('rpc/fractalpark_custom_formula_delete')) {
    return new Response(JSON.stringify({ replayed: false, deleted: true }), { status: 200 });
  }
  if (call.url.includes('rpc/fractalpark_custom_formula_save')) {
    const body = call.body ? JSON.parse(call.body) : {};
    return new Response(
      JSON.stringify({
        replayed: false,
        formula: {
          id: FORMULA_ID,
          owner_id: USER_ID,
          name: body.p_name ?? 'Untitled',
          source: body.p_source ?? '',
          experience_hint: body.p_experience_hint ?? null,
          revision: body.p_expected_revision ? 2 : 1,
          source_bytes: 40,
          created_at: '2026-08-03T00:00:00Z',
          updated_at: '2026-08-03T00:00:00Z',
        },
      }),
      { status: 200 },
    );
  }
  if (call.url.includes('custom_formulas')) {
    // Detail pre-read for PATCH; list for GET.
    const row = {
      id: FORMULA_ID,
      name: 'Route formula',
      revision: 1,
      source_bytes: 40,
      experience_hint: null,
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      source: VALID_SOURCE,
    };
    return new Response(JSON.stringify(call.url.includes('limit=1') ? [row] : [row]), { status: 200 });
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

function authedRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  return new Request(url, {
    method: init.method ?? 'GET',
    headers: {
      cookie: sessionCookie(),
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function detailContext(formulaId = FORMULA_ID): { params: Promise<{ formulaId: string }> } {
  return { params: Promise.resolve({ formulaId }) };
}

beforeEach(() => {
  for (const name of ENV_VARS) {
    savedEnv.set(name, process.env[name]);
  }
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'pk';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 'a'.repeat(48);
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'b'.repeat(48);
  stubFetch(defaultRespond);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved;
    }
  }
});

describe('custom formula routes', () => {
  it('GET list returns summary DTOs without sources', async () => {
    const res = await formulasGET(authedRequest('https://fractalpark.test/api/creation/custom-formulas'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { formulas: Array<Record<string, unknown>> };
    expect(body.formulas).toHaveLength(1);
    expect(body.formulas[0]).not.toHaveProperty('source');
    expect(body.formulas[0].hasExperienceHint).toBe(false);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('GET list requires a session', async () => {
    const res = await formulasGET(new Request('https://fractalpark.test/api/creation/custom-formulas'));
    expect(res.status).toBe(401);
  });

  it('POST creates a formula after compile validation and returns 201', async () => {
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'My formula', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { formulaId: string; revision: number };
    expect(body.revision).toBe(1);
    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    // Seam contract (review B1): create is signaled by null expected
    // revision and MAY carry the pre-generated id; the RPC accepts both.
    expect(rpcCall?.body).toContain('"p_expected_revision":null');
    const rpcArgs = JSON.parse(rpcCall?.body ?? '{}') as { p_formula_id?: string };
    expect(rpcArgs.p_formula_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST rejects uncompilable source with formula_compile_failed and never calls the RPC', async () => {
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Broken', source: INVALID_SOURCE },
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('formula_compile_failed');
    expect(fetchCalls.some((c) => c.url.includes('rpc/fractalpark_custom_formula_save'))).toBe(false);
  });

  it('POST rejects an oversize source with payload_too_large', async () => {
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Huge', source: 'a'.repeat(65_537) },
      }),
    );
    expect(res.status).toBe(413);
  });

  it('POST requires the idempotency key', async () => {
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        body: { name: 'No key', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('GET detail returns the source to the owner', async () => {
    const res = await formulaGET(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`),
      detailContext(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { formula: { source: string } };
    expect(body.formula.source).toBe(VALID_SOURCE);
  });

  it('projects the editable lifecycle head separately from the active runnable source', async () => {
    process.env.FRACTALPARK_MINE_FORMULA_LIFECYCLE_WRITER_ENABLED = 'true';
    const editableId = '10000000-0000-4000-8000-000000000001';
    const activeId = '10000000-0000-4000-8000-000000000002';
    const profile = {
      formulaId: FORMULA_ID,
      view: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
    };
    stubFetch((call) => {
      if (call.url.includes('custom_formula_revisions')) {
        return new Response(
          JSON.stringify([
            {
              id: editableId,
              definition: {
                formulaId: FORMULA_ID,
                source: INVALID_SOURCE,
                family: 'quadratic',
                lineage: {
                  parentFormulaId: 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb',
                  sourceRevision: 'a'.repeat(64),
                  profileRevision: 'b'.repeat(64),
                },
              },
              profile,
              diagnostics: [{ code: 'parse-failed' }],
              runnable: false,
              remixed_from_formula_id: 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb',
              lineage_source_revision: 'a'.repeat(64),
              lineage_profile_revision: 'b'.repeat(64),
            },
            {
              id: activeId,
              definition: { formulaId: FORMULA_ID, source: VALID_SOURCE },
              profile,
              diagnostics: [],
              runnable: true,
              remixed_from_formula_id: 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb',
              lineage_source_revision: 'a'.repeat(64),
              lineage_profile_revision: 'b'.repeat(64),
            },
          ]),
          { status: 200 },
        );
      }
      if (call.url.includes('custom_formulas')) {
        return new Response(
          JSON.stringify([
            {
              id: FORMULA_ID,
              name: 'Lifecycle formula',
              revision: 1,
              source_bytes: INVALID_SOURCE.length,
              experience_hint: null,
              frm_semantics_version: 2,
              editable_head_revision_id: editableId,
              active_runnable_revision_id: activeId,
              created_at: '2026-08-03T00:00:00Z',
              updated_at: '2026-08-24T00:00:00Z',
              source: VALID_SOURCE,
            },
          ]),
          { status: 200 },
        );
      }
      return defaultRespond(call);
    });

    const res = await formulaGET(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`),
      detailContext(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      formula: {
        source: string;
        lifecycle: {
          activeRunnableSource: string;
          editableHeadRevisionId: string;
        };
      };
    };
    expect(body.formula.source).toBe(INVALID_SOURCE);
    expect(body.formula.lifecycle.activeRunnableSource).toBe(VALID_SOURCE);
    expect(body.formula.lifecycle.editableHeadRevisionId).toBe(editableId);
    const revisionCall = fetchCalls.find((call) =>
      call.url.includes('custom_formula_revisions'),
    );
    expect(revisionCall?.url).toContain('select=id,definition,profile');
    expect(revisionCall?.url).not.toContain('select=id,source');
  });

  it('GET detail maps a missing owner record to not_found', async () => {
    stubFetch((call) => {
      if (call.url.includes('custom_formulas')) {
        return new Response('[]', { status: 200 });
      }
      return defaultRespond(call);
    });

    const res = await formulaGET(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`),
      detailContext(),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'not_found' },
    });
  });

  it('PATCH updates with expectedRevision and maps revision_conflict', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_custom_formula_save')) {
        return rpcError('revision_conflict: expected revision mismatch');
      }
      return defaultRespond(call);
    });
    const res = await formulaPATCH(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'PATCH',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Renamed', source: VALID_SOURCE, expectedRevision: 1 },
      }),
      detailContext(),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('revision_conflict');
  });

  it('PATCH accepts a rename-only body and preserves stored source, hint, and semantics', async () => {
    const storedHint = { bailout: 9 };
    stubFetch((call) => {
      if (call.url.includes('custom_formulas')) {
        return new Response(
          JSON.stringify([
            {
              id: FORMULA_ID,
              name: 'Route formula',
              revision: 1,
              source_bytes: 40,
              experience_hint: storedHint,
              frm_semantics_version: 2,
              created_at: '2026-08-03T00:00:00Z',
              updated_at: '2026-08-03T00:00:00Z',
              source: VALID_SOURCE,
            },
          ]),
          { status: 200 },
        );
      }
      return defaultRespond(call);
    });

    const res = await formulaPATCH(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'PATCH',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Renamed only', expectedRevision: 1 },
      }),
      detailContext(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      formulaId: FORMULA_ID,
      revision: 2,
      frmSemanticsVersion: 2,
    });
    const rpcCall = fetchCalls.find((call) =>
      call.url.includes('rpc/fractalpark_custom_formula_save'),
    );
    const rpcArgs = JSON.parse(rpcCall?.body ?? '{}') as Record<string, unknown>;
    expect(rpcArgs).toMatchObject({
      p_name: 'Renamed only',
      p_source: VALID_SOURCE,
      p_experience_hint: storedHint,
      p_expected_revision: 1,
    });
    expect(rpcArgs).not.toHaveProperty('p_frm_semantics_version');
  });

  it('PATCH maps a missing pre-read record and never calls the save RPC', async () => {
    stubFetch((call) => {
      if (call.url.includes('custom_formulas')) {
        return new Response('[]', { status: 200 });
      }
      return defaultRespond(call);
    });

    const res = await formulaPATCH(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'PATCH',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Missing', expectedRevision: 1 },
      }),
      detailContext(),
    );
    expect(res.status).toBe(404);
    expect(
      fetchCalls.some((call) =>
        call.url.includes('rpc/fractalpark_custom_formula_save'),
      ),
    ).toBe(false);
  });

  it('PATCH requires expectedRevision', async () => {
    const res = await formulaPATCH(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'PATCH',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Renamed', source: VALID_SOURCE },
      }),
      detailContext(),
    );
    expect(res.status).toBe(400);
  });

  it('DELETE removes the formula and returns 204', async () => {
    const res = await formulaDELETE(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { expectedRevision: 1 },
      }),
      detailContext(),
    );
    expect(res.status).toBe(204);
    const rpcCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_delete'));
    expect(rpcCall?.body).toContain('"p_expected_revision":1');
  });

  it('DELETE requires expectedRevision', async () => {
    const res = await formulaDELETE(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
      }),
      detailContext(),
    );
    expect(res.status).toBe(400);
  });

  it('DELETE rejects an oversized body before calling the RPC', async () => {
    const res = await formulaDELETE(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { expectedRevision: 1, padding: 'x'.repeat(16 * 1024) },
      }),
      detailContext(),
    );
    expect(res.status).toBe(413);
    expect(fetchCalls.some((c) => c.url.includes('rpc/fractalpark_custom_formula_delete'))).toBe(false);
  });

  it('DELETE maps not_found to 404', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_custom_formula_delete')) {
        return rpcError('not_found: custom formula not found');
      }
      return defaultRespond(call);
    });
    const res = await formulaDELETE(
      authedRequest(`https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { expectedRevision: 1 },
      }),
      detailContext(),
    );
    expect(res.status).toBe(404);
  });

  it('validation_failed from the save RPC maps to 400', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_custom_formula_save')) {
        return rpcError('validation_failed: unsupported semantics version');
      }
      return defaultRespond(call);
    });
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Rejected by RPC', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'validation_failed' },
    });
  });

  it('quota_exceeded maps to 422', async () => {
    stubFetch((call) => {
      if (call.url.includes('rpc/fractalpark_custom_formula_save')) {
        return rpcError('quota_exceeded: custom formula count quota reached');
      }
      return defaultRespond(call);
    });
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'One too many', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('quota_exceeded');
  });

  it('write routes reject cross-site origin', async () => {
    const res = await formulasPOST(
      authedRequest('https://fractalpark.test/api/creation/custom-formulas', {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY, origin: 'https://evil.example' },
        body: { name: 'X', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('write routes return cloud_disabled when the flag is off', async () => {
    const request = authedRequest('https://fractalpark.test/api/creation/custom-formulas');
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = '';
    const res = await formulasGET(request);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('cloud_disabled');
  });
});
