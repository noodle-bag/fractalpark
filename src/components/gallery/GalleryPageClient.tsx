'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { PublishedArtworkCard } from './GalleryCard';
import { MyWorksCloud } from './MyWorksCloud';
import { CommunityGrid } from './CommunityGrid';
import {
  artworkPagePath,
  isPublishedArtworkPagePresetId,
} from '@/content/artwork-pages';
import { builtinPresetToGalleryHref } from '@/lib/gallery-presets';
import type { PublishedArtwork } from '@/lib/published-artworks';
import { trackEvent } from '@/components/analytics/PageViewTracker';
import { cn } from '@/lib/utils';

type GalleryView = 'collection' | 'mine' | 'community';

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
  const isCollection = initialView === 'collection';
  const isCommunity = initialView === 'community';

  return (
    <main className="pb-10">
      <header className="px-4 pb-6 pt-8 sm:px-6 xl:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {isCollection
            ? t('collection.description')
            : isCommunity
              ? t('community.description')
              : t('mine.description')}
        </p>

        <nav className="mt-6 flex gap-2" aria-label={t('viewsLabel')}>
          <GalleryViewLink
            active={isCollection}
            href={`/${locale}/gallery`}
          >
            {t('collection.title')}
          </GalleryViewLink>
          <GalleryViewLink
            active={isCommunity}
            href={`/${locale}/gallery?view=community`}
          >
            {t('community.title')}
          </GalleryViewLink>
          <GalleryViewLink
            active={!isCollection && !isCommunity}
            href={`/${locale}/gallery?view=mine`}
          >
            {t('mine.title')}
          </GalleryViewLink>
        </nav>
      </header>

      {isCommunity ? (
        <CommunityGrid />
      ) : isCollection ? (
        <ArtworkGrid>
          {artworks.map((artwork) => (
            <PublishedArtworkCard
              key={artwork.presetId}
              artwork={artwork}
              href={isPublishedArtworkPagePresetId(artwork.presetId)
                ? `/${locale}${artworkPagePath(artwork.content)}`
                : builtinPresetToGalleryHref(artwork.presetId, locale)}
              onOpen={() => trackEvent('open_from_gallery', { is_builtin: true })}
            />
          ))}
        </ArtworkGrid>
      ) : (
        <>
          <MyWorksCloud />
        </>
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
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 xl:gap-5 xl:px-8">
      {children}
    </div>
  );
}
