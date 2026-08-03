/**
 * POST /api/creation/account/delete
 *
 * Step 3: explicit second confirmation. The client sends the step-up proof
 * id and the account email typed out; the server re-checks the address
 * against the auth record (never trusting the client), runs the confirm
 * transaction (lock + private-fact deletion + publication withdrawal +
 * cleanup jobs), revokes every session at the provider, and clears the
 * local cookie. The Idempotency-Key header is required by the write
 * contract; the confirm RPC itself is idempotent per operation.
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
import { AccountDeletionError, confirmAccountDeletion } from '@/lib/cloud/account-deletion';
import { clearSessionCookieHeader, resolveRequestSession } from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session } = await resolveRequestSession(request);
    if (!session) throw new CloudApiError('unauthenticated');

    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    if (!UUID_PATTERN.test(idempotencyKey)) throw new CloudApiError('validation_failed');

    const body = await readJsonBody(request);
    const operationId = typeof body.operationId === 'string' ? body.operationId : '';
    const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail : '';
    if (!UUID_PATTERN.test(operationId) || confirmEmail.trim() === '') {
      throw new CloudApiError('validation_failed');
    }

    const result = await confirmAccountDeletion(session.userId, operationId, confirmEmail);

    // Every session is already revoked at the provider; drop the local one.
    const headers = new Headers({ 'set-cookie': clearSessionCookieHeader(request) });
    return jsonOk(request, result, 200, headers);
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return jsonError(request, error.code === 'unavailable' ? 'unavailable' : error.code);
    }
    return toErrorResponse(request, error);
  }
}
