import runtimeIndexAsset from '../../public/formula-library/v1/runtime/published/index.json';
import previewManifestAsset from '../../public/formula-library/v1/previews/manifest.json';
import {
  PUBLICATION_DECISION_LEDGER_V1,
  type FormulaImplementationBasisV1,
  type FormulaLeakageScanStatusV1,
  type FormulaPublicationDecisionV1,
  type FormulaRightsStatusV1,
} from '@/engine/formulas/v1/publication-decisions';
import { getFormulaDirectoryEntryV1 } from '@/engine/formulas/v1/directory';
import {
  STANDARD_MANIFEST_INDEX_V1,
  type LegacyAliasV1,
} from '@/engine/formulas/v1/standard-manifest';
import {
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
  parsePublishedFormulaRuntimeIndexV1,
  type PublishedFormulaParameterDescriptorV1,
  type PublishedFormulaProfileQualityV1,
  type PublishedFormulaProfileV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from '@/engine/formulas/v1';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import type { ProvisionalPreviewAnomalyV1 } from '@/engine/formulas/v1/provisional-preview';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';

export const FORMULA_RECORD_COUNT_V1 = 677 as const;
export const PUBLISHED_FORMULA_RECORD_COUNT_V1 = 534 as const;
export const FORMULA_RECORD_PREVIEW_WIDTH_V1 = 96 as const;
export const FORMULA_RECORD_PREVIEW_HEIGHT_V1 = 60 as const;
export const FORMULA_RECORD_TAKEDOWN_EMAIL_V1 = 'contact@fractalpark.com' as const;
export const FORMULA_RECORD_REVISION_V1 =
  `decision-${PUBLICATION_DECISION_LEDGER_V1.decisionRevision}-runtime-${PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1}-preview-v1` as const;

const runtimeResult = parsePublishedFormulaRuntimeIndexV1(runtimeIndexAsset);
if (!runtimeResult.ok) throw new Error('formula-record-runtime-index-invalid');
const RUNTIME_BY_ID = new Map(
  runtimeResult.value.rows.map((row) => [row.formulaId, row]),
);

interface FormulaRecordPreviewManifestRowV1 {
  readonly formulaId: FormulaIdV1;
  readonly file: string;
  readonly pngSha256: string;
  readonly anomalies: readonly ProvisionalPreviewAnomalyV1[];
}

const rawPreviewManifest = previewManifestAsset as {
  readonly schema?: unknown;
  readonly rowCount?: unknown;
  readonly rows?: unknown;
};
if (
  rawPreviewManifest.schema !== 'fractalpark-formula-record-previews/v1' ||
  rawPreviewManifest.rowCount !== PUBLISHED_FORMULA_RECORD_COUNT_V1 ||
  !Array.isArray(rawPreviewManifest.rows)
) {
  throw new Error('formula-record-preview-manifest-invalid');
}
const PREVIEW_BY_ID = new Map<FormulaIdV1, FormulaRecordPreviewManifestRowV1>();
const PREVIEW_ANOMALIES = new Set<ProvisionalPreviewAnomalyV1>([
  'flat-preview',
  'no-escaped-pixels',
  'no-interior-pixels',
  'non-finite-pixels',
]);
for (const raw of rawPreviewManifest.rows) {
  const row = raw as Partial<FormulaRecordPreviewManifestRowV1>;
  if (
    typeof row.formulaId !== 'string' ||
    row.file !== `${row.formulaId}.png` ||
    typeof row.pngSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.pngSha256) ||
    !Array.isArray(row.anomalies) ||
    !row.anomalies.every((anomaly) => PREVIEW_ANOMALIES.has(anomaly)) ||
    PREVIEW_BY_ID.has(row.formulaId as FormulaIdV1)
  ) {
    throw new Error('formula-record-preview-manifest-invalid');
  }
  PREVIEW_BY_ID.set(row.formulaId as FormulaIdV1, {
    formulaId: row.formulaId as FormulaIdV1,
    file: row.file,
    pngSha256: row.pngSha256,
    anomalies: row.anomalies,
  });
}
if (
  PREVIEW_BY_ID.size !== PUBLISHED_FORMULA_RECORD_COUNT_V1 ||
  [...RUNTIME_BY_ID.keys()].some(
    (formulaId) => !PREVIEW_BY_ID.has(formulaId as FormulaIdV1)
  )
) {
  throw new Error('formula-record-preview-manifest-invalid');
}

