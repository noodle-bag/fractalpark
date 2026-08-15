import type { FractalDocument } from "./document";
import { readFractalDocument } from "./document-reader";
import type { FrmLikeV1Ir } from "./frm/v1";
import { FRM_V1_UNARY_FUNCTION_NAMES } from "./frm/frm-v1-stdlib";
import {
  canonicalJsonV1,
  isFormulaIdForScopeV1,
  isFormulaRevisionV1,
  validateFormulaSafetyEnvelopeV1,
  type FormulaIdV1,
  type FormulaParameterSchemaV1,
  type FormulaParameterValueV1,
  type FormulaRevisionV1,
  type FormulaScopeV1,
  type FormulaTerminationContractV1,
} from "./formulas/v1";

export const FRACTAL_DOCUMENT_V3_READER_VERSION = 3 as const;
export const FORMULA_SNAPSHOT_V1_VERSION = 1 as const;
export const FORMULA_SNAPSHOT_V1_EXECUTABLE_SOURCE_BYTES = 65_536;
export const FORMULA_SNAPSHOT_V1_PORTABLE_SOURCE_BYTES = 262_144;

export interface FormulaSnapshotV1 {
  readonly schemaVersion: typeof FORMULA_SNAPSHOT_V1_VERSION;
  readonly formulaId: FormulaIdV1;
  readonly scope: FormulaScopeV1;
  readonly source: string;
  readonly sourceRevision: FormulaRevisionV1;
  readonly semanticHash: FormulaRevisionV1;
  readonly languageVersion: "frm-like/1";
  readonly stdlibVersion: 1;
  readonly numericProfile: "standard32" | string;
  readonly parameterSchema: readonly FormulaParameterSchemaV1[];
  readonly resolvedParameters: Readonly<
    Record<string, FormulaParameterValueV1>
  >;
  readonly profileRevision?: FormulaRevisionV1;
  readonly mode: "parameter-plane" | "julia";
  readonly juliaC?: readonly [number, number];
  readonly iterations: number;
  readonly termination: FormulaTerminationContractV1;
  readonly channels: readonly string[];
}

export interface FractalDocumentV3 extends Omit<
  FractalDocument,
  "schemaVersion"
> {
  readonly schemaVersion: typeof FRACTAL_DOCUMENT_V3_READER_VERSION;
  readonly formulaSnapshot: FormulaSnapshotV1;
}

export type DocumentV3ReadonlyReason =
  | "future-document-version"
  | "durable-state-invalid"
  | "future-snapshot-version"
  | "snapshot-shape-invalid"
  | "formula-identity-invalid"
  | "document-snapshot-identity-mismatch"
  | "unsupported-language-version"
  | "unsupported-stdlib-version"
  | "unsupported-numeric-profile"
  | "legacy-source-over-current-limit"
  | "source-exceeds-portable-ceiling"
  | "snapshot-safety-invalid"
  | "resolved-parameters-invalid"
  | "document-snapshot-state-mismatch";

export interface DocumentV3ReadError {
  readonly code: "unsafe-input" | "invalid-document-v3";
  readonly path: string;
  readonly message: string;
}

export type DocumentV3ReadResult =
  | {
      readonly mode: "readable-v3";
      readonly writer: "disabled";
      readonly document: FractalDocumentV3;
      readonly snapshot: FormulaSnapshotV1;
      readonly ir: FrmLikeV1Ir;
      readonly original: unknown;
      readonly warnings: readonly string[];
    }
  | {
      readonly mode: "readonly-v3";
      readonly writer: "disabled";
      readonly reason: DocumentV3ReadonlyReason;
      readonly document: FractalDocumentV3;
      readonly original: unknown;
      readonly warnings: readonly string[];
    }
  | {
      readonly mode: "invalid";
      readonly errors: readonly DocumentV3ReadError[];
    };

