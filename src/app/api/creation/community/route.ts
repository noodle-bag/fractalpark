/**
 * GET /api/creation/community — anonymous, no-store, stable-cursor list of
 * published works (spec sections 5.1, 13). Page size defaults to 24 and is
 * hard-capped at 50; an invalid cursor answers validation_failed.
 */

import {
  assertCloudEnabled,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  COMMUNITY_DEFAULT_PAGE,
  COMMUNITY_MAX_PAGE,
  listCommunity,
} from '@/lib/cloud/community';
import { DraftServiceError } from '@/lib/cloud/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : COMMUNITY_DEFAULT_PAGE;
    if (!Number.isFinite(limit) || limit < 1 || limit > COMMUNITY_MAX_PAGE) {
      throw new CloudApiError('validation_failed');
    }
    const page = await listCommunity(cursor, limit);
    // jsonOk already answers `cache-control: private, no-store`, which
    // satisfies and exceeds the v0.4.15 community no-store contract.
    return jsonOk(request, page, 200);
  } catch (error) {
    if (error instanceof DraftServiceError && error.code === 'validation_failed') {
      return toErrorResponse(request, new CloudApiError('validation_failed'));
    }
    return toErrorResponse(request, error);
  }
}
