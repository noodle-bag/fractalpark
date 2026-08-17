import { hashFrmLikeV1, type FrmLikeV1Ir } from "@/engine/frm/v1";
import type {
  FormulaBackendRevisionV1,
  FormulaDefinitionV1,
  FormulaProfileV1,
  FormulaRevisionSetV1,
  FormulaRevisionV1,
} from "./types";

const REVISION = /^[0-9a-f]{64}$/;
const BACKEND_BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const MAX_CANONICAL_JSON_DEPTH = 64;
const MAX_CANONICAL_JSON_NODES = 4_096;

export function parseFormulaRevisionV1(
  value: unknown,
): FormulaRevisionV1 | undefined {
  return typeof value === "string" && REVISION.test(value)
    ? (value as FormulaRevisionV1)
    : undefined;
}

export function isFormulaRevisionV1(
  value: unknown,
): value is FormulaRevisionV1 {
  return parseFormulaRevisionV1(value) !== undefined;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return (
    Reflect.ownKeys(value).length === keys.length &&
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function plainDataRecord(value: unknown): value is Record<string, unknown> {
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

export function isFormulaBackendRevisionV1(
  value: unknown,
): value is FormulaBackendRevisionV1 {
  if (!plainDataRecord(value)) return false;
  return (
    exactKeys(value, ["schemaVersion", "buildId", "artifactSha256"]) &&
    value.schemaVersion === 1 &&
    typeof value.buildId === "string" &&
    BACKEND_BUILD_ID.test(value.buildId) &&
    isFormulaRevisionV1(value.artifactSha256)
  );
}

export function isFormulaRevisionSetV1(
  value: unknown,
): value is FormulaRevisionSetV1 {
  if (!plainDataRecord(value)) return false;
  const allowed = [
    "sourceRevision",
    "semanticHash",
    ...(Object.hasOwn(value, "profileRevision") ? ["profileRevision"] : []),
    ...(Object.hasOwn(value, "backendRevision") ? ["backendRevision"] : []),
  ];
  return (
    exactKeys(value, allowed) &&
    isFormulaRevisionV1(value.sourceRevision) &&
    isFormulaRevisionV1(value.semanticHash) &&
    (!Object.hasOwn(value, "profileRevision") ||
      isFormulaRevisionV1(value.profileRevision)) &&
    (!Object.hasOwn(value, "backendRevision") ||
      isFormulaBackendRevisionV1(value.backendRevision))
  );
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

interface CanonicalState {
  nodes: number;
  readonly maxNodes: number;
  readonly active: WeakSet<object>;
}

function canonicalJsonValueV1(
  value: unknown,
  state: CanonicalState,
  depth: number,
): string {
  if (depth > MAX_CANONICAL_JSON_DEPTH)
    throw new Error("canonical-json-too-deep");
  state.nodes++;
  if (state.nodes > state.maxNodes)
    throw new Error("canonical-json-too-large");
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "string") {
    if (hasLoneSurrogate(value))
      throw new Error("invalid-canonical-json-string");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("invalid-canonical-json-number");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (!value || typeof value !== "object")
    throw new Error("invalid-canonical-json-value");
  if (state.active.has(value)) throw new Error("cyclic-canonical-json");
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor?.enumerable || !("value" in descriptor))
          throw new Error("sparse-canonical-json-array");
        items.push(canonicalJsonValueV1(descriptor.value, state, depth + 1));
      }
      if (
        Reflect.ownKeys(value).some((key) => {
          if (key === "length") return false;
          return typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key);
        })
      )
        throw new Error("invalid-canonical-json-array-property");
      return `[${items.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error("invalid-canonical-json-object");
    if (
      Reflect.ownKeys(value).some((key) => {
        if (typeof key !== "string") return true;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return !descriptor?.enumerable || !("value" in descriptor);
      })
    )
      throw new Error("invalid-canonical-json-object-property");
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    if (Reflect.ownKeys(value).length !== keys.length)
      throw new Error("non-enumerable-canonical-json-property");
    return `{${keys
      .map((key) => {
        if (hasLoneSurrogate(key))
          throw new Error("invalid-canonical-json-key");
        return `${JSON.stringify(key)}:${canonicalJsonValueV1(
          record[key],
          state,
          depth + 1,
        )}`;
      })
      .join(",")}}`;
  } finally {
    state.active.delete(value);
  }
}

/**
 * Locale-independent canonical JSON used by Formula Profile revision v1.
 * `maxNodes` raises the DoS node budget only for already-validated, bounded
 * machine-generated assets such as the exact-677 publication decision ledger;
 * interactive/user-controlled input must keep the default.
 */
export function canonicalJsonV1(
  value: unknown,
  maxNodes: number = MAX_CANONICAL_JSON_NODES,
): string {
  if (!Number.isInteger(maxNodes) || maxNodes < 1)
    throw new Error("invalid-canonical-json-budget");
  return canonicalJsonValueV1(
    value,
    { nodes: 0, active: new WeakSet(), maxNodes },
    0,
  );
}

export async function sha256HexV1(value: string): Promise<FormulaRevisionV1> {
  if (!globalThis.crypto?.subtle) throw new Error("web-crypto-subtle-required");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("") as FormulaRevisionV1;
}

/** Includes Formula ID and source revision; excludes only the recursive hash field. */
export function profileRevisionProjectionV1(
  profile: Omit<FormulaProfileV1, "profileRevision">,
): string {
  return canonicalJsonV1({
    schemaVersion: profile.schemaVersion,
    formulaId: profile.formulaId,
    sourceRevision: profile.sourceRevision,
    parameters: profile.parameters,
    mode: profile.mode,
    ...(Object.hasOwn(profile, "juliaC") ? { juliaC: profile.juliaC } : {}),
    view: profile.view,
    iterations: profile.iterations,
    coloring: profile.coloring,
    palette: profile.palette,
    transform: profile.transform,
  });
}

export async function hashProfileRevisionV1(
  profile: Omit<FormulaProfileV1, "profileRevision">,
): Promise<FormulaRevisionV1> {
  return sha256HexV1(profileRevisionProjectionV1(profile));
}

export async function verifyDefinitionRevisionsV1(
  definition: Pick<
    FormulaDefinitionV1,
    "source" | "sourceRevision" | "semanticHash"
  >,
  ir: FrmLikeV1Ir,
): Promise<"ok" | "source-revision-mismatch" | "semantic-hash-mismatch"> {
  if (!isFormulaRevisionV1(definition.sourceRevision))
    return "source-revision-mismatch";
  if (!isFormulaRevisionV1(definition.semanticHash))
    return "semantic-hash-mismatch";
  try {
    const actual = await hashFrmLikeV1(definition.source, ir);
    if (actual.sourceRevision !== definition.sourceRevision)
      return "source-revision-mismatch";
    if (actual.semanticHash !== definition.semanticHash)
      return "semantic-hash-mismatch";
    return "ok";
  } catch {
    return "semantic-hash-mismatch";
  }
}

export async function verifyProfileRevisionV1(
  profile: FormulaProfileV1,
): Promise<boolean> {
  if (!isFormulaRevisionV1(profile.profileRevision)) return false;
  try {
    return profile.profileRevision === (await hashProfileRevisionV1(profile));
  } catch {
    return false;
  }
}
