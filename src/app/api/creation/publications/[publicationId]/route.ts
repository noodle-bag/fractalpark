/**
 * GET /api/creation/publications/[publicationId] — anonymous, no-store
 * published detail with the canonical envelope (the remix input, spec
 * sections 5, 13). Hidden, withdrawn, and nonexistent works all answer the
 * same not_found.
 */

import {
  assertCloudEnabled,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import { getCommunityPublication } from '@/lib/cloud/community';
import { DraftServiceError } from '@/lib/cloud/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
): Promise<Response> {
  try {
    assertCloudEnabled();
    const { publicationId } = await context.params;
    const publication = await getCommunityPublication(publicationId);
    return jsonOk(request, publication, 200);
  } catch (error) {
    if (error instanceof DraftServiceError && error.code === 'not_found') {
      return toErrorResponse(request, new CloudApiError('not_found'));
    }
    return toErrorResponse(request, error);
  }
}
