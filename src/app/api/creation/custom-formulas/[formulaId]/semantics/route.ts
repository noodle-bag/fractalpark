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
 * The source is not recompiled here (the save RPC is a metadata-only
 * version bump through the same optimistic-lock transaction). Ordinary
 * saves (PATCH) never pass a version and therefore never auto-upgrade.
 * The pre-read enforces ownership (uniform not_found) and the action
 * direction; the RPC re-checks ownership and revision atomically.
 *
 * Note: at the mechanism layer v1 and v2 compile identically today — the
 * strict-v2 semantic differences land in a later Slice. This endpoint
 * changes the persisted contract version only.
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
  formulaRequestHash,
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
function assertDirection(
  action: FormulaSemanticsAction,
  formula: CustomFormulaDetailDto,
): void {
  const current = formula.frmSemanticsVersion ?? 1;
  const target = ACTION_TARGET_VERSION[action];
  if (current === target) {
    throw new CloudApiError('validation_failed');
  }
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
    // re-checks ownership and revision atomically.
    const formula = await getCustomFormula(session.userId, formulaId);
    assertDirection(action, formula);

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