const PROVENANCE_COLLECTION_BY_ID = new Map<FormulaIdV1, 'F588' | 'B94'>();
for (const formulaId of STANDARD_MANIFEST_INDEX_V1.formulaIds) {
  const aliases = STANDARD_MANIFEST_INDEX_V1.aliasesFor(formulaId);
  const collection = aliases.some((alias) => alias.kind === 'f588')
    ? 'F588'
    : aliases.some((alias) => alias.kind === 'b94-canonical')
      ? 'B94'
      : undefined;
  if (!collection) throw new Error('formula-record-provenance-missing');
  PROVENANCE_COLLECTION_BY_ID.set(formulaId, collection);
}

export type FormulaRecordRightsScopeV1 =
  | 'project-canonical-implementation'
  | 'original-source-public-domain-assumption-and-project-canonical-implementation'
  | 'project-independent-rewrite-only'
  | 'identity-and-provenance-metadata-only';

export type FormulaRecordAliasV1 = Readonly<
  Pick<LegacyAliasV1, 'kind' | 'value'>
>;

interface FormulaRecordCommonV1 {
  readonly schema: 'fractalpark-formula-record/v1';
  readonly recordRevision: string;
  readonly formulaId: FormulaIdV1;
  readonly locale: SupportedLocale;
  readonly canonicalName: string;
  readonly originalName: string;
  readonly authorStatus: 'unconfirmed';
  readonly originalResourceStatus: 'unconfirmed';
  readonly originalVersionStatus: 'unconfirmed';
  readonly aliases: readonly FormulaRecordAliasV1[];
  readonly provenanceCollection: 'F588' | 'B94';
  readonly primaryFamily: string;
  readonly rightsStatus: FormulaRightsStatusV1;
  readonly rightsScope: FormulaRecordRightsScopeV1;
  readonly canonicalImplementationLicense: 'MIT' | null;
  readonly publicationDecision: FormulaPublicationDecisionV1;
  readonly decisionReason: string;
  readonly implementationBasis: FormulaImplementationBasisV1 | null;
  readonly implementationBasisRecordedAt: string | null;
  readonly leakageScanStatus: FormulaLeakageScanStatusV1;
  readonly reviewedAt: string;
  readonly takedown: Readonly<{
    email: typeof FORMULA_RECORD_TAKEDOWN_EMAIL_V1;
    subject: string;
  }>;
}

export interface PublishedFormulaRecordV1 extends FormulaRecordCommonV1 {
  readonly availability: 'published';
  readonly source: Readonly<{
    href: string;
    downloadHref: string;
    sourceRevision: string;
    semanticHash: string;
    languageVersion: 'frm-like/1';
    stdlibVersion: 1;
    parameters: readonly PublishedFormulaParameterDescriptorV1[];
  }>;
  readonly defaultProfile: PublishedFormulaProfileV1;
  readonly preview: Readonly<{
    src: string;
    width: typeof FORMULA_RECORD_PREVIEW_WIDTH_V1;
    height: typeof FORMULA_RECORD_PREVIEW_HEIGHT_V1;
    profileQuality: PublishedFormulaProfileQualityV1;
    status: 'ready' | 'diagnostic';
    pngSha256: string;
    anomalies: readonly ProvisionalPreviewAnomalyV1[];
  }>;
  readonly actions: Readonly<{
    openExploreHref: string;
    remixHref: string;
    viewSourceHref: string;
    downloadSourceHref: string;
  }>;
}

export interface UnavailableFormulaRecordV1 extends FormulaRecordCommonV1 {
  readonly availability: 'hold' | 'exclude';
}

export type PublicFormulaRecordV1 =
  | PublishedFormulaRecordV1
  | UnavailableFormulaRecordV1;

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

