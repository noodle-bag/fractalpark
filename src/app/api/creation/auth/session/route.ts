/**
 * GET /api/creation/auth/session
 *
 * Contract: docs/adr/0005-same-origin-cloud-session.md. Private probe used
 * by the integration verification (and later the product UI) to read the
 * safe session state. Re-verifies the sealed cookie, the token expiry and
 * the feature switch on every call; near expiry the server refreshes the
 * provider session and rotates the cookie atomically. Tampered, expired or
 * revoked sessions answer `unauthenticated` and clear the cookie. Never
 * returns tokens — only the stable user id and expiry metadata.
 */

import { assertCloudEnabled, CloudApiError, jsonOk, toErrorResponse } from '@/lib/cloud/api';
import {
  clearSessionCookieHeader,
  readSessionCookie,
  resolveRequestSession,
} from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
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
