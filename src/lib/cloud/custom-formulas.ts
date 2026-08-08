/**
 * v0.4.16: owner custom formula cloud store (ADR 0006, spec §17.1).
 *
 * Mirrors the draft data layer: reads go through service-key PostgREST with
 * an explicit owner filter; writes go through the narrow owner RPCs which
 * pack idempotency, quota, and optimistic concurrency into one transaction.
 * Compile and builtin-conflict validation happen here in Node (the engine
 * is TypeScript); the database constraints remain the last line of defense.
 */

import { getSupabaseConfig } from './config';
import { CloudApiError } from './api';

export class CustomFormulaServiceError extends Error {
  readonly code:
    | 'not_found'
    | 'quota_exceeded'
    | 'revision_conflict'
    | 'idempotency_conflict'
    | 'account_deleting'
    | 'unavailable';
  readonly status?: number;

  constructor(code: CustomFormulaServiceError['code'], message?: string, status?: number) {
    super(message ?? code);
    this.name = 'CustomFormulaServiceError';
    this.code = code;
    this.status = status;
  }
}

interface PostgrestOptions {
  method?: string;
  body?: unknown;
}

async function postgrest(path: string, options: PostgrestOptions = {}): Promise<Response> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });
  return response;
}

async function postgrestJson<T>(path: string): Promise<T> {
  const response = await postgrest(path);
  if (!response.ok) {
    throw new CustomFormulaServiceError('unavailable', `PostgREST ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

function mapRpcError(raw: string): CustomFormulaServiceError {
  const prefix = raw.split(':', 1)[0];
  switch (prefix) {
    case 'idempotency_conflict':
      return new CustomFormulaServiceError('idempotency_conflict');
    case 'quota_exceeded':
      return new CustomFormulaServiceError('quota_exceeded');
    case 'revision_conflict':
      return new CustomFormulaServiceError('revision_conflict');
    case 'not_found':
      return new CustomFormulaServiceError('not_found');
    case 'account_deleting':
      return new CustomFormulaServiceError('account_deleting');
    default:
      return new CustomFormulaServiceError('unavailable');
  }
}

async function callFormulaRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await postgrest(`rpc/${fn}`, { method: 'POST', body: args });
  if (!response.ok) {
    let message = '';
    try {
      const parsed = (await response.json()) as { message?: string };
      message = typeof parsed.message === 'string' ? parsed.message : '';
    } catch {
      message = '';
    }
    throw mapRpcError(message);
  }
  return (await response.json()) as T;
}

export const CUSTOM_FORMULA_MAX_SOURCE_BYTES = 65_536;
export const CUSTOM_FORMULA_QUOTA = 50;
export const CUSTOM_FORMULA_NAME_MAX_LENGTH = 80;

export interface CustomFormulaSummaryDto {
  id: string;
  name: string;
  revision: number;
  sourceBytes: number;
  hasExperienceHint: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFormulaDetailDto extends CustomFormulaSummaryDto {
  source: string;
  experienceHint: unknown | null;
}

interface CustomFormulaRow {
  id: string;
  name: string;
  revision: number;
  source_bytes: number;
  experience_hint?: unknown | null;
  created_at: string;
  updated_at: string;
  source?: string;
}

const SUMMARY_SELECT = 'id,name,revision,source_bytes,experience_hint,created_at,updated_at';
const DETAIL_SELECT = `${SUMMARY_SELECT},source`;

function toSummaryDto(row: CustomFormulaRow): CustomFormulaSummaryDto {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    sourceBytes: row.source_bytes,
    hasExperienceHint: row.experience_hint != null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDetailDto(row: CustomFormulaRow): CustomFormulaDetailDto {
  return {
    ...toSummaryDto(row),
    source: row.source ?? '',
    experienceHint: row.experience_hint ?? null,
  };
}

export async function listCustomFormulas(ownerId: string): Promise<CustomFormulaSummaryDto[]> {
  const rows = await postgrestJson<CustomFormulaRow[]>(
    `custom_formulas?select=${SUMMARY_SELECT}&owner_id=eq.${ownerId}` +
      '&order=updated_at.desc,id.desc',
  );
  return rows.map(toSummaryDto);
}

export async function getCustomFormula(ownerId: string, formulaId: string): Promise<CustomFormulaDetailDto> {
  const rows = await postgrestJson<CustomFormulaRow[]>(
    `custom_formulas?select=${DETAIL_SELECT}&id=eq.${formulaId}&owner_id=eq.${ownerId}&limit=1`,
  );
  if (rows.length === 0) {
    throw new CustomFormulaServiceError('not_found');
  }
  return toDetailDto(rows[0]);
}

export interface CustomFormulaSaveResult {
  replayed: boolean;
  formulaId: string;
  revision: number;
}

interface RpcFormulaSavePayload {
  replayed: boolean;
  formula_id?: string;
  revision?: number;
  formula?: CustomFormulaRow;
}

export async function saveCustomFormula(args: {
  ownerId: string;
  formulaId: string | null;
  expectedRevision: number | null;
  idempotencyKey: string;
  requestHash: string;
  name: string;
  source: string;
  experienceHint: unknown | null;
}): Promise<CustomFormulaSaveResult> {
  const payload = await callFormulaRpc<RpcFormulaSavePayload>('fractalpark_custom_formula_save', {
    p_owner_id: args.ownerId,
    p_idempotency_key: args.idempotencyKey,
    p_request_hash: args.requestHash,
    p_name: args.name,
    p_source: args.source,
    p_experience_hint: args.experienceHint,
    p_formula_id: args.formulaId,
    p_expected_revision: args.expectedRevision,
  });
  if (payload.replayed) {
    if (!payload.formula_id || typeof payload.revision !== 'number') {
      throw new CustomFormulaServiceError('unavailable', 'malformed rpc result');
    }
    return { replayed: true, formulaId: payload.formula_id, revision: payload.revision };
  }
  if (!payload.formula) {
    throw new CustomFormulaServiceError('unavailable', 'malformed rpc result');
  }
  return { replayed: false, formulaId: payload.formula.id, revision: payload.formula.revision };
}

export async function deleteCustomFormula(args: {
  ownerId: string;
  formulaId: string;
  expectedRevision: number | null;
  idempotencyKey: string;
  requestHash: string;
}): Promise<{ replayed: boolean }> {
  const payload = await callFormulaRpc<{ replayed: boolean }>('fractalpark_custom_formula_delete', {
    p_owner_id: args.ownerId,
    p_formula_id: args.formulaId,
    p_idempotency_key: args.idempotencyKey,
    p_request_hash: args.requestHash,
    p_expected_revision: args.expectedRevision,
  });
  return { replayed: payload.replayed === true };
}

/** Map service errors onto the frozen API error envelope. */
export function toCustomFormulaApiError(error: unknown): CloudApiError {
  if (error instanceof CustomFormulaServiceError) {
    switch (error.code) {
      case 'not_found':
        return new CloudApiError('not_found');
      case 'quota_exceeded':
        return new CloudApiError('quota_exceeded');
      case 'revision_conflict':
        return new CloudApiError('revision_conflict');
      case 'idempotency_conflict':
        return new CloudApiError('idempotency_conflict');
      case 'account_deleting':
        return new CloudApiError('account_deleting');
      default:
        return new CloudApiError('unavailable');
    }
  }
  return new CloudApiError('unavailable');
}
