/**
 * Public community reads for the v0.4.15 creation loop (spec sections 5,
 * 13). Anonymous, no-store, published-only: hidden and withdrawn works are
 * indistinguishable from ones that never existed. The list uses the stable
 * cursor (published_at desc, id desc) with a hard cap so reads stay
 * bounded; the detail carries the canonical envelope a remix needs.
 */

import { getSupabaseConfig } from './config';
import { DraftServiceError } from './drafts';

export const COMMUNITY_DEFAULT_PAGE = 24;
export const COMMUNITY_MAX_PAGE = 50;

export interface CommunityListItemDto {
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

export interface CommunityDetailDto extends CommunityListItemDto {
  /** Canonical frozen envelope; the document parameters a remix requires. */
  envelope: unknown;
}

interface CommunityRow {
  id: string;
  title: string;
  description: string | null;
  author_display_name: string;
  license: string;
  license_scope: string;
  thumbnail_status: 'pending' | 'ready' | 'failed';
  remix_source_type: string | null;
  remix_source_id: string | null;
  published_at: string;
}

const COMMUNITY_SELECT =
  'id,title,description,author_display_name,license,license_scope,' +
  'thumbnail_status,remix_source_type,remix_source_id,published_at';

function toDto(row: CommunityRow): CommunityListItemDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authorDisplayName: row.author_display_name,
    license: row.license,
    licenseScope: row.license_scope,
    thumbnailStatus: row.thumbnail_status,
    remixSource:
      row.remix_source_type && row.remix_source_id
        ? { type: row.remix_source_type, id: row.remix_source_id }
        : null,
    publishedAt: row.published_at,
  };
}

async function postgrestJson<T>(path: string): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new DraftServiceError('unavailable', `PostgREST ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Opaque cursor: the (published_at, id) of the last item on the page. */
export function encodeCommunityCursor(row: { published_at: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.published_at, row.id]), 'utf8').toString('base64url');
}

export function decodeCommunityCursor(raw: string): { publishedAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      !Number.isNaN(Date.parse(parsed[0]))
    ) {
      return { publishedAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  return null;
}

export interface CommunityPageDto {
  items: CommunityListItemDto[];
  nextCursor: string | null;
}

export async function listCommunity(
  cursor: string | null,
  limit: number,
): Promise<CommunityPageDto> {
  const pageSize = Math.min(Math.max(Math.trunc(limit) || COMMUNITY_DEFAULT_PAGE, 1), COMMUNITY_MAX_PAGE);
  const decoded = cursor ? decodeCommunityCursor(cursor) : null;
  if (cursor && !decoded) throw new DraftServiceError('validation_failed');

  let query =
    `artwork_publications?status=eq.published&select=${COMMUNITY_SELECT}` +
    `&order=published_at.desc,id.desc&limit=${pageSize + 1}`;
  if (decoded) {
    // Rows strictly after the cursor in (published_at desc, id desc) order.
    const at = encodeURIComponent(decoded.publishedAt);
    const id = encodeURIComponent(decoded.id);
    query += `&or=(published_at.lt.${at},and(published_at.eq.${at},id.lt.${id}))`;
  }
  const rows = await postgrestJson<CommunityRow[]>(query);
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toDto),
    nextCursor: hasMore && last ? encodeCommunityCursor(last) : null,
  };
}

/** Published-only detail; anything else is a uniform not_found. */
export async function getCommunityPublication(publicationId: string): Promise<CommunityDetailDto> {
  // Malformed ids never reach PostgREST: they are the same not_found as a
  // hidden, withdrawn, or nonexistent work.
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(publicationId)) {
    throw new DraftServiceError('not_found');
  }
  const rows = await postgrestJson<Array<CommunityRow & { envelope: unknown }>>(
    `artwork_publications?id=eq.${publicationId}&status=eq.published` +
      `&select=${COMMUNITY_SELECT},envelope&limit=1`,
  );
  const row = rows[0];
  if (!row) throw new DraftServiceError('not_found');
  return { ...toDto(row), envelope: row.envelope };
}
