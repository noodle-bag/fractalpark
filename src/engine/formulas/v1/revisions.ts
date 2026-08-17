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

const SHA256_SYNC_K = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Deterministic pure-TypeScript SHA-256 for load-time self-hash validation of
 * bundled machine-generated assets, where the async WebCrypto path cannot run
 * inside a synchronous module initializer. Not for new authentication,
 * password, or token uses; those keep the platform crypto APIs.
 */
export function sha256HexSyncV1(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let index = 0; index < 16; index++)
      w[index] = view.getUint32(block + index * 4);
    for (let index = 16; index < 64; index++) {
      const x = w[index - 15]!;
      const y = w[index - 2]!;
      const s0 =
        (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) >>> 0;
      const s1 =
        (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) >>>
        0;
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index++) {
      const s1 =
        (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7))) >>>
        0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 =
        (h + s1 + ch + SHA256_SYNC_K[index]! + w[index]!) >>> 0;
      const s0 =
        (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10))) >>>
        0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
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
