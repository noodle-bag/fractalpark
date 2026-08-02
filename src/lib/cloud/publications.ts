/**
 * Owner publication service for the v0.4.15 cloud creation loop (spec
 * sections 4.3, 5, 7, 10.2). Publications are immutable: the server
 * validates attribution, title, description, envelope, provenance,
 * attestation version, rate limits, and quotas; the only mutable facts
 * afterwards are lifecycle state, timestamps, moderation records, and the
 * derived thumbnail.
 *
 * Reads go through PostgREST with the service role; every write is a
 * single-transaction security-definer RPC. The frozen error envelope
 * never carries raw RPC messages.
 */

import { createHash } from 'node:crypto';

import { getSupabaseConfig } from './config';
import { canonicalStringify } from './envelope';
import { DraftServiceError } from './drafts';

/**
 * Current rights attestation version the client must confirm at publish.
 * This module is the source of truth; `src/lib/cloud/attestation.ts` is
 * the browser-safe mirror, and the two are locked equal by a unit test.
 */
export const RIGHTS_ATTESTATION_VERSION = '2026-08-02.v1';
/** Current license display version frozen onto every publication. */
export const LICENSE_VERSION = 'CC-BY-4.0';

export const PUBLISH_TITLE_MAX = 80;
export const PUBLISH_DESCRIPTION_MAX = 500;
export const DISPLAY_NAME_MAX = 40;

interface PostgrestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function postgrest(path: string, options: PostgrestOptions = {}): Promise<Response> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
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
}

