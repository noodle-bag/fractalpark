/**
 * GET    /api/creation/drafts/[draftId] — owner read (full envelope).
 * PATCH  /api/creation/drafts/[draftId] — optimistic-concurrency save.
 * DELETE /api/creation/drafts/[draftId] — permanent delete.
 *
 * Spec sections 4.2, 5, 6, 7: owner-only with uniform not_found; PATCH
 * carries the client's expectedRevision and never overwrites a mismatch;
 * the draft save cooldown (1 per draft per 5 seconds) is consumed before
 * the write; deletion registers the thumbnail cleanup inside the RPC
 * transaction.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  deleteDraft,
  deleteDraftThumbnailObject,
  getDraft,
  storeDraftThumbnail,
  toDraftApiError,
  updateDraft,
} from '@/lib/cloud/drafts';
import { consumeRateLimit } from '@/lib/cloud/rate-limit';
import { runArtworkBackup } from '@/lib/cloud/backup';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import {
  draftRequestHash,
  parseDraftWriteBody,
  requireIdempotencyKey,
  requireUuid,
  sha256Hex,
} from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ draftId: string }> };

function rotationHeaders(rotatedSetCookie?: string): Headers | undefined {
  if (!rotatedSetCookie) return undefined;
  const headers = new Headers();
  headers.append('set-cookie', rotatedSetCookie);
  return headers;
}

function wrapError(request: Request, error: unknown): Response {
  return toErrorResponse(request, error instanceof CloudApiError ? error : toDraftApiError(error));
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    const { draftId } = await context.params;
    requireUuid(draftId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const draft = await getDraft(session.userId, draftId);
    return jsonOk(request, { draft }, 200, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    return wrapError(request, error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { draftId } = await context.params;
    requireUuid(draftId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);

    const cooldown = await consumeRateLimit('draft_save_5s', `draft:${draftId}`, 1, 5);
    if (!cooldown.allowed) {
      throw new CloudApiError('rate_limited', cooldown.retryAfter);
    }

    // The update RPC enforces ownership and revision inside the transaction;
    // this read resolves the keep-thumbnail case and returns a uniform
    // not_found before any side effect.
    const current = await getDraft(session.userId, draftId);
    const input = await parseDraftWriteBody(request, { requireExpectedRevision: true });
    const expectedRevision = input.expectedRevision as number;

    let thumbnailPath: string | null;
    let thumbnailBytes: number;
    if (input.thumbnail.kind === 'set') {
      const stored = await storeDraftThumbnail({
        ownerId: session.userId,
        draftId,
        base64: input.thumbnail.base64,
      });
      thumbnailPath = stored.path;
      thumbnailBytes = stored.bytes;
    } else if (input.thumbnail.kind === 'clear') {
      thumbnailPath = null;
      thumbnailBytes = 0;
    } else {
      thumbnailPath = current.thumbnailPath;
      thumbnailBytes = current.thumbnailBytes;
    }

    const requestHash = draftRequestHash({
      operation: 'save_draft',
      mode: 'update',
      draftId,
      expectedRevision,
      envelope: input.canonicalEnvelope,
      thumbnail:
        input.thumbnail.kind === 'set' ? sha256Hex(input.thumbnail.base64) : input.thumbnail.kind,
    });

    try {
      const result = await updateDraft({
        ownerId: session.userId,
        draftId,
        idempotencyKey,
        requestHash,
        expectedRevision,
        title: input.title,
        canonicalEnvelope: input.canonicalEnvelope,
        thumbnailPath,
        configBytes: input.configBytes,
        thumbnailBytes,
      });
      // Backup email fires only on a fresh write, never on a replay.
      const backupEmailStatus = result.replayed
        ? 'not_requested'
        : await runArtworkBackup({
            ownerId: session.userId,
            idempotencyKey,
            trigger: 'save',
            title: input.title,
            revision: result.revision,
            envelope: input.canonicalEnvelope,
            siteUrl: new URL(request.url).origin,
          });
      return jsonOk(
        request,
        { draftId: result.draftId, revision: result.revision, envelope: result.envelope, backupEmailStatus },
        200,
        rotationHeaders(rotatedSetCookie),
      );
    } catch (error) {
      if (input.thumbnail.kind === 'set' && thumbnailPath) {
        await deleteDraftThumbnailObject(thumbnailPath);
      }
      throw error;
    }
  } catch (error) {
    return wrapError(request, error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { draftId } = await context.params;
    requireUuid(draftId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);

    const requestHash = draftRequestHash({ operation: 'delete_draft', draftId });
    await deleteDraft({ ownerId: session.userId, draftId, idempotencyKey, requestHash });

    const headers = rotationHeaders(rotatedSetCookie) ?? new Headers();
    headers.set('cache-control', 'private, no-store');
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return wrapError(request, error);
  }
}
