/**
 * POST /api/creation/auth/otp/verify
 *
 * Contract: docs/specs/web-creation-loop-v1.md §3/§5 and ADR 0005. A valid
 * six-digit code is exchanged server-side for provider tokens, which are
 * sealed into the HttpOnly `fp_creation_session` cookie. Wrong or expired
 * codes answer the generic `otp_invalid` without revealing registration
 * state or provider detail.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import { sealSessionCookieHeader } from '@/lib/cloud/request-session';
import { AuthProviderError, verifyEmailOtp } from '@/lib/cloud/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const OTP_PATTERN = /^\d{6}$/;

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!EMAIL_PATTERN.test(email) || !OTP_PATTERN.test(token)) {
      throw new CloudApiError('validation_failed');
    }

    let session;
    try {
      session = await verifyEmailOtp(email, token);
    } catch (error) {
      if (error instanceof AuthProviderError && error.status >= 400 && error.status < 500) {
        throw new CloudApiError('otp_invalid');
      }
      throw new CloudApiError('unavailable');
    }

    const headers = new Headers({ 'set-cookie': sealSessionCookieHeader(request, session) });
    return jsonOk(request, { user: { id: session.userId } }, 200, headers);
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
