/**
 * Transactional artwork backup mailer for the v0.4.15 cloud creation loop.
 *
 * Contract: docs/specs/web-creation-loop-v1.md §8 — Vercel connects
 * directly to the transactional SMTP provider; backup emails carry the
 * `.fractal.json` attachment, and mail failures never roll back artwork
 * operations. The Slice 1 SMTP probe and the PR 2 real backup path share
 * this sender.
 *
 * The transport is created lazily from getSmtpConfig(): nothing is
 * initialized at import time, and a deployment with the backup switch off
 * never opens a socket. SMTP credentials are never logged.
 */

import { createTransport } from 'nodemailer';

import { getSmtpConfig } from './config';

export const BACKUP_SENDER = 'FractalPark <noreply@fractalpark.com>';

export class BackupMailError extends Error {
  /** Original transport error, kept server-side for diagnostics; never sent to clients. */
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BackupMailError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface BackupMailResult {
  messageId: string;
}

/**
 * Send one artwork backup email with a `.fractal.json` attachment. Throws
 * BackupMailError on any transport failure; callers decide retry policy
 * (spec: failed sends may be retried, unknown outcomes are not).
 */
export async function sendArtworkBackupEmail(options: {
  to: string;
  subject: string;
  text: string;
  attachmentBytes: Buffer;
  attachmentFilename: string;
}): Promise<BackupMailResult> {
  const smtp = getSmtpConfig();
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: true,
    auth: { user: smtp.user, pass: smtp.password },
  });
  let info;
  try {
    info = await transport.sendMail({
      from: BACKUP_SENDER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      attachments: [
        {
          filename: options.attachmentFilename,
          content: options.attachmentBytes,
          contentType: 'application/json',
        },
      ],
    });
  } catch (error) {
    throw new BackupMailError(error instanceof Error ? error.message : 'SMTP send failed', error);
  } finally {
    transport.close();
  }
  return { messageId: typeof info?.messageId === 'string' ? info.messageId : '' };
}
