import presetsFile from '../../../../public/gallery-presets.json';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { buildPublishedArtworkCollection } from '@/lib/published-artworks';
import GalleryPageClient from '@/components/gallery/GalleryPageClient';

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale } = await params;
  const { view } = await searchParams;
  registerBuiltins({ quiet: true });
  const artworks = buildPublishedArtworkCollection(presetsFile, locale);

  return (
    <GalleryPageClient
      artworks={artworks}
      initialView={view === 'mine' ? 'mine' : view === 'community' ? 'community' : 'collection'}
    />
  );
}
