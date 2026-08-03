/**
 * Artwork backup email orchestration (spec section 14). Sends happen after
 * the artwork write succeeds and the route awaits the SMTP result; mail
 * failures never roll back the artwork operation. The mode lives on the
 * profile (off | publish_only | save_and_publish), the account email is
 * resolved server-side from the auth user — never from client input — and
 * every attempt lands on the operation row as backup_email_status with
 * attempts and the confirmed send time. The backup channel has its own
 * credentials, its own switch, and its own daily rate limit.
 */

import { sendArtworkBackupEmail } from './backup-mailer';
import { isArtworkEmailBackupEnabled } from './config';
import { getSupabaseConfig } from './config';
import { getAccountEmail } from './postgrest';
import { canonicalStringify } from './envelope';
import { consumeRateLimit } from './rate-limit';

export type BackupTrigger = 'save' | 'publish';
export type BackupEmailStatus =
  | 'not_requested'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'skipped_rate_limit';

export const BACKUP_USER_DAY_QUOTA = 20;
/** Email attachment cap from the spec; the envelope JSON must fit under it. */
export const BACKUP_ATTACHMENT_MAX_BYTES = 1024 * 1024;

/** The save path hands over the canonical JSON string; publish hands the
 * parsed object. Normalize so the attachment is ALWAYS the envelope object —
 * a string input must never be serialized as a JSON string literal (B1). */
function normalizeEnvelope(envelope: unknown): unknown {
  return typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
}

interface ProfileModeRow {
  backup_email_mode: 'off' | 'publish_only' | 'save_and_publish';
}

/** Whether this trigger should send for the given mode. */
export function shouldSendBackup(
  mode: ProfileModeRow['backup_email_mode'],
  trigger: BackupTrigger,
): boolean {
  if (mode === 'save_and_publish') return true;
  return mode === 'publish_only' && trigger === 'publish';
}

/** Attachment filename: sanitized artwork name plus the spec extension. */
export function backupFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\p{L}\p{N} ._-]+/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
  return `${base.length > 0 ? base : 'artwork'}.fractal.json`;
}

async function postgrest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`PostgREST ${response.status}`);
  return (await response.json()) as T;
}

async function consumeBackupQuota(ownerId: string): Promise<boolean> {
  try {
    const outcome = await consumeRateLimit('backup_user_day', ownerId, BACKUP_USER_DAY_QUOTA, 86400);
    return outcome.allowed;
  } catch {
    // Fail closed on a limiter outage: the artwork op already succeeded, so
    // the honest outcome is skipped, not failed.
    return false;
  }
}

/** Locate the operation row the artwork RPC created for this idempotency key. */
export async function findOperationId(
  ownerId: string,
  idempotencyKey: string,
): Promise<string | null> {
  const rows = await postgrest<Array<{ id: string }>>(
    `artwork_operations?owner_id=eq.${ownerId}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id&limit=1`,
  );
  return rows[0]?.id ?? null;
}

async function markBackupStatus(
  ownerId: string,
  operationId: string,
  status: BackupEmailStatus,
  sentAt?: string,
): Promise<void> {
  await postgrest<unknown>(
    `artwork_operations?id=eq.${operationId}&owner_id=eq.${ownerId}`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        backup_email_status: status,
        email_attempts: status === 'sent' || status === 'failed' ? 1 : 0,
        ...(sentAt ? { email_sent_at: sentAt } : {}),
      }),
    },
  );
}

function buildBackupText(input: {
  trigger: BackupTrigger;
  title: string;
  revision: number;
  publicationId?: string;
  siteUrl?: string;
}): { subject: string; text: string } {
  const when = new Date().toISOString();
  if (input.trigger === 'publish' && input.publicationId) {
    const link = input.siteUrl
      ? `${input.siteUrl}/en/gallery/community/${input.publicationId}`
      : undefined;
    return {
      subject: `[FractalPark] Published: ${input.title}`,
      text: [
        `Your artwork "${input.title}" is now published to the FractalPark Community.`,
        `Publication ID: ${input.publicationId}`,
        link ? `Public link: ${link}` : undefined,
        `Published at: ${when}`,
        '',
        'The fractal image layer of this work is licensed under CC BY 4.0.',
        'The attached .fractal.json carries the complete parameters, view, and any custom formulas. FractalPark cannot retract this file once delivered.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }
  return {
    subject: `[FractalPark] Saved: ${input.title}`,
    text: [
      `Your cloud draft "${input.title}" was saved (revision ${input.revision}).`,
      `Saved at: ${when}`,
      '',
      'The attached .fractal.json carries the complete parameters, view, and any custom formulas. FractalPark cannot retract this file once delivered.',
    ].join('\n'),
  };
}

/**
 * Fire the backup for a succeeded artwork write. Best-effort by contract:
 * every outcome (mode off, rate limited, SMTP failure) resolves into the
 * operation's backup_email_status; the function never throws into the
 * caller's response path.
 */
export async function runArtworkBackup(input: {
  ownerId: string;
  idempotencyKey: string;
  trigger: BackupTrigger;
  title: string;
  revision: number;
  envelope: unknown;
  publicationId?: string;
  siteUrl?: string;
}): Promise<BackupEmailStatus> {
  try {
    if (!isArtworkEmailBackupEnabled()) return 'not_requested';
    const rows = await postgrest<ProfileModeRow[]>(
      `profiles?user_id=eq.${input.ownerId}&select=backup_email_mode&limit=1`,
    );
    const mode = rows[0]?.backup_email_mode ?? 'off';
    if (!shouldSendBackup(mode, input.trigger)) return 'not_requested';

    const operationId = await findOperationId(input.ownerId, input.idempotencyKey);
    if (!operationId) return 'failed';
    const mark = (status: BackupEmailStatus, sentAt?: string) =>
      markBackupStatus(input.ownerId, operationId, status, sentAt).catch(() => undefined);

    // Definitive pre-send failures answer `failed` WITHOUT burning quota —
    // the spec counts actual SMTP attempts (N5).
    const email = await getAccountEmail(input.ownerId);
    if (!email) {
      await mark('failed');
      return 'failed';
    }

    const attachmentJson = JSON.stringify(
      JSON.parse(canonicalStringify(normalizeEnvelope(input.envelope))),
      null,
      2,
    );
    const attachmentBytes = Buffer.from(attachmentJson, 'utf8');
    if (attachmentBytes.byteLength > BACKUP_ATTACHMENT_MAX_BYTES) {
      await mark('failed');
      return 'failed';
    }

    if (!(await consumeBackupQuota(input.ownerId))) {
      await mark('skipped_rate_limit');
      return 'skipped_rate_limit';
    }

    const { subject, text } = buildBackupText(input);
    try {
      await sendArtworkBackupEmail({
        to: email,
        subject,
        text,
        attachmentBytes,
        attachmentFilename: backupFilename(input.title),
      });
    } catch (error) {
      // A transport throw means acceptance could not be reliably recorded:
      // the honest status is `unknown`, not `failed` (N2). The message stays
      // server-side for diagnostics; it never reaches the client.
      console.error(
        '[backup] artwork backup send failed:',
        error instanceof Error ? error.message : 'unknown transport error',
      );
      await mark('unknown');
      return 'unknown';
    }
    const sentAt = new Date().toISOString();
    await mark('sent', sentAt);
    return 'sent';
  } catch {
    // The backup channel never breaks the artwork operation.
    return 'failed';
  }
}