const REQUIRED_DOCUMENT_KEYS = Object.freeze([
  "schemaVersion",
  "scene",
  "formula",
  "coloring",
  "transform",
  "render",
  "formulaSnapshot",
]);
const OPTIONAL_DOCUMENT_KEYS = Object.freeze([
  "animation",
  "assets",
  "metadata",
]);
const REQUIRED_SNAPSHOT_KEYS = Object.freeze([
  "schemaVersion",
  "formulaId",
  "scope",
  "source",
  "sourceRevision",
  "semanticHash",
  "languageVersion",
  "stdlibVersion",
  "numericProfile",
  "parameterSchema",
  "resolvedParameters",
  "mode",
  "iterations",
  "termination",
  "channels",
]);
const OPTIONAL_SNAPSHOT_KEYS = Object.freeze(["profileRevision", "juliaC"]);
const FORMULA_SCOPES = new Set<FormulaScopeV1>([
  "standard",
  "mine",
  "community",
]);
const UNARY_FUNCTIONS = new Set<string>(FRM_V1_UNARY_FUNCTION_NAMES);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function preflightPlainJson(
  value: unknown,
  state: { nodes: number; stringCodeUnits: number; active: WeakSet<object> },
  maxStringCodeUnits: number,
  depth = 0,
): void {
  if (depth > 64 || ++state.nodes > 16_384) throw new Error("unsafe-input");
  if (typeof value === "string") {
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > maxStringCodeUnits)
      throw new Error("input-too-large");
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("unsafe-input");
    return;
  }
  if (!value || typeof value !== "object" || state.active.has(value))
    throw new Error("unsafe-input");
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor?.enumerable || !("value" in descriptor))
          throw new Error("unsafe-input");
        preflightPlainJson(
          descriptor.value,
          state,
          maxStringCodeUnits,
          depth + 1,
        );
      }
      if (
        Reflect.ownKeys(value).some(
          (key) =>
            key !== "length" &&
            (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key)),
        )
      ) {
        throw new Error("unsafe-input");
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error("unsafe-input");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error("unsafe-input");
      state.stringCodeUnits += key.length;
      if (state.stringCodeUnits > maxStringCodeUnits)
        throw new Error("input-too-large");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor))
        throw new Error("unsafe-input");
      preflightPlainJson(
        descriptor.value,
        state,
        maxStringCodeUnits,
        depth + 1,
      );
    }
  } finally {
    state.active.delete(value);
  }
}

export function clonePortableJsonV1(
  value: unknown,
  maxStringCodeUnits = 1_048_576,
): unknown {
  preflightPlainJson(
    value,
    { nodes: 0, stringCodeUnits: 0, active: new WeakSet<object>() },
    maxStringCodeUnits,
  );
  return JSON.parse(canonicalJsonV1(value)) as unknown;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object))
    return value;
  seen.add(value as object);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function finitePair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function invalid(path: string, message: string): DocumentV3ReadResult {
  return {
    mode: "invalid",
    errors: [{ code: "invalid-document-v3", path, message }],
  };
}

function readonly(
  document: FractalDocumentV3,
  original: unknown,
  reason: DocumentV3ReadonlyReason,
  warning: string,
): DocumentV3ReadResult {
  return {
    mode: "readonly-v3",
    writer: "disabled",
    reason,
    document,
    original,
    warnings: Object.freeze([warning]),
  };
}

