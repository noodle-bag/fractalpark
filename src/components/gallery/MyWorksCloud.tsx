'use client';

/**
 * My Works cloud sections (spec information architecture: signed-in My
 * Works shows Drafts, Published, and On this device). Rendered only when
 * the deployment is cloud-enabled; anonymous visitors get a low-key
 * sign-in card, and cloud-disabled deployments render nothing at all so
 * production keeps its current shape.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CloudUpload, LogOut, RefreshCw, Trash2 } from 'lucide-react';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { useArtworks } from '@/hooks/useArtworks';
import {
  CloudClientError,
  listDrafts,
  listPublications,
  withdrawPublication,
  type CloudDraftSummary,
  type CloudPublicationSummary,
} from '@/lib/cloud/client';
import { deleteDraft, importArtworkToCloud, openCloudDraft } from '@/lib/cloud/sync';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';
import { readLocalFormulaAssets } from '@/lib/custom-formula-storage';
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
  const { state, openSignIn, signOut } = useCloudSession();
  const { artworks: localArtworks, saveEnvelope, updateArtwork, bindCloud } = useArtworks();

  const [drafts, setDrafts] = useState<CloudDraftSummary[] | null>(null);
  const [publications, setPublications] = useState<CloudPublicationSummary[] | null>(null);
  const [publishTarget, setPublishTarget] = useState<CloudDraftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const authenticated = state.status === 'authenticated';

  const refreshDrafts = useCallback(async () => {
    try {
      setError(null);
      const [draftList, publicationList] = await Promise.all([listDrafts(), listPublications()]);
      setDrafts(draftList);
      setPublications(publicationList);
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

  /** After publishing, the source draft is gone server-side: clear the
   * local copy's binding so it returns to the plain local state. */
  const handlePublished = useCallback(() => {
    if (publishTarget) {
      const bound = localArtworks.find((item) => item.cloud?.draftId === publishTarget.id);
      if (bound) bindCloud(bound.id, null);
    }
    setPublishTarget(null);
    void refreshDrafts();
  }, [bindCloud, localArtworks, publishTarget, refreshDrafts]);

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

  const openDraft = useCallback(
    async (draftId: string) => {
      setBusyId(draftId);
      setError(null);
      try {
        const detail = await openCloudDraft(draftId);
        // Hydrate the local recovery copy: refresh the bound record when
        // one exists, otherwise create a new local record and bind it.
        const bound = localArtworks.find((item) => item.cloud?.draftId === draftId);
        // Guard: if the local copy has edits made after the last successful
        // sync (e.g. the user kept saving through a revision conflict), the
        // cloud version would silently destroy them — confirm first.
        if (
          bound?.cloud &&
          (bound.updatedAt ?? 0) > bound.cloud.syncedAt &&
          !window.confirm(t('confirmOverwrite'))
        ) {
          return;
        }
        const name = detail.title || 'Untitled';
        let localId: string;
        if (bound) {
          const updated = updateArtwork(bound.id, name, detail.envelope as never, bound.thumbnail);
          if (!updated.success) throw new CloudClientError('unavailable');
          localId = bound.id;
        } else {
          const saved = saveEnvelope(name, detail.envelope as never, '');
          if (!saved.success) throw new CloudClientError('unavailable');
          localId = saved.value.id;
        }
        bindCloud(localId, { draftId, revision: detail.revision, syncedAt: Date.now() });
        router.push(`/${locale}/explore?artwork=${encodeURIComponent(localId)}`);
      } catch (value) {
        setError(value instanceof CloudClientError ? value.code : 'unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [bindCloud, localArtworks, locale, router, saveEnvelope, t, updateArtwork],
  );

  const removeDraft = useCallback(
    async (draftId: string) => {
      if (!window.confirm(t('confirmDelete'))) return;
      setBusyId(draftId);
      setError(null);
      try {
        await deleteDraft(draftId);
        const bound = localArtworks.find((item) => item.cloud?.draftId === draftId);
        if (bound) bindCloud(bound.id, null);
        await refreshDrafts();
      } catch (value) {
        setError(value instanceof CloudClientError ? value.code : 'unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [bindCloud, localArtworks, refreshDrafts, t],
  );

  const importLocal = useCallback(
    async (localId: string) => {
      const item = localArtworks.find((entry) => entry.id === localId);
      if (!item || item.cloud) return;
      setBusyId(localId);
      setError(null);
      try {
        const envelope = await createFractalDocumentEnvelope(item.document, readLocalFormulaAssets());
        if (!envelope.success) throw new CloudClientError('invalid_envelope');
        const outcome = await importArtworkToCloud({
          envelope: envelope.value,
          thumbnail: item.thumbnail,
        });
        if (outcome.kind === 'synced') {
          bindCloud(localId, outcome.binding);
          await refreshDrafts();
        } else {
          setError(outcome.kind === 'quota' ? 'quota_exceeded' : 'unavailable');
        }
      } catch (value) {
        setError(value instanceof CloudClientError ? value.code : 'unavailable');
      } finally {
        setBusyId(null);
      }
    },
    [bindCloud, localArtworks, refreshDrafts],
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
          onClick={openSignIn}
          className="mt-3 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t('signIn')}
        </button>
      </section>
    );
  }

  const unboundLocal = localArtworks.filter((item) => item.storageFormat === 'document' && !item.cloud);

  return (
    <section className="mx-4 mb-8 space-y-6 sm:mx-6 xl:mx-8">
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
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('signOut')}
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
                      : t('publishedMeta', {
                          license: publication.license,
                          date: new Date(publication.publishedAt).toLocaleDateString(
                            locale === 'zh' ? 'zh-CN' : 'en-US',
                          ),
                        })}
                  </span>
                </div>
                {publication.status === 'published' && (
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

      {unboundLocal.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">{t('importTitle')}</h3>
          <ul className="mt-2 space-y-2">
            {unboundLocal.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <button
                  type="button"
                  onClick={() => void importLocal(item.id)}
                  disabled={busyId === item.id}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  {busyId === item.id ? t('importing') : t('import')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
