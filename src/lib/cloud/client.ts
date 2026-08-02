/**
 * Browser-side client for the same-origin cloud creation APIs (spec
 * sections 5, 6, 7). Requests are same-origin, so the sealed session
 * cookie travels automatically; every write generates its own
 * Idempotency-Key. Errors arrive in the frozen envelope and are mapped
 * to a typed union the UI can branch on; network failures and malformed
 * envelopes never pretend to be API errors.
 */

export type CloudClientErrorCode =
  | 'offline'
  | 'malformed_response'
  | 'cloud_disabled'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'invalid_envelope'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'idempotency_conflict'
  | 'revision_conflict'
  | 'otp_invalid'
  | 'payload_too_large'
  | 'formula_assets_not_publishable'
  | 'unavailable';

export class CloudClientError extends Error {
  readonly code: CloudClientErrorCode;
  readonly retryAfter?: number;

  constructor(code: CloudClientErrorCode, retryAfter?: number) {
    super(code);
    this.name = 'CloudClientError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const API_CODES = new Set<CloudClientErrorCode>([
  'cloud_disabled',
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'invalid_envelope',
  'quota_exceeded',
  'rate_limited',
  'idempotency_conflict',
  'revision_conflict',
  'otp_invalid',
  'payload_too_large',
  'formula_assets_not_publishable',
  'unavailable',
]);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new CloudClientError('offline');
  }

  if (!response.ok) {
    let code: CloudClientErrorCode = 'unavailable';
    let retryAfter: number | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; retryAfter?: number };
      };
      const raw = body.error?.code ?? '';
      if (API_CODES.has(raw as CloudClientErrorCode)) {
        code = raw as CloudClientErrorCode;
      }
      if (typeof body.error?.retryAfter === 'number') {
        retryAfter = body.error.retryAfter;
      }
    } catch {
      code = 'malformed_response';
    }
    throw new CloudClientError(code, retryAfter);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new CloudClientError('malformed_response');
  }
}

export interface CloudSession {
  userId: string;
}

/** Null when anonymous; throws only on transport/config failures. */
export async function getSession(): Promise<CloudSession | null> {
  try {
    const body = await call<{ user: { id: string } }>('/api/creation/auth/session');
    return { userId: body.user.id };
  } catch (error) {
    if (error instanceof CloudClientError && error.code === 'unauthenticated') {
      return null;
    }
    throw error;
  }
}

export async function requestOtp(email: string): Promise<void> {
  await call('/api/creation/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtp(email: string, token: string): Promise<CloudSession> {
  const body = await call<{ user: { id: string } }>('/api/creation/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, token }),
  });
  return { userId: body.user.id };
}

export async function logout(): Promise<void> {
  await call('/api/creation/auth/logout', { method: 'POST' });
}

export interface CloudDraftSummary {
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

export interface CloudDraftDetail extends CloudDraftSummary {
  envelope: unknown;
  thumbnailPath: string | null;
}

export async function listDrafts(): Promise<CloudDraftSummary[]> {
  const body = await call<{ drafts: CloudDraftSummary[] }>('/api/creation/drafts');
  return body.drafts;
}

export async function getDraft(draftId: string): Promise<CloudDraftDetail> {
  const body = await call<{ draft: CloudDraftDetail }>(`/api/creation/drafts/${draftId}`);
  return body.draft;
}

export interface DraftWriteResult {
  draftId: string;
  revision: number;
  envelope?: unknown;
}

export async function createDraft(input: {
  envelope: unknown;
  remixSourceType?: string;
  remixSourceId?: string;
  thumbnailBase64?: string;
}): Promise<DraftWriteResult> {
  return call('/api/creation/drafts', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      envelope: input.envelope,
      ...(input.remixSourceType ? { remixSourceType: input.remixSourceType } : {}),
      ...(input.remixSourceId ? { remixSourceId: input.remixSourceId } : {}),
      ...(input.thumbnailBase64 ? { thumbnail: input.thumbnailBase64 } : {}),
    }),
  });
}

export async function updateDraft(
  draftId: string,
  input: {
    envelope: unknown;
    expectedRevision: number;
    thumbnailBase64?: string;
    clearThumbnail?: boolean;
  },
): Promise<DraftWriteResult> {
  return call(`/api/creation/drafts/${draftId}`, {
    method: 'PATCH',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      envelope: input.envelope,
      expectedRevision: input.expectedRevision,
      ...(input.thumbnailBase64 ? { thumbnail: input.thumbnailBase64 } : {}),
      ...(input.clearThumbnail ? { thumbnail: null } : {}),
    }),
  });
}

export async function deleteDraft(draftId: string): Promise<void> {
  await call(`/api/creation/drafts/${draftId}`, {
    method: 'DELETE',
    headers: { 'idempotency-key': crypto.randomUUID() },
  });
}

// ---------------------------------------------------------------------------
// Publications & profile (v0.4.15 commit 7)
// ---------------------------------------------------------------------------

export interface CloudProfile {
  displayName: string | null;
}

export async function getProfile(): Promise<CloudProfile> {
  return call<CloudProfile>('/api/creation/profile');
}

export async function setDisplayName(displayName: string): Promise<CloudProfile> {
  return call('/api/creation/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export interface CloudPublicationSummary {
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

export async function listPublications(): Promise<CloudPublicationSummary[]> {
  const body = await call<{ publications: CloudPublicationSummary[] }>('/api/creation/publications');
  return body.publications;
}

export interface PublishInput {
  expectedRevision: number;
  title: string;
  description: string;
  attestationVersion: string;
}

export interface PublishResult {
  publicationId: string;
  status: 'published';
  title: string;
  thumbnailStatus: 'pending';
  publishedAt: string;
  replayed?: boolean;
}

export async function publishDraft(draftId: string, input: PublishInput): Promise<PublishResult> {
  return call(`/api/creation/drafts/${draftId}/publish`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export interface WithdrawResult {
  publicationId: string;
  status: 'withdrawn';
  withdrawnAt: string;
  replayed?: boolean;
}

export async function withdrawPublication(publicationId: string): Promise<WithdrawResult> {
  return call(`/api/creation/publications/${publicationId}/withdraw`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// Community (anonymous public reads, no-store)
// ---------------------------------------------------------------------------

export interface CommunityListItem {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  license: string;
  licenseScope: string;
  thumbnailStatus: 'pending' | 'ready' | 'failed';
  remixSource: { type: string; id: string } | null;
  publishedAt: string;
}

export interface CommunityPage {
  items: CommunityListItem[];
  nextCursor: string | null;
}

export async function listCommunity(cursor?: string, limit?: number): Promise<CommunityPage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return call<CommunityPage>(`/api/creation/community${query ? `?${query}` : ''}`);
}

export interface CommunityDetail extends CommunityListItem {
  envelope: unknown;
}

export async function getCommunityPublication(publicationId: string): Promise<CommunityDetail> {
  return call<CommunityDetail>(`/api/creation/publications/${publicationId}`);
}
