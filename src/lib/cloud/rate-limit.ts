/**
 * Rate limiting for the v0.4.15 cloud creation loop.
 *
 * Contract: docs/specs/web-creation-loop-v1.md §7 and §4.5.
 *
 * - Counters live in Postgres and move through the transactional
 *   `fractalpark_rate_limit_consume` RPC: read, window reset, limit check
 *   and increment happen in one transaction. No per-instance memory state.
 * - Subjects (email, IP) are never stored raw: the counter key is an
 *   HMAC-SHA256 hex digest with FRACTALPARK_RATE_LIMIT_HMAC_KEY.
 * - OTP counters are consumed by the same-origin Auth API BEFORE the
 *   identity provider is called. The provider's own rate limits remain a
 *   second boundary.
 * - The only trusted client IP source is the hosting platform's verified
 *   request data; unsourced requests are grouped under a single bucket so
 *   local development still exercises the limiter.
 * - The limiter fails closed: an unreachable counter backend surfaces as
 *   `unavailable` (503), never as a silent pass.
 */

import { createHmac } from 'node:crypto';

import { getRateLimitHmacKey, getSupabaseConfig } from './config';

export type RateLimitPolicyKey =
  | 'otp_email_minute'
  | 'otp_email_hour'
  | 'otp_ip_hour'
  | 'draft_save_5s'
  | 'publish_user_day'
  | 'backup_user_day';

export interface RateLimitOutcome {
  allowed: boolean;
  retryAfter: number;
}

export class RateLimitBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitBackendError';
  }
}

/** HMAC-SHA256 hex digest of a rate-limit subject; never the raw value. */
export function hashRateLimitSubject(subject: string): string {
  return createHmac('sha256', getRateLimitHmacKey()).update(subject, 'utf8').digest('hex');
}

/**
 * Extract the client IP from platform-verified request headers. On Vercel
 * the platform-populated `x-vercel-forwarded-for` is authoritative; plain
 * `x-forwarded-for` / `x-real-ip` are fallbacks for other hosts. Anything
 * else maps to a single shared bucket ('unknown') so unsourced traffic is
 * still rate limited instead of bypassing it.
 */
export function extractClientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

interface ConsumeRow {
  allowed?: boolean;
  retry_after?: number;
}

/**
 * Atomically consume one unit of a policy window for a subject. Throws
 * RateLimitBackendError when the counter backend cannot answer; callers map
 * that to `unavailable` and never treat it as "allowed".
 */
export async function consumeRateLimit(
  policyKey: RateLimitPolicyKey,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitOutcome> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/fractalpark_rate_limit_consume`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_policy_key: policyKey,
        p_subject_hash: hashRateLimitSubject(subject),
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    });
  } catch {
    throw new RateLimitBackendError('rate-limit backend unreachable');
  }
  if (!res.ok) {
    throw new RateLimitBackendError(`rate-limit backend rejected the consume: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as ConsumeRow[];
  const row = rows[0];
  if (typeof row?.allowed !== 'boolean' || typeof row.retry_after !== 'number') {
    throw new RateLimitBackendError('rate-limit backend returned a malformed result');
  }
  return { allowed: row.allowed, retryAfter: row.retry_after };
}
