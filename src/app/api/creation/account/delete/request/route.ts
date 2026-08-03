/**
 * POST /api/creation/account/delete/request
 *
 * Step 1 of account deletion (spec section 10.2): send a fresh step-up OTP
 * to the account email. Session required; the address is resolved
 * server-side, never taken from the client. Refused while a deletion is
 * already locked.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  emptyOk,
  jsonError,
  toErrorResponse,
} from '@/lib/cloud/api';
import { AccountDeletionError, requestDeletionOtp } from '@/lib/cloud/account-deletion';
import { resolveRequestSession } from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session } = await resolveRequestSession(request);
    if (!session) throw new CloudApiError('unauthenticated');

    await requestDeletionOtp(session.userId);
    return emptyOk();
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return jsonError(request, error.code === 'unavailable' ? 'unavailable' : error.code);
    }
    return toErrorResponse(request, error);
  }
}
