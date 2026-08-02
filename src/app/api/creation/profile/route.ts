/**
 * GET   /api/creation/profile — own minimal profile (display name).
 * PATCH /api/creation/profile — set the display name (1–40 plain-text
 *         characters; required once before the first publish, spec §3).
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import { DraftServiceError } from '@/lib/cloud/drafts';
import { getProfile, setDisplayName } from '@/lib/cloud/publications';
import { resolveRequestSession } from '@/lib/cloud/request-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rotationHeaders(rotatedSetCookie?: string): Headers | undefined {
  if (!rotatedSetCookie) return undefined;
  const headers = new Headers();
  headers.append('set-cookie', rotatedSetCookie);
  return headers;
}

function toApiError(error: unknown): CloudApiError {
  if (error instanceof DraftServiceError && error.code === 'validation_failed') {
    return new CloudApiError('validation_failed');
  }
  return new CloudApiError('unavailable');
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const profile = await getProfile(session.userId);
    return jsonOk(request, profile, 200, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    return toErrorResponse(request, error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const body: unknown = await readJsonBody(request);
    const displayName =
      typeof (body as { displayName?: unknown })?.displayName === 'string'
        ? (body as { displayName: string }).displayName
        : null;
    if (displayName === null) throw new CloudApiError('validation_failed');
    const profile = await setDisplayName(session.userId, displayName);
    return jsonOk(request, profile, 200, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    if (error instanceof DraftServiceError) return toErrorResponse(request, toApiError(error));
    return toErrorResponse(request, error);
  }
}
