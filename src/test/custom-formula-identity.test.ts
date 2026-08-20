import { describe, expect, it } from 'vitest';

import {
  canonicalizeCloudCustomFormulaRuntimeId,
  parseCloudCustomFormulaReference,
  parseCloudCustomFormulaRuntimeId,
  parseCloudCustomFormulaStorageId,
  toCloudCustomFormulaRuntimeId,
} from '@/lib/cloud/custom-formula-identity';

const STORAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUNTIME_ID = `custom-${STORAGE_ID}`;
const STANDARD_ID = '00e14aa8-b766-54ea-a359-3f5d20d329b7';

describe('cloud custom-formula identity', () => {
  it('keeps storage UUIDs and runtime IDs explicit and reversible', () => {
    const storageId = parseCloudCustomFormulaStorageId(STORAGE_ID.toUpperCase());

    expect(storageId).toBe(STORAGE_ID);
    expect(storageId && toCloudCustomFormulaRuntimeId(storageId)).toBe(RUNTIME_ID);
    expect(parseCloudCustomFormulaRuntimeId(RUNTIME_ID)).toEqual({
      storageId: STORAGE_ID,
      runtimeId: RUNTIME_ID,
      source: 'runtime',
    });
  });

  it('dual-reads a historical bare UUID and canonicalizes it for runtime use', () => {
    expect(parseCloudCustomFormulaReference(STORAGE_ID)).toEqual({
      storageId: STORAGE_ID,
      runtimeId: RUNTIME_ID,
      source: 'legacy-storage',
    });
    expect(canonicalizeCloudCustomFormulaRuntimeId(STORAGE_ID)).toBe(RUNTIME_ID);
    expect(
      parseCloudCustomFormulaReference(STORAGE_ID, {
        acceptLegacyStorageId: false,
      }),
    ).toBeNull();
  });

  it('preserves Standard UUIDv5 identities outside the custom namespace', () => {
    expect(canonicalizeCloudCustomFormulaRuntimeId(STANDARD_ID)).toBe(STANDARD_ID);
  });

  it.each([
    'mandelbrot',
    'custom-local',
    'custom-custom-550e8400-e29b-41d4-a716-446655440000',
    'custom-550e8400-e29b-41d4-a716-44665544000z',
    'frm-example',
    'custom-imported-deadbeef',
    '',
  ])('rejects unsupported identity %s', (value) => {
    expect(parseCloudCustomFormulaStorageId(value)).toBeNull();
    expect(parseCloudCustomFormulaRuntimeId(value)).toBeNull();
    expect(parseCloudCustomFormulaReference(value)).toBeNull();
    expect(canonicalizeCloudCustomFormulaRuntimeId(value)).toBe(value);
  });
});
