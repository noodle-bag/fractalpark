import { FRM_V1_UNARY_FUNCTION_NAMES } from "@/engine/frm/frm-v1-stdlib";
import { isFormulaIdForScopeV1, isFormulaIdV1 } from "./identity";
import { isFormulaRevisionV1, verifyProfileRevisionV1 } from "./revisions";
import type { StandardManifestIndexV1 } from "./standard-manifest";
import type {
  FormulaDefinitionV1,
  FormulaFailureCodeV1,
  FormulaIdV1,
  FormulaParameterSchemaV1,
  FormulaParameterValueV1,
  FormulaProfileV1,
  FormulaRecordV1,
  FormulaResultV1,
  FormulaRevisionV1,
} from "./types";

const DEFINITION_KEYS = Object.freeze([
  "schemaVersion",
  "formulaId",
  "scope",
  "source",
  "sourceRevision",
  "semanticHash",
  "languageVersion",
  "stdlibVersion",
  "supportedNumericProfiles",
  "parameters",
  "programModel",
  "termination",
  "channels",
  "capabilities",
]);
const PROFILE_KEYS = Object.freeze([
  "schemaVersion",
  "formulaId",
  "sourceRevision",
  "profileRevision",
  "parameters",
  "mode",
  "view",
  "iterations",
  "coloring",
  "palette",
  "transform",
]);
const UNARY_FUNCTIONS = new Set<string>(FRM_V1_UNARY_FUNCTION_NAMES);

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

function denseArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value)) return false;
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return false;
    }
    return Reflect.ownKeys(value).every(
      (key) =>
        key === "length" ||
        (typeof key === "string" &&
          /^(?:0|[1-9]\d*)$/.test(key) &&
          Number(key) < value.length),
    );
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
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

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePair(value: unknown): value is readonly [number, number] {
  return (
    denseArray(value) &&
    value.length === 2 &&
    value.every(finite) &&
    Reflect.ownKeys(value).every(
      (key) => key === "length" || key === "0" || key === "1",
    )
  );
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    denseArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length
  );
}

function profileParameterValue(
  schema: FormulaParameterSchemaV1,
  value: unknown,
): value is FormulaParameterValueV1 {
  if (schema.type === "real") {
    return (
      finite(value) &&
      (!schema.hardDomain ||
        (value >= schema.hardDomain[0] && value <= schema.hardDomain[1]))
    );
  }
  if (schema.type === "complex") return finitePair(value);
  return typeof value === "string" && UNARY_FUNCTIONS.has(value);
}

function validProfileParameters(
  value: unknown,
  schema: readonly FormulaParameterSchemaV1[],
): value is Readonly<Record<string, FormulaParameterValueV1>> {
  if (!record(value)) return false;
  const expected = schema.map((parameter) => parameter.name).sort();
  if (!exactKeys(value, expected)) return false;
  return schema.every((parameter) =>
    profileParameterValue(parameter, value[parameter.name]),
  );
}

function validView(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, ["centerX", "centerY", "zoom", "rotation"]) &&
    finite(value.centerX) &&
    finite(value.centerY) &&
    finite(value.zoom) &&
    value.zoom > 0 &&
    finite(value.rotation)
  );
}

function validColoring(value: unknown): boolean {
  if (!record(value)) return false;
  const expected = [
    "pipelineVersion",
    "outsideColoringId",
    "insideColoringId",
    "smooth",
    ...(Object.hasOwn(value, "measurement") ? ["measurement"] : []),
    ...(Object.hasOwn(value, "channel") ? ["channel"] : []),
    ...(Object.hasOwn(value, "post") ? ["post"] : []),
  ];
  if (
    !exactKeys(value, expected) ||
    (value.pipelineVersion !== 1 && value.pipelineVersion !== 2) ||
    typeof value.outsideColoringId !== "string" ||
    value.outsideColoringId.length === 0 ||
    typeof value.insideColoringId !== "string" ||
    value.insideColoringId.length === 0 ||
    typeof value.smooth !== "boolean" ||
    (Object.hasOwn(value, "measurement") &&
      (typeof value.measurement !== "string" ||
        value.measurement.length === 0)) ||
    (Object.hasOwn(value, "channel") &&
      (typeof value.channel !== "string" || value.channel.length === 0))
  )
    return false;
  if (!Object.hasOwn(value, "post")) return true;
  if (!record(value.post)) return false;
  return Object.values(value.post).every(
    (entry) =>
      typeof entry === "string" || typeof entry === "boolean" || finite(entry),
  );
}

