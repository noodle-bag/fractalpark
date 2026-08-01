/**
 * POST /api/creation/auth/otp/request
 *
 * Contract: docs/specs/web-creation-loop-v1.md §5/§7 and ADR 0005.
 * FractalPark's email/IP HMAC counters are consumed BEFORE the identity
 * provider is called; the provider's own limits remain a second boundary.
 * The response is generic and never reveals whether the email is registered.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import { consumeRateLimit, extractClientIp } from '@/lib/cloud/rate-limit';
import { AuthProviderError, requestEmailOtp } from '@/lib/cloud/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email)) {
      throw new CloudApiError('validation_failed');
    }

    const ip = extractClientIp(request.headers);
    const ipWindow = await consumeRateLimit('otp_ip_hour', `ip:${ip}`, 20, 3600);
    if (!ipWindow.allowed) {
      throw new CloudApiError('rate_limited', ipWindow.retryAfter);
    }
    const minute = await consumeRateLimit('otp_email_minute', `email:${email}`, 1, 60);
    if (!minute.allowed) {
      throw new CloudApiError('rate_limited', minute.retryAfter);
    }
    const hour = await consumeRateLimit('otp_email_hour', `email:${email}`, 5, 3600);
    if (!hour.allowed) {
      throw new CloudApiError('rate_limited', hour.retryAfter);
    }

    await requestEmailOtp(email);
    return jsonOk(request, { ok: true });
  } catch (error) {
    if (error instanceof AuthProviderError && error.status === 429) {
      return jsonError(request, 'rate_limited');
    }
    return toErrorResponse(request, error);
  }
}
