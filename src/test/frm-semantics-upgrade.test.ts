/**
 * FRM Upgrade & Compare route tests (v0.4.18 slice 2, commit 6).
 *
 * Covers the explicit semantics-version contract: new formulas are created
 * as strict v2, ordinary saves never auto-upgrade, and the dedicated
 * semantics endpoint performs revision-checked, direction-enforced,
 * idempotency-keyed upgrades and reverts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as formulasPOST } from '@/app/api/creation/custom-formulas/route';
import { PATCH as formulaPATCH } from '@/app/api/creation/custom-formulas/[formulaId]/route';
import { POST as semanticsPOST } from '@/app/api/creation/custom-formulas/[formulaId]/semantics/route';
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

function baseRow(version?: number) {
  return {
    id: FORMULA_ID,
    name: 'Route formula',
    revision: 1,
    source_bytes: 40,
    experience_hint: null,
    created_at: '2026-08-03T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
    source: VALID_SOURCE,
    ...(version === undefined ? {} : { frm_semantics_version: version }),
  };
}

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

function defaultRespond(storedVersion?: number) {
  return (call: { url: string; method: string; body: string | null }): Response => {
    if (call.url.includes('fractalpark_rate_limit_consume')) {
      return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
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
      return new Response(JSON.stringify([baseRow(storedVersion)]), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
  };
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
  for (const key of ENV_VARS) savedEnv.set(key, process.env[key]);
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'pk';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'b'.repeat(32);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_VARS) {
    const previous = savedEnv.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

const CREATE_URL = 'https://fractalpark.test/api/creation/custom-formulas';
const DETAIL_URL = `https://fractalpark.test/api/creation/custom-formulas/${FORMULA_ID}`;
const SEMANTICS_URL = `${DETAIL_URL}/semantics`;

describe('semantics versioning across save routes', () => {
  it('creates new formulas as strict v2', async () => {
    stubFetch(defaultRespond());
    const res = await formulasPOST(
      authedRequest(CREATE_URL, {
        method: 'POST',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Fresh', source: VALID_SOURCE },
      }),
    );
    expect(res.status).toBe(201);
    const saveCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    expect(saveCall?.body).toContain('"p_frm_semantics_version":2');
  });

  it('never sends a version on ordinary update (no auto-upgrade)', async () => {
    stubFetch(defaultRespond(1));
    const res = await formulaPATCH(
      authedRequest(DETAIL_URL, {
        method: 'PATCH',
        headers: { 'idempotency-key': IDEMPOTENCY_KEY },
        body: { name: 'Renamed', source: VALID_SOURCE, experienceHint: null, expectedRevision: 1 },
      }),
      detailContext(),
    );
    expect(res.status).toBe(200);
    const saveCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    expect(saveCall?.body).not.toContain('p_frm_semantics_version');
  });
});

describe('POST .../semantics: explicit Upgrade & Compare actions', () => {
  const semanticsRequest = (action: string, expectedRevision = 1) =>
    authedRequest(SEMANTICS_URL, {
      method: 'POST',
      headers: { 'idempotency-key': IDEMPOTENCY_KEY },
      body: { action, expectedRevision },
    });

  it('upgrades a v1 formula to v2 with a revision-checked explicit save', async () => {
    stubFetch(defaultRespond(1));
    const res = await semanticsPOST(semanticsRequest('upgradeSemantics'), detailContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ formulaId: FORMULA_ID, frmSemanticsVersion: 2 });
    const saveCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    expect(saveCall?.body).toContain('"p_frm_semantics_version":2');
    expect(saveCall?.body).toContain('"p_expected_revision":1');
  });

  it('reverts a v2 formula back to v1', async () => {
    stubFetch(defaultRespond(2));
    const res = await semanticsPOST(semanticsRequest('revertSemantics'), detailContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ formulaId: FORMULA_ID, frmSemanticsVersion: 1 });
    const saveCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    expect(saveCall?.body).toContain('"p_frm_semantics_version":1');
  });

  it('rejects an upgrade that is already at v2 (direction enforcement)', async () => {
    stubFetch(defaultRespond(2));
    const res = await semanticsPOST(semanticsRequest('upgradeSemantics'), detailContext());
    expect(res.status).toBe(400);
    const saveCall = fetchCalls.find((c) => c.url.includes('rpc/fractalpark_custom_formula_save'));
    expect(saveCall).toBeUndefined();
  });

  it('rejects a revert that is already at v1', async () => {
    stubFetch(defaultRespond(1));
    const res = await semanticsPOST(semanticsRequest('revertSemantics'), detailContext());
    expect(res.status).toBe(400);
  });

  it('rejects unknown actions and bad revisions at validation', async () => {
    stubFetch(defaultRespond(1));
    const badAction = await semanticsPOST(semanticsRequest('makeItSo'), detailContext());
    expect(badAction.status).toBe(400);
    const badRevision = await semanticsPOST(semanticsRequest('upgradeSemantics', 0), detailContext());
    expect(badRevision.status).toBe(400);
  });

  it('requires a session', async () => {
    stubFetch(defaultRespond(1));
    const res = await semanticsPOST(
      new Request(SEMANTICS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': IDEMPOTENCY_KEY },
        body: JSON.stringify({ action: 'upgradeSemantics', expectedRevision: 1 }),
      }),
      detailContext(),
    );
    expect(res.status).toBe(401);
  });
});
