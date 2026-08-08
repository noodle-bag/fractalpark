'use client';

/**
 * My Works cloud sections (v0.4.16, spec §17): the signed-in view is
 * exactly Cloud Drafts + Published. The local "On this device" section is
 * gone — the cloud draft is the only artwork persistence (ADR 0006).
 * Anonymous visitors get a low-key sign-in card, unavailable gets an
 * honest outage card, and cloud-disabled deployments render nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { RefreshCw, Trash2 } from 'lucide-react';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import {
  CloudClientError,
  deleteDraft,
  getProfile,
  listDrafts,
  listPublications,
  setBackupEmailMode,
  withdrawPublication,
  type CloudDraftSummary,
  type CloudPublicationSummary,
  type Profile,
} from '@/lib/cloud/client';
import { PublishDialog } from './PublishDialog';

const ERROR_KEYS = new Set([
  'unavailable',
  'quota_exceeded',
  'offline',
  'not_found',
  'unauthenticated',
  'invalid_envelope',
  'rate_limited',
]);

/** Map any client error code to a message key that actually exists. */
function errorKey(code: string): string {
  return ERROR_KEYS.has(code) ? `errors.${code}` : 'errors.unavailable';
}

export function MyWorksCloud() {
  const t = useTranslations('cloud.myWorks');
  const locale = useLocale();
  const router = useRouter();
  const { state, openSignIn } = useCloudSession();

  const [drafts, setDrafts] = useState<CloudDraftSummary[] | null>(null);
  const [publications, setPublications] = useState<CloudPublicationSummary[] | null>(null);
  const [publishTarget, setPublishTarget] = useState<CloudDraftSummary | null>(null);
  const [backupMode, setBackupMode] = useState<Profile['backupEmailMode']>('off');
  const [backupNotice, setBackupNotice] = useState<Profile['backupEmailMode'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const authenticated = state.status === 'authenticated';

  const refreshDrafts = useCallback(async () => {
    try {
      setError(null);
      const [draftList, publicationList, profile] = await Promise.all([
        listDrafts(),
        listPublications(),
        getProfile(),
      ]);
      setDrafts(draftList);
      setPublications(publicationList);
      setBackupMode(profile.backupEmailMode);
    } catch (value) {
      setError(value instanceof CloudClientError ? value.code : 'unavailable');
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      void refreshDrafts();
    } else {
      setDrafts(null);
      setPublications(null);
    }
  }, [authenticated, refreshDrafts]);

  /** After publishing, the source draft is gone server-side: close the
   * dialog and refresh both lists. */
  const handlePublished = useCallback(() => {
    setPublishTarget(null);
    void refreshDrafts();
  }, [refreshDrafts]);

  const withdraw = useCallback(
    async (publicationId: string) => {
      if (!window.confirm(t('confirmWithdraw'))) return;
      setBusyId(publicationId);
      setError(null);
      try {
        await withdrawPublication(publicationId);
        await refreshDrafts();
      } catch (value) {
        setError(value instanceof CloudClientError ? value.code : 'unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [refreshDrafts, t],
  );

  const changeBackupMode = useCallback(
    async (next: Profile['backupEmailMode'], confirmed: boolean) => {
      if (next !== 'off' && !confirmed) {
        // Enabling requires the explicit attachment-content notice first.
        setBackupNotice(next);
        return;
      }
      setBackupNotice(null);
      setBusyId('backup');
      try {
        const profile = await setBackupEmailMode(next);
        setBackupMode(profile.backupEmailMode);
      } catch {
        setError('unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const openDraft = useCallback(
    (draftId: string) => {
      // v0.4.16 (review-merged fix): open drafts straight in Explore via
      // `?draft=` — no local hydration, no `?artwork=` round-trip. The
      // Explore loader registers envelope formula assets in memory.
      router.push(`/${locale}/explore?draft=${encodeURIComponent(draftId)}`);
    },
    [locale, router],
  );

  const removeDraft = useCallback(
    async (draftId: string) => {
      if (!window.confirm(t('confirmDelete'))) return;
      setBusyId(draftId);
      setError(null);
      try {
        await deleteDraft(draftId);
        await refreshDrafts();
      } catch (value) {
        setError(value instanceof CloudClientError ? value.code : 'unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [refreshDrafts, t],
  );

  if (state.status === 'disabled' || state.status === 'loading') {
    return null;
  }

  if (state.status === 'anonymous') {
    return (
      <section className="mx-4 mb-6 rounded-lg border border-dashed px-6 py-5 sm:mx-6 xl:mx-8">
        <p className="text-sm text-muted-foreground">{t('signInHint')}</p>
        <button
          type="button"
          onClick={() => openSignIn()}
          className="mt-3 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t('signIn')}
        </button>
      </section>
    );
  }

  if (state.status === 'unavailable') {
    // Never a frozen impersonation of the signed-in workspace (ADR 0006):
    // the outage is stated, nothing spins forever.
    return (
      <section className="mx-4 mb-6 rounded-lg border border-dashed px-6 py-5 sm:mx-6 xl:mx-8">
        <p className="text-sm text-muted-foreground">{t('unavailableHint')}</p>
      </section>
    );
  }

  return (
    <section className="mx-4 mb-8 space-y-6 sm:mx-6 xl:mx-8">
      <div className="rounded-lg border px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t('backupLabel')}</span>
          {(['off', 'publish_only', 'save_and_publish'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={busyId === 'backup'}
              onClick={() => void changeBackupMode(mode, false)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                backupMode === mode
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`backupModes.${mode}`)}
            </button>
          ))}
        </div>
        {backupNotice && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs leading-relaxed">{t('backupNotice')}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void changeBackupMode(backupNotice, true)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                {t('backupConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setBackupNotice(null)}
                className="rounded-md border px-3 py-1 text-xs font-medium"
              >
                {t('backupCancel')}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('draftsTitle')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshDrafts()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('refresh')}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{t(errorKey(error))}</p>}

      {drafts === null ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-5 text-sm text-muted-foreground">
          {t('draftsEmpty')}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => void openDraft(draft.id)}
                disabled={busyId === draft.id}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-medium hover:underline">{draft.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('meta', {
                    revision: draft.revision,
                    date: new Date(draft.updatedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US'),
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPublishTarget(draft)}
                disabled={busyId === draft.id}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {t('publish')}
              </button>
              <button
                type="button"
                aria-label={t('delete')}
                title={t('delete')}
                onClick={() => void removeDraft(draft.id)}
                disabled={busyId === draft.id}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h2 className="text-xl font-semibold">{t('publishedTitle')}</h2>
        {publications === null ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('loading')}</p>
        ) : publications.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed px-6 py-5 text-sm text-muted-foreground">
            {t('publishedEmpty')}
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border">
            {publications.map((publication) => (
              <li
                key={publication.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{publication.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {publication.status === 'withdrawn'
                      ? t('withdrawnMeta', {
                          date: new Date(publication.withdrawnAt ?? publication.publishedAt).toLocaleDateString(
                            locale === 'zh' ? 'zh-CN' : 'en-US',
                          ),
                        })
                      : publication.status === 'hidden'
                        ? t('hiddenMeta', {
                            date: new Date(publication.publishedAt).toLocaleDateString(
                              locale === 'zh' ? 'zh-CN' : 'en-US',
                            ),
                          })
                        : t('publishedMeta', {
                            license: publication.license,
                            date: new Date(publication.publishedAt).toLocaleDateString(
                              locale === 'zh' ? 'zh-CN' : 'en-US',
                            ),
                          })}
                  </span>
                </div>
                {(publication.status === 'published' || publication.status === 'hidden') && (
                  <button
                    type="button"
                    onClick={() => void withdraw(publication.id)}
                    disabled={busyId === publication.id}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {t('withdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PublishDialog
        draft={publishTarget}
        onClose={() => setPublishTarget(null)}
        onPublished={handlePublished}
      />

      {/* AccountDeletion is intentionally not rendered (v0.4.16 Slice 1):
          the UI entry is hidden, while the component, API routes, RPCs,
          worker, and safety tests stay fully intact. */}
    </section>
  );
}
