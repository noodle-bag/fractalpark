import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSameOrigin,
  CloudApiError,
  jsonError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import { CloudConfigError } from '@/lib/cloud/config';
import { extractClientIp, hashRateLimitSubject } from '@/lib/cloud/rate-limit';

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'h'.repeat(32);
});

afterEach(() => {
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://fractalpark.com${path}`, {
    ...init,
    headers: { host: 'fractalpark.com', ...(init.headers ?? {}) },
  });
}

describe('jsonError', () => {
  it('emits the stable envelope with status and private, no-store', async () => {
    const res = jsonError(req('/x'), 'validation_failed');
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('validation_failed');
    expect(typeof body.error.message).toBe('string');
  });

  it('maps every product code to its frozen status', () => {
    const expected: Array<[Parameters<typeof jsonError>[1], number]> = [
      ['cloud_disabled', 403],
      ['unauthenticated', 401],
      ['forbidden', 403],
      ['not_found', 404],
      ['validation_failed', 400],
      ['otp_invalid', 400],
      ['payload_too_large', 413],
      ['invalid_envelope', 422],
      ['formula_assets_not_publishable', 422],
      ['quota_exceeded', 422],
      ['revision_conflict', 409],
      ['idempotency_conflict', 409],
      ['rate_limited', 429],
      ['unavailable', 503],
    ];
    for (const [code, status] of expected) {
      expect(jsonError(req('/x'), code).status).toBe(status);
    }
  });

  it('serves bilingual messages from Accept-Language', async () => {
    const zh = jsonError(req('/x', { headers: { 'accept-language': 'zh-CN' } }), 'rate_limited');
    const en = jsonError(req('/x', { headers: { 'accept-language': 'en-US' } }), 'rate_limited');
    const zhBody = (await zh.json()) as { error: { message: string } };
    const enBody = (await en.json()) as { error: { message: string } };
    expect(zhBody.error.message).not.toBe(enBody.error.message);
    expect(zhBody.error.message).toMatch(/[一-鿿]/);
  });

  it('carries retryAfter in the envelope and the retry-after header', async () => {
    const res = jsonError(req('/x'), 'rate_limited', 42);
    expect(res.headers.get('retry-after')).toBe('42');
    const body = (await res.json()) as { error: { retryAfter: number } };
    expect(body.error.retryAfter).toBe(42);
  });
});

describe('jsonOk', () => {
  it('is private, no-store and carries extra headers', async () => {
    const res = jsonOk(req('/x'), { ok: true }, 200, new Headers({ 'set-cookie': 'a=b' }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('set-cookie')).toBe('a=b');
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
  });
});

describe('assertSameOrigin', () => {
  it('accepts a missing Origin (non-browser caller)', () => {
    expect(() => assertSameOrigin(req('/x', { method: 'POST' }))).not.toThrow();
  });

  it('accepts a matching Origin', () => {
    expect(() =>
      assertSameOrigin(req('/x', { method: 'POST', headers: { origin: 'https://fractalpark.com' } })),
    ).not.toThrow();
  });

  it('rejects a cross-site Origin', () => {
    expect(() =>
      assertSameOrigin(req('/x', { method: 'POST', headers: { origin: 'https://evil.example.com' } })),
    ).toThrowError(CloudApiError);
  });

  it('rejects an unparseable Origin', () => {
    expect(() => assertSameOrigin(req('/x', { method: 'POST', headers: { origin: 'not a url' } }))).toThrowError(
      CloudApiError,
    );
  });
});

describe('readJsonBody', () => {
  it('reads a JSON object', async () => {
    const body = await readJsonBody(
      req('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 1 }) }),
    );
    expect(body).toEqual({ a: 1 });
  });

  it('rejects non-JSON content types before reading the body', async () => {
    await expect(
      readJsonBody(req('/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"a":1}' })),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(readJsonBody(req('/x', { method: 'POST', body: '{"a":1}' }))).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('rejects malformed JSON and non-object payloads', async () => {
    const jsonHeaders = { 'content-type': 'application/json' };
    await expect(
      readJsonBody(req('/x', { method: 'POST', headers: jsonHeaders, body: '{nope' })),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(
      readJsonBody(req('/x', { method: 'POST', headers: jsonHeaders, body: '[1,2]' })),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('rejects oversized bodies by declared length and by actual size', async () => {
    const jsonHeaders = { 'content-type': 'application/json' };
    await expect(
      readJsonBody(
        req('/x', { method: 'POST', headers: { ...jsonHeaders, 'content-length': '99999' }, body: '{}' }),
      ),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    await expect(
      readJsonBody(req('/x', { method: 'POST', headers: jsonHeaders, body: `{"a":"${'x'.repeat(20000)}"}` })),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
  });
});

describe('toErrorResponse', () => {
  it('maps CloudApiError, CloudConfigError and unknown errors', async () => {
    expect(toErrorResponse(req('/x'), new CloudApiError('forbidden')).status).toBe(403);
    expect(toErrorResponse(req('/x'), new CloudConfigError('cloud_disabled', 'off')).status).toBe(403);
    expect(toErrorResponse(req('/x'), new CloudConfigError('cloud_config_missing', 'x')).status).toBe(503);
    expect(toErrorResponse(req('/x'), new Error('boom')).status).toBe(503);
  });
});

describe('extractClientIp', () => {
  it('prefers the platform-verified header, then fallbacks, then the shared bucket', () => {
    expect(
      extractClientIp(
        new Headers({ 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-forwarded-for': '9.9.9.9' }),
      ),
    ).toBe('1.2.3.4');
    expect(extractClientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }))).toBe('9.9.9.9');
    expect(extractClientIp(new Headers({ 'x-real-ip': '7.7.7.7' }))).toBe('7.7.7.7');
    expect(extractClientIp(new Headers())).toBe('unknown');
  });
});

describe('hashRateLimitSubject', () => {
  it('is a stable 64-char hex digest that never contains the raw subject', () => {
    const digest = hashRateLimitSubject('email:user@example.com');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashRateLimitSubject('email:user@example.com'));
    expect(digest).not.toContain('user@example.com');
    expect(digest).not.toBe(hashRateLimitSubject('email:other@example.com'));
  });
});
