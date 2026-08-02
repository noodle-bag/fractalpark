/**
 * Shared request handling for the owner draft routes (spec sections 5, 6,
 * 7, 8). Everything here is request-shape only; persistence lives in the
 * drafts service and owner RPCs.
 */

import { createHash, randomUUID } from 'node:crypto';

import { CloudApiError, readJsonBody } from '@/lib/cloud/api';
import { publicationSourceExists } from '@/lib/cloud/drafts';
import { canonicalStringify, resolveRegistrySource, validateCloudEnvelopeV1 } from '@/lib/cloud/envelope';

/** Draft saves carry an envelope plus a base64 thumbnail margin (spec 5.1). */
export const DRAFT_SAVE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string): string {
  if (!UUID_RE.test(value)) {
    throw new CloudApiError('validation_failed');
  }
  return value;
}

/** Idempotency-Key header is required on every draft write (spec section 6). */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('idempotency-key') ?? '';
  return requireUuid(key.trim());
}

export function newDraftId(): string {
  return randomUUID();
}

export interface RemixSourceInput {
  type: 'formula' | 'preset' | 'publication';
  id: string;
}

/** Nullable as a pair; immutable after creation (spec section 4.2). */
export function parseRemixSource(body: Record<string, unknown>): RemixSourceInput | null {
  const type = body.remixSourceType;
  const id = body.remixSourceId;
  if (type === undefined && id === undefined) return null;
  if (typeof type !== 'string' || typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new CloudApiError('validation_failed');
  }
  if (type !== 'formula' && type !== 'preset' && type !== 'publication') {
    throw new CloudApiError('validation_failed');
  }
  return { type, id };
}

/** Provenance resolves only against server-verified sources (spec section 8). */
export async function assertProvenanceResolves(source: RemixSourceInput | null): Promise<void> {
  if (!source) return;
  if (source.type === 'publication') {
    if (!(await publicationSourceExists(source.id))) {
      throw new CloudApiError('validation_failed');
    }
    return;
  }
  if (!resolveRegistrySource(source.type, source.id)) {
    throw new CloudApiError('validation_failed');
  }
}

export type ThumbnailField =
  | { kind: 'absent' }
  | { kind: 'clear' }
  | { kind: 'set'; base64: string };

function parseThumbnailField(body: Record<string, unknown>): ThumbnailField {
  if (!('thumbnail' in body)) return { kind: 'absent' };
  const value = body.thumbnail;
  if (value === null) return { kind: 'clear' };
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudApiError('validation_failed');
  }
  return { kind: 'set', base64: value };
}

export interface DraftWriteInput {
  canonicalEnvelope: string;
  configBytes: number;
  title: string;
  hasPortableFormulas: boolean;
  remixSource: RemixSourceInput | null;
  thumbnail: ThumbnailField;
  /** Present only when the caller requires it (PATCH saves). */
  expectedRevision?: number;
}

/**
 * Read and validate a draft write body: JSON shape, envelope via the cloud
 * validation profile (server-canonicalized), provenance pair, and the
 * thumbnail field. The 1 MiB envelope input cap is measured on the received
 * bytes, before canonicalization. With requireExpectedRevision the body
 * must carry the client's expected revision (spec section 4.2).
 */
export async function parseDraftWriteBody(
  request: Request,
  options: { requireExpectedRevision?: boolean } = {},
): Promise<DraftWriteInput> {
  const body = await readJsonBody(request, DRAFT_SAVE_BODY_LIMIT_BYTES);
  if (!('envelope' in body)) {
    throw new CloudApiError('validation_failed');
  }
  let expectedRevision: number | undefined;
  if (options.requireExpectedRevision) {
    const value = body.expectedRevision;
    if (!Number.isInteger(value) || (value as number) < 1) {
      throw new CloudApiError('validation_failed');
    }
    expectedRevision = value as number;
  }
  const inputBytes = Buffer.byteLength(JSON.stringify(body.envelope), 'utf8');
  const result = validateCloudEnvelopeV1(body.envelope, inputBytes);
  if (!result.ok) {
    throw new CloudApiError('invalid_envelope');
  }
  const remixSource = parseRemixSource(body);
  return {
    canonicalEnvelope: result.value.canonicalJson,
    configBytes: result.value.configBytes,
    title: result.value.title,
    hasPortableFormulas: result.value.hasPortableFormulas,
    remixSource,
    thumbnail: parseThumbnailField(body),
    expectedRevision,
  };
}

/** Stable request hash for the idempotency contract (spec section 6). */
export function draftRequestHash(parts: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalStringify(parts)).digest('hex');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
