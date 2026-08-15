import { describe, expect, it } from 'vitest';
import identityManifest from '../../resources/formula-library/v1/standard-formula-ids.json';
import teachingContent from '../../resources/formula-library/v1/teaching-content-prototype.json';

const LOCALES = ['en', 'zh', 'pt', 'ko', 'ru', 'es', 'fr'];

describe('v0.4.19 five-formula × seven-locale teaching prototype', () => {
  it('covers five neutral Formula IDs across all seven requested locales', () => {
    expect(teachingContent.version).toBe(1);
    expect(teachingContent.status).toBe('prototype-not-reviewed-localization');
    expect(teachingContent.locales).toEqual(LOCALES);
    expect(teachingContent.formulaCount).toBe(5);
    expect(teachingContent.entryCount).toBe(35);
    expect(teachingContent.entries).toHaveLength(35);

    const knownIds = new Set(identityManifest.formulas.map((entry) => entry.formulaId));
    const formulaIds = new Set(teachingContent.entries.map((entry) => entry.formulaId));
    expect(formulaIds.size).toBe(5);
    expect([...formulaIds].every((formulaId) => knownIds.has(formulaId))).toBe(true);

    for (const formulaId of formulaIds) {
      const locales = teachingContent.entries
        .filter((entry) => entry.formulaId === formulaId)
        .map((entry) => entry.requestedLocale)
        .sort();
      expect(locales).toEqual([...LOCALES].sort());
    }
  });

  it('never presents fallback English as reviewed translation or indexable content', () => {
    for (const entry of teachingContent.entries) {
      expect(Object.keys(entry).sort()).toEqual([
        'contentLocale',
        'formulaId',
        'indexability',
        'requestedLocale',
        'summary',
        'title',
        'translationStatus',
      ]);
      expect(entry.contentLocale).toBe('en');
      expect(entry.indexability).toBe('noindex');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      if (entry.requestedLocale === 'en') {
        expect(entry.translationStatus).toBe('draft');
      } else {
        expect(entry.translationStatus).toBe('fallback');
      }
    }
  });
});
