/**
 * Shared server-side Supabase helpers: PostgREST with the service key and
 * GoTrue admin reads. Extracted from drafts.ts/backup.ts so account
 * deletion, backup, and future services share one implementation.
 */

import { getSupabaseConfig } from './config';

export interface PostgrestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function postgrest(path: string, options: PostgrestOptions = {}): Promise<Response> {
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

export async function postgrestJson<T>(path: string, options: PostgrestOptions = {}): Promise<T> {
  const response = await postgrest(path, options);
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Account email from the auth user; server-side only, never client input. */
export async function getAccountEmail(ownerId: string): Promise<string | null> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/admin/users/${ownerId}`, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { email?: string };
  return typeof body.email === 'string' && body.email.length > 0 ? body.email : null;
}

/**
 * True while a locked account deletion is active for the owner (spec 10.2).
 * Read on every authenticated request — keep it a single indexed count.
 */
export async function hasActiveDeletion(ownerId: string): Promise<boolean> {
  const rows = await postgrestJson<Array<{ id: string }>>(
    `/artwork_operations?owner_id=eq.${ownerId}&operation_type=eq.delete_account` +
      `&status=eq.processing&deletion_stage=eq.locked&select=id&limit=1`,
  );
  return rows.length > 0;
}
