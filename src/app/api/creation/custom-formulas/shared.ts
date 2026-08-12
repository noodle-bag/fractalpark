/**
 * Shared helpers for the custom formula routes (spec §17.1): body parsing,
 * server-side compile + builtin-conflict validation, and the request hash
 * input to the idempotency gate.
 */

import { createHash, randomUUID } from 'node:crypto';

import { CloudApiError } from '@/lib/cloud/api';
import {
  CUSTOM_FORMULA_MAX_SOURCE_BYTES,
  CUSTOM_FORMULA_NAME_MAX_LENGTH,
} from '@/lib/cloud/custom-formulas';
import { compileImportedFrm } from '@/engine/frm/compile';
import type { FrmSemanticsVersion } from '@/engine/frm/semantics-version';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';

const MAX_BODY_BYTES = 128 * 1024;

export function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new CloudApiError('validation_failed');
  }
  return value;
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('idempotency-key') ?? '';
  return requireUuid(key.trim());
}

export function newFormulaRuntimeId(formulaId: string): string {
  return `custom-${formulaId}`;
}

export interface FormulaWriteInput {
  name: string;
  source: string;
  experienceHint: unknown | null;
  expectedRevision: number | null;
}

export async function parseFormulaWriteBody(
  request: Request,
  options: { requireExpectedRevision?: boolean } = {},
): Promise<FormulaWriteInput> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    throw new CloudApiError('payload_too_large');
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new CloudApiError('validation_failed');
  }
  if (!body || typeof body !== 'object') {
    throw new CloudApiError('validation_failed');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > CUSTOM_FORMULA_NAME_MAX_LENGTH) {
    throw new CloudApiError('validation_failed');
  }

  const source = typeof body.source === 'string' ? body.source : '';
  const sourceBytes = Buffer.byteLength(source, 'utf8');
  if (sourceBytes < 1) {
    throw new CloudApiError('validation_failed');
  }
  if (sourceBytes > CUSTOM_FORMULA_MAX_SOURCE_BYTES) {
    throw new CloudApiError('payload_too_large');
  }

  let experienceHint: unknown | null = null;
  if ('experienceHint' in body && body.experienceHint !== null && body.experienceHint !== undefined) {
    const hint = body.experienceHint;
    if (typeof hint !== 'object' || Array.isArray(hint)) {
      throw new CloudApiError('validation_failed');
    }
    // Round-trip through JSON to strip prototypes/functions and cap size.
    try {
      const serialized = JSON.stringify(hint);
      if (Buffer.byteLength(serialized, 'utf8') > 4096) {
        throw new CloudApiError('validation_failed');
      }
      experienceHint = JSON.parse(serialized);
    } catch (error) {
      if (error instanceof CloudApiError) throw error;
      throw new CloudApiError('validation_failed');
    }
  }

  let expectedRevision: number | null = null;
  if (options.requireExpectedRevision) {
    const value = body.expectedRevision;
    if (!Number.isInteger(value) || (value as number) < 1) {
      throw new CloudApiError('validation_failed');
    }
    expectedRevision = value as number;
  }

  return { name, source, experienceHint, expectedRevision };
}

/**
 * Server-side acceptance: the runtime id must not shadow a built-in, and
 * the source must compile. registerBuiltins() is idempotent; the catalog
 * check mirrors formula-resolver's builtin-id-conflict semantics.
 */
export function assertFormulaCompiles(
  runtimeId: string,
  source: string,
  frmSemanticsVersion: FrmSemanticsVersion,
): void {
  registerBuiltins();
  if (getFormulaMetadata(runtimeId)) {
    throw new CloudApiError('formula_builtin_conflict');
  }
  const result = compileImportedFrm(
    source,
    runtimeId,
    frmSemanticsVersion,
  );
  if (!result.success || !result.plugin) {
    throw new CloudApiError('formula_compile_failed');
  }
}

export function formulaRequestHash(parts: Record<string, unknown>): string {
  return sha256Hex(JSON.stringify(parts));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export { randomUUID };
