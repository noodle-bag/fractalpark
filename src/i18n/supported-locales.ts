/**
 * Supported locale codes for FractalPark.
 *
 * This is the single source of truth for both client-side i18n routing
 * (`next-intl`) and server-side code (Cloud API error messages, sitemap,
 * JSON-LD). Adding a language means extending this array, the messages
 * file, and the locale registry in `src/i18n/locales.ts`.
 *
 * BCP 47 short codes are used for consistency with the existing `en`/`zh`
 * convention. The full BCP 47 mapping for JSON-LD lives in `src/lib/json-ld.ts`.
 */
export const SUPPORTED_LOCALES = ['en', 'zh', 'pt', 'ko', 'ru', 'es', 'fr'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** BCP 47 tags for `<html lang>` (server-rendered, per locale). */
export const HTML_LANG: Record<SupportedLocale, string> = {
  en: 'en',
  zh: 'zh-CN',
  pt: 'pt-BR',
  ko: 'ko-KR',
  ru: 'ru-RU',
  es: 'es-ES',
  fr: 'fr-FR',
};

/** Open Graph `og:locale` codes (underscore form, per OG spec). */
export const OG_LOCALE: Record<SupportedLocale, string> = {
  en: 'en_US',
  zh: 'zh_CN',
  pt: 'pt_BR',
  ko: 'ko_KR',
  ru: 'ru_RU',
  es: 'es_ES',
  fr: 'fr_FR',
};
