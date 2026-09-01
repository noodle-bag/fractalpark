import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';

describe('Formula Atlas published-directory contract', () => {
  it('uses published categories and counts instead of the legacy 94-row body', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/formulas/page.tsx'),
      'utf8',
    );

    expect(source).toContain('PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map');
    expect(source).toContain('PUBLISHED_FORMULA_DIRECTORY_V1.categoryCounts');
    expect(source).toContain('numberOfItems: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1');
    expect(source).not.toContain('atlas.families');
    expect(source).not.toContain('atlas.formulas');
  });

  it('states the 534-row published contract in every Atlas locale and metadata set', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8'),
      );
      const atlas = messages.formulas.index;
      const metadata = messages.metadata.formulaAtlas;

      expect(atlas.publishedIntro, locale).toContain('534');
      expect(atlas.capabilities.items.server.description, locale).toContain('534');
      expect(atlas.directory.title, locale).toContain('534');
      expect(atlas.families.browse, locale).toBeTruthy();
      expect(metadata.title, locale).toContain('534');
      expect(metadata.publishedDescription, locale).toContain('534');
      expect(metadata.imageAlt, locale).toContain('534');
    }
  });
});
