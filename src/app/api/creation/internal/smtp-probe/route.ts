/**
 * POST /api/creation/internal/smtp-probe
 *
 * Slice 1 exit verification (PR 1 contract): prove the Vercel Node Function
 * → transactional SMTP → 1 MB attachment path for real, before the backup
 * feature ships in PR 2.
 *
 * Hardening, since this endpoint sends email:
 * - Gated by the cloud feature switch first (no cloud init while off).
 * - Requires the cron bearer secret; it is not part of the browser surface,
 *   so no Origin check applies (browsers cannot attach Authorization
 *   headers cross-site without a CORS preflight, which we never answer).
 * - Consumes the real backup_user_day counter before sending.
 * - The recipient is hardcoded to the maintainer mailbox: this probe can
 *   never become an open relay.
 */

import {
  assertCloudEnabled,
  CloudApiError,
  jsonOk,
  toErrorResponse,
} from '@/lib/cloud/api';
import { BackupMailError, sendArtworkBackupEmail } from '@/lib/cloud/backup-mailer';
import { getCronSecret } from '@/lib/cloud/config';
import { consumeRateLimit } from '@/lib/cloud/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Maintainer test mailbox (staging rule: synthetic/maintainer mailboxes only). */
const PROBE_RECIPIENT = 'noreply@fractalpark.com';

/**
 * Constant-time bearer check (hash both sides to equalize length first):
 * the secret is high-entropy and TLS noise already blurs timing, so this is
 * defense in depth, not a load-bearing control.
 */
function bearerMatches(authorization: string, secret: string): boolean {
  const provided = createHash('sha256').update(authorization).digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

/** Deterministic ~1.05 MB synthetic .fractal.json for the attachment path. */
function buildProbePayload(): Buffer {
  const header = '{"type":"FractalParkDocument","version":2,"probe":"slice1-smtp-attachment","filler":"';
  const footer = '"}';
  const targetBytes = 1_100_000;
  const fillerLength = targetBytes - header.length - footer.length;
  return Buffer.from(`${header}${'x'.repeat(fillerLength)}${footer}`, 'utf8');
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertCloudEnabled();
    const authorization = request.headers.get('authorization') ?? '';
    if (!bearerMatches(authorization, getCronSecret())) {
      throw new CloudApiError('unauthenticated');
    }

    const window = await consumeRateLimit('backup_user_day', 'user:smtp-probe', 20, 86400);
    if (!window.allowed) {
      throw new CloudApiError('rate_limited', window.retryAfter);
    }

    const attachment = buildProbePayload();
    try {
      const result = await sendArtworkBackupEmail({
        to: PROBE_RECIPIENT,
        subject: 'FractalPark SMTP attachment probe',
        text: 'Slice 1 exit verification: Vercel Node Function to transactional SMTP with a 1 MB .fractal.json attachment. No action needed.',
        attachmentBytes: attachment,
        attachmentFilename: 'probe.fractal.json',
      });
      return jsonOk(request, { ok: true, messageId: result.messageId, attachmentBytes: attachment.length });
    } catch (error) {
      if (error instanceof BackupMailError) {
        throw new CloudApiError('unavailable');
      }
      throw error;
    }
  } catch (error) {
    return toErrorResponse(request, error);
  }
}
