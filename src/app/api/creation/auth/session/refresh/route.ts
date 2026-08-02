/**
 * POST /api/creation/auth/session/refresh
 *
 * Contract: docs/specs/web-creation-loop-v1.md §5 and ADR 0005. Explicit
 * server-side refresh: verifies the sealed cookie, exchanges the refresh
 * token for a new pair at the provider, and rotates the cookie atomically.
 * The provider invalidates the old refresh token in the same exchange, so
 * the pre-rotation cookie cannot be replayed.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  clearSessionCookieHeader,
  readSessionCookie,
  resolveRequestSession,
} from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session, rotatedSetCookie } = await resolveRequestSession(request, { forceRefresh: true });
    const headers = new Headers();
    if (rotatedSetCookie) {
      headers.append('set-cookie', rotatedSetCookie);
    }
    return jsonOk(
      request,
      { user: { id: session.userId }, accessTokenExpiresAt: session.accessTokenExpiresAt },
      200,
      headers,
    );
  } catch (error) {
    const response = toErrorResponse(request, error);
    if (error instanceof CloudApiError && error.code === 'unauthenticated' && readSessionCookie(request)) {
      response.headers.append('set-cookie', clearSessionCookieHeader(request));
    }
    return response;
  }
}
