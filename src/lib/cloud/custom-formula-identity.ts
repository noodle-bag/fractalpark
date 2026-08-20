/**
 * Cloud custom-formula identity boundaries.
 *
 * Persistence and API resource paths use a bare UUID. Runtime state uses the
 * namespaced `custom-<uuid>` form so cloud formulas cannot collide with the
 * built-in catalog. Readers accept the historical bare-UUID runtime reference;
 * writers always emit the namespaced form.
 */

import { isStandardFormulaIdV1 } from '@/engine/formulas/v1/identity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNTIME_PREFIX = 'custom-';

declare const storageIdBrand: unique symbol;
declare const runtimeIdBrand: unique symbol;

export type CloudCustomFormulaStorageId = string & {
  readonly [storageIdBrand]: 'CloudCustomFormulaStorageId';
};

export type CloudCustomFormulaRuntimeId = `custom-${string}` & {
  readonly [runtimeIdBrand]: 'CloudCustomFormulaRuntimeId';
};

export interface CloudCustomFormulaIdentity {
  storageId: CloudCustomFormulaStorageId;
  runtimeId: CloudCustomFormulaRuntimeId;
  source: 'runtime' | 'legacy-storage';
}

export function parseCloudCustomFormulaStorageId(
  value: string,
): CloudCustomFormulaStorageId | null {
  if (!UUID_PATTERN.test(value)) return null;
  return value.toLowerCase() as CloudCustomFormulaStorageId;
}

export function toCloudCustomFormulaRuntimeId(
  storageId: CloudCustomFormulaStorageId,
): CloudCustomFormulaRuntimeId {
  return `${RUNTIME_PREFIX}${storageId}` as CloudCustomFormulaRuntimeId;
}

export function parseCloudCustomFormulaRuntimeId(
  value: string,
): CloudCustomFormulaIdentity | null {
  if (!value.startsWith(RUNTIME_PREFIX)) return null;
  const storageId = parseCloudCustomFormulaStorageId(
    value.slice(RUNTIME_PREFIX.length),
  );
  if (!storageId) return null;
  return {
    storageId,
    runtimeId: toCloudCustomFormulaRuntimeId(storageId),
    source: 'runtime',
  };
}

/**
 * Parse a cloud formula reference at a runtime/document/URL read boundary.
 * Bare UUIDs are the v0.4.16-v0.4.18 legacy representation and are accepted
 * only when the caller explicitly keeps the compatibility read enabled.
 */
export function parseCloudCustomFormulaReference(
  value: string,
  options: { acceptLegacyStorageId?: boolean } = {},
): CloudCustomFormulaIdentity | null {
  const runtime = parseCloudCustomFormulaRuntimeId(value);
  if (runtime) return runtime;
  if (options.acceptLegacyStorageId === false) return null;

  const storageId = parseCloudCustomFormulaStorageId(value);
  if (!storageId) return null;
  return {
    storageId,
    runtimeId: toCloudCustomFormulaRuntimeId(storageId),
    source: 'legacy-storage',
  };
}

/** Canonicalize only strict cloud identities; preserve all other formula IDs. */
export function canonicalizeCloudCustomFormulaRuntimeId(value: string): string {
  // Standard identities are deterministic UUIDv5 values. They share the
  // historical bare-UUID shape but must never enter the cloud-custom
  // namespace; Mine/Community identities are UUIDv4 by contract.
  if (isStandardFormulaIdV1(value)) return value;
  return parseCloudCustomFormulaReference(value)?.runtimeId ?? value;
}
