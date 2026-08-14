/**
 * POST /api/creation/custom-formulas/[formulaId]/semantics — explicit FRM
 * semantics-version change (v0.4.18 slice 2, commit 6: Upgrade & Compare).
 *
 * Two reversible actions, both revision-checked and idempotency-keyed like
 * the ordinary update:
 *
 *   upgradeSemantics — v1 (legacy) → v2 (strict): saveCustomFormula is
 *     called with an explicit frmSemanticsVersion of 2.
 *   revertSemantics  — v2 (strict) → v1 (legacy): saveCustomFormula is
 *     called with an explicit frmSemanticsVersion of 1.
 *
 * The exact stored source is compiled under the target contract before the
 * metadata write. Ordinary saves (PATCH) inherit the stored version and
 * therefore never auto-upgrade.
 * The pre-read enforces ownership (uniform not_found) and the action
 * direction; the RPC re-checks ownership and revision atomically.
 *
 */

import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from '@/lib/cloud/api';
import {
  getCustomFormula,
  saveCustomFormula,
  toCustomFormulaApiError,
  type CustomFormulaDetailDto,
} from '@/lib/cloud/custom-formulas';
import { consumeRateLimit } from '@/lib/cloud/rate-limit';
import { resolveRequestSession } from '@/lib/cloud/request-session';
import type { FrmSemanticsVersion } from '@/engine/frm/semantics-version';
import {
  assertFormulaCompiles,
  formulaRequestHash,
  newFormulaRuntimeId,
  requireIdempotencyKey,
  requireUuid,
} from '../../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type FormulaSemanticsAction = 'upgradeSemantics' | 'revertSemantics';

interface RouteContext {
  params: Promise<{ formulaId: string }>;
}

/** Action → target version contract: upgrade is v1→v2, revert is v2→v1. */
const ACTION_TARGET_VERSION: Record<FormulaSemanticsAction, FrmSemanticsVersion> = {
  upgradeSemantics: 2,
  revertSemantics: 1,
};

function rotationHeaders(rotatedSetCookie?: string): Headers | undefined {
  if (!rotatedSetCookie) return undefined;
  const headers = new Headers();
  headers.append('set-cookie', rotatedSetCookie);
  return headers;
}

function parseSemanticsBody(body: Record<string, unknown>): {
  action: FormulaSemanticsAction;
  expectedRevision: number;
} {
  const action = body.action;
  if (action !== 'upgradeSemantics' && action !== 'revertSemantics') {
    throw new CloudApiError('validation_failed');
  }
  const expectedRevision = body.expectedRevision;
  if (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 1) {
    throw new CloudApiError('validation_failed');
  }
  return { action, expectedRevision: expectedRevision as number };
}

/** The action must move the stored version in its declared direction. */
function isDirectionSatisfied(
  action: FormulaSemanticsAction,
  formula: CustomFormulaDetailDto,
): boolean {
  const current = formula.frmSemanticsVersion ?? 1;
  return current === ACTION_TARGET_VERSION[action];
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
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

    const rawBody = await readJsonBody(request);
    if (!rawBody || typeof rawBody !== 'object') {
      throw new CloudApiError('validation_failed');
    }
    const { action, expectedRevision } = parseSemanticsBody(
      rawBody as Record<string, unknown>,
    );
    const targetVersion = ACTION_TARGET_VERSION[action];

    // Uniform not_found (ownership) before any side effect; the RPC
    // re-checks ownership and revision atomically. The pre-read error must
    // be mapped here — toErrorResponse does not know service errors.
    let formula: CustomFormulaDetailDto;
    try {
      formula = await getCustomFormula(session.userId, formulaId);
    } catch (error) {
      throw toCustomFormulaApiError(error);
    }

    // Validate the target even for an idempotent post-condition. Early
    // v0.4.18 candidates could persist v2 after a v1-only validation; an
    // `unchanged` response must not bless that inconsistent record.
    assertFormulaCompiles(
      newFormulaRuntimeId(formulaId),
      formula.source,
      targetVersion,
    );

    // A no-write post-condition is safe only when the caller's revision is
    // still current. A stale tab must enter the RPC gate: the original key
    // can replay, while a fresh key receives revision_conflict instead of
    // blessing and re-registering stale source bytes.
    if (
      isDirectionSatisfied(action, formula) &&
      formula.revision === expectedRevision
    ) {
      return jsonOk(
        request,
        {
          formulaId,
          revision: formula.revision,
          frmSemanticsVersion: targetVersion,
          unchanged: true,
        },
        200,
        rotationHeaders(rotatedSetCookie),
      );
    }

    const requestHash = formulaRequestHash({
      operation: 'change_formula_semantics',
      formulaId,
      action,
      expectedRevision,
      targetVersion,
    });

    try {
      const result = await saveCustomFormula({
        ownerId: session.userId,
        formulaId,
        expectedRevision,
        idempotencyKey,
        requestHash,
        name: formula.name,
        source: formula.source,
        experienceHint: formula.experienceHint,
        frmSemanticsVersion: targetVersion,
      });
      return jsonOk(
        request,
        {
          formulaId: result.formulaId,
          revision: result.revision,
          frmSemanticsVersion: targetVersion,
        },
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
