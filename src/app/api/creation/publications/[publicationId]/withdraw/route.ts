/**
 * POST /api/creation/publications/[publicationId]/withdraw — permanent
 * owner withdrawal (spec §4.3, §10.2). One transaction marks the work
 * withdrawn, clears the public envelope/description, keeps the minimal
 * tombstone, and registers the public-thumbnail cleanup job. Public reads
 * and new remixes stop immediately; storage cleanup is asynchronous.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import { DraftServiceError } from '@/lib/cloud/drafts';
import { withdrawPublication } from '@/lib/cloud/publications';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import {
  requireIdempotencyKey,
  requireUuid,
} from '@/app/api/creation/drafts/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toApiError(error: unknown): CloudApiError {
  if (error instanceof DraftServiceError) {
    switch (error.code) {
      case 'not_found':
      case 'idempotency_conflict':
      case 'account_deleting':
        return new CloudApiError(error.code as 'not_found');
      default:
        return new CloudApiError('unavailable');
    }
  }
  return new CloudApiError('unavailable');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const { publicationId: rawPublicationId } = await context.params;
    const publicationId = requireUuid(rawPublicationId);
    const idempotencyKey = requireIdempotencyKey(request);

    const result = await withdrawPublication(session.userId, publicationId, idempotencyKey);
    const headers = rotatedSetCookie ? new Headers({ 'set-cookie': rotatedSetCookie }) : undefined;
    return jsonOk(request, result, 200, headers);
  } catch (error) {
    if (error instanceof DraftServiceError) return toErrorResponse(request, toApiError(error));
    return toErrorResponse(request, error);
  }
}
