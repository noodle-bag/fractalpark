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
import { resolveFrmSemanticsVersion, type FrmSemanticsVersion } from '@/engine/frm/semantics-version';

export class CustomFormulaServiceError extends Error {
  readonly code:
    | 'not_found'
    | 'quota_exceeded'
    | 'revision_conflict'
    | 'idempotency_conflict'
    | 'account_deleting'
    | 'validation_failed'
    | 'unavailable';
  readonly status?: number;
  /** Structured PostgREST/PostgreSQL code, retained for safe read fallback. */
  readonly backendCode?: string;

  constructor(
    code: CustomFormulaServiceError['code'],
    message?: string,
    status?: number,
    backendCode?: string,
  ) {
    super(message ?? code);
    this.name = 'CustomFormulaServiceError';
    this.code = code;
    this.status = status;
    this.backendCode = backendCode;
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
    let backendCode: string | undefined;
    let backendMessage: string | undefined;
    try {
      const body = (await response.json()) as { code?: unknown; message?: unknown };
      backendCode = typeof body.code === 'string' ? body.code : undefined;
      backendMessage = typeof body.message === 'string' ? body.message : undefined;
    } catch {
      // Preserve the HTTP status even when the backend body is not JSON.
    }
    throw new CustomFormulaServiceError(
      'unavailable',
      backendMessage ?? `PostgREST ${response.status}`,
      response.status,
      backendCode,
    );
  }
  return (await response.json()) as T;
}

const MISSING_SEMANTICS_COLUMN_CODES = new Set(['42703', 'PGRST204']);

function isMissingSemanticsColumn(error: unknown): boolean {
  return (
    error instanceof CustomFormulaServiceError &&
    error.code === 'unavailable' &&
    error.backendCode !== undefined &&
    MISSING_SEMANTICS_COLUMN_CODES.has(error.backendCode) &&
    error.message.includes('frm_semantics_version')
  );
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
    case 'validation_failed':
      return new CustomFormulaServiceError('validation_failed');
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
  /** FRM compile-semantics contract (spec §3); absent when the column is missing/NULL (reads as v1). */
  frmSemanticsVersion?: FrmSemanticsVersion;
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
  frm_semantics_version?: number | null;
  created_at: string;
  updated_at: string;
  source?: string;
}

const SUMMARY_SELECT = 'id,name,revision,source_bytes,experience_hint,created_at,updated_at,frm_semantics_version';
/** Pre-migration summary select: identical minus the additive column. */
const SUMMARY_SELECT_LEGACY = 'id,name,revision,source_bytes,experience_hint,created_at,updated_at';
const DETAIL_SELECT = `${SUMMARY_SELECT},source`;
/** Pre-migration detail select: identical minus the additive column. */
const DETAIL_SELECT_LEGACY = `${SUMMARY_SELECT_LEGACY},source`;

function toSummaryDto(row: CustomFormulaRow): CustomFormulaSummaryDto {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    sourceBytes: row.source_bytes,
    hasExperienceHint: row.experience_hint != null,
    frmSemanticsVersion:
      row.frm_semantics_version == null
        ? undefined
        : resolveFrmSemanticsVersion(row.frm_semantics_version),
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
  const listUrl = (select: string) =>
    `custom_formulas?select=${select}&owner_id=eq.${ownerId}` + '&order=updated_at.desc,id.desc';
  let rows: CustomFormulaRow[];
  try {
    rows = await postgrestJson<CustomFormulaRow[]>(listUrl(SUMMARY_SELECT));
  } catch (error) {
    if (!isMissingSemanticsColumn(error)) throw error;
    // Safe pre-migration fallback: only a structured missing-column error
    // may retry without frm_semantics_version. Availability, auth, and
    // permission failures must remain failures rather than masquerading as v1.
    rows = await postgrestJson<CustomFormulaRow[]>(listUrl(SUMMARY_SELECT_LEGACY));
  }
  return rows.map(toSummaryDto);
}

export async function getCustomFormula(ownerId: string, formulaId: string): Promise<CustomFormulaDetailDto> {
  const detailUrl = (select: string) =>
    `custom_formulas?select=${select}&id=eq.${formulaId}&owner_id=eq.${ownerId}&limit=1`;
  let rows: CustomFormulaRow[];
  try {
    rows = await postgrestJson<CustomFormulaRow[]>(detailUrl(DETAIL_SELECT));
  } catch (error) {
    if (!isMissingSemanticsColumn(error)) throw error;
    // Pre-migration fallback: frm_semantics_version is an additive column
    // applied under hosted-ops review. Retry only when PostgREST identifies
    // that exact missing column; the DTO then reports undefined/read-as-v1.
    rows = await postgrestJson<CustomFormulaRow[]>(detailUrl(DETAIL_SELECT_LEGACY));
  }
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
  /** Only forwarded when explicitly given; ordinary saves never auto-upgrade the version. */
  frmSemanticsVersion?: FrmSemanticsVersion;
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
    ...(args.frmSemanticsVersion !== undefined
      ? { p_frm_semantics_version: args.frmSemanticsVersion }
      : {}),
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
      case 'validation_failed':
        return new CloudApiError('validation_failed');
      default:
        return new CloudApiError('unavailable');
    }
  }
  return new CloudApiError('unavailable');
}
