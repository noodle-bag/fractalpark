/**
 * POST /api/creation/auth/logout
 *
 * Contract: docs/adr/0005-same-origin-cloud-session.md — logout revokes the
 * provider session first and then clears the cookie. It is idempotent: a
 * missing, malformed, or expired cookie still answers 204 with a clearing
 * Set-Cookie, because the local cookie drop is the security boundary and an
 * already-gone session is the desired end state.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  emptyOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  clearSessionCookieHeader,
  readSessionCookie,
} from '@/lib/cloud/request-session';
import { unsealSession, SessionSealError } from '@/lib/cloud/session';
import { revokeProviderSession } from '@/lib/cloud/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);

    const raw = readSessionCookie(request);
    if (raw) {
      try {
        const session = unsealSession(raw);
        await revokeProviderSession(session.accessToken);
      } catch (error) {
        if (!(error instanceof SessionSealError)) {
          throw error;
        }
        // Malformed/tampered cookie: nothing worth revoking; still clear.
      }
    }

    const headers = new Headers({ 'set-cookie': clearSessionCookieHeader(request) });
    return emptyOk(headers);
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