async function postgrestJson<T>(path: string, options: PostgrestOptions = {}): Promise<T> {
  const response = await postgrest(path, options);
  if (!response.ok) {
    throw new DraftServiceError('unavailable', `PostgREST ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

function mapRpcError(raw: string): DraftServiceError {
  const prefix = raw.split(':', 1)[0];
  switch (prefix) {
    case 'idempotency_conflict':
      return new DraftServiceError('idempotency_conflict');
    case 'revision_conflict':
      return new DraftServiceError('revision_conflict');
    case 'not_found':
      return new DraftServiceError('not_found');
    case 'validation_failed':
      return new DraftServiceError('validation_failed');
    case 'rate_limited': {
      const retryAfter = Number.parseInt(raw.split(':')[1]?.trim() ?? '', 10);
      return new DraftServiceError(
        'rate_limited',
        undefined,
        undefined,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    default:
      return new DraftServiceError('unavailable');
  }
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
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

function requestHash(parts: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalStringify(parts)).digest('hex');
}

// ---------------------------------------------------------------------------
// Profile (display name; required before the first publish, spec section 3)
// ---------------------------------------------------------------------------

export interface ProfileDto {
  displayName: string | null;
}

interface ProfileRow {
  display_name: string | null;
}

export async function getProfile(ownerId: string): Promise<ProfileDto> {
  const rows = await postgrestJson<ProfileRow[]>(
    `profiles?user_id=eq.${ownerId}&select=display_name`,
  );
  return { displayName: rows[0]?.display_name ?? null };
}

const CONTROL_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u061c\u2028-\u202e\u2060\u2066-\u2069\ufeff]/;
/** Descriptions may span lines; every other control character stays banned. */
const DESCRIPTION_CONTROL_PATTERN =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u061c\u2028-\u202e\u2060\u2066-\u2069\ufeff]/;

/** Validate and persist the display name (1–40 plain-text characters). */
export async function setDisplayName(ownerId: string, displayName: string): Promise<ProfileDto> {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX) {
    throw new DraftServiceError('validation_failed');
  }
  // Plain text only: no control characters, no bidi/format overrides or
  // zero-width spoofing glyphs.
  if (CONTROL_PATTERN.test(trimmed)) {
    throw new DraftServiceError('validation_failed');
  }
  const response = await postgrest('profiles', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: { user_id: ownerId, display_name: trimmed },
  });
  if (!response.ok) {
    throw new DraftServiceError('unavailable', `PostgREST ${response.status}`, response.status);
  }
  return { displayName: trimmed };
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export interface PublicationSummaryDto {
  id: string;
  title: string;
  description: string | null;
  status: 'published' | 'hidden' | 'withdrawn';
  authorDisplayName: string;
  license: string;
  licenseScope: string;
  thumbnailStatus: 'pending' | 'ready' | 'failed';
  remixSource: { type: string; id: string } | null;
  publishedAt: string;
  withdrawnAt: string | null;
}

interface PublicationRow {
  id: string;
  title: string;
  description: string | null;
  status: 'published' | 'hidden' | 'withdrawn';
  author_display_name: string;
  license: string;
  license_scope: string;
  thumbnail_status: 'pending' | 'ready' | 'failed';
  remix_source_type: string | null;
  remix_source_id: string | null;
  published_at: string;
  withdrawn_at: string | null;
}

const PUBLICATION_SELECT =
  'id,title,description,status,author_display_name,license,license_scope,' +
  'thumbnail_status,remix_source_type,remix_source_id,published_at,withdrawn_at';

function toPublicationDto(row: PublicationRow): PublicationSummaryDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    authorDisplayName: row.author_display_name,
    license: row.license,
    licenseScope: row.license_scope,
    thumbnailStatus: row.thumbnail_status,
    remixSource:
      row.remix_source_type && row.remix_source_id
        ? { type: row.remix_source_type, id: row.remix_source_id }
        : null,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
  };
}

export async function listPublications(ownerId: string): Promise<PublicationSummaryDto[]> {
  const rows = await postgrestJson<PublicationRow[]>(
    `artwork_publications?owner_id=eq.${ownerId}&select=${PUBLICATION_SELECT}&order=published_at.desc`,
  );
  return rows.map(toPublicationDto);
}

export interface PublishInput {
  draftId: string;
  expectedRevision: number;
  title: string;
  description: string;
  /** Canonical server-serialized envelope (already validated). */
  canonicalEnvelope: unknown;
  configBytes: number;
  /** The attestation version the client confirmed; must be current. */
  attestationVersion: string;
  idempotencyKey: string;
}

export interface PublishResultDto {
  publicationId: string;
  status: 'published';
  title: string;
  thumbnailStatus: 'pending';
  publishedAt: string;
  replayed?: boolean;
}

interface PublishRpcResult {
  replayed?: boolean;
  publication_id: string;
  status: string;
  title?: string;
  thumbnail_status?: string;
  published_at?: string;
}

/** Plain-text validation for public metadata (title/description). */
export function validatePublicationText(title: string, description: string): boolean {
  const t = title.trim();
  const d = description.trim();
  return (
    t.length >= 1 &&
    t.length <= PUBLISH_TITLE_MAX &&
    d.length <= PUBLISH_DESCRIPTION_MAX &&
    !CONTROL_PATTERN.test(t) &&
    !DESCRIPTION_CONTROL_PATTERN.test(d)
  );
}

export async function publishDraft(ownerId: string, input: PublishInput): Promise<PublishResultDto> {
  if (input.attestationVersion !== RIGHTS_ATTESTATION_VERSION) {
    // The client confirmed an outdated attestation; the UI must re-prompt.
    throw new DraftServiceError('validation_failed');
  }
  const title = input.title.trim();
  const description = input.description.trim();
  if (!validatePublicationText(title, description)) {
    throw new DraftServiceError('validation_failed');
  }
  const hash = requestHash({
    draftId: input.draftId,
    expectedRevision: input.expectedRevision,
    title,
    description,
    envelope: input.canonicalEnvelope,
    attestationVersion: input.attestationVersion,
  });
  const result = await callRpc<PublishRpcResult>('fractalpark_publish_draft', {
    p_owner_id: ownerId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: hash,
    p_draft_id: input.draftId,
    p_expected_revision: input.expectedRevision,
    p_title: title,
    p_description: description.length > 0 ? description : null,
    p_envelope: input.canonicalEnvelope,
    p_config_bytes: input.configBytes,
    p_rights_attestation_version: input.attestationVersion,
    p_license_version: LICENSE_VERSION,
  });
  return {
    publicationId: result.publication_id,
    status: 'published',
    title: result.title ?? title,
    thumbnailStatus: 'pending',
    publishedAt: result.published_at ?? new Date().toISOString(),
    replayed: result.replayed === true,
  };
}

export interface WithdrawResultDto {
  publicationId: string;
  status: 'withdrawn';
  withdrawnAt: string;
  replayed?: boolean;
}

interface OperationReplayRow {
  publication_id: string | null;
  request_hash: string;
}

interface PublicationEnvelopeRow {
  envelope: unknown;
  status: string;
  title: string;
  published_at: string;
}

/**
 * Replay lookup for publish: the source draft is deleted on success, so a
 * retried request cannot re-read it. The operation row plus the frozen
 * publication envelope reconstruct the original request hash; a match
 * returns the recorded publication, a mismatch is idempotency_conflict.
 */
export async function findPublishReplay(
  ownerId: string,
  idempotencyKey: string,
  hashInputs: {
    draftId: string;
    expectedRevision: number;
    title: string;
    description: string;
    attestationVersion: string;
  },
): Promise<PublishResultDto | null> {
  const ops = await postgrestJson<OperationReplayRow[]>(
    `artwork_operations?owner_id=eq.${ownerId}&idempotency_key=eq.${idempotencyKey}` +
      `&operation_type=eq.publish_draft&status=eq.succeeded&select=publication_id,request_hash`,
  );
  const op = ops[0];
  if (!op?.publication_id) return null;
  const pubs = await postgrestJson<PublicationEnvelopeRow[]>(
    `artwork_publications?id=eq.${op.publication_id}&select=envelope,status,title,published_at`,
  );
  const pub = pubs[0];
  if (!pub || pub.status !== 'published' || pub.envelope === null) return null;
  const recomputed = requestHash({
    draftId: hashInputs.draftId,
    expectedRevision: hashInputs.expectedRevision,
    title: hashInputs.title.trim(),
    description: hashInputs.description.trim(),
    envelope: pub.envelope,
    attestationVersion: hashInputs.attestationVersion,
  });
  if (recomputed !== op.request_hash) {
    throw new DraftServiceError('idempotency_conflict');
  }
  return {
    publicationId: op.publication_id,
    status: 'published',
    title: pub.title,
    thumbnailStatus: 'pending',
    publishedAt: pub.published_at,
    replayed: true,
  };
}

interface WithdrawRpcResult {
  replayed?: boolean;
  publication_id: string;
  status: string;
  withdrawn_at?: string;
}

export async function withdrawPublication(
  ownerId: string,
  publicationId: string,
  idempotencyKey: string,
): Promise<WithdrawResultDto> {
  const hash = requestHash({ publicationId });
  const result = await callRpc<WithdrawRpcResult>('fractalpark_withdraw_publication', {
    p_owner_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: hash,
    p_publication_id: publicationId,
  });
  return {
    publicationId: result.publication_id,
    status: 'withdrawn',
    withdrawnAt: result.withdrawn_at ?? new Date().toISOString(),
    replayed: result.replayed === true,
  };
}
