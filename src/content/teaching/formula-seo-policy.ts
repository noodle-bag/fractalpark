import { STANDARD_MANIFEST_INDEX_V1 } from '@/engine/formulas/v1/standard-manifest';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import {
  loadDeliveredTeachingLocalesV1,
  loadPublishedRuntimeFormulaIdsV1,
  loadSelectedTeachingFormulaIdsV1,
} from '@/content/teaching/content-loader';

export interface FormulaSeoSetsV1 {
  readonly valid: boolean;
  readonly catalogAccessibleSet: readonly string[];
  readonly implementationAccessibleSet: readonly string[];
  readonly indexSet: readonly string[];
  readonly sitemapSet: readonly string[];
  readonly hreflangSet: readonly string[];
}

export interface FormulaSeoDependenciesV1 {
  readonly catalogFormulaIds: readonly string[];
  readonly implementationFormulaIds: readonly string[];
  readonly teachingFormulaIds: readonly string[];
  readonly loadDeliveredLocales: (formulaId: string) => readonly string[];
}

const FORMULA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCALES = new Set<string>(SUPPORTED_LOCALES);

export function formulaLocaleKeyV1(locale: string, formulaId: string): string {
  return `${locale}:${formulaId}`;
}

export function parseFormulaLocaleKeyV1(
  key: string,
): Readonly<{ locale: string; formulaId: string }> | undefined {
  const separator = key.indexOf(':');
  if (separator <= 0) return undefined;
  const locale = key.slice(0, separator);
  const formulaId = key.slice(separator + 1);
  if (!LOCALES.has(locale) || !FORMULA_ID.test(formulaId)) return undefined;
  return Object.freeze({ locale, formulaId });
}

function exactUniqueIds(values: readonly string[], expectedCount: number): boolean {
  return (
    values.length === expectedCount &&
    values.every((value) => FORMULA_ID.test(value)) &&
    new Set(values).size === expectedCount
  );
}

export function buildFormulaSeoSetsV1(
  dependencies: FormulaSeoDependenciesV1,
): FormulaSeoSetsV1 {
  const catalog = [...dependencies.catalogFormulaIds];
  const implementation = [...dependencies.implementationFormulaIds];
  const teaching = [...dependencies.teachingFormulaIds];
  const catalogIds = new Set(catalog);
  const implementationIds = new Set(implementation);
  const authorityValid =
    exactUniqueIds(catalog, 677) &&
    exactUniqueIds(implementation, 534) &&
    exactUniqueIds(teaching, 50) &&
    implementation.every((formulaId) => catalogIds.has(formulaId)) &&
    teaching.every((formulaId) => implementationIds.has(formulaId));

  const index: string[] = [];
  if (authorityValid) {
    for (const formulaId of teaching) {
      let delivered: readonly string[] = [];
      try {
        delivered = dependencies.loadDeliveredLocales(formulaId);
      } catch {
        delivered = [];
      }
      const locales = [...new Set(delivered)].filter((locale) => LOCALES.has(locale));
      for (const locale of locales) index.push(formulaLocaleKeyV1(locale, formulaId));
    }
  }
  index.sort();
  const frozenIndex = Object.freeze(index);

  return Object.freeze({
    valid: authorityValid,
    catalogAccessibleSet: Object.freeze(catalog),
    implementationAccessibleSet: Object.freeze(implementation),
    indexSet: frozenIndex,
    sitemapSet: frozenIndex,
    hreflangSet: frozenIndex,
  });
}

const PRODUCTION_FORMULA_SEO_SETS_V1 = buildFormulaSeoSetsV1({
  catalogFormulaIds: STANDARD_MANIFEST_INDEX_V1.formulaIds,
  implementationFormulaIds: loadPublishedRuntimeFormulaIdsV1(),
  teachingFormulaIds: loadSelectedTeachingFormulaIdsV1(),
  loadDeliveredLocales: loadDeliveredTeachingLocalesV1,
});

const PRODUCTION_INDEX_KEYS_V1 = new Set(PRODUCTION_FORMULA_SEO_SETS_V1.indexSet);

export function loadFormulaSeoSetsV1(): FormulaSeoSetsV1 {
  return PRODUCTION_FORMULA_SEO_SETS_V1;
}

export function isFormulaLocaleIndexableV1(
  formulaId: string,
  locale: string,
): boolean {
  return PRODUCTION_INDEX_KEYS_V1.has(formulaLocaleKeyV1(locale, formulaId));
}

export function loadIndexableTeachingFormulaIdsV1(): readonly string[] {
  if (!PRODUCTION_FORMULA_SEO_SETS_V1.valid) return [];
  const ids = new Set<string>();
  for (const key of PRODUCTION_FORMULA_SEO_SETS_V1.indexSet) {
    ids.add(key.slice(key.indexOf(':') + 1));
  }
  return Object.freeze([...ids]);
}

export function indexableFormulaIdsForLocaleV1(
  sets: Pick<FormulaSeoSetsV1, 'valid' | 'indexSet'>,
  locale: string,
): readonly string[] {
  if (!sets.valid || !LOCALES.has(locale)) return [];
  return Object.freeze(
    sets.indexSet
      .map(parseFormulaLocaleKeyV1)
      .filter(
        (value): value is Readonly<{ locale: string; formulaId: string }> =>
          value !== undefined && value.locale === locale,
      )
      .map(({ formulaId }) => formulaId),
  );
}

export function loadIndexableTeachingFormulaIdsForLocaleV1(
  locale: string,
): readonly string[] {
  return indexableFormulaIdsForLocaleV1(
    PRODUCTION_FORMULA_SEO_SETS_V1,
    locale,
  );
}

export function loadIndexableTeachingLocalesV1(formulaId: string): readonly string[] {
  if (!FORMULA_ID.test(formulaId)) return [];
  return Object.freeze(
    SUPPORTED_LOCALES.filter((locale) =>
      PRODUCTION_INDEX_KEYS_V1.has(formulaLocaleKeyV1(locale, formulaId)),
    ),
  );
}
