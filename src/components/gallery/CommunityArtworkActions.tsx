'use client';

/**
 * Community artwork actions (spec section 13): Remix forks the published
 * revision into a new private draft for a signed-in owner (server-verified
 * provenance), or into a plain local copy for an anonymous visitor; copy
 * link shares the canonical URL. The source publication is immutable, so
 * the remix input never drifts.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Copy, GitFork } from 'lucide-react';

import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { useArtworks } from '@/hooks/useArtworks';
import { CloudClientError, createDraft, getCommunityPublication } from '@/lib/cloud/client';
import { trackEvent } from '@/components/analytics/PageViewTracker';

interface CommunityArtworkActionsProps {
  publicationId: string;
  title: string;
  pageUrl: string;
}

export function CommunityArtworkActions({
  publicationId,
  title,
  pageUrl,
}: CommunityArtworkActionsProps) {
  const t = useTranslations('cloud.community');
  const locale = useLocale();
  const router = useRouter();
  const { state, openSignIn } = useCloudSession();
  const { saveEnvelope } = useArtworks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const remix = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      trackEvent('community_remix_started', { source: 'community_page' });
      const detail = await getCommunityPublication(publicationId);
      const remixTitle = `${title} (Remix)`.slice(0, 80);
      if (state.status === 'authenticated') {
        // Server creates the draft with the frozen envelope and the
        // verified publication provenance; it lands in My Works → Drafts.
        const created = await createDraft({
          envelope: detail.envelope,
          remixSourceType: 'publication',
          remixSourceId: publicationId,
        });
        void created;
        router.push(`/${locale}/gallery?view=mine`);
        return;
      }
      // Anonymous remix: the same frozen envelope becomes a local artwork.
      const saved = saveEnvelope(remixTitle, detail.envelope as never, '');
      if (!saved.success) throw new CloudClientError('unavailable');
      router.push(`/${locale}/explore?artwork=${encodeURIComponent(saved.value.id)}`);
    } catch (value) {
      setBusy(false);
      setError(value instanceof CloudClientError ? value.code : 'unavailable');
    }
  }, [locale, publicationId, router, saveEnvelope, state.status, title]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); the URL stays visible anyway.
    }
  }, [pageUrl]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {state.status === 'anonymous' ? (
        <button
          type="button"
          onClick={() => openSignIn()}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t('signInToSyncRemix')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void remix()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <GitFork className="h-4 w-4" />
        {busy ? t('remixing') : t('remix')}
      </button>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t('copied') : t('copyLink')}
      </button>
      {error && <p className="w-full text-sm text-destructive">{t('errors.generic')}</p>}
    </div>
  );
}