function validPalette(value: unknown): boolean {
  if (!record(value)) return false;
  const expected = [
    "paletteId",
    ...(Object.hasOwn(value, "colorSpace") ? ["colorSpace"] : []),
    ...(Object.hasOwn(value, "gradient") ? ["gradient"] : []),
  ];
  if (
    !exactKeys(value, expected) ||
    typeof value.paletteId !== "string" ||
    value.paletteId.length === 0 ||
    (Object.hasOwn(value, "colorSpace") &&
      (typeof value.colorSpace !== "string" || value.colorSpace.length === 0))
  )
    return false;
  if (!Object.hasOwn(value, "gradient")) return true;
  if (!denseArray(value.gradient)) return false;
  return value.gradient.every(
    (stop) =>
      record(stop) &&
      exactKeys(stop, ["position", "color"]) &&
      finite(stop.position) &&
      stop.position >= 0 &&
      stop.position <= 1 &&
      typeof stop.color === "string" &&
      stop.color.length > 0,
  );
}

function validTransform(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "rotation",
      "scaleX",
      "scaleY",
      "skewX",
      "skewY",
      "offsetX",
      "offsetY",
    ]) &&
    [
      value.rotation,
      value.scaleX,
      value.scaleY,
      value.skewX,
      value.skewY,
      value.offsetX,
      value.offsetY,
    ].every(finite)
  );
}

export function validateFormulaDefinitionIdentityV1(
  value: unknown,
  expectedFormulaId: FormulaIdV1,
  standardManifest: StandardManifestIndexV1,
): FormulaResultV1<FormulaDefinitionV1> {
  if (!record(value) || !exactKeys(value, DEFINITION_KEYS))
    return { ok: false, code: "definition-invalid" };
  if (
    value.formulaId !== expectedFormulaId ||
    (value.scope !== "standard" &&
      value.scope !== "mine" &&
      value.scope !== "community") ||
    !isFormulaIdForScopeV1(value.scope, value.formulaId)
  )
    return { ok: false, code: "identity-mismatch" };
  if (
    value.scope === "standard" &&
    !standardManifest.hasFormulaId(value.formulaId)
  )
    return { ok: false, code: "identity-mismatch" };
  return { ok: true, value: value as unknown as FormulaDefinitionV1 };
}

