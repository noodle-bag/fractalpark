import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CloudClientError,
  createDraft,
  getSession,
  listDrafts,
  updateDraft,
} from '@/lib/cloud/client';

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function apiError(status: number, code: string, retryAfter?: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message: 'm', ...(retryAfter !== undefined ? { retryAfter } : {}) } }),
    { status },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloud client session probe', () => {
  it('returns the user when authenticated', async () => {
    stubFetch(() => new Response(JSON.stringify({ user: { id: 'u-1' } })));
    expect(await getSession()).toEqual({ userId: 'u-1' });
  });

  it('maps 401 to anonymous (null), not an error', async () => {
    stubFetch(() => apiError(401, 'unauthenticated'));
    expect(await getSession()).toBeNull();
  });

  it('propagates cloud_disabled as a typed error', async () => {
    stubFetch(() => apiError(403, 'cloud_disabled'));
    await expect(getSession()).rejects.toMatchObject({ code: 'cloud_disabled' });
  });

  it('maps transport failure to offline', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    await expect(getSession()).rejects.toMatchObject({ code: 'offline' });
  });

  it('maps a non-JSON error body to malformed_response', async () => {
    stubFetch(() => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(getSession()).rejects.toMatchObject({ code: 'malformed_response' });
  });
});

describe('cloud client draft calls', () => {
  it('sends Idempotency-Key and JSON content type on writes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Promise.resolve(
          new Response(JSON.stringify({ draftId: 'd-1', revision: 1 }), { status: 201 }),
        );
      }),
    );
    await createDraft({ envelope: { envelopeVersion: 1 } });
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps rate_limited with retryAfter', async () => {
    stubFetch(() => apiError(429, 'rate_limited', 7));
    await expect(listDrafts()).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 7 });
  });

  it('maps revision_conflict and quota_exceeded', async () => {
    stubFetch(() => apiError(409, 'revision_conflict'));
    await expect(
      updateDraft('d-1', { envelope: {}, expectedRevision: 3 }),
    ).rejects.toMatchObject({ code: 'revision_conflict' });

    stubFetch(() => apiError(422, 'quota_exceeded'));
    await expect(listDrafts()).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('keeps unknown error codes as unavailable, never inventing semantics', async () => {
    stubFetch(() => apiError(500, 'something_new_from_the_future'));
    await expect(listDrafts()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('maps otp_invalid precisely so the dialog can say "wrong code"', async () => {
    stubFetch(() => apiError(400, 'otp_invalid'));
    await expect(getSession()).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('maps payload_too_large and formula_assets_not_publishable from the frozen table', async () => {
    stubFetch(() => apiError(413, 'payload_too_large'));
    await expect(listDrafts()).rejects.toMatchObject({ code: 'payload_too_large' });
    stubFetch(() => apiError(422, 'formula_assets_not_publishable'));
    await expect(listDrafts()).rejects.toMatchObject({ code: 'formula_assets_not_publishable' });
  });

  it('returns undefined for 204 deletes', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    const { deleteDraft } = await import('@/lib/cloud/client');
    await expect(deleteDraft('d-1')).resolves.toBeUndefined();
  });

  it('is a CloudClientError instance on every failure path', async () => {
    stubFetch(() => apiError(403, 'cloud_disabled'));
    await expect(listDrafts()).rejects.toBeInstanceOf(CloudClientError);
  });
});
