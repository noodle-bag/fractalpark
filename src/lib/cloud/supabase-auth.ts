/**
 * Server-side Supabase Auth (GoTrue) REST client for the v0.4.15 cloud
 * creation loop.
 *
 * Contract: docs/adr/0005-same-origin-cloud-session.md — the browser never
 * talks to the identity provider; OTP request, verify, refresh and logout
 * all execute server-side inside FractalPark Route Handlers.
 *
 * Plain `fetch` wrappers keep this dependency-free. Nothing is initialized
 * at import time: every function reads the cloud config lazily, so a
 * deployment with the switch off never builds a client or a connection.
 * Provider error bodies may contain sensitive detail and are never
 * forwarded to callers — only stable classification is.
 */

import { getSupabaseConfig } from './config';

export class AuthProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthProviderError';
    this.status = status;
  }
}

export interface ProviderSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when the access token expires. */
  accessTokenExpiresAt: number;
}

interface ProviderSessionBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string };
}

function parseSessionBody(body: ProviderSessionBody): ProviderSession {
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number' ||
    typeof body.user?.id !== 'string'
  ) {
    throw new AuthProviderError(502, 'identity provider returned a malformed session');
  }
  return {
    userId: body.user.id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
}

async function authFetch(
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<Response> {
  const { url, publishableKey } = getSupabaseConfig();
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: { apikey: publishableKey, 'content-type': 'application/json', ...init.headers },
  });
}

/**
 * Send a six-digit OTP to the email. GoTrue deliberately answers 200 even
 * for unknown emails when confirmation is required, so this never leaks
 * registration state. Rate limiting happens in the caller before this.
 */
export async function requestEmailOtp(email: string): Promise<void> {
  let res: Response;
  try {
    res = await authFetch('/otp', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ email, create_user: true }),
    });
  } catch {
    throw new AuthProviderError(503, 'identity provider unreachable');
  }
  if (!res.ok) {
    throw new AuthProviderError(res.status, 'identity provider rejected the OTP request');
  }
}

/**
 * Verify a six-digit code. Returns the sealed-session material on success.
 * Wrong/expired codes surface as a 4xx from GoTrue; callers map that to the
 * generic `otp_invalid` product error without any provider detail.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<ProviderSession> {
  let res: Response;
  try {
    res = await authFetch('/verify', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ type: 'email', email, token }),
    });
  } catch {
    throw new AuthProviderError(503, 'identity provider unreachable');
  }
  if (!res.ok) {
    throw new AuthProviderError(res.status, 'identity provider rejected the OTP verification');
  }
  return parseSessionBody((await res.json()) as ProviderSessionBody);
}

/**
 * Exchange a refresh token for a new token pair. GoTrue rotates refresh
 * tokens on every exchange: the old refresh token dies here, which is what
 * makes a replayed pre-rotation cookie useless.
 */
export async function refreshProviderSession(refreshToken: string): Promise<ProviderSession> {
  let res: Response;
  try {
    res = await authFetch('/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    throw new AuthProviderError(503, 'identity provider unreachable');
  }
  if (!res.ok) {
    throw new AuthProviderError(res.status, 'identity provider rejected the session refresh');
  }
  return parseSessionBody((await res.json()) as ProviderSessionBody);
}

/**
 * Revoke the provider session (and its refresh token) on logout. Network
 * failures do not block the local cookie clear — the caller still drops the
 * sealed cookie, and the orphaned access token expires on its own.
 */
export async function revokeProviderSession(accessToken: string): Promise<void> {
  try {
    await authFetch('/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ scope: 'global' }),
    });
  } catch {
    // Best effort by contract: local cookie clear is the security boundary.
  }
}
