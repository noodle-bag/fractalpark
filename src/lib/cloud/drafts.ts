/**
 * Owner draft service for the v0.4.15 cloud creation loop (spec sections
 * 4.2, 5, 6, 7).
 *
 * Reads go through PostgREST with the service role; every write goes through
 * the narrow owner RPCs so idempotency, quotas, and optimistic concurrency
 * hold inside one transaction. The browser never sees the service key, and
 * error mapping never leaks database details: RPC errors arrive as
 * '<code>: <message>' and only the code prefix crosses to the client.
 */

import { randomUUID } from 'node:crypto';

import { CloudApiError } from './api';
import { getSupabaseConfig } from './config';

const DRAFT_SUMMARY_SELECT =
  'id,title,revision,config_bytes,thumbnail_bytes,remix_source_type,remix_source_id,created_at,updated_at';
const DRAFT_DETAIL_SELECT = `${DRAFT_SUMMARY_SELECT},envelope,thumbnail_path`;

export class DraftServiceError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryAfter?: number;

  constructor(code: string, message?: string, status?: number, retryAfter?: number) {
    super(message ?? code);
    this.name = 'DraftServiceError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

interface PostgrestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function postgrest(path: string, options: PostgrestOptions = {}): Promise<Response> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });
  return response;
}

