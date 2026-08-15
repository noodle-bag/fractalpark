import {
  assertCloudEnabled,
  assertSameOrigin,
  CloudApiError,
  jsonOk,
  readJsonBody,
  toErrorResponse,
} from "@/lib/cloud/api";
import {
  CustomFormulaServiceError,
  toCustomFormulaApiError,
} from "@/lib/cloud/custom-formulas";
import {
  MINE_FORMULA_LIFECYCLE_BODY_LIMIT_BYTES,
  saveMineFormulaLifecycle,
  type MineFormulaLifecycleRevisionInput,
} from "@/lib/cloud/mine-formula-lifecycle";
import { resolveRequestSession } from "@/lib/cloud/request-session";
import {
  formulaRequestHash,
  requireIdempotencyKey,
  requireUuid,
} from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gated Mine lifecycle writer. This route is intentionally unreachable by
 * default; reader and legacy writer paths remain authoritative until a separate
 * explicit activation changes this flag.
 */
function assertLifecycleWriterEnabled(): void {
  if (
    process.env.FRACTALPARK_MINE_FORMULA_LIFECYCLE_WRITER_ENABLED !== "true"
  ) {
    throw new CloudApiError("cloud_disabled");
  }
}

function asLifecycle(value: unknown): MineFormulaLifecycleRevisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CloudApiError("validation_failed");
  }
  const body = value as Record<string, unknown>;
  const lifecycle = body.lifecycle;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    throw new CloudApiError("validation_failed");
  }
  const candidate = lifecycle as Record<string, unknown>;
  if (
    !candidate.definition ||
    typeof candidate.definition !== "object" ||
    Array.isArray(candidate.definition) ||
    !candidate.profile ||
    typeof candidate.profile !== "object" ||
    Array.isArray(candidate.profile)
  ) {
    throw new CloudApiError("validation_failed");
  }
  return lifecycle as MineFormulaLifecycleRevisionInput;
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    assertLifecycleWriterEnabled();
    assertSameOrigin(request);
    const { session } = await resolveRequestSession(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await readJsonBody(
      request,
      MINE_FORMULA_LIFECYCLE_BODY_LIMIT_BYTES,
    );
    const record = body as Record<string, unknown> | null;
    if (
      typeof record?.formulaId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.formulaId,
      )
    ) {
      throw new CloudApiError("validation_failed");
    }
    const formulaId = requireUuid(record.formulaId);
    const lifecycle = asLifecycle(body);
    if (
      lifecycle.definition.formulaId !== formulaId ||
      lifecycle.profile.formulaId !== formulaId
    ) {
      throw new CloudApiError("validation_failed");
    }
    const requestHash = formulaRequestHash({
      operation: "mine_formula_lifecycle_save",
      formulaId,
      lifecycle,
    });
    const result = await saveMineFormulaLifecycle({
      ownerId: session.userId,
      formulaId,
      idempotencyKey,
      requestHash,
      lifecycle,
    });
    return jsonOk(request, result, result.replayed ? 200 : 201);
  } catch (error) {
    return toErrorResponse(
      request,
      error instanceof CustomFormulaServiceError
        ? toCustomFormulaApiError(error)
        : error,
    );
  }
}
