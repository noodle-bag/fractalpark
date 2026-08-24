import { createHash } from 'node:crypto';

import enMessages from '../../../messages/en.json';
import esMessages from '../../../messages/es.json';
import frMessages from '../../../messages/fr.json';
import koMessages from '../../../messages/ko.json';
import ptMessages from '../../../messages/pt.json';
import ruMessages from '../../../messages/ru.json';
import zhMessages from '../../../messages/zh.json';
import heldGuideAsset from '../../../resources/formula-library/v1/teaching-held-guide-appendix.v1.json';
import restoredGuideAsset from '../../../resources/formula-library/v1/teaching-restored-guide-projection.v1.json';
import reviewEvidenceAsset from '../../../resources/formula-library/v1/teaching-review-evidence/guide-restoration-v1/review-manifest.v1.json';
import {
  getPublishedFormulaGuideByFormulaId,
  getPublishedFormulaGuideFormulaId,
} from '@/content/formula-guides';
import { canonicalJsonV1 } from '@/engine/formulas/v1/revisions';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';
import { buildFormulaRecordV1 } from '@/lib/formula-records';

const EXPECTED_GUIDE_COUNT = 4;
const EXPECTED_TEACHING_PACKAGE_COUNT = 50;
const EXPECTED_GUIDE_SLUGS = Object.freeze([
  'cosh-mandelbrot',
  'zaslavsky-map',
  'mandelbox',
  'newton-cosh',
] as const);
const EXPECTED_GUIDE_FORMULA_IDS = Object.freeze([
  '201c54f3-a77a-5be0-a0a5-6f4f1998ee6d',
  '22d9a008-eb14-53de-9960-11eb5d37bb8e',
  '280cd3e2-865b-5c78-90b7-39b2a36d7be0',
  'a89891b1-8ccb-5d58-9fbb-05944b85ce3c',
] as const);
const SHA256 = /^[a-f0-9]{64}$/;

interface RestoredGuideRowV1 {
  readonly formulaId: string;
  readonly guideSlug: string;
  readonly displayName: string;
  readonly primaryFamily: string;
  readonly implementationBasis: string;
  readonly publicationDecision: string;
  readonly guideAvailability: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
}

const messagesByLocale = {
  en: enMessages,
  zh: zhMessages,
  pt: ptMessages,
  ko: koMessages,
  ru: ruMessages,
  es: esMessages,
  fr: frMessages,
} as const;

function sha256Canonical(value: unknown, maxNodes = 20_000): string {
  return createHash('sha256')
    .update(canonicalJsonV1(value, maxNodes))
    .digest('hex');
}

function exactStringSet(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    values.length === expected.length &&
    new Set(values).size === expected.length &&
    values.every((value) => expected.includes(value))
  );
}

