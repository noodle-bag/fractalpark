import {
  canonicalizeFrmLikeV1,
  FRM_LIKE_V1_DEFAULT_LIMITS,
  parseFrmLikeV1,
  type FrmLikeV1Ir,
  type FrmLikeV1Parameter,
} from "@/engine/frm/v1";
import { verifyDefinitionRevisionsV1 } from "./revisions";
import type {
  ExecutableFormulaDefinitionV1,
  FormulaDefinitionV1,
  FormulaParameterSchemaV1,
} from "./types";

export const MAX_EXECUTABLE_FORMULA_SOURCE_BYTES_V1 =
  FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes;

export type SafetyEnvelopeFailureV1 =
  | "invalid-definition"
  | "source-too-large"
  | "source-invalid"
  | "source-not-canonical"
  | "parameter-schema-mismatch"
  | "source-revision-mismatch"
  | "semantic-hash-mismatch";

export type SafetyEnvelopeResultV1 =
  | {
      readonly ok: true;
      readonly ir: FrmLikeV1Ir;
      readonly executable: ExecutableFormulaDefinitionV1;
    }
  | { readonly ok: false; readonly code: SafetyEnvelopeFailureV1 };

const EXECUTABLE_KEYS = Object.freeze([
  "schemaVersion",
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

function finitePair(value: unknown): value is readonly [number, number] {
  return (
    denseArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

function sameParameter(
  expected: FrmLikeV1Parameter,
  actual: unknown,
): actual is FormulaParameterSchemaV1 {
  if (!record(actual)) return false;
  const expectedKeys = [
    "name",
    "type",
    "default",
    ...(expected.hardDomain ? ["hardDomain"] : []),
    ...(expected.classicBinding ? ["classicBinding"] : []),
  ];
  if (!exactKeys(actual, expectedKeys)) return false;
  if (
    actual.name !== expected.name ||
    actual.type !== expected.type ||
    actual.classicBinding !== expected.classicBinding
  )
    return false;
  if (expected.type === "real") {
    if (
      typeof actual.default !== "number" ||
      !Number.isFinite(actual.default) ||
      actual.default !== expected.default
    )
      return false;
    if (expected.hardDomain) {
      if (!finitePair(actual.hardDomain)) return false;
      if (
        actual.hardDomain[0] !== expected.hardDomain[0] ||
        actual.hardDomain[1] !== expected.hardDomain[1]
      )
        return false;
    } else if (Object.hasOwn(actual, "hardDomain")) return false;
    return true;
  }
  if (expected.type === "complex") {
    return (
      finitePair(actual.default) &&
      Array.isArray(expected.default) &&
      actual.default[0] === expected.default[0] &&
      actual.default[1] === expected.default[1] &&
      !Object.hasOwn(actual, "hardDomain")
    );
  }
  return (
    typeof actual.default === "string" &&
    actual.default === expected.default &&
    !Object.hasOwn(actual, "hardDomain")
  );
}

function validStringSet(value: unknown): value is readonly string[] {
  return (
    denseArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length
  );
}

function validExecutableShape(
  input: unknown,
): input is ExecutableFormulaDefinitionV1 {
  if (!record(input) || !exactKeys(input, EXECUTABLE_KEYS)) return false;
  if (
    input.schemaVersion !== 1 ||
    typeof input.source !== "string" ||
    typeof input.sourceRevision !== "string" ||
    typeof input.semanticHash !== "string" ||
    input.languageVersion !== "frm-like/1" ||
    input.stdlibVersion !== 1 ||
    input.programModel !== "orbit" ||
    !denseArray(input.supportedNumericProfiles) ||
    input.supportedNumericProfiles[0] !== "standard32" ||
    !validStringSet(input.supportedNumericProfiles) ||
    !denseArray(input.parameters) ||
    !validStringSet(input.channels) ||
    !validStringSet(input.capabilities) ||
    !record(input.termination) ||
    !exactKeys(input.termination, [
      "predicateMeaning",
      "nonFinite",
      "maximumIterations",
    ]) ||
    input.termination.predicateMeaning !== "continue-iteration" ||
    input.termination.nonFinite !== "terminate-with-event" ||
    input.termination.maximumIterations !== "profile-resolved"
  )
    return false;
  return true;
}

export function executableFormulaSourceFitsV1(source: string): boolean {
  return (
    typeof source === "string" &&
    new TextEncoder().encode(source).byteLength <=
      MAX_EXECUTABLE_FORMULA_SOURCE_BYTES_V1
  );
}

export function projectExecutableFormulaDefinitionV1(
  definition: FormulaDefinitionV1,
): ExecutableFormulaDefinitionV1 {
  return {
    schemaVersion: definition.schemaVersion,
    source: definition.source,
    sourceRevision: definition.sourceRevision,
    semanticHash: definition.semanticHash,
    languageVersion: definition.languageVersion,
    stdlibVersion: definition.stdlibVersion,
    supportedNumericProfiles: definition.supportedNumericProfiles,
    parameters: definition.parameters,
    programModel: definition.programModel,
    termination: definition.termination,
    channels: definition.channels,
    capabilities: definition.capabilities,
  };
}

/** Formula ID, scope, provenance, rights, and aliases cannot enter this function. */
export async function validateFormulaSafetyEnvelopeV1(
  input: unknown,
): Promise<SafetyEnvelopeResultV1> {
  if (!validExecutableShape(input))
    return { ok: false, code: "invalid-definition" };
  if (!executableFormulaSourceFitsV1(input.source))
    return { ok: false, code: "source-too-large" };
  const parsed = parseFrmLikeV1(input.source);
  if (parsed.ok === false) return { ok: false, code: "source-invalid" };
  if (canonicalizeFrmLikeV1(parsed.ir) !== input.source)
    return { ok: false, code: "source-not-canonical" };
  if (
    parsed.ir.parameters.length !== input.parameters.length ||
    !parsed.ir.parameters.every((parameter, index) =>
      sameParameter(parameter, input.parameters[index]),
    )
  )
    return { ok: false, code: "parameter-schema-mismatch" };
  const ir = deepFreeze(parsed.ir);
  const executable = deepFreeze<ExecutableFormulaDefinitionV1>({
    schemaVersion: 1,
    source: input.source,
    sourceRevision: input.sourceRevision,
    semanticHash: input.semanticHash,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: [...input.supportedNumericProfiles] as [
      "standard32",
      ...string[],
    ],
    parameters: ir.parameters,
    programModel: "orbit",
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [...input.channels],
    capabilities: [...input.capabilities],
  });
  const revision = await verifyDefinitionRevisionsV1(executable, ir);
  if (revision !== "ok") return { ok: false, code: revision };
  return { ok: true, ir, executable };
}
