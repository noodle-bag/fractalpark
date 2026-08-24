import {
  PUBLISHED_FORMULA_DIRECTORY_V1,
  getPublishedFormulaDirectoryRowV1,
} from '@/content/published-formula-directory';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';
import { formulaLocaleKeyV1 } from '@/content/teaching/formula-seo-policy';

export interface FormulaRecordSeoSetsV1 {
  readonly indexSet: readonly string[];
  readonly sitemapSet: readonly string[];
  readonly hreflangSet: readonly string[];
}

export function loadFormulaRecordSeoSetsV1(): FormulaRecordSeoSetsV1 {
  const keys = PUBLISHED_FORMULA_DIRECTORY_V1.rows.flatMap((row) =>
    SUPPORTED_LOCALES.map((locale) => formulaLocaleKeyV1(locale, row.formulaId)),
  );
  const frozen = Object.freeze(keys);
  return Object.freeze({
    indexSet: frozen,
    sitemapSet: frozen,
    hreflangSet: frozen,
  });
}

export function isPublishedFormulaRecordIndexableV1(
  formulaId: unknown,
  locale: unknown,
): boolean {
  return (
    getPublishedFormulaDirectoryRowV1(formulaId) !== undefined &&
    typeof locale === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(locale)
  );
}

export function loadIndexableFormulaRecordIdsV1(): readonly string[] {
  return Object.freeze(
    PUBLISHED_FORMULA_DIRECTORY_V1.rows.map((row) => row.formulaId),
  );
}

export function loadIndexableFormulaRecordLocalesV1(
  formulaId: unknown,
): readonly SupportedLocale[] {
  return getPublishedFormulaDirectoryRowV1(formulaId)
    ? Object.freeze([...SUPPORTED_LOCALES])
    : Object.freeze([]);
}
