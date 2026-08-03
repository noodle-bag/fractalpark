/**
 * GET    /api/creation/custom-formulas/[formulaId] — owner formula detail.
 * PATCH  /api/creation/custom-formulas/[formulaId] — update (revision-checked).
 * DELETE /api/creation/custom-formulas/[formulaId] — delete.
 *
 * Spec §17.1: the update RPC enforces ownership and revision inside the
 * transaction; this route resolves a uniform not_found before any side
 * effect and applies the 5-second per-formula save cooldown.
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  emptyOk,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  deleteCustomFormula,
  getCustomFormula,
  saveCustomFormula,
  toCustomFormulaApiError,
} from '@/lib/cloud/custom-formulas';
import { consumeRateLimit } from '@/lib/cloud/rate-limit';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import {
  assertFormulaCompiles,
  formulaRequestHash,
  newFormulaRuntimeId,
  parseFormulaWriteBody,
  requireIdempotencyKey,
  requireUuid,
} from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ formulaId: string }>;
}

function rotationHeaders(rotatedSetCookie?: string): Headers | undefined {
  if (!rotatedSetCookie) return undefined;
  const headers = new Headers();
  headers.append('set-cookie', rotatedSetCookie);
  return headers;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    const { formulaId } = await context.params;
    requireUuid(formulaId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const formula = await getCustomFormula(session.userId, formulaId);
    return jsonOk(request, { formula }, 200, rotationHeaders(rotatedSetCookie));
  } catch (error) {
    return toErrorResponse(request, error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { formulaId } = await context.params;
    requireUuid(formulaId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);

    const cooldown = await consumeRateLimit('custom_formula_save_5s', `custom-formula:${formulaId}`, 1, 5);
    if (!cooldown.allowed) {
      throw new CloudApiError('rate_limited', cooldown.retryAfter);
    }

    // Uniform not_found before any side effect; the RPC re-checks ownership
    // and revision atomically.
    await getCustomFormula(session.userId, formulaId);
    const input = await parseFormulaWriteBody(request, { requireExpectedRevision: true });
    assertFormulaCompiles(newFormulaRuntimeId(formulaId), input.source);

    const requestHash = formulaRequestHash({
      operation: 'save_custom_formula',
      mode: 'update',
      formulaId,
      expectedRevision: input.expectedRevision,
      name: input.name,
      source: input.source,
      experienceHint: input.experienceHint,
    });

    try {
      const result = await saveCustomFormula({
        ownerId: session.userId,
        formulaId,
        expectedRevision: input.expectedRevision,
        idempotencyKey,
        requestHash,
        name: input.name,
        source: input.source,
        experienceHint: input.experienceHint,
      });
      return jsonOk(
        request,
        { formulaId: result.formulaId, revision: result.revision },
        200,
        rotationHeaders(rotatedSetCookie),
      );
    } catch (error) {
      throw toCustomFormulaApiError(error);
    }
  } catch (error) {
    return toErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertCloudEnabled();
    assertSameOrigin(request);
    const { formulaId } = await context.params;
    requireUuid(formulaId);
    const { session, rotatedSetCookie } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);

    let expectedRevision: number | null = null;
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 0) {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        throw new CloudApiError('validation_failed');
      }
      const value = body?.expectedRevision;
      if (value !== undefined && value !== null) {
        if (!Number.isInteger(value) || (value as number) < 1) {
          throw new CloudApiError('validation_failed');
        }
        expectedRevision = value as number;
      }
    }

    const requestHash = formulaRequestHash({
      operation: 'delete_custom_formula',
      formulaId,
      expectedRevision,
    });

    try {
      await deleteCustomFormula({
        ownerId: session.userId,
        formulaId,
        expectedRevision,
        idempotencyKey,
        requestHash,
      });
      return emptyOk(rotationHeaders(rotatedSetCookie));
    } catch (error) {
      throw toCustomFormulaApiError(error);
    }
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
