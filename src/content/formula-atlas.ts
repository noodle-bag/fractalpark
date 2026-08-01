import {
  FORMULA_CATALOG,
  type FormulaMetadata,
} from '@/engine/plugins/formula-catalog';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import { appendRemixSource } from '@/lib/remix-source';
import { documentToExploreHref } from '@/lib/url-params';
import {
  FORMULA_CONTENT_MANIFEST,
  type FormulaContentEntry,
} from './formula-manifest';
import {
  formulaGuidePath,
  isPublishedFormulaGuideId,
} from './formula-guides';

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

export interface FormulaAtlasEntry {
  metadata: FormulaMetadata;
  guide?: FormulaContentEntry;
  guideHref?: `/formulas/${string}`;
  exploreHref: string;
  destinationHref: string;
}

export interface FormulaAtlasGuideEntry extends FormulaAtlasEntry {
  guide: FormulaContentEntry;
}

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
    FORMULA_CONTENT_MANIFEST.map((entry) => [entry.formulaId, entry])
  );
  const formulas: FormulaAtlasEntry[] = FORMULA_CATALOG.map((metadata) => {
    const guide = guidesByFormulaId.get(metadata.id);
    const guideHref =
      guide && isPublishedFormulaGuideId(metadata.id)
        ? formulaGuidePath(guide)
        : undefined;
    const exploreHref = appendRemixSource(
      documentToExploreHref(
        buildFormulaDefaultDocument(metadata.id),
        locale
      ),
      { type: 'formula', id: metadata.id }
    );

    return {
      metadata,
      guide,
      guideHref,
      exploreHref,
      destinationHref: guideHref
        ? `/${locale}${guideHref}`
        : exploreHref,
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
