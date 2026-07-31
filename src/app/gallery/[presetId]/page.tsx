import presetsFile from '../../../../public/gallery-presets.json';
import {
  builtinPresetConfigToExploreHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
import {
  artworkPagePath,
  isPublishedArtworkPagePresetId,
} from '@/content/artwork-pages';
import { getArtworkContentByPresetId } from '@/content/artwork-manifest';
import { notFound, permanentRedirect } from 'next/navigation';

interface GalleryPresetDefaultLocaleShortlinkPageProps {
  params: Promise<{
    presetId: string;
  }>;
}

export default async function GalleryPresetDefaultLocaleShortlinkPage({
  params,
}: GalleryPresetDefaultLocaleShortlinkPageProps) {
  const { presetId } = await params;
  const parsedPresetsFile = parseGalleryPresetsFile(presetsFile);
  const preset = findBuiltinPresetConfigById(parsedPresetsFile, presetId);

  if (!preset) {
    notFound();
  }

  if (isPublishedArtworkPagePresetId(preset.id)) {
    const content = getArtworkContentByPresetId(preset.id);
    if (!content) notFound();
    permanentRedirect(`/en${artworkPagePath(content)}`);
  }

  permanentRedirect(builtinPresetConfigToExploreHref(preset, 'en'));
}
