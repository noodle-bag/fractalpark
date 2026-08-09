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
