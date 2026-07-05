import { redirect } from 'next/navigation';

interface GalleryPresetDefaultLocaleShortlinkPageProps {
  params: Promise<{
    presetId: string;
  }>;
}

export default async function GalleryPresetDefaultLocaleShortlinkPage({
  params,
}: GalleryPresetDefaultLocaleShortlinkPageProps) {
  const { presetId } = await params;

  redirect(`/en/gallery/${encodeURIComponent(presetId)}`);
}
