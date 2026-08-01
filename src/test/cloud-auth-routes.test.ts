import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as otpRequestPOST } from '@/app/api/creation/auth/otp/request/route';
import { POST as otpVerifyPOST } from '@/app/api/creation/auth/otp/verify/route';
import { POST as logoutPOST } from '@/app/api/creation/auth/logout/route';
import { GET as sessionGET } from '@/app/api/creation/auth/session/route';
import { POST as refreshPOST } from '@/app/api/creation/auth/session/refresh/route';
import { SESSION_COOKIE_NAME, sealSession, unsealSession, type SessionPayload } from '@/lib/cloud/session';

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
] as const;

const SUPABASE_URL = 'https://project.example.supabase.co';
const savedEnv = new Map<string, string | undefined>();

interface FetchCall {
  url: string;
  body: unknown;
  authorization: string | null;
}

let fetchCalls: FetchCall[] = [];

type FetchResponder = (call: FetchCall) => Response;

function stubFetch(respond: FetchResponder): void {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: FetchCall = {
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: new Headers(init?.headers).get('authorization'),
      };
      fetchCalls.push(call);
      return respond(call);
    }),
  );
}

function enableCloudEnv(): void {
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 's'.repeat(32);
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'r'.repeat(32);
}

beforeEach(() => {
  for (const name of ENV_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  enableCloudEnv();
  stubFetch(() => new Response('unexpected call', { status: 500 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

function makeRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    ...init,
    headers: { host: 'fractalpark.com', ...(init.headers ?? {}) },
  });
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return makeRequest(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://fractalpark.com', ...headers },
    body: JSON.stringify(body),
  });
}

function providerSession(uid = 'user-1', at = 'AT-1', rt = 'RT-1') {
  return { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: uid } };
}

function sessionPayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    userId: 'user-1',
    accessToken: 'AT-1',
    refreshToken: 'RT-1',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function cookieHeader(payload: SessionPayload): string {
  return `${SESSION_COOKIE_NAME}=${sealSession(payload)}`;
}

function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ?? '';
}

describe('feature switch off', () => {
  const routes: Array<[string, (r: Request) => Promise<Response>, Request]> = [
    ['otp request', otpRequestPOST, postJson('/api/creation/auth/otp/request', { email: 'a@b.co' })],
    ['otp verify', otpVerifyPOST, postJson('/api/creation/auth/otp/verify', { email: 'a@b.co', token: '123456' })],
    ['session', sessionGET, makeRequest('/api/creation/auth/session')],
    ['refresh', refreshPOST, postJson('/api/creation/auth/session/refresh', {})],
    ['logout', logoutPOST, postJson('/api/creation/auth/logout', {})],
  ];

  for (const [name, handler, request] of routes) {
    it(`returns cloud_disabled for ${name} without initializing any cloud client`, async () => {
      delete process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;
      const res = await handler(request);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('cloud_disabled');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(fetchCalls).toHaveLength(0);
    });
  }
});

describe('POST /api/creation/auth/otp/request', () => {
  it('consumes email/IP counters before calling the provider', async () => {
    stubFetch((call) => {
      if (call.url.includes('fractalpark_rate_limit_consume')) {
        return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
      }
      if (call.url === `${SUPABASE_URL}/auth/v1/otp`) {
        return new Response('{}', { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'User@Example.com' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const rateCalls = fetchCalls.filter((c) => c.url.includes('fractalpark_rate_limit_consume'));
    expect(rateCalls).toHaveLength(3);
    // Normalized email subject, HMAC-hashed (never the raw address).
    const subjects = rateCalls.map((c) => (c.body as { p_subject_hash: string }).p_subject_hash);
    expect(subjects.every((s) => /^[0-9a-f]{64}$/.test(s))).toBe(true);
    expect(subjects.join()).not.toContain('user@example.com');
    expect(new Set(subjects).size).toBe(2); // one email subject (x2 policies) + one IP subject
    // The provider call is last — counters always come first.
    expect(fetchCalls[fetchCalls.length - 1].url).toBe(`${SUPABASE_URL}/auth/v1/otp`);
    expect((fetchCalls[fetchCalls.length - 1].body as { email: string }).email).toBe('user@example.com');
  });

  it('returns a generic 429 with retryAfter when a counter denies, and never calls the provider', async () => {
    stubFetch((call) => {
      if (call.url.includes('fractalpark_rate_limit_consume')) {
        return new Response(JSON.stringify([{ allowed: false, retry_after: 37 }]), { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'a@b.co' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('37');
    const body = (await res.json()) as { error: { code: string; retryAfter: number } };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.retryAfter).toBe(37);
    expect(fetchCalls.some((c) => c.url.includes('/auth/v1/otp'))).toBe(false);
  });

  it('fails closed with 503 when the counter backend errors', async () => {
    stubFetch(() => new Response('db down', { status: 500 }));
    const res = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'a@b.co' }));
    expect(res.status).toBe(503);
    expect(fetchCalls.some((c) => c.url.includes('/auth/v1/otp'))).toBe(false);
  });

  it('rejects invalid input and cross-site origins without calling anything', async () => {
    const badEmail = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'not-an-email' }));
    expect(badEmail.status).toBe(400);
    const crossSite = await otpRequestPOST(
      postJson('/api/creation/auth/otp/request', { email: 'a@b.co' }, { origin: 'https://evil.example.com' }),
    );
    expect(crossSite.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });

  it('maps a provider 429 to the generic rate_limited and other failures to 503', async () => {
    stubFetch((call) => {
      if (call.url.includes('fractalpark_rate_limit_consume')) {
        return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
      }
      return new Response('slow down', { status: 429 });
    });
    const limited = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'a@b.co' }));
    expect(limited.status).toBe(429);

    stubFetch((call) => {
      if (call.url.includes('fractalpark_rate_limit_consume')) {
        return new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 });
      }
      return new Response('provider down', { status: 500 });
    });
    const down = await otpRequestPOST(postJson('/api/creation/auth/otp/request', { email: 'a@b.co' }));
    expect(down.status).toBe(503);
  });
});

