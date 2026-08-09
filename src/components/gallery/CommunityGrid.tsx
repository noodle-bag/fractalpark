'use client';

/**
 * Community grid (spec section 13): the public published list with the
 * stable cursor pager. Anonymous and no-store; hidden/withdrawn works
 * simply never appear. Cards link to the public artwork page; remix
 * happens there.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';
import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import { ArtworkEnvelopePreview } from '@/components/gallery/ArtworkEnvelopePreview';
import {
  GALLERY_CARD_LINK_CLASS,
  GALLERY_PREVIEW_FRAME_CLASS,
} from '@/components/gallery/gallery-card-styles';
import {
  CloudClientError,
  getCommunityPublication,
  listCommunity,
  type CommunityListItem,
} from '@/lib/cloud/client';
import { trackEvent } from '@/components/analytics/PageViewTracker';

export function CommunityGrid() {
  const t = useTranslations('cloud.community');
  const locale = useLocale();
  const { state } = useCloudSession();
  const [items, setItems] = useState<CommunityListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (after: string | null) => {
    setLoading(true);
    setError(false);
    try {
      const page = await listCommunity(after ?? undefined);
      setItems((previous) => (after ? [...previous, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (value) {
      void (value instanceof CloudClientError ? value.code : 'unavailable');
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // cloud-disabled deployments keep the old two-view Gallery shape.
  const enabled = state.status !== 'disabled';
  useEffect(() => {
    if (enabled) void load(null);
  }, [enabled, load]);

  if (!enabled) return null;

  if (!loading && items.length === 0 && !error) {
    return (
      <section className="mx-4 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center sm:mx-6 xl:px-8">
        <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{t('emptyDescription')}</p>
      </section>
    );
  }

  return (
    <section className="px-4 sm:px-6 xl:px-8">
      {error && <p className="mb-4 text-sm text-destructive">{t('errors.loadFailed')}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
        {items.map((item) => (
          <article key={item.id}>
            <Link
              href={`/gallery/community/${item.id}`}
              onClick={() => trackEvent('community_artwork_viewed', { publication_id: item.id })}
              className={GALLERY_CARD_LINK_CLASS}
            >
              <div className={GALLERY_PREVIEW_FRAME_CLASS}>
                <ArtworkEnvelopePreview
                  previewKey={`publication:${item.id}`}
                  loadEnvelope={async () => (await getCommunityPublication(item.id)).envelope}
                />
              </div>
              <h3 className="mt-3 truncate font-medium group-hover:underline">{item.title}</h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {item.authorDisplayName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.license} ·{' '}
                {new Date(item.publishedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
              </p>
            </Link>
          </article>
        ))}
      </div>
      {cursor && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void load(cursor)}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMore')}
          </button>
        </div>
      )}
      {loading && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('loading')}</p>
      )}
    </section>
  );
}
