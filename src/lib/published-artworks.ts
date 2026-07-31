import {
  getArtworkContentByPresetId,
  getArtworkContentBySlug,
  type ArtworkContentEntry,
} from '@/content/artwork-manifest';
import type { FractalDocument } from '@/engine/document';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import type { FractalParams, Keyframe } from '@/engine/types';
import {
  buildCanonicalPresetDocument,
  buildPresetPlaybackKeyframes,
  parseGalleryPresetsFile,
  type GalleryPresetConfig,
} from '@/lib/gallery-presets';

export interface PublishedArtwork {
  presetId: string;
  slug: string;
  name: string;
  nameEn: string;
  nameZh?: string;
  thumbnail?: string;
  content: ArtworkContentEntry;
  formulaId: string;
  document: FractalDocument;
}

export interface PublishedArtworkPlayback {
  id: string;
  name: string;
  thumbnail?: string;
  params: FractalParams;
  animation: { keyframes: Keyframe[] };
}

export function buildPublishedArtwork(
  config: GalleryPresetConfig,
  locale: string
): PublishedArtwork {
  const content = getArtworkContentByPresetId(config.id);
  if (!content) {
    throw new Error(`Missing artwork content entry for preset: ${config.id}`);
  }

  const document = buildCanonicalPresetDocument(config);

  return {
    presetId: config.id,
    slug: content.slug,
    name: locale === 'zh' && config.nameZh ? config.nameZh : config.name,
    nameEn: config.name,
    nameZh: config.nameZh,
    thumbnail: config.thumbnail,
    content,
    formulaId: document.formula.formulaId,
    document,
  };
}

export function buildPublishedArtworkPlayback(
  artwork: PublishedArtwork
): PublishedArtworkPlayback {
  return {
    id: artwork.presetId,
    name: artwork.name,
    thumbnail: artwork.thumbnail,
    params: documentToRuntimeParams(artwork.document),
    animation: {
      keyframes: buildPresetPlaybackKeyframes(
        artwork.document,
        artwork.presetId
      ),
    },
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

export function buildPublishedArtworkByPresetId(
  input: unknown,
  presetId: string,
  locale: string
): PublishedArtwork | undefined {
  const config = parseGalleryPresetsFile(input).presets.find(
    (preset) => preset.id === presetId
  );
  return config ? buildPublishedArtwork(config, locale) : undefined;
}

export function buildPublishedArtworkBySlug(
  input: unknown,
  slug: string,
  locale: string
): PublishedArtwork | undefined {
  const content = getArtworkContentBySlug(slug);
  return content
    ? buildPublishedArtworkByPresetId(input, content.presetId, locale)
    : undefined;
}
