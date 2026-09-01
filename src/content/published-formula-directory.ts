import directoryAsset from '../../public/formula-library/v1/directory/index.json';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
  type PublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryFamilyV1,
} from '@/content/formula-directory-categories';

export {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
  parsePublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryFamilyV1,
} from '@/content/formula-directory-categories';

export const PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 = 534 as const;
export const CLASSIC_FORMULA_COUNT_V1 = 94 as const;
export const PUBLISHED_FORMULA_GUIDE_COUNT_V1 = 21 as const;
export const FORMULA_DIRECTORY_CATEGORY_MEMBERSHIP_COUNT_V1 = 628 as const;


export interface PublishedFormulaDirectoryRowV1 {
  readonly formulaId: FormulaIdV1;
  readonly displayName: string;
  readonly primaryFamily: PublishedFormulaDirectoryFamilyV1;
  readonly categories: readonly PublishedFormulaDirectoryCategoryV1[];
  readonly canonicalPath: `/formulas/${FormulaIdV1}`;
  readonly guideSlug: string | null;
}

export interface ClassicAlternateProfileV1 {
  readonly schema: 'fractalpark-classic-alternate-profile/v1';
  readonly authority: 'legacy-formula-catalog';
  readonly bounds: Readonly<{
    centerX: number;
    centerY: number;
    zoom: number;
    rotation?: number;
  }>;
  readonly formula: Readonly<{
    isJulia: boolean;
    juliaC: readonly [number, number];
    power: number;
    params: Readonly<Record<string, unknown>>;
  }>;
  readonly coloring: Readonly<Record<string, unknown>>;
  readonly iterations: number;
}

export interface ClassicAliasDeepLinkV1 {
  readonly legacyRuntimeId: string;
  readonly canonicalFormulaId: FormulaIdV1;
  readonly canonicalPath: `/formulas/${FormulaIdV1}`;
  readonly alternateProfile: ClassicAlternateProfileV1;
}

export interface ClassicRuntimeAliasV1 {
  readonly runtimeId: string;
  readonly canonicalFormulaId: FormulaIdV1;
}

export interface PublishedFormulaDirectoryV1 {
  readonly revision: 1;
  readonly contentHash: string;
  readonly rows: readonly PublishedFormulaDirectoryRowV1[];
  readonly runtimeAliases: readonly ClassicRuntimeAliasV1[];
  readonly aliasDeepLinks: readonly ClassicAliasDeepLinkV1[];
  readonly categoryCounts: Readonly<
    Record<PublishedFormulaDirectoryCategoryV1, number>
  >;
}

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const raw = directoryAsset as unknown as Record<string, unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    finite(value[0]) &&
    finite(value[1])
  );
}

function isFamily(value: unknown): value is PublishedFormulaDirectoryFamilyV1 {
  return (
    typeof value === 'string' &&
    (PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1 as readonly string[]).includes(value)
  );
}

function isCategory(value: unknown): value is PublishedFormulaDirectoryCategoryV1 {
  return (
    typeof value === 'string' &&
    (PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1 as readonly string[]).includes(value)
  );
}

function parseAlternateProfile(value: unknown): ClassicAlternateProfileV1 | undefined {
  if (!record(value) || !record(value.bounds) || !record(value.formula)) return undefined;
  if (
    value.schema !== 'fractalpark-classic-alternate-profile/v1' ||
    value.authority !== 'legacy-formula-catalog' ||
    !finite(value.bounds.centerX) ||
    !finite(value.bounds.centerY) ||
    !finite(value.bounds.zoom) ||
    value.bounds.zoom <= 0 ||
    (value.bounds.rotation !== undefined && !finite(value.bounds.rotation)) ||
    typeof value.formula.isJulia !== 'boolean' ||
    !pair(value.formula.juliaC) ||
    !finite(value.formula.power) ||
    !record(value.formula.params) ||
    !record(value.coloring) ||
    !Number.isInteger(value.iterations) ||
    (value.iterations as number) <= 0
  ) {
    return undefined;
  }
  return Object.freeze({
    schema: value.schema,
    authority: value.authority,
    bounds: Object.freeze({
      centerX: value.bounds.centerX,
      centerY: value.bounds.centerY,
      zoom: value.bounds.zoom,
      ...(value.bounds.rotation === undefined
        ? {}
        : { rotation: value.bounds.rotation }),
    }),
    formula: Object.freeze({
      isJulia: value.formula.isJulia,
      juliaC: Object.freeze([...value.formula.juliaC]) as readonly [number, number],
      power: value.formula.power,
      params: Object.freeze(structuredClone(value.formula.params)),
    }),
    coloring: Object.freeze(structuredClone(value.coloring)),
    iterations: value.iterations as number,
  });
}

