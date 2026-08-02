/**
 * GET /api/creation/publications — the owner's publication list for
 * My Works → Published (summary DTO; lifecycle states included).
 */

import {
  assertCloudEnabled,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import { listPublications } from '@/lib/cloud/publications';
import { resolveRequestSession } from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const publications = await listPublications(session.userId);
    const headers = rotatedSetCookie ? new Headers({ 'set-cookie': rotatedSetCookie }) : undefined;
    return jsonOk(request, { publications }, 200, headers);
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
