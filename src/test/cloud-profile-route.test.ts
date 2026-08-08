import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from '@/app/api/creation/profile/route';
import { getProfile, setBackupEmailMode, setDisplayName } from '@/lib/cloud/publications';
import { resolveRequestSession } from '@/lib/cloud/request-session';

vi.mock('@/lib/cloud/publications', () => ({
  getProfile: vi.fn(),
  setBackupEmailMode: vi.fn(),
  setDisplayName: vi.fn(),
}));

vi.mock('@/lib/cloud/request-session', () => ({
  resolveRequestSession: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(method: 'GET' | 'PATCH', body?: unknown): Request {
  return new Request('https://fractalpark.test/api/creation/profile', {
    method,
    headers: {
      host: 'fractalpark.test',
      origin: 'https://fractalpark.test',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('profile route', () => {
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
      rotatedSetCookie: 'fp_session=rotated; Path=/; HttpOnly',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns the authenticated owner profile and forwards cookie rotation', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      displayName: 'Cloud Author',
      backupEmailMode: 'off',
    });

    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      displayName: 'Cloud Author',
      backupEmailMode: 'off',
    });
    expect(getProfile).toHaveBeenCalledWith(USER_ID);
    expect(response.headers.get('set-cookie')).toContain('fp_session=rotated');
  });

  it('writes display name through the owner-scoped service', async () => {
    vi.mocked(setDisplayName).mockResolvedValue({
      displayName: 'New Author',
      backupEmailMode: 'off',
    });

    const response = await PATCH(request('PATCH', { displayName: '  New Author  ' }));

    expect(response.status).toBe(200);
    expect(setDisplayName).toHaveBeenCalledWith(USER_ID, '  New Author  ');
    expect(setBackupEmailMode).not.toHaveBeenCalled();
  });

  it('writes backup mode without overwriting display name', async () => {
    vi.mocked(setBackupEmailMode).mockResolvedValue({
      displayName: 'Existing Author',
      backupEmailMode: 'publish_only',
    });

    const response = await PATCH(request('PATCH', { backupEmailMode: 'publish_only' }));

    expect(response.status).toBe(200);
    expect(setBackupEmailMode).toHaveBeenCalledWith(USER_ID, 'publish_only');
    expect(setDisplayName).not.toHaveBeenCalled();
  });

  it('rejects a body with neither supported field before any write', async () => {
    const response = await PATCH(request('PATCH', { unknown: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'validation_failed' } });
    expect(setBackupEmailMode).not.toHaveBeenCalled();
    expect(setDisplayName).not.toHaveBeenCalled();
  });
});
