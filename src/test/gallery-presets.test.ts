import { describe, expect, it } from 'vitest';
import presetsFile from '../../public/gallery-presets.json';
import {
  builtinPresetConfigToExploreHref,
  builtinPresetToGalleryHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';

describe('gallery preset shortlinks', () => {
  it('builds stable builtin preset gallery hrefs', () => {
    expect(builtinPresetToGalleryHref('preset-newton-deep-spiral', 'en')).toBe(
      '/en/gallery/preset-newton-deep-spiral'
    );
    expect(builtinPresetToGalleryHref('preset-newton-deep-spiral', 'zh')).toBe(
      '/zh/gallery/preset-newton-deep-spiral'
    );
    expect(builtinPresetToGalleryHref('preset-newton-deep-spiral')).toBe(
      '/gallery/preset-newton-deep-spiral'
    );
  });

  it('keeps current builtin preset ids unique', () => {
    const parsed = parseGalleryPresetsFile(presetsFile);
    const ids = parsed.presets.map(preset => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds a builtin preset by id and builds the explore redirect target', () => {
    const parsed = parseGalleryPresetsFile(presetsFile);
    const preset = findBuiltinPresetConfigById(parsed, 'preset-newton-deep-spiral');

    expect(preset?.name).toBe('Newton Deep Spiral');
    if (!preset) {
      throw new Error('Expected preset-newton-deep-spiral to exist');
    }

    const href = builtinPresetConfigToExploreHref(preset, 'en');

    expect(href.startsWith('/en/explore?')).toBe(true);
    expect(href).toContain('fm=newton3');
  });
});