function validateRestoredGuideProjectionV1(): readonly FormulaIdV1[] {
  const asset = restoredGuideAsset;
  if (
    asset.schema !== 'fractalpark-teaching-restored-guide-projection/v1' ||
    asset.status !== 'published' ||
    asset.guideCount !== EXPECTED_GUIDE_COUNT ||
    asset.localeCount !== SUPPORTED_LOCALES.length ||
    !exactStringSet(asset.localeSet, SUPPORTED_LOCALES) ||
    asset.scope.expectedCommit !== '26d' ||
    asset.scope.teachingPackageMutation !== false ||
    asset.scope.reviewedTeachingPackageCount !==
      EXPECTED_TEACHING_PACKAGE_COUNT ||
    asset.pins.publicationDecisionRevision !== 4 ||
    asset.pins.publicationDecisionsContentHash !==
      'cac35a05d2d0c219b4f5ac00f3dea5b5fbb2b9c6b2fc15ea3383ef0f62d6031d' ||
    !SHA256.test(asset.pins.finalReviewedCandidateSha256) ||
    reviewEvidenceAsset.status !== 'approved' ||
    reviewEvidenceAsset.finalCandidateSha256 !==
      asset.pins.finalReviewedCandidateSha256 ||
    reviewEvidenceAsset.maintainerAuthorization.status !== 'authorized' ||
    reviewEvidenceAsset.maintainerAuthorization.actorKind !==
      'human-maintainer' ||
    reviewEvidenceAsset.maintainerAuthorization.maintainerResponse !==
      '好的，继续，需要复审' ||
    reviewEvidenceAsset.finalVerdict.status !== 'approved' ||
    reviewEvidenceAsset.finalVerdict.deepseek !== 'APPROVE / NO_FINDINGS' ||
    reviewEvidenceAsset.finalVerdict.kimi !== 'APPROVE / NO_FINDINGS' ||
    sha256Canonical(reviewEvidenceAsset) !==
      asset.pins.reviewEvidenceCanonicalSha256 ||
    sha256Canonical(heldGuideAsset, 10_000) !==
      asset.pins.priorHeldGuideAppendixCanonicalSha256 ||
    !Array.isArray(asset.rows) ||
    asset.rows.length !== EXPECTED_GUIDE_COUNT
  ) {
    throw new Error('restored-guide-projection-invalid');
  }

  const rows = asset.rows as readonly RestoredGuideRowV1[];
  if (
    !exactStringSet(
      rows.map((row) => row.formulaId),
      EXPECTED_GUIDE_FORMULA_IDS,
    ) ||
    !exactStringSet(
      rows.map((row) => row.guideSlug),
      EXPECTED_GUIDE_SLUGS,
    )
  ) {
    throw new Error('restored-guide-projection-invalid');
  }

  for (const locale of SUPPORTED_LOCALES) {
    const entries = messagesByLocale[locale].formulas.entries as Record<
      string,
      unknown
    >;
    const projection = Object.fromEntries(
      EXPECTED_GUIDE_SLUGS.map((slug) => [slug, entries[slug]]),
    );
    if (
      Object.values(projection).some((entry) => entry === undefined) ||
      sha256Canonical(projection, 10_000) !==
        asset.localeContentCanonicalSha256[locale]
    ) {
      throw new Error('restored-guide-localized-content-invalid');
    }
  }

  for (const row of rows) {
    const formulaId = row.formulaId as FormulaIdV1;
    const guide = getPublishedFormulaGuideByFormulaId(formulaId);
    const record = buildFormulaRecordV1(formulaId, 'en');
    if (
      row.publicationDecision !== 'publish' ||
      row.guideAvailability !== 'published' ||
      row.implementationBasis !== 'project-owned' ||
      !SHA256.test(row.sourceRevision) ||
      !SHA256.test(row.semanticHash) ||
      !guide ||
      guide.slug !== row.guideSlug ||
      getPublishedFormulaGuideFormulaId(guide) !== formulaId ||
      !record ||
      record.availability !== 'published' ||
      record.publicationDecision !== 'publish' ||
      record.implementationBasis !== 'project-owned' ||
      record.canonicalName !== row.displayName ||
      record.primaryFamily !== row.primaryFamily ||
      record.source.sourceRevision !== row.sourceRevision ||
      record.source.semanticHash !== row.semanticHash
    ) {
      throw new Error('restored-guide-runtime-binding-invalid');
    }
  }

  return Object.freeze(rows.map((row) => row.formulaId as FormulaIdV1));
}

export const RESTORED_GUIDE_FORMULA_IDS_V1 =
  validateRestoredGuideProjectionV1();

const restoredGuideFormulaIdSet = new Set<string>(
  RESTORED_GUIDE_FORMULA_IDS_V1,
);

export function isRestoredGuideFormulaV1(formulaId: string): boolean {
  return restoredGuideFormulaIdSet.has(formulaId);
}

export function loadRestoredGuideFormulaIdsV1(): readonly FormulaIdV1[] {
  return RESTORED_GUIDE_FORMULA_IDS_V1;
}

export function loadRestoredGuideLocalesV1(
  formulaId: string,
): readonly SupportedLocale[] {
  return isRestoredGuideFormulaV1(formulaId) ? SUPPORTED_LOCALES : [];
}
