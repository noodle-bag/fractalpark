import type { FormulaIdV1, FormulaScopeV1 } from "./types";

export const FORMULA_ID_NAMESPACE_V1 = "4287abf5-af50-5f75-9d2a-f56bec9bdf2b";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isStandardFormulaIdV1(value: unknown): value is FormulaIdV1 {
  return typeof value === "string" && UUID_V5.test(value);
}

export function isOpaqueFormulaIdV1(value: unknown): value is FormulaIdV1 {
  return typeof value === "string" && UUID_V4.test(value);
}

export function parseFormulaIdV1(value: unknown): FormulaIdV1 | undefined {
  return isStandardFormulaIdV1(value) || isOpaqueFormulaIdV1(value)
    ? value
    : undefined;
}

export function isFormulaIdV1(value: unknown): value is FormulaIdV1 {
  return parseFormulaIdV1(value) !== undefined;
}

/** Shape-only. Frozen Standard-manifest membership is checked at the asset boundary. */
export function isFormulaIdForScopeV1(
  scope: FormulaScopeV1,
  value: unknown,
): value is FormulaIdV1 {
  return scope === "standard"
    ? isStandardFormulaIdV1(value)
    : isOpaqueFormulaIdV1(value);
}

export type RandomUuidV4 = () => string;

function createOpaqueFormulaIdV1(randomUuid: RandomUuidV4): FormulaIdV1 {
  const value = randomUuid();
  if (!isOpaqueFormulaIdV1(value)) throw new Error("invalid-uuid-v4-generator");
  return value;
}

function browserRandomUuidV4(): string {
  if (!globalThis.crypto?.randomUUID)
    throw new Error("web-crypto-random-uuid-required");
  return globalThis.crypto.randomUUID();
}

export function createMineFormulaIdV1(
  randomUuid: RandomUuidV4 = browserRandomUuidV4,
): FormulaIdV1 {
  return createOpaqueFormulaIdV1(randomUuid);
}

export function createCommunityFormulaIdV1(
  randomUuid: RandomUuidV4 = browserRandomUuidV4,
): FormulaIdV1 {
  return createOpaqueFormulaIdV1(randomUuid);
}