function loadDirectory(): PublishedFormulaDirectoryV1 {
  const unsigned = { ...raw };
  delete unsigned.contentHash;
  if (
    raw.schema !== 'fractalpark-published-formula-directory/v1' ||
    raw.revision !== 1 ||
    typeof raw.contentHash !== 'string' ||
    !SHA256.test(raw.contentHash) ||
    raw.contentHash !== PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1 ||
    sha256HexSyncV1(canonicalJsonV1(unsigned, 262_144)) !== raw.contentHash ||
    !record(raw.counts) ||
    raw.counts.published !== PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 ||
    raw.counts.classic !== CLASSIC_FORMULA_COUNT_V1 ||
    raw.counts.guides !== PUBLISHED_FORMULA_GUIDE_COUNT_V1 ||
    raw.counts.categoryMemberships !==
      FORMULA_DIRECTORY_CATEGORY_MEMBERSHIP_COUNT_V1 ||
    raw.counts.runtimeAliases !== CLASSIC_FORMULA_COUNT_V1 ||
    !Array.isArray(raw.categoryOrder) ||
    JSON.stringify(raw.categoryOrder) !==
      JSON.stringify(PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1) ||
    !record(raw.categoryCounts) ||
    !Array.isArray(raw.rows) ||
    raw.rows.length !== PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 ||
    !Array.isArray(raw.runtimeAliases) ||
    raw.runtimeAliases.length !== CLASSIC_FORMULA_COUNT_V1 ||
    !Array.isArray(raw.aliasDeepLinks) ||
    raw.aliasDeepLinks.length !== 5
  ) {
    throw new Error('published-formula-directory-invalid');
  }

  const rawCategoryCounts = raw.categoryCounts as Record<string, unknown>;
  const categoryCounts = Object.fromEntries(
    PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((category) => {
      const count = rawCategoryCounts[category];
      if (!Number.isInteger(count) || (count as number) <= 0) {
        throw new Error('published-formula-directory-invalid');
      }
      return [category, count];
    }),
  ) as Record<PublishedFormulaDirectoryCategoryV1, number>;
  if (
    categoryCounts.classic !== CLASSIC_FORMULA_COUNT_V1 ||
    Object.values(categoryCounts).reduce((total, count) => total + count, 0) !==
      FORMULA_DIRECTORY_CATEGORY_MEMBERSHIP_COUNT_V1
  ) {
    throw new Error('published-formula-directory-invalid');
  }

  const formulaIds = new Set<string>();
  let classicCount = 0;
  let guideCount = 0;
  const counted = Object.fromEntries(
    PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((category) => [category, 0]),
  ) as Record<PublishedFormulaDirectoryCategoryV1, number>;
  const rows = raw.rows.map((value): PublishedFormulaDirectoryRowV1 => {
    if (
      !record(value) ||
      typeof value.formulaId !== 'string' ||
      !UUID_V5.test(value.formulaId) ||
      formulaIds.has(value.formulaId) ||
      typeof value.displayName !== 'string' ||
      value.displayName.length === 0 ||
      !isFamily(value.primaryFamily) ||
      !Array.isArray(value.categories) ||
      value.categories.length < 1 ||
      value.categories.length > 2 ||
      !value.categories.every(isCategory) ||
      new Set(value.categories).size !== value.categories.length ||
      value.categories[value.categories.length - 1] !== value.primaryFamily ||
      value.canonicalPath !== `/formulas/${value.formulaId}` ||
      (value.guideSlug !== null &&
        (typeof value.guideSlug !== 'string' || value.guideSlug.length === 0))
    ) {
      throw new Error('published-formula-directory-invalid');
    }
    formulaIds.add(value.formulaId);
    for (const category of value.categories) counted[category]++;
    if (value.categories[0] === 'classic') classicCount++;
    if (value.guideSlug !== null) guideCount++;
    return Object.freeze({
      formulaId: value.formulaId as FormulaIdV1,
      displayName: value.displayName,
      primaryFamily: value.primaryFamily,
      categories: Object.freeze([...value.categories]),
      canonicalPath: value.canonicalPath as `/formulas/${FormulaIdV1}`,
      guideSlug: value.guideSlug,
    });
  });
  if (
    formulaIds.size !== PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 ||
    classicCount !== CLASSIC_FORMULA_COUNT_V1 ||
    guideCount !== PUBLISHED_FORMULA_GUIDE_COUNT_V1 ||
    PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.some(
      (category) => counted[category] !== categoryCounts[category],
    )
  ) {
    throw new Error('published-formula-directory-invalid');
  }

  const runtimeIds = new Set<string>();
  const runtimeAliasTargetIds = new Set<string>();
  const runtimeAliases = raw.runtimeAliases.map((value): ClassicRuntimeAliasV1 => {
    if (
      !record(value) ||
      typeof value.runtimeId !== 'string' ||
      value.runtimeId.length === 0 ||
      runtimeIds.has(value.runtimeId) ||
      typeof value.canonicalFormulaId !== 'string' ||
      !formulaIds.has(value.canonicalFormulaId)
    ) {
      throw new Error('published-formula-directory-invalid');
    }
    runtimeIds.add(value.runtimeId);
    runtimeAliasTargetIds.add(value.canonicalFormulaId);
    return Object.freeze({
      runtimeId: value.runtimeId,
      canonicalFormulaId: value.canonicalFormulaId as FormulaIdV1,
    });
  });
  if (runtimeAliasTargetIds.size !== 89) {
    throw new Error('published-formula-directory-invalid');
  }
  const runtimeAliasById = new Map(
    runtimeAliases.map((alias) => [alias.runtimeId, alias.canonicalFormulaId]),
  );

  const legacyIds = new Set<string>();
  const aliasDeepLinks = raw.aliasDeepLinks.map((value): ClassicAliasDeepLinkV1 => {
    if (
      !record(value) ||
      typeof value.legacyRuntimeId !== 'string' ||
      value.legacyRuntimeId.length === 0 ||
      legacyIds.has(value.legacyRuntimeId) ||
      typeof value.canonicalFormulaId !== 'string' ||
      !formulaIds.has(value.canonicalFormulaId) ||
      runtimeAliasById.get(value.legacyRuntimeId) !== value.canonicalFormulaId ||
      value.canonicalPath !== `/formulas/${value.canonicalFormulaId}`
    ) {
      throw new Error('published-formula-directory-invalid');
    }
    const alternateProfile = parseAlternateProfile(value.alternateProfile);
    if (!alternateProfile) throw new Error('published-formula-directory-invalid');
    legacyIds.add(value.legacyRuntimeId);
    return Object.freeze({
      legacyRuntimeId: value.legacyRuntimeId,
      canonicalFormulaId: value.canonicalFormulaId as FormulaIdV1,
      canonicalPath: value.canonicalPath as `/formulas/${FormulaIdV1}`,
      alternateProfile,
    });
  });

  return Object.freeze({
    revision: 1,
    contentHash: raw.contentHash,
    rows: Object.freeze(rows),
    runtimeAliases: Object.freeze(runtimeAliases),
    aliasDeepLinks: Object.freeze(aliasDeepLinks),
    categoryCounts: Object.freeze(categoryCounts),
  });
}

