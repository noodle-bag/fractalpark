import presetsFile from '../../../../../public/gallery-presets.json';
import {
  builtinPresetConfigToExploreHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
import { notFound, permanentRedirect } from 'next/navigation';

interface GalleryPresetShortlinkPageProps {
  params: Promise<{
    locale: string;
    presetId: string;
  }>;
}

export default async function GalleryPresetShortlinkPage({
  params,
}: GalleryPresetShortlinkPageProps) {
  const { locale, presetId } = await params;
  const parsedPresetsFile = parseGalleryPresetsFile(presetsFile);
  const preset = findBuiltinPresetConfigById(parsedPresetsFile, presetId);

  if (!preset) {
    notFound();
  }

  permanentRedirect(builtinPresetConfigToExploreHref(preset, locale));
}
