import presetsFile from '../../../../public/gallery-presets.json';
import {
  builtinPresetConfigToExploreHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
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

  permanentRedirect(builtinPresetConfigToExploreHref(preset, 'en'));
}
