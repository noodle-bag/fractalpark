import {
  FORMULA_CATALOG,
  type FormulaMetadata,
} from '@/engine/plugins/formula-catalog';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import { buildFormulaRecordV1 } from '@/lib/formula-records';
import { appendRemixSource } from '@/lib/remix-source';
import { documentToExploreHref } from '@/lib/url-params';
import { resolveStandardAliasV1 } from '@/engine/formulas/v1/standard-manifest';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import type { FormulaContentEntry } from './formula-manifest';
import { formulaGuidePath } from './formula-guides';
import { PUBLISHED_TEACHING_GUIDES_V1 } from './teaching/guide-route-policy';

export const FORMULA_FAMILY_ORDER = [
  'classic',
  'burning-ship',
  'newton',
  'magnet',
  'phoenix',
  'transcendental',
  'exotic',
] as const;

export type FormulaFamily = (typeof FORMULA_FAMILY_ORDER)[number];

interface FormulaAtlasEntryBase {
  metadata: FormulaMetadata;
  destinationHref: string;
}

export type FormulaAtlasEntry = FormulaAtlasEntryBase &
  (
    | {
        guide: FormulaContentEntry;
        guideHref: `/formulas/${string}`;
        recordHref?: never;
        exploreHref: string;
      }
    | {
        guide?: never;
        guideHref?: never;
        recordHref: `/formulas/${string}`;
        exploreHref?: never;
      }
    | {
        guide?: never;
        guideHref?: never;
        recordHref?: never;
        exploreHref: string;
      }
  );

export type FormulaAtlasGuideEntry = Extract<
  FormulaAtlasEntry,
  { guide: FormulaContentEntry }
>;

export interface FormulaAtlasFamily {
  id: FormulaFamily;
  formulas: FormulaAtlasEntry[];
  guides: FormulaAtlasGuideEntry[];
}

export interface FormulaAtlas {
  formulas: FormulaAtlasEntry[];
  families: FormulaAtlasFamily[];
  guides: FormulaAtlasGuideEntry[];
}

function isGuideEntry(entry: FormulaAtlasEntry): entry is FormulaAtlasGuideEntry {
  return entry.guide !== undefined;
}

export function buildFormulaAtlas(locale: string): FormulaAtlas {
  const guidesByFormulaId = new Map(
    PUBLISHED_TEACHING_GUIDES_V1.map((entry) => [entry.formulaId, entry])
  );
  const formulas: FormulaAtlasEntry[] = FORMULA_CATALOG.map((metadata) => {
    const formulaId = resolveStandardAliasV1('runtime-id', metadata.id);
    const formulaRecord = formulaId
      ? buildFormulaRecordV1(formulaId as FormulaIdV1, locale)
      : undefined;
    if (!formulaId || !formulaRecord) {
      throw new Error(`Missing standard Formula Record for ${metadata.id}`);
    }
    const guide = guidesByFormulaId.get(metadata.id);
    const published = formulaRecord.availability === 'published';
    if (!published) {
      const recordHref = `/formulas/${formulaId}` as const;
      return {
        metadata,
        recordHref,
        destinationHref: `/${locale}${recordHref}`,
      };
    }
    const exploreHref = appendRemixSource(
      documentToExploreHref(
        buildFormulaDefaultDocument(metadata.id),
        locale
      ),
      { type: 'formula', id: metadata.id }
    );
    if (guide) {
      const guideHref = formulaGuidePath(guide);
      return {
        metadata,
        guide,
        guideHref,
        exploreHref,
        destinationHref: `/${locale}${guideHref}`,
      };
    }
    return {
      metadata,
      exploreHref,
      destinationHref: exploreHref,
    };
  });
  const families = FORMULA_FAMILY_ORDER.map((familyId) => {
    const familyFormulas = formulas.filter(
      ({ metadata }) => metadata.family === familyId
    );

    return {
      id: familyId,
      formulas: familyFormulas,
      guides: familyFormulas.filter(isGuideEntry),
    };
  });

  return {
    formulas,
    families,
    guides: formulas.filter(isGuideEntry),
  };
}