async function postgrestJson<T>(path: string, options: PostgrestOptions = {}): Promise<T> {
  const response = await postgrest(path, options);
  if (!response.ok) {
    throw new DraftServiceError('unavailable', `PostgREST ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Map an RPC error body ('<code>: <message>') to the frozen API codes. */
function mapRpcError(raw: string): DraftServiceError {
  const prefix = raw.split(':', 1)[0];
  switch (prefix) {
    case 'idempotency_conflict':
      return new DraftServiceError('idempotency_conflict');
    case 'quota_exceeded':
      return new DraftServiceError('quota_exceeded');
    case 'revision_conflict':
      return new DraftServiceError('revision_conflict');
    case 'not_found':
      return new DraftServiceError('not_found');
    default:
      // Unknown RPC failures are our bug, never the client's; do not keep
      // the raw message (future-proof against accidental leakage).
      return new DraftServiceError('unavailable');
  }
}

async function callDraftRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
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

export interface DraftSummaryDto {
  id: string;
  title: string;
  revision: number;
  configBytes: number;
  thumbnailBytes: number;
  hasThumbnail: boolean;
  remixSource: { type: string; id: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDetailDto extends DraftSummaryDto {
  envelope: unknown;
  thumbnailPath: string | null;
}

interface DraftRow {
  id: string;
  title: string;
  revision: number;
  config_bytes: number;
  thumbnail_bytes: number;
  remix_source_type: string | null;
  remix_source_id: string | null;
  created_at: string;
  updated_at: string;
  envelope?: unknown;
  thumbnail_path?: string | null;
}

function toSummaryDto(row: DraftRow): DraftSummaryDto {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    configBytes: row.config_bytes,
    thumbnailBytes: row.thumbnail_bytes,
    hasThumbnail: row.thumbnail_bytes > 0,
    remixSource:
      row.remix_source_type && row.remix_source_id
        ? { type: row.remix_source_type, id: row.remix_source_id }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDetailDto(row: DraftRow): DraftDetailDto {
  return { ...toSummaryDto(row), envelope: row.envelope, thumbnailPath: row.thumbnail_path ?? null };
}

export async function listDrafts(ownerId: string): Promise<DraftSummaryDto[]> {
  const rows = await postgrestJson<DraftRow[]>(
    `artwork_drafts?select=${DRAFT_SUMMARY_SELECT}&owner_id=eq.${ownerId}` +
      '&order=updated_at.desc,id.desc',
  );
  return rows.map(toSummaryDto);
}

export async function getDraft(ownerId: string, draftId: string): Promise<DraftDetailDto> {
  const rows = await postgrestJson<DraftRow[]>(
    `artwork_drafts?select=${DRAFT_DETAIL_SELECT}&id=eq.${draftId}&owner_id=eq.${ownerId}&limit=1`,
  );
  if (rows.length === 0) {
    throw new DraftServiceError('not_found');
  }
  return toDetailDto(rows[0]);
}

export interface DraftCreateResult {
  replayed: boolean;
  draftId: string;
  revision: number;
  envelope?: unknown;
}

interface RpcDraftCreatePayload {
  replayed: boolean;
  draft_id?: string;
  revision?: number;
  draft?: DraftRow;
}

export async function createDraft(args: {
  ownerId: string;
  draftId: string;
  idempotencyKey: string;
  requestHash: string;
  title: string;
  canonicalEnvelope: string;
  thumbnailPath: string | null;
  configBytes: number;
  thumbnailBytes: number;
  remixSourceType: string | null;
  remixSourceId: string | null;
}): Promise<DraftCreateResult> {
  const payload = await callDraftRpc<RpcDraftCreatePayload>('fractalpark_draft_create', {
    p_owner_id: args.ownerId,
    p_idempotency_key: args.idempotencyKey,
    p_request_hash: args.requestHash,
    p_title: args.title,
    p_envelope: JSON.parse(args.canonicalEnvelope),
    p_thumbnail_path: args.thumbnailPath,
    p_config_bytes: args.configBytes,
    p_thumbnail_bytes: args.thumbnailBytes,
    p_remix_source_type: args.remixSourceType,
    p_remix_source_id: args.remixSourceId,
    p_draft_id: args.draftId,
  });
  if (payload.replayed) {
    if (!payload.draft_id || typeof payload.revision !== 'number') {
      throw new DraftServiceError('unavailable', 'malformed rpc result');
    }
    return { replayed: true, draftId: payload.draft_id, revision: payload.revision };
  }
  if (!payload.draft) {
    throw new DraftServiceError('unavailable', 'malformed rpc result');
  }
  return {
    replayed: false,
    draftId: payload.draft.id,
    revision: payload.draft.revision,
    envelope: payload.draft.envelope,
  };
}

export async function updateDraft(args: {
  ownerId: string;
  draftId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedRevision: number;
  title: string;
  canonicalEnvelope: string;
  thumbnailPath: string | null;
  configBytes: number;
  thumbnailBytes: number;
}): Promise<DraftCreateResult> {
  const payload = await callDraftRpc<RpcDraftCreatePayload>('fractalpark_draft_update', {
    p_owner_id: args.ownerId,
    p_draft_id: args.draftId,
    p_idempotency_key: args.idempotencyKey,
    p_request_hash: args.requestHash,
    p_expected_revision: args.expectedRevision,
    p_title: args.title,
    p_envelope: JSON.parse(args.canonicalEnvelope),
    p_thumbnail_path: args.thumbnailPath,
    p_config_bytes: args.configBytes,
    p_thumbnail_bytes: args.thumbnailBytes,
  });
  if (payload.replayed) {
    if (!payload.draft_id || typeof payload.revision !== 'number') {
      throw new DraftServiceError('unavailable', 'malformed rpc result');
    }
    return { replayed: true, draftId: payload.draft_id, revision: payload.revision };
  }
  if (!payload.draft) {
    throw new DraftServiceError('unavailable', 'malformed rpc result');
  }
  return {
    replayed: false,
    draftId: payload.draft.id,
    revision: payload.draft.revision,
    envelope: payload.draft.envelope,
  };
}

export async function deleteDraft(args: {
  ownerId: string;
  draftId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<{ replayed: boolean }> {
  const payload = await callDraftRpc<{ replayed: boolean; deleted?: boolean }>(
    'fractalpark_draft_delete',
    {
      p_owner_id: args.ownerId,
      p_draft_id: args.draftId,
      p_idempotency_key: args.idempotencyKey,
      p_request_hash: args.requestHash,
    },
  );
  if (payload.deleted !== true) {
    throw new DraftServiceError('unavailable', 'malformed rpc result');
  }
  return { replayed: payload.replayed === true };
}

/** True when a publication source resolves to a live published row. */
export async function publicationSourceExists(publicationId: string): Promise<boolean> {
  const rows = await postgrestJson<Array<{ id: string }>>(
    `artwork_publications?select=id&id=eq.${publicationId}&status=eq.published&limit=1`,
  );
  return rows.length > 0;
}

const THUMBNAIL_MAGIC: Array<{ bytes: number[]; contentType: string; extension: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], contentType: 'image/png', extension: 'png' },
  { bytes: [0xff, 0xd8, 0xff], contentType: 'image/jpeg', extension: 'jpg' },
  { bytes: [0x52, 0x49, 0x46, 0x46], contentType: 'image/webp', extension: 'webp' },
];

export const DRAFT_THUMBNAIL_MAX_BYTES = 512_000; // 500 KB (spec section 7)

/**
 * Validate and store a base64 draft thumbnail. Size and magic-byte checks
 * happen here; pixel re-encoding is a PR 2 exit-gate decision tracked in the
 * execution ledger (the bucket is owner-only in this commit). Returns the
 * storage path and byte count for the RPC, or throws validation_failed.
 */
export async function storeDraftThumbnail(args: {
  ownerId: string;
  draftId: string;
  base64: string;
}): Promise<{ path: string; bytes: number }> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(args.base64, 'base64');
  } catch {
    throw new DraftServiceError('validation_failed', 'thumbnail is not valid base64');
  }
  if (buffer.length === 0 || buffer.length > DRAFT_THUMBNAIL_MAX_BYTES) {
    throw new DraftServiceError('validation_failed', 'thumbnail size outside the allowed range');
  }
  const magic = THUMBNAIL_MAGIC.find((candidate) =>
    candidate.bytes.every((byte, index) => buffer[index] === byte),
  );
  if (!magic) {
    throw new DraftServiceError('validation_failed', 'thumbnail must be PNG, JPEG, or WebP');
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  // Every upload lands at a fresh path: a replace never overwrites the old
  // object in place, so an RPC failure afterwards can safely delete the new
  // orphan while the draft keeps its previous thumbnail; on success the RPC
  // registers the old path for cleanup.
  const path = `${args.ownerId}/${args.draftId}-${randomUUID().slice(0, 8)}.${magic.extension}`;
  const response = await fetch(`${url}/storage/v1/object/draft-thumbnails/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': magic.contentType,
      'x-upsert': 'true',
      'cache-control': 'no-store',
    },
    body: new Uint8Array(buffer),
  });
  if (!response.ok) {
    throw new DraftServiceError('unavailable', `storage ${response.status}`, response.status);
  }
  return { path, bytes: buffer.length };
}

/** Best-effort delete of a stored thumbnail object (orphan cleanup). */
export async function deleteDraftThumbnailObject(path: string): Promise<void> {
  try {
    const { url, serviceRoleKey } = getSupabaseConfig();
    await fetch(`${url}/storage/v1/object/draft-thumbnails/${path}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
  } catch {
    // Best effort: the object is small and the bucket is private.
  }
}

/** Map service errors to the frozen API codes; anything else stays 503. */
export function toDraftApiError(error: unknown): CloudApiError {
  if (error instanceof DraftServiceError) {
    switch (error.code) {
      case 'not_found':
      case 'validation_failed':
      case 'idempotency_conflict':
      case 'quota_exceeded':
      case 'revision_conflict':
        return new CloudApiError(error.code as 'not_found');
      default:
        return new CloudApiError('unavailable');
    }
  }
  return new CloudApiError('unavailable');
}
