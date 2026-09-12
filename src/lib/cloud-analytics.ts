import { trackEvent } from '@/components/analytics/PageViewTracker';

export type BackupEmailStatus =
  | 'not_requested'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'skipped_rate_limit';

export function trackBackupEmailResult(status?: BackupEmailStatus): void {
  if (!status || status === 'not_requested') return;
  trackEvent('backup_email_result', { status });
}
