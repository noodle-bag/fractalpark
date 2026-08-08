/**
 * GET  /api/creation/custom-formulas — owner formula list (summary DTO, no sources).
 * POST /api/creation/custom-formulas — create a formula.
 *
 * Spec §17.1: owner-only; writes require the Idempotency-Key header; the
 * quota (50) is enforced atomically in the owner RPC; compile and
 * builtin-conflict validation run here before any write.
 */

import { randomUUID } from 'node:crypto';

import {
  assertCloudEnabled,
  assertSameOrigin,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  listCustomFormulas,
  saveCustomFormula,
  toCustomFormulaApiError,
} from '@/lib/cloud/custom-formulas';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import {
  assertFormulaCompiles,
  formulaRequestHash,
  newFormulaRuntimeId,
  parseFormulaWriteBody,
  requireIdempotencyKey,
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
    const formulas = await listCustomFormulas(session.userId);
    return jsonOk(request, { formulas }, 200, rotationHeaders(rotatedSetCookie));
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
    const input = await parseFormulaWriteBody(request);

    const formulaId = randomUUID();
    assertFormulaCompiles(newFormulaRuntimeId(formulaId), input.source);

    const requestHash = formulaRequestHash({
      operation: 'save_custom_formula',
      mode: 'create',
      name: input.name,
      source: input.source,
      experienceHint: input.experienceHint,
    });

    try {
      const result = await saveCustomFormula({
        ownerId: session.userId,
        formulaId,
        expectedRevision: null,
        idempotencyKey,
        requestHash,
        name: input.name,
        source: input.source,
        experienceHint: input.experienceHint,
      });
      return jsonOk(
        request,
        { formulaId: result.formulaId, revision: result.revision },
        result.replayed ? 200 : 201,
        rotationHeaders(rotatedSetCookie),
      );
    } catch (error) {
      throw toCustomFormulaApiError(error);
    }
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
