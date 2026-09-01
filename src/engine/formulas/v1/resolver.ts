import type { FrmLikeV1Ir } from "@/engine/frm/v1";
import {
  mapSafetyFailureToFormulaCodeV1,
  validateFormulaDefinitionIdentityV1,
  validateFormulaProfileAssetV1,
} from "./assets";
import { isFormulaIdV1, isStandardFormulaIdV1 } from "./identity";
import { isFormulaBackendRevisionV1, isFormulaRevisionV1 } from "./revisions";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
} from "./safety-envelope";
import {
  isFormulaAliasKindV1,
  STANDARD_MANIFEST_INDEX_V1,
  type StandardManifestIndexV1,
} from "./standard-manifest";
import type {
  FormulaAssetRevisionRequestV1,
  FormulaBackendRevisionV1,
  FormulaDefinitionV1,
  FormulaIdV1,
  FormulaProfileV1,
  FormulaResultV1,
  FormulaRuntimeArtifactRefV1,
} from "./types";

export interface ImmutableFormulaAssetStoreV1 {
  getDefinition(
    formulaId: FormulaIdV1,
    sourceRevision: string,
  ): Promise<unknown | undefined>;
  getProfile(
    formulaId: FormulaIdV1,
    sourceRevision: string,
    profileRevision: string,
  ): Promise<unknown | undefined>;
}

export interface FormulaCompilerInputV1 {
  readonly definition: FormulaDefinitionV1;
  readonly profile: FormulaProfileV1;
  readonly ir: FrmLikeV1Ir;
}

export interface FormulaCompilerOutputV1<T> {
  readonly artifact: T;
  readonly backendRevision: FormulaBackendRevisionV1;
}

export interface FormulaCompilerAdapterV1<T> {
  compile(input: FormulaCompilerInputV1): Promise<FormulaCompilerOutputV1<T>>;
}

export interface ResolvedFormulaAssetV1<T> {
  readonly formulaId: FormulaIdV1;
  readonly definition: FormulaDefinitionV1;
  readonly profile: FormulaProfileV1;
  readonly ir: FrmLikeV1Ir;
  readonly artifact: T;
  readonly runtimeArtifact: FormulaRuntimeArtifactRefV1;
}