function validateDurableState(
  candidate: Record<string, unknown>,
): string | null {
  if (!record(candidate.scene) || !record(candidate.scene.bounds))
    return "scene.bounds";
  const bounds = candidate.scene.bounds;
  if (
    !Number.isFinite(bounds.centerX) ||
    !Number.isFinite(bounds.centerY) ||
    !Number.isFinite(bounds.zoom) ||
    Number(bounds.zoom) <= 0 ||
    !Number.isFinite(bounds.rotation)
  ) {
    return "scene.bounds";
  }
  if (
    !record(candidate.formula) ||
    typeof candidate.formula.formulaId !== "string"
  ) {
    return "formula";
  }
  if (
    typeof candidate.formula.isJulia !== "boolean" ||
    !finitePair(candidate.formula.juliaC) ||
    !Number.isFinite(candidate.formula.power) ||
    (Object.hasOwn(candidate.formula, "params") &&
      !record(candidate.formula.params))
  ) {
    return "formula";
  }
  if (
    !record(candidate.coloring) ||
    !record(candidate.transform) ||
    !record(candidate.render)
  ) {
    return "coloring/transform/render";
  }
  if (
    !Number.isSafeInteger(candidate.render.maxIterations) ||
    Number(candidate.render.maxIterations) < 1 ||
    Number(candidate.render.maxIterations) > 1_000_000
  ) {
    return "render.maxIterations";
  }
  const durable = { ...candidate };
  delete durable.formulaSnapshot;
  const v2Projection = {
    ...durable,
    schemaVersion: 2,
    formula: { ...candidate.formula, formulaId: "mandelbrot" },
  };
  const released = readFractalDocument(v2Projection);
  if (released.mode !== "editable") return "document-v2";
  const normalized = JSON.parse(JSON.stringify(released.document)) as unknown;
  if (canonicalJsonV1(normalized) !== canonicalJsonV1(v2Projection))
    return "document-v2";
  return null;
}

function parameterValueMatches(
  schema: FormulaParameterSchemaV1,
  value: unknown,
): value is FormulaParameterValueV1 {
  if (schema.type === "real") {
    if (!Number.isFinite(value)) return false;
    if (schema.hardDomain) {
      return (
        Number(value) >= schema.hardDomain[0] &&
        Number(value) <= schema.hardDomain[1]
      );
    }
    return true;
  }
  if (schema.type === "complex") return finitePair(value);
  return typeof value === "string" && UNARY_FUNCTIONS.has(value);
}

function resolvedParametersMatch(
  schema: readonly FormulaParameterSchemaV1[],
  values: unknown,
): values is Readonly<Record<string, FormulaParameterValueV1>> {
  if (!record(values)) return false;
  const expected = new Set(schema.map((entry) => entry.name));
  if (Object.keys(values).length !== expected.size) return false;
  for (const entry of schema) {
    if (
      !Object.hasOwn(values, entry.name) ||
      !parameterValueMatches(entry, values[entry.name])
    ) {
      return false;
    }
  }
  return Object.keys(values).every((key) => expected.has(key));
}

function snapshotShape(value: unknown): value is Record<string, unknown> {
  return (
    record(value) &&
    exactKeys(value, REQUIRED_SNAPSHOT_KEYS, OPTIONAL_SNAPSHOT_KEYS) &&
    typeof value.schemaVersion === "number" &&
    typeof value.formulaId === "string" &&
    typeof value.scope === "string" &&
    typeof value.source === "string" &&
    typeof value.sourceRevision === "string" &&
    typeof value.semanticHash === "string" &&
    typeof value.languageVersion === "string" &&
    typeof value.stdlibVersion === "number" &&
    typeof value.numericProfile === "string" &&
    Array.isArray(value.parameterSchema) &&
    record(value.resolvedParameters) &&
    typeof value.mode === "string" &&
    Number.isSafeInteger(value.iterations) &&
    record(value.termination) &&
    Array.isArray(value.channels)
  );
}

function snapshotStateMatchesDocument(
  document: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): boolean {
  const formula = document.formula as Record<string, unknown>;
  const render = document.render as Record<string, unknown>;
  if (formula.formulaId !== snapshot.formulaId) return false;
  if ((snapshot.mode === "julia") !== formula.isJulia) return false;
  if (
    snapshot.mode === "julia" &&
    canonicalJsonV1(formula.juliaC) !== canonicalJsonV1(snapshot.juliaC)
  ) {
    return false;
  }
  if (record(formula.params) && Object.hasOwn(formula.params, "formula")) {
    if (
      !record(formula.params.formula) ||
      canonicalJsonV1(formula.params.formula) !==
        canonicalJsonV1(snapshot.resolvedParameters)
    ) {
      return false;
    }
  }
  if (
    record(snapshot.resolvedParameters) &&
    Object.hasOwn(snapshot.resolvedParameters, "power") &&
    formula.power !== snapshot.resolvedParameters.power
  ) {
    return false;
  }
  return render.maxIterations === snapshot.iterations;
}

