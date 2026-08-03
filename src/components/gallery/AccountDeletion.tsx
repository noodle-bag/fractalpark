'use client';

/**
 * Account deletion danger zone (spec section 10.2): fresh OTP step-up ->
 * typed-email second confirmation -> irreversible deletion. Drafts are
 * deleted permanently; published works are withdrawn and keep only the
 * attribution tombstone; licenses already granted to remixes stay in
 * effect.
 */

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import {
  deleteAccount,
  requestAccountDeletionOtp,
  verifyAccountDeletion,
  CloudClientError,
} from '@/lib/cloud/client';

type Stage = 'idle' | 'code' | 'confirm' | 'done';

export default function AccountDeletion() {
  const t = useTranslations('cloud.accountDeletion');
  const [stage, setStage] = useState<Stage>('idle');
  const [code, setCode] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [operationId, setOperationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        const code = err instanceof CloudClientError ? err.code : 'generic';
        setError(t.has(`errors.${code}`) ? t(`errors.${code}` as never) : t('errors.generic'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const sendCode = () =>
    run(async () => {
      await requestAccountDeletionOtp();
      setStage('code');
    });

  const verifyCode = () =>
    run(async () => {
      const proof = await verifyAccountDeletion(code.trim());
      setOperationId(proof.operationId);
      setStage('confirm');
    });

  const confirmDelete = () =>
    run(async () => {
      if (!operationId) return;
      await deleteAccount(operationId, confirmEmail.trim());
      setStage('done');
      // The session is already gone server-side; reload into the signed-out UI.
      window.setTimeout(() => window.location.reload(), 2500);
    });

  if (stage === 'done') {
    return (
      <div className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
        <p className="font-medium">{t('doneTitle')}</p>
        <p className="mt-1 text-muted-foreground">{t('doneBody')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
      <h3 className="font-medium text-destructive">{t('title')}</h3>
      {stage === 'idle' && (
        <>
          <p className="mt-1 text-muted-foreground">{t('intro')}</p>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy}
            className="mt-2 rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {busy ? t('working') : t('start')}
          </button>
        </>
      )}
      {stage === 'code' && (
        <>
          <p className="mt-1 text-muted-foreground">{t('codeSent')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t('codePlaceholder')}
              className="w-32 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={busy || !/^\d{6}$/.test(code.trim())}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {busy ? t('working') : t('verify')}
            </button>
            <button
              type="button"
              onClick={() => setStage('idle')}
              className="text-xs text-muted-foreground underline"
            >
              {t('cancel')}
            </button>
          </div>
        </>
      )}
      {stage === 'confirm' && (
        <>
          <p className="mt-1 text-muted-foreground">{t('confirmWarning')}</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            <li>{t('consequenceDrafts')}</li>
            <li>{t('consequencePublications')}</li>
            <li>{t('consequenceLicense')}</li>
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={busy || confirmEmail.trim() === ''}
              className="rounded-md border border-destructive bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? t('working') : t('confirmButton')}
            </button>
            <button
              type="button"
              onClick={() => setStage('idle')}
              className="text-xs text-muted-foreground underline"
            >
              {t('cancel')}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
