import { createCipheriv, createHash, randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  needsRefresh,
  sealSession,
  serializeSessionClearCookie,
  serializeSessionCookie,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  SessionSealError,
  unsealSession,
  type SessionPayload,
} from '@/lib/cloud/session';

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
] as const;

const savedEnv = new Map<string, string | undefined>();

function enableEnv(key = 'k'.repeat(32)): void {
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = key;
}

beforeEach(() => {
  for (const name of ENV_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  enableEnv();
});

afterEach(() => {
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    userId: 'user-123',
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-def',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('sealSession / unsealSession', () => {
  it('round-trips a session payload', () => {
    const original = payload();
    const unsealed = unsealSession(sealSession(original));
    expect(unsealed).toEqual(original);
  });

  it('seals the same payload to different values (random IV)', () => {
    const original = payload();
    expect(sealSession(original)).not.toBe(sealSession(original));
  });

  it('produces an opaque value that leaks no token material', () => {
    const sealed = sealSession(payload());
    expect(sealed).not.toContain('access-token-abc');
    expect(sealed).not.toContain('refresh-token-def');
    expect(sealed).not.toContain('user-123');
  });

  it('rejects a tampered value', () => {
    const sealed = sealSession(payload());
    const tampered = `${sealed.slice(0, -4)}${sealed.endsWith('a') ? 'b' : 'a'}aaa`;
    expect(() => unsealSession(tampered)).toThrow(SessionSealError);
  });

  it('rejects a value sealed under a different key', () => {
    const sealed = sealSession(payload());
    enableEnv('x'.repeat(32));
    expect(() => unsealSession(sealed)).toThrow(SessionSealError);
  });

  it('accepts an expired-but-intact payload so the refresh path can decide', () => {
    // Expiry is a refresh decision, not an integrity failure: the sealed
    // refresh token may still be valid at the provider.
    const expired = payload({ accessTokenExpiresAt: Math.floor(Date.now() / 1000) - 1 });
    const unsealed = unsealSession(sealSession(expired));
    expect(unsealed).toEqual(expired);
    expect(needsRefresh(unsealed)).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(() => unsealSession('!!!')).toThrow(SessionSealError);
    expect(() => unsealSession('')).toThrow(SessionSealError);
    expect(() => unsealSession(Buffer.from('short').toString('base64url'))).toThrow(SessionSealError);
    // Well-formed but wrong payload version.
    const derived = createHash('sha256').update('k'.repeat(32), 'utf8').digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derived, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ v: 99 })), cipher.final()]);
    const forged = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    expect(() => unsealSession(forged)).toThrow(SessionSealError);
  });
});

describe('needsRefresh', () => {
  it('is false for a fresh token and true near expiry', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(needsRefresh(payload({ accessTokenExpiresAt: now + 3600 }))).toBe(false);
    expect(needsRefresh(payload({ accessTokenExpiresAt: now + 30 }))).toBe(true);
  });
});

describe('serializeSessionCookie', () => {
  it('fixes HttpOnly, SameSite=Lax, Path=/ and Secure on a production host', () => {
    const cookie = serializeSessionCookie('value', { host: 'fractalpark.com' });
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=value`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`);
  });

  it('omits Secure only for the localhost development exception', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
      expect(serializeSessionCookie('value', { host })).not.toContain('Secure');
    }
    expect(serializeSessionCookie('value', { host: 'preview.fractalpark.com' })).toContain('Secure');
  });

  it('clears the cookie with Max-Age=0', () => {
    const cleared = serializeSessionClearCookie('fractalpark.com');
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cleared).toContain('Max-Age=0');
  });
});
