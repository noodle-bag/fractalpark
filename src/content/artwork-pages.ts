import {
  ARTWORK_CONTENT_MANIFEST,
  getArtworkContentBySlug,
  type ArtworkContentEntry,
} from './artwork-manifest';

export const PUBLISHED_ARTWORK_PAGE_PRESET_IDS =
  ARTWORK_CONTENT_MANIFEST.map(({ presetId }) => presetId);

const publishedPresetIds = new Set<string>(PUBLISHED_ARTWORK_PAGE_PRESET_IDS);

export const PUBLISHED_ARTWORK_PAGES: readonly ArtworkContentEntry[] =
  ARTWORK_CONTENT_MANIFEST;

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