export async function validateFormulaProfileAssetV1(
  value: unknown,
  definition: FormulaDefinitionV1,
  expectedProfileRevision: FormulaRevisionV1,
): Promise<FormulaResultV1<FormulaProfileV1>> {
  if (!record(value)) return { ok: false, code: "profile-invalid" };
  const expectedKeys = [
    ...PROFILE_KEYS,
    ...(Object.hasOwn(value, "juliaC") ? ["juliaC"] : []),
  ];
  if (
    !exactKeys(value, expectedKeys) ||
    value.schemaVersion !== 1 ||
    !isFormulaIdV1(value.formulaId) ||
    !isFormulaRevisionV1(value.sourceRevision) ||
    !isFormulaRevisionV1(value.profileRevision) ||
    !validProfileParameters(value.parameters, definition.parameters) ||
    (value.mode !== "parameter-plane" && value.mode !== "julia") ||
    !validView(value.view) ||
    !Number.isSafeInteger(value.iterations) ||
    (value.iterations as number) < 1 ||
    !validColoring(value.coloring) ||
    !validPalette(value.palette) ||
    !validTransform(value.transform)
  )
    return { ok: false, code: "profile-invalid" };
  if (value.formulaId !== definition.formulaId)
    return { ok: false, code: "identity-mismatch" };
  if (value.sourceRevision !== definition.sourceRevision)
    return { ok: false, code: "source-revision-mismatch" };
  if (value.profileRevision !== expectedProfileRevision)
    return { ok: false, code: "profile-revision-mismatch" };
  if (
    (value.mode === "julia" &&
      (!Object.hasOwn(value, "juliaC") || !finitePair(value.juliaC))) ||
    (value.mode === "parameter-plane" && Object.hasOwn(value, "juliaC"))
  )
    return { ok: false, code: "profile-invalid" };
  const candidate = value as unknown as FormulaProfileV1;
  const profile = deepFreeze<FormulaProfileV1>({
    schemaVersion: 1,
    formulaId: definition.formulaId,
    sourceRevision: definition.sourceRevision,
    profileRevision: candidate.profileRevision,
    parameters: Object.fromEntries(
      Object.entries(candidate.parameters).map(([name, parameterValue]) => [
        name,
        Array.isArray(parameterValue)
          ? ([...parameterValue] as [number, number])
          : parameterValue,
      ]),
    ) as Record<string, FormulaParameterValueV1>,
    mode: candidate.mode,
    ...(Object.hasOwn(candidate, "juliaC")
      ? { juliaC: [...candidate.juliaC!] as [number, number] }
      : {}),
    view: { ...candidate.view },
    iterations: candidate.iterations,
    coloring: {
      pipelineVersion: candidate.coloring.pipelineVersion,
      outsideColoringId: candidate.coloring.outsideColoringId,
      insideColoringId: candidate.coloring.insideColoringId,
      smooth: candidate.coloring.smooth,
      ...(Object.hasOwn(candidate.coloring, "measurement")
        ? { measurement: candidate.coloring.measurement }
        : {}),
      ...(Object.hasOwn(candidate.coloring, "channel")
        ? { channel: candidate.coloring.channel }
        : {}),
      ...(Object.hasOwn(candidate.coloring, "post")
        ? { post: { ...candidate.coloring.post! } }
        : {}),
    },
    palette: {
      paletteId: candidate.palette.paletteId,
      ...(Object.hasOwn(candidate.palette, "colorSpace")
        ? { colorSpace: candidate.palette.colorSpace }
        : {}),
      ...(Object.hasOwn(candidate.palette, "gradient")
        ? {
            gradient: candidate.palette.gradient!.map((stop) => ({ ...stop })),
          }
        : {}),
    },
    transform: { ...candidate.transform },
  });
  if (!(await verifyProfileRevisionV1(profile)))
    return { ok: false, code: "profile-revision-mismatch" };
  return { ok: true, value: profile };
}

/** Runtime ownership check for future Record stores; no source or resolved state. */
export function validateFormulaRecordOwnershipV1(
  value: unknown,
): value is FormulaRecordV1 {
  if (!record(value)) return false;
  const expectedKeys = [
    "schemaVersion",
    "formulaId",
    "scope",
    "names",
    "facets",
    "relations",
    "provenance",
    "rights",
    ...(Object.hasOwn(value, "preview") ? ["preview"] : []),
  ];
  if (
    !exactKeys(value, expectedKeys) ||
    value.schemaVersion !== 1 ||
    (value.scope !== "standard" &&
      value.scope !== "mine" &&
      value.scope !== "community") ||
    !isFormulaIdForScopeV1(value.scope, value.formulaId) ||
    !record(value.names) ||
    !Object.values(value.names).every(
      (name) => typeof name === "string" && name.length > 0,
    ) ||
    !stringArray(value.facets) ||
    !denseArray(value.relations) ||
    !record(value.provenance) ||
    !record(value.rights) ||
    (Object.hasOwn(value, "preview") && !record(value.preview))
  )
    return false;
  return value.relations.every(
    (relation) =>
      record(relation) &&
      exactKeys(relation, ["kind", "targetFormulaId", "evidence"]) &&
      typeof relation.kind === "string" &&
      relation.kind.length > 0 &&
      isFormulaIdV1(relation.targetFormulaId) &&
      typeof relation.evidence === "string" &&
      relation.evidence.length > 0,
  );
}

export function mapSafetyFailureToFormulaCodeV1(
  code: string,
): FormulaFailureCodeV1 {
  if (code === "source-revision-mismatch") return "source-revision-mismatch";
  if (code === "semantic-hash-mismatch") return "semantic-hash-mismatch";
  return "unsafe-definition";
}
