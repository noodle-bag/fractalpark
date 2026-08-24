import { isFormulaIdForScopeV1 } from "@/engine/formulas/v1/identity";
import {
  canonicalJsonV1,
  hashProfileRevisionV1,
  sha256HexV1,
} from "@/engine/formulas/v1/revisions";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
} from "@/engine/formulas/v1/safety-envelope";
import { validateFormulaProfileAssetV1 } from "@/engine/formulas/v1/assets";
import { compilePublishedFormulaPluginV1 } from "@/engine/formulas/v1/published-adapter";
import type {
  FormulaDefinitionV1,
  FormulaProfileV1,
  FormulaRevisionV1,
} from "@/engine/formulas/v1/types";
import { CustomFormulaServiceError } from "./custom-formulas";
import { getSupabaseConfig } from "./config";

export interface MineFormulaLifecycleRevisionInput {
  definition: Record<string, unknown>;
  profile: Record<string, unknown>;
  sourceRevision: string;
  profileRevision: string;
  runnable: boolean;
  diagnostics: readonly unknown[];
  supersedes?: string | null;
  importedFromFormulaId?: string | null;
  remixedFromFormulaId?: string | null;
  lineageSourceRevision?: string | null;
  lineageProfileRevision?: string | null;
}

export interface MineFormulaLifecycleResult {
  replayed: boolean;
  formulaId: string;
  revision: number;
  editableHeadRevisionId: string;
  activeRunnableRevisionId: string | null;
}

const SHA256 = /^[0-9a-f]{64}$/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_OR_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_SOURCE_BYTES = 65_536;
export const MINE_FORMULA_LIFECYCLE_BODY_LIMIT_BYTES = 512 * 1024;