function record(value: unknown): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor?.enumerable && "value" in descriptor);
    });
  } catch {
    return false;
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    Reflect.ownKeys(value).length === actual.length &&
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function resolveReferenceV1(
  reference: unknown,
  manifest: StandardManifestIndexV1,
): FormulaResultV1<FormulaIdV1> {
  if (!record(reference) || typeof reference.kind !== "string")
    return { ok: false, code: "invalid-reference" };
  if (reference.kind === "canonical") {
    if (
      !exactKeys(reference, ["kind", "formulaId"]) ||
      !isFormulaIdV1(reference.formulaId) ||
      (isStandardFormulaIdV1(reference.formulaId) &&
        !manifest.hasFormulaId(reference.formulaId))
    )
      return { ok: false, code: "invalid-reference" };
    return { ok: true, value: reference.formulaId };
  }
  if (reference.kind === "legacy-alias") {
    if (
      !exactKeys(reference, ["kind", "alias"]) ||
      !record(reference.alias) ||
      !exactKeys(reference.alias, ["kind", "value"]) ||
      !isFormulaAliasKindV1(reference.alias.kind) ||
      typeof reference.alias.value !== "string"
    )
      return { ok: false, code: "invalid-reference" };
    const formulaId = manifest.resolveAlias(
      reference.alias.kind,
      reference.alias.value,
    );
    return formulaId
      ? { ok: true, value: formulaId }
      : { ok: false, code: "unknown-alias" };
  }
  return { ok: false, code: "invalid-reference" };
}

export async function resolveFormulaV1<T>(
  request: FormulaAssetRevisionRequestV1,
  dependencies: Readonly<{
    manifest?: StandardManifestIndexV1;
    assets: ImmutableFormulaAssetStoreV1;
    compiler: FormulaCompilerAdapterV1<T>;
  }>,
): Promise<FormulaResultV1<ResolvedFormulaAssetV1<T>>> {
  const manifest = dependencies.manifest ?? STANDARD_MANIFEST_INDEX_V1;
  let reference: FormulaResultV1<FormulaIdV1>;
  try {
    if (
      !record(request) ||
      !exactKeys(request, ["reference", "sourceRevision", "profileRevision"]) ||
      !isFormulaRevisionV1(request.sourceRevision) ||
      !isFormulaRevisionV1(request.profileRevision)
    )
      return { ok: false, code: "invalid-reference" };
    reference = resolveReferenceV1(request.reference, manifest);
  } catch {
    return { ok: false, code: "invalid-reference" };
  }
  if (reference.ok === false) return reference;
  const formulaId = reference.value;

  let rawDefinition: unknown;
  try {
    rawDefinition = await dependencies.assets.getDefinition(
      formulaId,
      request.sourceRevision,
    );
  } catch {
    return { ok: false, code: "asset-store-failed" };
  }
  if (rawDefinition === undefined)
    return { ok: false, code: "definition-not-found" };
  let definition: FormulaDefinitionV1;
  let ir: FrmLikeV1Ir;
  try {
    const identity = validateFormulaDefinitionIdentityV1(
      rawDefinition,
      formulaId,
      manifest,
    );
    if (identity.ok === false) return identity;
    const candidateDefinition = identity.value;
    const definitionScope = candidateDefinition.scope;
    if (candidateDefinition.sourceRevision !== request.sourceRevision)
      return { ok: false, code: "source-revision-mismatch" };
    const safety = await validateFormulaSafetyEnvelopeV1(
      projectExecutableFormulaDefinitionV1(candidateDefinition),
    );
    if (safety.ok === false)
      return {
        ok: false,
        code: mapSafetyFailureToFormulaCodeV1(safety.code),
      };
    ir = safety.ir;
    definition = Object.freeze({
      formulaId,
      scope: definitionScope,
      ...safety.executable,
    });
  } catch {
    return { ok: false, code: "definition-invalid" };
  }

  let rawProfile: unknown;
  try {
    rawProfile = await dependencies.assets.getProfile(
      formulaId,
      request.sourceRevision,
      request.profileRevision,
    );
  } catch {
    return { ok: false, code: "asset-store-failed" };
  }
  if (rawProfile === undefined) return { ok: false, code: "profile-not-found" };
  let profile: FormulaResultV1<FormulaProfileV1>;
  try {
    profile = await validateFormulaProfileAssetV1(
      rawProfile,
      definition,
      request.profileRevision,
    );
  } catch {
    return { ok: false, code: "profile-invalid" };
  }
  if (profile.ok === false) return profile;

  let compiled: FormulaCompilerOutputV1<T>;
  try {
    compiled = await dependencies.compiler.compile({
      definition,
      profile: profile.value,
      ir,
    });
  } catch {
    return { ok: false, code: "compiler-failed" };
  }
  let backendRevision: FormulaBackendRevisionV1;
  let artifact: T;
  try {
    const candidateBackendRevision = compiled.backendRevision;
    if (!isFormulaBackendRevisionV1(candidateBackendRevision))
      return { ok: false, code: "backend-revision-invalid" };
    backendRevision = Object.freeze({ ...candidateBackendRevision });
    artifact = compiled.artifact;
  } catch {
    return { ok: false, code: "backend-revision-invalid" };
  }
  const runtimeArtifact: FormulaRuntimeArtifactRefV1 = Object.freeze({
    formulaId,
    sourceRevision: definition.sourceRevision,
    semanticHash: definition.semanticHash,
    format: "glsl-es-1.00",
    backendRevision,
  });
  return {
    ok: true,
    value: Object.freeze({
      formulaId,
      definition,
      profile: profile.value,
      ir,
      artifact,
      runtimeArtifact,
    }),
  };
}
