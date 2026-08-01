/**
 * Server-side cloud configuration for the v0.4.15 web creation loop.
 *
 * Contract: docs/specs/web-creation-loop-v1.md §1 (feature switch and
 * environments). Key rules implemented here:
 *
 * - `FRACTALPARK_CREATION_CLOUD_ENABLED` missing or not exactly "true"
 *   means the cloud loop is OFF. There is no NEXT_PUBLIC_ variant.
 * - This module performs no initialization at import time. Every read is
 *   lazy, so a deployment without any cloud variables builds and runs
 *   exactly as before.
 * - Secret values are never logged or included in error messages; only
 *   variable NAMES may appear in diagnostics.
 * - This module must only be imported from server code (Route Handlers,
 *   server components, server utilities). It must never ship to the client
 *   bundle.
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export type CloudConfigErrorCode =
  | 'cloud_disabled'
  | 'cloud_config_missing'
  | 'cloud_config_invalid';

export class CloudConfigError extends Error {
  readonly code: CloudConfigErrorCode;

  constructor(code: CloudConfigErrorCode, message: string) {
    super(message);
    this.name = 'CloudConfigError';
    this.code = code;
  }
}

/** The master switch: anything other than the exact string "true" is off. */
export function isCreationCloudEnabled(): boolean {
  return process.env.FRACTALPARK_CREATION_CLOUD_ENABLED === 'true';
}

/** The independent backup-email switch; requires the master switch. */
export function isArtworkEmailBackupEnabled(): boolean {
  return (
    isCreationCloudEnabled() &&
    process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED === 'true'
  );
}

function requireEnabled(): void {
  if (!isCreationCloudEnabled()) {
    throw new CloudConfigError(
      'cloud_disabled',
      'The cloud creation loop is disabled in this environment.',
    );
  }
}

function requireValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new CloudConfigError(
      'cloud_config_missing',
      `Cloud configuration is incomplete: missing ${name}.`,
    );
  }
  return value;
}

function parsePort(name: string, raw: string): number {
  if (!/^\d{1,5}$/.test(raw)) {
    throw new CloudConfigError(
      'cloud_config_invalid',
      `Cloud configuration is invalid: ${name} must be a TCP port number.`,
    );
  }
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new CloudConfigError(
      'cloud_config_invalid',
      `Cloud configuration is invalid: ${name} must be a TCP port number.`,
    );
  }
  return port;
}

/**
 * Supabase connection for server-side clients. Throws `cloud_disabled`
 * when the switch is off and `cloud_config_missing` when any required
 * variable is absent, so callers fail closed instead of half-connecting.
 */
export function getSupabaseConfig(): SupabaseConfig {
  requireEnabled();
  const url = requireValue('SUPABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CloudConfigError(
      'cloud_config_invalid',
      'Cloud configuration is invalid: SUPABASE_URL must be an https URL.',
    );
  }
  if (parsed.protocol !== 'https:' || parsed.hostname === '') {
    throw new CloudConfigError(
      'cloud_config_invalid',
      'Cloud configuration is invalid: SUPABASE_URL must be an https URL.',
    );
  }
  return {
    url,
    publishableKey: requireValue('SUPABASE_PUBLISHABLE_KEY'),
    serviceRoleKey: requireValue('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

/** Key for sealing the session cookie (authenticated encryption). */
export function getSessionEncryptionKey(): string {
  requireEnabled();
  const key = requireValue('FRACTALPARK_SESSION_ENCRYPTION_KEY');
  if (key.length < 32) {
    throw new CloudConfigError(
      'cloud_config_invalid',
      'Cloud configuration is invalid: FRACTALPARK_SESSION_ENCRYPTION_KEY must be at least 32 characters.',
    );
  }
  return key;
}

/** HMAC key for rate-limit subject hashing. */
export function getRateLimitHmacKey(): string {
  requireEnabled();
  const key = requireValue('FRACTALPARK_RATE_LIMIT_HMAC_KEY');
  if (key.length < 32) {
    throw new CloudConfigError(
      'cloud_config_invalid',
      'Cloud configuration is invalid: FRACTALPARK_RATE_LIMIT_HMAC_KEY must be at least 32 characters.',
    );
  }
  return key;
}

/** Secret protecting the health-check cron endpoint. */
export function getCronSecret(): string {
  requireEnabled();
  return requireValue('CRON_SECRET');
}

/** Transactional SMTP configuration for artwork backup emails. */
export function getSmtpConfig(): SmtpConfig {
  if (!isArtworkEmailBackupEnabled()) {
    throw new CloudConfigError(
      'cloud_disabled',
      'Artwork email backup is disabled in this environment.',
    );
  }
  return {
    host: requireValue('FRACTALPARK_SMTP_HOST'),
    port: parsePort(
      'FRACTALPARK_SMTP_PORT',
      requireValue('FRACTALPARK_SMTP_PORT'),
    ),
    user: requireValue('FRACTALPARK_SMTP_USER'),
    password: requireValue('FRACTALPARK_SMTP_PASSWORD'),
  };
}

/**
 * Names of the server-only cloud variables, used by tooling (preflight and
 * environment audits) to assert that no NEXT_PUBLIC_ variant leaks into the
 * environment. Values are never part of this list.
 */
export const CLOUD_SERVER_ONLY_VARIABLES = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
  'CRON_SECRET',
  'FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED',
  'FRACTALPARK_SMTP_HOST',
  'FRACTALPARK_SMTP_PORT',
  'FRACTALPARK_SMTP_USER',
  'FRACTALPARK_SMTP_PASSWORD',
  'SUPABASE_DB_URL',
] as const;
