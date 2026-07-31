import {
  getArtworkContentByPresetId,
  getArtworkContentBySlug,
  type ArtworkContentEntry,
} from './artwork-manifest';

export const PUBLISHED_ARTWORK_PAGE_PRESET_IDS = [
  'preset-newton-deep-spiral',
  'preset-newton-cosh-ember-meridian',
] as const;

const publishedPresetIds = new Set<string>(PUBLISHED_ARTWORK_PAGE_PRESET_IDS);

export const PUBLISHED_ARTWORK_PAGES: readonly ArtworkContentEntry[] =
  PUBLISHED_ARTWORK_PAGE_PRESET_IDS.map((presetId) => {
    const entry = getArtworkContentByPresetId(presetId);
    if (!entry) {
      throw new Error(`Missing artwork content entry: ${presetId}`);
    }
    return entry;
  });

export function isPublishedArtworkPagePresetId(presetId: string): boolean {
  return publishedPresetIds.has(presetId);
}

export function getPublishedArtworkPageBySlug(
  slug: string
): ArtworkContentEntry | undefined {
  const entry = getArtworkContentBySlug(slug);
  return entry && isPublishedArtworkPagePresetId(entry.presetId)
    ? entry
    : undefined;
}

export function artworkPagePath(
  entry: ArtworkContentEntry
): `/gallery/${string}` {
  return `/gallery/${entry.slug}`;
}