function rightsScope(
  rightsStatus: FormulaRightsStatusV1,
  decision: FormulaPublicationDecisionV1,
): FormulaRecordRightsScopeV1 {
  if (decision !== 'publish') return 'identity-and-provenance-metadata-only';
  if (rightsStatus === 'project-owned') {
    return 'project-canonical-implementation';
  }
  if (rightsStatus === 'source-declared-public-domain-assumption') {
    return 'original-source-public-domain-assumption-and-project-canonical-implementation';
  }
  return 'project-independent-rewrite-only';
}

function sourceFacts(row: PublishedFormulaRuntimeIndexRowV1) {
  const href = `/formula-library/v1/runtime/published/${row.definitionPath}`;
  return Object.freeze({
    href,
    downloadHref: href,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    languageVersion: 'frm-like/1' as const,
    stdlibVersion: 1 as const,
    parameters: row.parameters,
  });
}

export function buildFormulaRecordV1(
  formulaId: FormulaIdV1,
  locale: unknown,
): PublicFormulaRecordV1 | undefined {
  if (!isSupportedLocale(locale)) return undefined;
  const directory = getFormulaDirectoryEntryV1(formulaId);
  const decision = PUBLICATION_DECISION_LEDGER_V1.decisionFor(formulaId);
  const provenanceCollection = PROVENANCE_COLLECTION_BY_ID.get(formulaId);
  if (!directory || !decision || !provenanceCollection) return undefined;

  const common = {
    schema: 'fractalpark-formula-record/v1' as const,
    recordRevision: FORMULA_RECORD_REVISION_V1,
    formulaId,
    locale,
    canonicalName: directory.displayName,
    originalName: directory.displayName,
    authorStatus: 'unconfirmed' as const,
    originalResourceStatus: 'unconfirmed' as const,
    originalVersionStatus: 'unconfirmed' as const,
    aliases: Object.freeze(
      STANDARD_MANIFEST_INDEX_V1.aliasesFor(formulaId).map((alias) =>
        Object.freeze({ kind: alias.kind, value: alias.value }),
      ),
    ),
    provenanceCollection,
    primaryFamily: directory.primaryFamily,
    rightsStatus: decision.rightsStatus,
    rightsScope: rightsScope(
      decision.rightsStatus,
      decision.publicationDecision,
    ),
    canonicalImplementationLicense:
      decision.publicationDecision === 'publish' ? ('MIT' as const) : null,
    publicationDecision: decision.publicationDecision,
    decisionReason: decision.decisionReason,
    implementationBasis: decision.implementationBasis,
    implementationBasisRecordedAt: decision.implementationBasisRecordedAt,
    leakageScanStatus: decision.leakageScanStatus,
    reviewedAt: decision.reviewedAt,
    takedown: Object.freeze({
      email: FORMULA_RECORD_TAKEDOWN_EMAIL_V1,
      subject: `[Formula Record Takedown] ${formulaId}`,
    }),
  };

  if (decision.publicationDecision !== 'publish') {
    return Object.freeze({
      ...common,
      availability: decision.publicationDecision,
    });
  }

  const runtime = RUNTIME_BY_ID.get(formulaId);
  const previewEvidence = PREVIEW_BY_ID.get(formulaId);
  if (!runtime || !previewEvidence) return undefined;
  const source = sourceFacts(runtime);
  const openExploreHref = `/${locale}/explore?open=standard-formula&formula=${formulaId}`;
  return Object.freeze({
    ...common,
    availability: 'published' as const,
    source,
    defaultProfile: runtime.profile,
    preview: Object.freeze({
      src: `/formula-library/v1/previews/${formulaId}.png`,
      width: FORMULA_RECORD_PREVIEW_WIDTH_V1,
      height: FORMULA_RECORD_PREVIEW_HEIGHT_V1,
      profileQuality: runtime.profile.quality,
      status: previewEvidence.anomalies.length === 0 ? 'ready' : 'diagnostic',
      pngSha256: previewEvidence.pngSha256,
      anomalies: previewEvidence.anomalies,
    }),
    actions: Object.freeze({
      openExploreHref,
      remixHref: `${openExploreHref}&intent=remix`,
      viewSourceHref: source.href,
      downloadSourceHref: source.downloadHref,
    }),
  });
}
