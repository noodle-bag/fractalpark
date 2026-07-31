import type { FractalDocument } from '@/engine/document';
import {
  buildCanonicalPresetDocument,
  parseGalleryPresetsFile,
  type GalleryPresetConfig,
} from '@/lib/gallery-presets';

export interface PublishedArtwork {
  presetId: string;
  name: string;
  nameEn: string;
  nameZh?: string;
  thumbnail?: string;
  document: FractalDocument;
}

export function buildPublishedArtwork(
  config: GalleryPresetConfig,
  locale: string
): PublishedArtwork {
  return {
    presetId: config.id,
    name: locale === 'zh' && config.nameZh ? config.nameZh : config.name,
    nameEn: config.name,
    nameZh: config.nameZh,
    thumbnail: config.thumbnail,
    document: buildCanonicalPresetDocument(config),
  };
}

export function buildPublishedArtworkCollection(
  input: unknown,
  locale: string
): PublishedArtwork[] {
  return parseGalleryPresetsFile(input).presets.map((config) =>
    buildPublishedArtwork(config, locale)
  );
}