describe('POST /api/creation/auth/otp/verify', () => {
  it('seals the provider tokens into one HttpOnly cookie on success', async () => {
    stubFetch((call) => {
      if (call.url === `${SUPABASE_URL}/auth/v1/verify`) {
        return new Response(JSON.stringify(providerSession()), { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await otpVerifyPOST(postJson('/api/creation/auth/otp/verify', { email: 'a@b.co', token: '123456' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Secure');

    const sealed = sessionCookieFrom(res);
    const session = unsealSession(sealed);
    expect(session.userId).toBe('user-1');
    expect(session.accessToken).toBe('AT-1');
    expect(session.refreshToken).toBe('RT-1');
    // Tokens travel only inside the sealed cookie, never in the body.
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('AT-1');
    expect(JSON.stringify(body)).not.toContain('RT-1');
  });

  it('answers the generic otp_invalid for wrong or expired codes', async () => {
    stubFetch(() => new Response(JSON.stringify({ error_code: 'otp_expired', msg: 'Token has expired or is invalid' }), { status: 403 }));
    const res = await otpVerifyPOST(postJson('/api/creation/auth/otp/verify', { email: 'a@b.co', token: '000000' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('otp_invalid');
    expect(body.error.message).not.toContain('expired or is invalid');
    expect(body.error.message).not.toContain('a@b.co');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects malformed codes before calling the provider', async () => {
    const res = await otpVerifyPOST(postJson('/api/creation/auth/otp/verify', { email: 'a@b.co', token: 'abcdef' }));
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it('answers 503 when the provider is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const res = await otpVerifyPOST(postJson('/api/creation/auth/otp/verify', { email: 'a@b.co', token: '123456' }));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/creation/auth/session', () => {
  it('rejects a missing cookie without setting one', async () => {
    const res = await sessionGET(makeRequest('/api/creation/auth/session'));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns the safe session state for a valid cookie without touching the provider', async () => {
    const res = await sessionGET(
      makeRequest('/api/creation/auth/session', { headers: { cookie: cookieHeader(sessionPayload()) } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('set-cookie')).toBeNull();
    const body = (await res.json()) as { user: { id: string } };
    expect(body.user.id).toBe('user-1');
    expect(fetchCalls).toHaveLength(0);
  });

  it('rejects a tampered cookie and clears it', async () => {
    const res = await sessionGET(
      makeRequest('/api/creation/auth/session', { headers: { cookie: `${SESSION_COOKIE_NAME}=forged-value` } }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetchCalls).toHaveLength(0);
  });

  it('renews an expired sealed session through the refresh token when the provider allows it', async () => {
    // The access token is dead but the sealed refresh token is still valid:
    // the server refreshes and rotates instead of killing the session.
    const expired = sessionPayload({ accessTokenExpiresAt: Math.floor(Date.now() / 1000) - 10 });
    stubFetch((call) => {
      if (call.url.includes('grant_type=refresh_token')) {
        return new Response(JSON.stringify(providerSession('user-1', 'AT-3', 'RT-3')), { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await sessionGET(
      makeRequest('/api/creation/auth/session', { headers: { cookie: cookieHeader(expired) } }),
    );
    expect(res.status).toBe(200);
    expect(unsealSession(sessionCookieFrom(res)).accessToken).toBe('AT-3');
  });

  it('rejects an expired sealed session whose refresh token the provider rejects, and clears the cookie', async () => {
    const expired = sessionPayload({ accessTokenExpiresAt: Math.floor(Date.now() / 1000) - 10 });
    stubFetch(() => new Response(JSON.stringify({ error: 'invalid refresh token' }), { status: 400 }));
    const res = await sessionGET(
      makeRequest('/api/creation/auth/session', { headers: { cookie: cookieHeader(expired) } }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rotates the cookie atomically near expiry and rejects replay of the old value', async () => {
    const nearExpiry = sessionPayload({ accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 10 });
    const oldCookie = cookieHeader(nearExpiry);

    // First call: the provider accepts the refresh token and rotates it.
    stubFetch((call) => {
      if (call.url.includes('grant_type=refresh_token')) {
        expect((call.body as { refresh_token: string }).refresh_token).toBe('RT-1');
        return new Response(JSON.stringify(providerSession('user-1', 'AT-2', 'RT-2')), { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await sessionGET(makeRequest('/api/creation/auth/session', { headers: { cookie: oldCookie } }));
    expect(res.status).toBe(200);
    const rotated = sessionCookieFrom(res);
    expect(rotated).not.toBe('');
    expect(rotated).not.toBe(oldCookie.slice(SESSION_COOKIE_NAME.length + 1));
    const rotatedSession = unsealSession(rotated);
    expect(rotatedSession.accessToken).toBe('AT-2');
    expect(rotatedSession.refreshToken).toBe('RT-2');

    // Replay: the old refresh token is dead at the provider, so the old
    // cookie value must fail and be cleared.
    stubFetch(() => new Response(JSON.stringify({ error: 'invalid refresh token' }), { status: 400 }));
    const replay = await sessionGET(makeRequest('/api/creation/auth/session', { headers: { cookie: oldCookie } }));
    expect(replay.status).toBe(401);
    expect(replay.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('answers 503 when the refresh backend is unreachable near expiry', async () => {
    const nearExpiry = sessionPayload({ accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 10 });
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const res = await sessionGET(
      makeRequest('/api/creation/auth/session', { headers: { cookie: cookieHeader(nearExpiry) } }),
    );
    expect(res.status).toBe(503);
  });
});

describe('POST /api/creation/auth/session/refresh', () => {
  it('forces a provider refresh and rotation even for a fresh cookie', async () => {
    stubFetch((call) => {
      if (call.url.includes('grant_type=refresh_token')) {
        return new Response(JSON.stringify(providerSession('user-1', 'AT-2', 'RT-2')), { status: 200 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await refreshPOST(
      postJson('/api/creation/auth/session/refresh', {}, { cookie: cookieHeader(sessionPayload()) }),
    );
    expect(res.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    const rotated = unsealSession(sessionCookieFrom(res));
    expect(rotated.refreshToken).toBe('RT-2');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects cross-site origins without calling the provider', async () => {
    const res = await refreshPOST(
      postJson('/api/creation/auth/session/refresh', {}, { origin: 'https://evil.example.com', cookie: cookieHeader(sessionPayload()) }),
    );
    expect(res.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('POST /api/creation/auth/logout', () => {
  it('revokes the provider session first and then clears the cookie', async () => {
    stubFetch((call) => {
      if (call.url === `${SUPABASE_URL}/auth/v1/logout`) {
        return new Response('{}', { status: 204 });
      }
      return new Response('unmatched', { status: 500 });
    });
    const res = await logoutPOST(
      postJson('/api/creation/auth/logout', {}, { cookie: cookieHeader(sessionPayload()) }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${SUPABASE_URL}/auth/v1/logout`);
    expect(fetchCalls[0].authorization).toBe('Bearer AT-1');
  });

  it('is idempotent: a missing cookie still answers 204 with a clearing cookie', async () => {
    const res = await logoutPOST(postJson('/api/creation/auth/logout', {}));
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetchCalls).toHaveLength(0);
  });

  it('clears a tampered cookie without calling the provider', async () => {
    const res = await logoutPOST(
      postJson('/api/creation/auth/logout', {}, { cookie: `${SESSION_COOKIE_NAME}=forged` }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetchCalls).toHaveLength(0);
  });

  it('still clears the cookie when the provider is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const res = await logoutPOST(
      postJson('/api/creation/auth/logout', {}, { cookie: cookieHeader(sessionPayload()) }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