/**
 * Reader-first Document v3 seam. It never enables a v3 writer and never
 * consults a catalog, route, cloud store, alias table, or "latest" revision.
 */
export async function readFractalDocumentV3(
  input: unknown,
): Promise<DocumentV3ReadResult> {
  let cloned: unknown;
  try {
    cloned = clonePortableJsonV1(input);
  } catch {
    return {
      mode: "invalid",
      errors: [
        {
          code: "unsafe-input",
          path: "",
          message:
            "Document input must be finite, acyclic, accessor-free plain JSON.",
        },
      ],
    };
  }
  if (!record(cloned)) return invalid("", "Document v3 must be a JSON object.");
  if (
    !Number.isSafeInteger(cloned.schemaVersion) ||
    Number(cloned.schemaVersion) < 0
  ) {
    return invalid(
      "schemaVersion",
      "schemaVersion must be a non-negative safe integer.",
    );
  }
  if (Number(cloned.schemaVersion) > FRACTAL_DOCUMENT_V3_READER_VERSION) {
    const future = deepFreeze(cloned as unknown as FractalDocumentV3);
    return readonly(
      future,
      input,
      "future-document-version",
      `Document v${String(cloned.schemaVersion)} is newer than the v3 reader.`,
    );
  }
  if (
    cloned.schemaVersion !== FRACTAL_DOCUMENT_V3_READER_VERSION ||
    !exactKeys(cloned, REQUIRED_DOCUMENT_KEYS, OPTIONAL_DOCUMENT_KEYS)
  ) {
    return invalid(
      "",
      "Expected a closed Document v3 object with a formulaSnapshot.",
    );
  }
  const durableError = validateDurableState(cloned);
  const document = deepFreeze(cloned as unknown as FractalDocumentV3);
  if (durableError) {
    return readonly(
      document,
      input,
      "durable-state-invalid",
      `Document durable state is malformed at ${durableError}; execution is disabled.`,
    );
  }
  const rawSnapshot = cloned.formulaSnapshot;
  if (!snapshotShape(rawSnapshot)) {
    return readonly(
      document,
      input,
      "snapshot-shape-invalid",
      "The embedded Formula snapshot is malformed and cannot execute.",
    );
  }
  if (Number(rawSnapshot.schemaVersion) > FORMULA_SNAPSHOT_V1_VERSION) {
    return readonly(
      document,
      input,
      "future-snapshot-version",
      `Formula snapshot v${String(rawSnapshot.schemaVersion)} is newer than this reader.`,
    );
  }
  if (Number(rawSnapshot.schemaVersion) !== FORMULA_SNAPSHOT_V1_VERSION) {
    return readonly(
      document,
      input,
      "snapshot-shape-invalid",
      "Formula snapshot version is invalid.",
    );
  }
  if (
    !FORMULA_SCOPES.has(rawSnapshot.scope as FormulaScopeV1) ||
    !isFormulaIdForScopeV1(
      rawSnapshot.scope as FormulaScopeV1,
      rawSnapshot.formulaId,
    )
  ) {
    return readonly(
      document,
      input,
      "formula-identity-invalid",
      "The snapshot Formula ID does not match its declared scope.",
    );
  }
  if (!snapshotStateMatchesDocument(cloned, rawSnapshot)) {
    return readonly(
      document,
      input,
      rawSnapshot.formulaId ===
        (cloned.formula as Record<string, unknown>).formulaId
        ? "document-snapshot-state-mismatch"
        : "document-snapshot-identity-mismatch",
      "Document state and its embedded Formula snapshot disagree.",
    );
  }
  if (rawSnapshot.languageVersion !== "frm-like/1") {
    return readonly(
      document,
      input,
      "unsupported-language-version",
      "This FRM-like language version is not executable by the v1 reader.",
    );
  }
  if (rawSnapshot.stdlibVersion !== 1) {
    return readonly(
      document,
      input,
      "unsupported-stdlib-version",
      "This FRM-like standard-library version is not executable by the v1 reader.",
    );
  }
  if (rawSnapshot.numericProfile !== "standard32") {
    return readonly(
      document,
      input,
      "unsupported-numeric-profile",
      "This NumericProfile is unsupported; the artwork remains preserved read-only.",
    );
  }
  if (
    !isFormulaRevisionV1(rawSnapshot.sourceRevision) ||
    !isFormulaRevisionV1(rawSnapshot.semanticHash) ||
    (Object.hasOwn(rawSnapshot, "profileRevision") &&
      !isFormulaRevisionV1(rawSnapshot.profileRevision))
  ) {
    return readonly(
      document,
      input,
      "snapshot-shape-invalid",
      "Snapshot revisions must be lowercase SHA-256 digests.",
    );
  }
  const sourceBytes = new TextEncoder().encode(
    rawSnapshot.source as string,
  ).byteLength;
  if (sourceBytes > FORMULA_SNAPSHOT_V1_PORTABLE_SOURCE_BYTES) {
    return readonly(
      document,
      input,
      "source-exceeds-portable-ceiling",
      "Embedded source exceeds the portable reader ceiling and was not executed.",
    );
  }
  if (sourceBytes > FORMULA_SNAPSHOT_V1_EXECUTABLE_SOURCE_BYTES) {
    return readonly(
      document,
      input,
      "legacy-source-over-current-limit",
      "Legacy source is preserved exactly but exceeds the current executable limit.",
    );
  }
  if (
    !Number.isSafeInteger(rawSnapshot.iterations) ||
    Number(rawSnapshot.iterations) < 1 ||
    Number(rawSnapshot.iterations) > 1_000_000 ||
    (rawSnapshot.mode !== "parameter-plane" && rawSnapshot.mode !== "julia") ||
    (rawSnapshot.mode === "julia"
      ? !Object.hasOwn(rawSnapshot, "juliaC") || !finitePair(rawSnapshot.juliaC)
      : Object.hasOwn(rawSnapshot, "juliaC"))
  ) {
    return readonly(
      document,
      input,
      "resolved-parameters-invalid",
      "Resolved parameters, mode, Julia state, or iteration budget is invalid.",
    );
  }

  let safety: Awaited<ReturnType<typeof validateFormulaSafetyEnvelopeV1>>;
  try {
    safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: rawSnapshot.source,
      sourceRevision: rawSnapshot.sourceRevision,
      semanticHash: rawSnapshot.semanticHash,
      languageVersion: rawSnapshot.languageVersion,
      stdlibVersion: rawSnapshot.stdlibVersion,
      supportedNumericProfiles: ["standard32"],
      parameters: rawSnapshot.parameterSchema,
      programModel: "orbit",
      termination: rawSnapshot.termination,
      channels: rawSnapshot.channels,
      capabilities: [],
    });
  } catch {
    return readonly(
      document,
      input,
      "snapshot-safety-invalid",
      "The embedded Formula snapshot could not be validated safely.",
    );
  }
  if (!safety.ok) {
    return readonly(
      document,
      input,
      "snapshot-safety-invalid",
      `The embedded Formula snapshot failed the Universal Safety Envelope (${safety.code}).`,
    );
  }
  if (
    !resolvedParametersMatch(
      safety.executable.parameters,
      rawSnapshot.resolvedParameters,
    )
  ) {
    return readonly(
      document,
      input,
      "resolved-parameters-invalid",
      "Resolved parameters do not match the validated Formula parameter schema.",
    );
  }

  const snapshot = document.formulaSnapshot;
  return {
    mode: "readable-v3",
    writer: "disabled",
    document,
    snapshot,
    ir: safety.ir,
    original: input,
    warnings: Object.freeze([
      "Document v3 writer is disabled; embedded bytes are reader-only.",
    ]),
  };
}