export const PUBLISHED_FORMULA_DIRECTORY_V1 = loadDirectory();
const ROW_BY_ID = new Map(
  PUBLISHED_FORMULA_DIRECTORY_V1.rows.map((row) => [row.formulaId, row]),
);
const ALIAS_BY_RUNTIME_ID = new Map(
  PUBLISHED_FORMULA_DIRECTORY_V1.aliasDeepLinks.map((alias) => [
    alias.legacyRuntimeId,
    alias,
  ]),
);

export function getPublishedFormulaDirectoryRowV1(
  formulaId: unknown,
): PublishedFormulaDirectoryRowV1 | undefined {
  return typeof formulaId === 'string'
    ? ROW_BY_ID.get(formulaId as FormulaIdV1)
    : undefined;
}

export function isPublishedFormulaDirectoryIdV1(
  formulaId: unknown,
): formulaId is FormulaIdV1 {
  return getPublishedFormulaDirectoryRowV1(formulaId) !== undefined;
}


export function filterPublishedFormulaDirectoryV1(
  category?: PublishedFormulaDirectoryCategoryV1,
): readonly PublishedFormulaDirectoryRowV1[] {
  if (category === undefined) return PUBLISHED_FORMULA_DIRECTORY_V1.rows;
  return Object.freeze(
    PUBLISHED_FORMULA_DIRECTORY_V1.rows.filter((row) =>
      row.categories.includes(category),
    ),
  );
}

export function resolveClassicAliasDeepLinkV1(
  legacyRuntimeId: unknown,
): ClassicAliasDeepLinkV1 | undefined {
  return typeof legacyRuntimeId === 'string'
    ? ALIAS_BY_RUNTIME_ID.get(legacyRuntimeId)
    : undefined;
}
