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
import { stashRemixHandoff } from '@/lib/remix-handoff';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const remix = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      trackEvent('community_remix_started', { source: 'community_page' });
      const detail = await getCommunityPublication(publicationId);
      if (state.status === 'authenticated') {
        // Server creates the draft with the frozen envelope and the
        // verified publication provenance; Explore opens it directly.
        const created = await createDraft({
          envelope: detail.envelope,
          remixSourceType: 'publication',
          remixSourceId: publicationId,
        });
        router.push(`/${locale}/explore?draft=${encodeURIComponent(created.draftId)}`);
        return;
      }
      // Anonymous remix (v0.4.16): a one-shot transient handoff, no local
      // artwork entry — saving later is what creates the cloud draft.
      stashRemixHandoff({
        envelope: detail.envelope,
        publicationId,
        title: `${title} (Remix)`.slice(0, 80),
      });
      router.push(`/${locale}/explore?remix=${encodeURIComponent(publicationId)}`);
    } catch (value) {
      setBusy(false);
      setError(value instanceof CloudClientError ? value.code : 'unavailable');
    }
  }, [locale, publicationId, router, state.status, title]);

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
