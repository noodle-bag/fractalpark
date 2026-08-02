/**
 * POST /api/creation/drafts/[draftId]/publish — create an immutable
 * publication from a stated draft revision (spec §4.3, §10.2).
 *
 * The server re-reads the draft, re-validates its envelope against the
 * cloud profile (rejecting portable formula source as
 * `formula_assets_not_publishable`), canonicalizes it, and hands the whole
 * write to a single-transaction owner RPC: idempotency, display-name
 * requirement, revision check, publish quota, publication insert, source
 * draft deletion, and thumbnail cleanup job all commit or fail together.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import { DraftServiceError, getDraft } from '@/lib/cloud/drafts';
import { validateCloudEnvelopeV1 } from '@/lib/cloud/envelope';
import { findPublishReplay, publishDraft } from '@/lib/cloud/publications';
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
  if (error instanceof DraftServiceError) {
    switch (error.code) {
      case 'not_found':
      case 'validation_failed':
      case 'idempotency_conflict':
      case 'revision_conflict':
        return new CloudApiError(error.code as 'not_found');
      case 'rate_limited':
        return new CloudApiError('rate_limited', error.retryAfter);
      default:
        return new CloudApiError('unavailable');
    }
  }
  return new CloudApiError('unavailable');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const { draftId } = await context.params;

    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) throw new CloudApiError('validation_failed');

    const body: unknown = await readJsonBody(request);
    const parsed = body as {
      expectedRevision?: unknown;
      title?: unknown;
      description?: unknown;
      attestationVersion?: unknown;
    };
    if (
      typeof parsed?.expectedRevision !== 'number' ||
      !Number.isInteger(parsed.expectedRevision) ||
      parsed.expectedRevision < 1 ||
      typeof parsed.title !== 'string' ||
      typeof parsed.description !== 'string' ||
      typeof parsed.attestationVersion !== 'string'
    ) {
      throw new CloudApiError('validation_failed');
    }

    // Re-validate the persisted draft envelope; the publication freezes the
    // server-canonical form, never the client-supplied bytes. A replayed
    // request arrives after the source draft was deleted — resolve it from
    // the recorded operation instead of failing with not_found.
    let draft;
    try {
      draft = await getDraft(session.userId, draftId);
    } catch (error) {
      if (error instanceof DraftServiceError && error.code === 'not_found') {
        const replay = await findPublishReplay(session.userId, idempotencyKey, {
          draftId,
          expectedRevision: parsed.expectedRevision,
          title: parsed.title,
          description: parsed.description,
          attestationVersion: parsed.attestationVersion,
        });
        if (replay) return jsonOk(request, replay, 201, rotationHeaders(rotatedSetCookie));
      }
      throw error;
    }
    const envelopeBytes = Buffer.byteLength(JSON.stringify(draft.envelope ?? null), 'utf8');
    const verdict = validateCloudEnvelopeV1(draft.envelope, envelopeBytes);
    if (!verdict.ok) throw new CloudApiError('invalid_envelope');
    if (verdict.value.hasPortableFormulas) {
      throw new CloudApiError('formula_assets_not_publishable');
    }

    const result = await publishDraft(session.userId, {
      draftId,
      expectedRevision: parsed.expectedRevision,
      title: parsed.title,
      description: parsed.description,
      canonicalEnvelope: JSON.parse(verdict.value.canonicalJson),
      configBytes: verdict.value.configBytes,
      attestationVersion: parsed.attestationVersion,
      idempotencyKey,
    });
    return jsonOk(request, result, 201, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    if (error instanceof DraftServiceError) return toErrorResponse(request, toApiError(error));
    return toErrorResponse(request, error);
  }
}
