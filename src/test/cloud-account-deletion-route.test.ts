import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/creation/account/delete/route';
import { confirmAccountDeletion } from '@/lib/cloud/account-deletion';
import { clearSessionCookieHeader, resolveRequestSession } from '@/lib/cloud/request-session';

vi.mock('@/lib/cloud/account-deletion', () => ({
  AccountDeletionError: class AccountDeletionError extends Error {
    constructor(public readonly code: string, message?: string) {
      super(message ?? code);
    }
  },
  confirmAccountDeletion: vi.fn(),
}));

vi.mock('@/lib/cloud/request-session', () => ({
  clearSessionCookieHeader: vi.fn(),
  resolveRequestSession: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';

function request(body: unknown, key = IDEMPOTENCY_KEY): Request {
  return new Request('https://fractalpark.test/api/creation/account/delete', {
    method: 'POST',
    headers: {
      host: 'fractalpark.test',
      origin: 'https://fractalpark.test',
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
}

describe('account deletion confirmation route', () => {
  beforeEach(() => {
    vi.stubEnv('FRACTALPARK_CREATION_CLOUD_ENABLED', 'true');
    vi.mocked(resolveRequestSession).mockResolvedValue({
      session: {
        userId: USER_ID,
        email: 'owner@example.com',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60_000,
      },
      rotatedSetCookie: undefined,
    });
    vi.mocked(clearSessionCookieHeader).mockReturnValue(
      'fp_session=; Path=/; Max-Age=0; HttpOnly',
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('confirms with the authenticated owner and clears the local session cookie', async () => {
    vi.mocked(confirmAccountDeletion).mockResolvedValue({
      status: 'processing',
      draftsDeleted: 2,
      publicationsWithdrawn: 1,
    });

    const response = await POST(
      request({ operationId: OPERATION_ID, confirmEmail: 'owner@example.com' }),
    );

    expect(response.status).toBe(200);
    expect(confirmAccountDeletion).toHaveBeenCalledWith(
      USER_ID,
      OPERATION_ID,
      'owner@example.com',
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects malformed idempotency keys before the irreversible service call', async () => {
    const response = await POST(
      request({ operationId: OPERATION_ID, confirmEmail: 'owner@example.com' }, 'not-a-uuid'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'validation_failed' } });
    expect(confirmAccountDeletion).not.toHaveBeenCalled();
  });

  it('rejects malformed operation ids and empty confirmation emails', async () => {
    const response = await POST(
      request({ operationId: 'not-a-uuid', confirmEmail: '   ' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'validation_failed' } });
    expect(confirmAccountDeletion).not.toHaveBeenCalled();
  });
});
