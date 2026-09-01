export const PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1 = [
  'algebraic-power',
  'transcendental',
  'function-composition',
  'rational-reciprocal',
  'orbit-memory',
  'folded-absolute',
  'root-finding',
] as const;
export const PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1 = [
  'classic',
  ...PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
] as const;
export const PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1 =
  '20acd210094d0553090094bf7bfb676fa72f7de44130698a386e01a46c0cdf29' as const;

export type PublishedFormulaDirectoryFamilyV1 =
  (typeof PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1)[number];
export type PublishedFormulaDirectoryCategoryV1 =
  (typeof PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1)[number];

export function parsePublishedFormulaDirectoryCategoryV1(
  value: unknown,
): PublishedFormulaDirectoryCategoryV1 | undefined {
  return typeof value === 'string' &&
    (PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1 as readonly string[]).includes(value)
    ? (value as PublishedFormulaDirectoryCategoryV1)
    : undefined;
}
