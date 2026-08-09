import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  HTML_LANG,
  OG_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';
import { htmlLangForLocale } from '@/app/[locale]/layout';

/**
 * Guards the seven-locale metadata contract: every supported locale must have
 * a distinct, correctly formatted `<html lang>` tag and `og:locale` code, and
 * no locale may silently fall back to English (the v0.4.17 bug where all
 * non-zh pages emitted lang="en" / en_US).
 */
describe('locale metadata maps', () => {
  it('covers every supported locale exactly once', () => {
    expect(Object.keys(HTML_LANG).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    expect(Object.keys(OG_LOCALE).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('maps each locale to a distinct html lang tag', () => {
    const values = SUPPORTED_LOCALES.map((l) => HTML_LANG[l]);
    expect(new Set(values).size).toBe(SUPPORTED_LOCALES.length);
    expect(HTML_LANG.zh).toBe('zh-CN');
    expect(HTML_LANG.pt).toBe('pt-BR');
    expect(HTML_LANG.ko).toBe('ko-KR');
    expect(HTML_LANG.ru).toBe('ru-RU');
    expect(HTML_LANG.es).toBe('es-ES');
    expect(HTML_LANG.fr).toBe('fr-FR');
  });

  it('maps each locale to a distinct Open Graph locale code', () => {
    const values = SUPPORTED_LOCALES.map((l) => OG_LOCALE[l]);
    expect(new Set(values).size).toBe(SUPPORTED_LOCALES.length);
    for (const value of values) {
      expect(value).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it('htmlLangForLocale never falls back to en for a supported non-en locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const lang = htmlLangForLocale(locale);
      expect(lang).toBe(HTML_LANG[locale]);
      if (locale !== DEFAULT_LOCALE) {
        expect(lang).not.toBe(HTML_LANG[DEFAULT_LOCALE]);
      }
    }
  });

  it('htmlLangForLocale passes through unknown locales defensively', () => {
    expect(htmlLangForLocale('de' as SupportedLocale)).toBe('de');
  });
});
