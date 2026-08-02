/**
 * GET  /api/creation/drafts — owner draft list (summary DTO, no envelopes).
 * POST /api/creation/drafts — create a draft.
 *
 * Spec sections 4.2, 5, 6, 7: owner-only; writes require the Idempotency-Key
 * header; quotas are enforced atomically in the owner RPC; provenance
 * resolves only against server-verified sources. The draft ID is generated
 * here so a thumbnail can be stored under its final path inside the same
 * logical write; if the RPC rejects after the upload, the orphan object is
 * deleted best-effort.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  createDraft,
  deleteDraftThumbnailObject,
  listDrafts,
  storeDraftThumbnail,
  toDraftApiError,
} from '@/lib/cloud/drafts';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import {
  assertProvenanceResolves,
  draftRequestHash,
  newDraftId,
  parseDraftWriteBody,
  requireIdempotencyKey,
  sha256Hex,
} from './shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rotationHeaders(rotatedSetCookie?: string): Headers | undefined {
  if (!rotatedSetCookie) return undefined;
  const headers = new Headers();
  headers.append('set-cookie', rotatedSetCookie);
  return headers;
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const drafts = await listDrafts(session.userId);
    return jsonOk(request, { drafts }, 200, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    return toErrorResponse(request, error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = await parseDraftWriteBody(request);
    await assertProvenanceResolves(input.remixSource);

    const draftId = newDraftId();
    let thumbnailPath: string | null = null;
    let thumbnailBytes = 0;
    if (input.thumbnail.kind === 'set') {
      const stored = await storeDraftThumbnail({
        ownerId: session.userId,
        draftId,
        base64: input.thumbnail.base64,
      });
      thumbnailPath = stored.path;
      thumbnailBytes = stored.bytes;
    }

    const requestHash = draftRequestHash({
      operation: 'save_draft',
      mode: 'create',
      envelope: input.canonicalEnvelope,
      thumbnail: input.thumbnail.kind === 'set' ? sha256Hex(input.thumbnail.base64) : null,
      remixSource: input.remixSource,
    });

    try {
      const result = await createDraft({
        ownerId: session.userId,
        draftId,
        idempotencyKey,
        requestHash,
        title: input.title,
        canonicalEnvelope: input.canonicalEnvelope,
        thumbnailPath,
        configBytes: input.configBytes,
        thumbnailBytes,
        remixSourceType: input.remixSource?.type ?? null,
        remixSourceId: input.remixSource?.id ?? null,
      });
      const status = result.replayed ? 200 : 201;
      return jsonOk(
        request,
        { draftId: result.draftId, revision: result.revision, envelope: result.envelope },
        status,
        rotationHeaders(rotatedSetCookie),
      );
    } catch (error) {
      if (thumbnailPath) {
        await deleteDraftThumbnailObject(thumbnailPath);
      }
      throw error;
    }
  } catch (error) {
    return toErrorResponse(request, error instanceof CloudApiError ? error : toDraftApiError(error));
  }
}
