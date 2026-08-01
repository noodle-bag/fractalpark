/**
 * Request-scoped session resolution for private cloud routes.
 *
 * Contract: docs/adr/0005-same-origin-cloud-session.md —
 *
 * - Every private request re-verifies the sealed cookie, the token expiry,
 *   and the cloud feature switch on the server. A client-side session
 *   object is never an authorization fact.
 * - Near expiry, the server refreshes the provider session and atomically
 *   rotates the cookie: the response carries the new sealed value, and the
 *   provider invalidates the old refresh token in the same exchange, so the
 *   pre-rotation cookie cannot be replayed.
 * - Tampered, expired, or revoked sessions answer `unauthenticated` and
 *   clear the cookie; they never produce a partial session.
 */

import {
  needsRefresh,
  serializeSessionClearCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  sealSession,
  unsealSession,
  type SessionPayload,
  SessionSealError,
} from './session';
import { AuthProviderError, refreshProviderSession } from './supabase-auth';
import { CloudApiError } from './api';

export interface ResolvedSession {
  session: SessionPayload;
  /** Present when the cookie was rotated during this request. */
  rotatedSetCookie?: string;
}

function requestHost(request: Request): string {
  return request.headers.get('host') ?? 'localhost';
}

/** Raw sealed cookie value from the Cookie header, or null when absent. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return rest.join('=') || null;
    }
  }
  return null;
}

/**
 * Resolve the caller's session from the sealed cookie, refreshing and
 * rotating near expiry. Throws CloudApiError('unauthenticated') — with the
 * clear-cookie header attached via `clearCookie` — when no valid session
 * exists.
 */
export async function resolveRequestSession(
  request: Request,
  options: { forceRefresh?: boolean } = {},
): Promise<ResolvedSession> {
  const raw = readSessionCookie(request);
  if (!raw) {
    throw new CloudApiError('unauthenticated');
  }
  let session: SessionPayload;
  try {
    session = unsealSession(raw);
  } catch (error) {
    if (error instanceof SessionSealError) {
      throw new CloudApiError('unauthenticated');
    }
    throw error;
  }

  if (!options.forceRefresh && !needsRefresh(session)) {
    return { session };
  }

  try {
    const refreshed = await refreshProviderSession(session.refreshToken);
    const rotated = sealSession(refreshed);
    return {
      session: refreshed,
      rotatedSetCookie: serializeSessionCookie(rotated, { host: requestHost(request) }),
    };
  } catch (error) {
    if (error instanceof AuthProviderError && error.status >= 400 && error.status < 500) {
      // Refresh token expired, rotated away, or revoked: the session is
      // dead; the caller clears the cookie.
      throw new CloudApiError('unauthenticated');
    }
    throw new CloudApiError('unavailable');
  }
}

/** Set-Cookie header value that clears the session cookie for this host. */
export function clearSessionCookieHeader(request: Request): string {
  return serializeSessionClearCookie(requestHost(request));
}

/** Set-Cookie header value that seals a fresh session for this host. */
export function sealSessionCookieHeader(request: Request, session: SessionPayload): string {
  return serializeSessionCookie(sealSession(session), { host: requestHost(request) });
}
