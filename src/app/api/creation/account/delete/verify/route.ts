/**
 * POST /api/creation/account/delete/verify
 *
 * Step 2: verify the fresh OTP (proof of mailbox control) and issue the
 * single-use delete_account proof (10-minute window). The verified provider
 * session is discarded — no new app session is created.
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
import { AccountDeletionError, verifyDeletionStepUp } from '@/lib/cloud/account-deletion';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import { AuthProviderError } from '@/lib/cloud/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session } = await resolveRequestSession(request);
    if (!session) throw new CloudApiError('unauthenticated');

    const body = await readJsonBody(request);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) throw new CloudApiError('validation_failed');

    const proof = await verifyDeletionStepUp(session.userId, code);
    return jsonOk(request, proof, 200);
  } catch (error) {
    if (error instanceof AuthProviderError) {
      return jsonError(request, 'otp_invalid');
    }
    if (error instanceof AccountDeletionError) {
      return jsonError(request, error.code === 'unavailable' ? 'unavailable' : error.code);
    }
    return toErrorResponse(request, error);
  }
}