function validationFailed(message: string): never {
  throw new CustomFormulaServiceError("validation_failed", message);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function clonePlainInput(
  input: MineFormulaLifecycleRevisionInput,
): MineFormulaLifecycleRevisionInput {
  try {
    const canonical = canonicalJsonV1(input);
    if (/"originalSource":|"original_source":/i.test(canonical)) {
      return validationFailed(
        "originalSource is never a Mine lifecycle payload",
      );
    }
    return JSON.parse(canonical) as MineFormulaLifecycleRevisionInput;
  } catch {
    return validationFailed("lifecycle payload must be finite plain JSON");
  }
}

function validateLineage(input: MineFormulaLifecycleRevisionInput): void {
  if (input.importedFromFormulaId && input.remixedFromFormulaId) {
    validationFailed("import and remix lineage are exclusive");
  }
  if (input.supersedes != null && !UUID_V4.test(input.supersedes)) {
    validationFailed("supersedes must be a revision UUIDv4");
  }
  const parentId = input.importedFromFormulaId ?? input.remixedFromFormulaId;
  if (parentId != null && !UUID_V4_OR_V5.test(parentId)) {
    validationFailed("lineage Formula ID must be UUIDv4 or UUIDv5");
  }
  const hasParent = parentId != null;
  const hasSource = input.lineageSourceRevision != null;
  const hasProfile = input.lineageProfileRevision != null;
  if (hasParent !== hasSource) {
    validationFailed("lineage Formula ID and source revision must be paired");
  }
  if (hasSource && !SHA256.test(input.lineageSourceRevision ?? "")) {
    validationFailed("lineage source revision must be exact");
  }
  if (hasProfile && !SHA256.test(input.lineageProfileRevision ?? "")) {
    validationFailed("lineage profile revision must be exact");
  }
}

async function validatedMineLifecycleInput(
  input: MineFormulaLifecycleRevisionInput,
): Promise<MineFormulaLifecycleRevisionInput> {
  const value = clonePlainInput(input);
  if (
    !SHA256.test(value.sourceRevision) ||
    !SHA256.test(value.profileRevision) ||
    !plainRecord(value.definition) ||
    !plainRecord(value.profile)
  ) {
    return validationFailed("exact Definition/Profile revisions are required");
  }
  if (
    value.definition.sourceRevision !== value.sourceRevision ||
    value.profile.sourceRevision !== value.sourceRevision ||
    value.profile.profileRevision !== value.profileRevision
  ) {
    return validationFailed(
      "revision fields must match Definition/Profile payloads",
    );
  }
  if (
    !Array.isArray(value.diagnostics) ||
    (value.runnable
      ? value.diagnostics.length !== 0
      : value.diagnostics.length === 0)
  ) {
    return validationFailed("runnable and diagnostics must agree");
  }
  if (
    value.definition.scope !== "mine" ||
    !isFormulaIdForScopeV1("mine", value.definition.formulaId) ||
    value.profile.formulaId !== value.definition.formulaId
  ) {
    return validationFailed(
      "owner Mine identity must match Definition and Profile",
    );
  }
  if (typeof value.definition.source !== "string") {
    return validationFailed("Definition source is required");
  }
  if (
    new TextEncoder().encode(value.definition.source).byteLength >
    MAX_SOURCE_BYTES
  ) {
    return validationFailed("Definition source exceeds 65,536 UTF-8 bytes");
  }
  if ((await sha256HexV1(value.definition.source)) !== value.sourceRevision) {
    return validationFailed("source revision does not match source bytes");
  }
  let computedProfileRevision: string;
  try {
    computedProfileRevision = await hashProfileRevisionV1(
      value.profile as unknown as Omit<FormulaProfileV1, "profileRevision">,
    );
  } catch {
    return validationFailed("Profile projection is invalid");
  }
  if (computedProfileRevision !== value.profileRevision) {
    return validationFailed(
      "profile revision does not match Profile projection",
    );
  }
  validateLineage(value);
  const definition = value.definition as unknown as FormulaDefinitionV1;
  const profile = await validateFormulaProfileAssetV1(
    value.profile,
    definition,
    value.profileRevision as FormulaRevisionV1,
  );
  if (!profile.ok) return validationFailed("Profile is invalid");
  if (value.runnable) {
    const safety = await validateFormulaSafetyEnvelopeV1(
      projectExecutableFormulaDefinitionV1(definition),
    );
    if (!safety.ok)
      return validationFailed("runnable Definition failed Safety Envelope");
    const compiled = await compilePublishedFormulaPluginV1({
      formulaId: definition.formulaId,
      displayName:
        typeof value.definition.name === "string"
          ? value.definition.name
          : "Mine Formula",
      family:
        typeof value.definition.family === "string"
          ? value.definition.family
          : "mine",
      sourceRevision: value.sourceRevision,
      semanticHash:
        typeof value.definition.semanticHash === "string"
          ? value.definition.semanticHash
          : "",
      source: value.definition.source,
    });
    if (!compiled.ok) {
      return validationFailed("runnable source did not parse and compile exactly");
    }
    const sourceParameters = compiled.value.descriptor.parameters.map(
      ({ slotName, type, default: defaultValue, hardDomain, classicBinding }) => ({
        name: slotName,
        type,
        default: defaultValue,
        ...(hardDomain ? { hardDomain } : {}),
        ...(classicBinding ? { classicBinding } : {}),
      }),
    );
    if (
      canonicalJsonV1(definition.parameters) !==
      canonicalJsonV1(sourceParameters)
    ) {
      return validationFailed(
        "runnable Definition parameters do not match source bytes",
      );
    }
  }
  return value;
}

export async function assertMineFormulaLifecycleInput(
  input: MineFormulaLifecycleRevisionInput,
): Promise<void> {
  await validatedMineLifecycleInput(input);
}

export async function saveMineFormulaLifecycle(args: {
  ownerId: string;
  formulaId: string;
  idempotencyKey: string;
  requestHash: string;
  lifecycle: MineFormulaLifecycleRevisionInput;
}): Promise<MineFormulaLifecycleResult> {
  const lifecycle = await validatedMineLifecycleInput(args.lifecycle);
  if (
    !UUID_V4.test(args.formulaId) ||
    lifecycle.definition.formulaId !== args.formulaId
  ) {
    validationFailed("Mine Formula identity must be one exact UUIDv4");
  }
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/rpc/fractalpark_custom_formula_lifecycle_save`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_owner_id: args.ownerId,
        p_formula_id: args.formulaId,
        p_idempotency_key: args.idempotencyKey,
        p_request_hash: args.requestHash,
        p_definition: lifecycle.definition,
        p_profile: lifecycle.profile,
        p_source_revision: lifecycle.sourceRevision,
        p_profile_revision: lifecycle.profileRevision,
        p_runnable: lifecycle.runnable,
        p_diagnostics: lifecycle.diagnostics,
        p_supersedes: lifecycle.supersedes ?? null,
        p_imported_from_formula_id: lifecycle.importedFromFormulaId ?? null,
        p_remixed_from_formula_id: lifecycle.remixedFromFormulaId ?? null,
        p_lineage_source_revision: lifecycle.lineageSourceRevision ?? null,
        p_lineage_profile_revision: lifecycle.lineageProfileRevision ?? null,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: unknown;
    };
    const prefix =
      typeof body.message === "string"
        ? body.message.split(":", 1)[0]
        : "unavailable";
    const code =
      prefix === "not_found" ||
      prefix === "quota_exceeded" ||
      prefix === "idempotency_conflict" ||
      prefix === "validation_failed" ||
      prefix === "account_deleting"
        ? prefix
        : "unavailable";
    throw new CustomFormulaServiceError(code);
  }
  const result = (await response.json()) as Record<string, unknown>;
  if (
    typeof result.formula_id !== "string" ||
    typeof result.revision !== "number" ||
    typeof result.editable_head_revision_id !== "string"
  ) {
    throw new CustomFormulaServiceError(
      "unavailable",
      "malformed lifecycle rpc result",
    );
  }
  return {
    replayed: result.replayed === true,
    formulaId: result.formula_id,
    revision: result.revision,
    editableHeadRevisionId: result.editable_head_revision_id,
    activeRunnableRevisionId:
      typeof result.active_runnable_revision_id === "string"
        ? result.active_runnable_revision_id
        : null,
  };
}
