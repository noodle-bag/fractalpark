import { describe, expect, it } from 'vitest';
import presetsFile from '../../public/gallery-presets.json';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import {
  buildCanonicalPresetDocument,
  buildFractalParamsFromPresetQuery,
  builtinPresetConfigToExploreHref,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
import {
  buildPublishedArtwork,
  buildPublishedArtworkCollection,
} from '@/lib/published-artworks';
import { documentToExploreHref, fractalParamsToHref } from '@/lib/url-params';

describe('fractal content model', () => {
  it('builds one canonical preset document without changing runtime behavior', () => {
    const configs = parseGalleryPresetsFile(presetsFile).presets;

    for (const config of configs) {
      const parsed = buildFractalParamsFromPresetQuery(config.url);
      const document = buildCanonicalPresetDocument(config);

      expect(documentToRuntimeParams(document)).toEqual(parsed.params);
      expect(document.animation?.viewKeyframes).toEqual(parsed.keyframes);
    }
  });

  it('uses the canonical preset document for Explore links', () => {
    const configs = parseGalleryPresetsFile(presetsFile).presets;

    for (const config of configs) {
      const parsed = buildFractalParamsFromPresetQuery(config.url);
      const legacyHref = fractalParamsToHref(
        parsed.params,
        'en',
        parsed.keyframes
      );

      expect(builtinPresetConfigToExploreHref(config, 'en')).toBe(legacyHref);
      expect(builtinPresetConfigToExploreHref(config, 'en')).toBe(
        documentToExploreHref(buildCanonicalPresetDocument(config), 'en')
      );
    }
  });

  it('builds localized published artwork without duplicating source order', () => {
    const parsed = parseGalleryPresetsFile(presetsFile);
    const english = buildPublishedArtworkCollection(presetsFile, 'en');
    const chinese = buildPublishedArtworkCollection(presetsFile, 'zh');

    expect(english).toHaveLength(parsed.presets.length);
    expect(english.map((artwork) => artwork.presetId)).toEqual(
      parsed.presets.map((config) => config.id)
    );
    expect(english[0].name).toBe(parsed.presets[0].name);
    expect(chinese[0].name).toBe(parsed.presets[0].nameZh);
    expect(chinese[0].document).toEqual(english[0].document);
  });

  it('projects the same canonical document for every published consumer', () => {
    const config = parseGalleryPresetsFile(presetsFile).presets[5];
    const artwork = buildPublishedArtwork(config, 'en');

    expect(artwork.presetId).toBe(config.id);
    expect(artwork.document).toEqual(buildCanonicalPresetDocument(config));
    expect(artwork.thumbnail).toBe(config.thumbnail);
  });
});
