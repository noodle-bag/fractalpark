/**
 * Sealed session cookie for the v0.4.15 cloud creation loop.
 *
 * Contract: docs/adr/0005-same-origin-cloud-session.md. After OTP
 * verification the server seals the provider tokens into an
 * authenticated-encryption cookie named `fp_creation_session`. The browser
 * never holds a token; JavaScript cannot read the cookie (HttpOnly).
 *
 * - Encryption: AES-256-GCM (node:crypto). The 32-byte key derives from
 *   FRACTALPARK_SESSION_ENCRYPTION_KEY via SHA-256, so any 32+ character
 *   secret accepted by cloud/config.ts works. A random 12-byte IV per seal.
 * - The sealed payload carries the access token, refresh token, user ID and
 *   access-token expiry. Tampering, wrong keys, and expired payloads are all
 *   rejected; an expired payload is never resurrected client-side.
 * - Cookie attributes are fixed by the ADR: HttpOnly, SameSite=Lax, Path=/,
 *   Secure in production with an explicit localhost development exception.
 *
 * This module performs no work at import time and never logs secret values.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { getSessionEncryptionKey } from './config';

export const SESSION_COOKIE_NAME = 'fp_creation_session';

/** Cookie lifetime: bounds the sealed payload, not the provider session. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Access tokens with less remaining life than this are refreshed. */
export const SESSION_REFRESH_THRESHOLD_SECONDS = 60;

const SEAL_VERSION = 1;

export interface SessionPayload {
  /** Stable internal user ID (provider `sub`). The real identity. */
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when the access token expires. */
  accessTokenExpiresAt: number;
}

export class SessionSealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionSealError';
  }
}

function deriveKey(): Buffer {
  // The configured secret is an arbitrary 32+ char string; SHA-256 turns it
  // into a fixed 32-byte AES key without ever persisting the raw secret.
  return createHash('sha256').update(getSessionEncryptionKey(), 'utf8').digest();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Seal a session payload into an opaque, tamper-evident cookie value. */
export function sealSession(payload: SessionPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify({ v: SEAL_VERSION, ...payload }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Unseal a cookie value. Throws SessionSealError on malformed input,
 * tampering, or version mismatch. An expired access token does NOT throw:
 * the sealed refresh token may still be valid, so the refresh path
 * (request-session) decides whether the session can be renewed; only a
 * provider-side rejection ends the session.
 */
export function unsealSession(value: string): SessionPayload {
  let raw: Buffer;
  try {
    raw = Buffer.from(value, 'base64url');
  } catch {
    throw new SessionSealError('malformed session cookie');
  }
  if (raw.length < 12 + 16 + 2) {
    throw new SessionSealError('malformed session cookie');
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new SessionSealError('session cookie failed integrity check');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new SessionSealError('malformed session payload');
  }
  const candidate = parsed as Partial<SessionPayload> & { v?: number };
  if (
    candidate.v !== SEAL_VERSION ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.accessToken !== 'string' ||
    typeof candidate.refreshToken !== 'string' ||
    typeof candidate.accessTokenExpiresAt !== 'number'
  ) {
    throw new SessionSealError('malformed session payload');
  }
  return {
    userId: candidate.userId,
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    accessTokenExpiresAt: candidate.accessTokenExpiresAt,
  };
}

/** True when the access token should be refreshed before use. */
export function needsRefresh(payload: SessionPayload): boolean {
  return payload.accessTokenExpiresAt - nowSeconds() < SESSION_REFRESH_THRESHOLD_SECONDS;
}

export interface CookieOptions {
  /** Request host; Secure is omitted only for the localhost dev exception. */
  host: string;
  /** Override Max-Age; 0 clears the cookie. */
  maxAgeSeconds?: number;
}

function isLocalhost(host: string): boolean {
  const lower = host.toLowerCase();
  const hostname = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Serialize the session cookie with the ADR-fixed attribute set. */
export function serializeSessionCookie(value: string, options: CookieOptions): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds ?? SESSION_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (!isLocalhost(options.host)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/** Serialize a clearing cookie (logout / failed refresh / tamper recovery). */
export function serializeSessionClearCookie(host: string): string {
  return serializeSessionCookie('', { host, maxAgeSeconds: 0 });
}
