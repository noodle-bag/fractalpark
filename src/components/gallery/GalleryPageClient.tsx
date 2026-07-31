'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { LocalArtworkCard, PublishedArtworkCard } from './GalleryCard';
import { useArtworks } from '@/hooks/useArtworks';
import { builtinPresetToGalleryHref } from '@/lib/gallery-presets';
import type { PublishedArtwork } from '@/lib/published-artworks';
import { savedFractalToHref } from '@/lib/url-params';
import { trackEvent } from '@/components/analytics/PageViewTracker';
import { cn } from '@/lib/utils';

type GalleryView = 'collection' | 'mine';

interface GalleryPageClientProps {
  artworks: PublishedArtwork[];
  initialView: GalleryView;
}

export default function GalleryPageClient({
  artworks,
  initialView,
}: GalleryPageClientProps) {
  const locale = useLocale();
  const t = useTranslations('gallery');
  const { artworks: localArtworks, remove, rename } = useArtworks();
  const isCollection = initialView === 'collection';

  return (
    <main className="pb-10">
      <header className="px-4 pb-6 pt-8 sm:px-6 xl:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {isCollection ? t('collection.description') : t('mine.description')}
        </p>

        <nav className="mt-6 flex gap-2" aria-label={t('viewsLabel')}>
          <GalleryViewLink
            active={isCollection}
            href={`/${locale}/gallery`}
          >
            {t('collection.title')}
          </GalleryViewLink>
          <GalleryViewLink
            active={!isCollection}
            href={`/${locale}/gallery?view=mine`}
          >
            {t('mine.title')}
          </GalleryViewLink>
        </nav>
      </header>

      {isCollection ? (
        <ArtworkGrid>
          {artworks.map((artwork) => (
            <PublishedArtworkCard
              key={artwork.presetId}
              artwork={artwork}
              href={builtinPresetToGalleryHref(artwork.presetId, locale)}
              onOpen={() => trackEvent('open_from_gallery', { is_builtin: true })}
            />
          ))}
        </ArtworkGrid>
      ) : localArtworks.length > 0 ? (
        <>
          <div className="mb-5 flex justify-end px-4 sm:px-6 xl:px-8">
            <Link
              href={`/${locale}/explore`}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              {t('mine.create')}
            </Link>
          </div>
          <ArtworkGrid>
            {localArtworks.map((artwork) => (
              <LocalArtworkCard
                key={artwork.id}
                artwork={artwork}
                href={artwork.storageFormat === 'document'
                  ? `/${locale}/explore?artwork=${encodeURIComponent(artwork.id)}`
                  : savedFractalToHref(artwork, locale)}
                onDelete={remove}
                onRename={rename}
                onOpen={() => trackEvent('open_from_gallery', { is_builtin: false })}
              />
            ))}
          </ArtworkGrid>
        </>
      ) : (
        <section className="mx-4 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center sm:mx-6 xl:mx-8">
          <h2 className="text-xl font-semibold">{t('mine.emptyTitle')}</h2>
          <p className="mt-2 max-w-md text-muted-foreground">{t('mine.emptyDescription')}</p>
          <Link
            href={`/${locale}/explore`}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            {t('mine.create')}
          </Link>
        </section>
      )}
    </main>
  );
}

function GalleryViewLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Link>
  );
}

function ArtworkGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6 min-[900px]:grid-cols-3 min-[1200px]:grid-cols-4 min-[1600px]:grid-cols-5 min-[2200px]:grid-cols-6 xl:gap-5 xl:px-8">
      {children}
    </div>
  );
}
