import provenanceAsset from '../../../../resources/formula-library/v1/formula-record-provenance.v1.json';

import {
  PUBLICATION_DECISION_LEDGER_V1,
  type PublicationDecisionLedgerV1,
} from './publication-decisions';
import { canonicalJsonV1, sha256HexSyncV1 } from './revisions';
import {
  STANDARD_MANIFEST_INDEX_V1,
  type StandardManifestIndexV1,
} from './standard-manifest';
import type { FormulaIdV1 } from './types';

export const FORMULA_RECORD_PROVENANCE_SCHEMA_V1 =
  'fractalpark-formula-record-provenance/v1';
export const FORMULA_RECORD_PROVENANCE_VERSION_V1 = 1;
export const FORMULA_RECORD_PROVENANCE_COUNT_V1 = 534;
export const FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1 =
  'd409c6f6ee755125d925be5a4f8cbbafeba020692431fb456b4ad2ca6aa740c8';

export type FormulaHistoricalSourceProjectV1 =
  | 'fractalpark'
  | 'fractint'
  | 'iterated-dynamics';

export interface FormulaHistoricalSourceV1 {
  readonly sourceProject: FormulaHistoricalSourceProjectV1;
  readonly sourceProjectName: string;
  readonly repositoryUrl: string;
  readonly repositoryRevision: string;
  readonly observedAt: string;
  readonly filePath: string;
  readonly resourceUrl: string;
}

export interface FormulaRecordProvenanceIndexV1 {
  readonly contentHash: typeof FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1;
  readonly rows: readonly Readonly<
    FormulaHistoricalSourceV1 & { formulaId: FormulaIdV1 }
  >[];
  provenanceFor(formulaId: unknown): FormulaHistoricalSourceV1 | undefined;
}

export type FormulaRecordProvenanceBuildResultV1 =
  | { readonly ok: true; readonly index: FormulaRecordProvenanceIndexV1 }
  | { readonly ok: false; readonly code: 'invalid-formula-record-provenance' };

type JsonRecord = Record<string, unknown>;

const PROJECTS = Object.freeze([
  'fractalpark',
  'fractint',
  'iterated-dynamics',
] as const satisfies readonly FormulaHistoricalSourceProjectV1[]);

const EXPECTED_BINDINGS = Object.freeze({
  standardFormulaIdsSha256:
    'b98bbc2b954871b227acfd7c882443cbeb44870931ddb4714c9aed3ffcf33729',
  publicationDecisionsSha256:
    'ed63d7fab46530ac61a2dfb562644b9d36c1d8f4a73128cc51c0c7fbcb625de6',
  publishedRuntimeIndexSha256:
    'e912b1cb4ad884a6a021fd0d2683495e8ea61911d05c4135fbecaa335cade742',
});

const EXPECTED_COUNTS = Object.freeze({
  fractalpark: 89,
  fractint: 415,
  'iterated-dynamics': 30,
});

const EXPECTED_REPOSITORIES = Object.freeze({
  fractalpark: Object.freeze({
    displayName: 'FractalPark',
    repositoryUrl: 'https://github.com/noodle-bag/fractalpark',
    revision: 'e235a9c4fc584c28517102f1a5ed75eeced4df3d',
  }),
  fractint: Object.freeze({
    displayName: 'Fractint',
    repositoryUrl: 'https://github.com/LegalizeAdulthood/fractint',
    revision: 'b846dc501526d1726d8fe88817e53cdfc46e6768',
  }),
  'iterated-dynamics': Object.freeze({
    displayName: 'Iterated Dynamics',
    repositoryUrl: 'https://github.com/LegalizeAdulthood/iterated-dynamics',
    revision: '1874ec377bdb8a62119aaf9975b1444bf087d478',
  }),
});

const FRACTINT_FILES = new Set([
  'fractint-float/formulas/fract001.frm',
  'fractint-float/formulas/fract002.frm',
  'fractint-float/formulas/fract003.frm',
  'fractint-float/formulas/fract196.frm',
  'fractint-float/formulas/fract200.frm',
  'fractint-float/formulas/fractint.frm',
  'fractint-float/formulas/ikenaga.frm',
  'fractint-float/formulas/julitile.frm',
  'fractint/formulas/fractint.frm',
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'observedAt',
  'formulaCount',
  'inputBindings',
  'sourceCounts',
  'repositories',
  'rows',
  'contentHash',
]);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function isProject(value: unknown): value is FormulaHistoricalSourceProjectV1 {
  return (
    typeof value === 'string' &&
    (PROJECTS as readonly string[]).includes(value)
  );
}

function matchesRecord(
  value: unknown,
  expected: Readonly<Record<string, string | number>>,
): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, expectedValue]) =>
      Object.is(value[key], expectedValue),
    )
  );
}

function validFilePath(
  project: FormulaHistoricalSourceProjectV1,
  filePath: string,
): boolean {
  if (project === 'fractint') return FRACTINT_FILES.has(filePath);
  if (project === 'iterated-dynamics') {
    return filePath === 'home/extra/frmtutor.frm';
  }
  return /^public\/formula-library\/v1\/runtime\/published\/definitions\/[a-f0-9]{64}\.frm$/.test(
    filePath,
  );
}

function resourceUrl(
  repositoryUrl: string,
  revision: string,
  filePath: string,
): string {
  return `${repositoryUrl}/blob/${revision}/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export function createFormulaRecordProvenanceIndexV1(
  input: unknown = provenanceAsset,
  manifest: StandardManifestIndexV1 = STANDARD_MANIFEST_INDEX_V1,
  decisions: PublicationDecisionLedgerV1 = PUBLICATION_DECISION_LEDGER_V1,
): FormulaRecordProvenanceBuildResultV1 {
  const invalid = (): FormulaRecordProvenanceBuildResultV1 => ({
    ok: false,
    code: 'invalid-formula-record-provenance',
  });
  if (!isRecord(input) || !hasExactKeys(input, TOP_LEVEL_KEYS)) return invalid();
  if (
    input.schema !== FORMULA_RECORD_PROVENANCE_SCHEMA_V1 ||
    input.version !== FORMULA_RECORD_PROVENANCE_VERSION_V1 ||
    input.observedAt !== '2026-08-25' ||
    input.formulaCount !== FORMULA_RECORD_PROVENANCE_COUNT_V1 ||
    input.contentHash !== FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1 ||
    !matchesRecord(input.inputBindings, EXPECTED_BINDINGS) ||
    !matchesRecord(input.sourceCounts, EXPECTED_COUNTS) ||
    !isRecord(input.repositories) ||
    !hasExactKeys(input.repositories, PROJECTS) ||
    !Array.isArray(input.rows) ||
    input.rows.length !== FORMULA_RECORD_PROVENANCE_COUNT_V1
  ) {
    return invalid();
  }
  for (const project of PROJECTS) {
    if (!matchesRecord(input.repositories[project], EXPECTED_REPOSITORIES[project])) {
      return invalid();
    }
  }

  const publishedIds = decisions.publishedFormulaIds();
  const counts = { fractalpark: 0, fractint: 0, 'iterated-dynamics': 0 };
  const byId = new Map<FormulaIdV1, FormulaHistoricalSourceV1>();
  const rows: Array<Readonly<FormulaHistoricalSourceV1 & { formulaId: FormulaIdV1 }>> = [];

  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];
    if (!isRecord(row) || !hasExactKeys(row, ['formulaId', 'sourceProject', 'filePath'])) {
      return invalid();
    }
    if (
      typeof row.formulaId !== 'string' ||
      publishedIds[index] !== row.formulaId ||
      !manifest.hasFormulaId(row.formulaId) ||
      !isProject(row.sourceProject) ||
      typeof row.filePath !== 'string' ||
      !validFilePath(row.sourceProject, row.filePath) ||
      byId.has(row.formulaId)
    ) {
      return invalid();
    }
    const aliases = manifest.aliasesFor(row.formulaId);
    const isF588 = aliases.some((alias) => alias.kind === 'f588');
    if (isF588 === (row.sourceProject === 'fractalpark')) return invalid();

    const repository = EXPECTED_REPOSITORIES[row.sourceProject];
    const provenance = Object.freeze({
      sourceProject: row.sourceProject,
      sourceProjectName: repository.displayName,
      repositoryUrl: repository.repositoryUrl,
      repositoryRevision: repository.revision,
      observedAt: input.observedAt,
      filePath: row.filePath,
      resourceUrl: resourceUrl(
        repository.repositoryUrl,
        repository.revision,
        row.filePath,
      ),
    });
    counts[row.sourceProject]++;
    byId.set(row.formulaId, provenance);
    rows.push(Object.freeze({ formulaId: row.formulaId, ...provenance }));
  }
  if (PROJECTS.some((project) => counts[project] !== EXPECTED_COUNTS[project])) {
    return invalid();
  }
  try {
    const unsigned = { ...input };
    delete unsigned.contentHash;
    if (sha256HexSyncV1(canonicalJsonV1(unsigned, 4_096)) !== input.contentHash) {
      return invalid();
    }
  } catch {
    return invalid();
  }

  return {
    ok: true,
    index: Object.freeze({
      contentHash: FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1,
      rows: Object.freeze(rows),
      provenanceFor(formulaId: unknown) {
        return typeof formulaId === 'string'
          ? byId.get(formulaId as FormulaIdV1)
          : undefined;
      },
    }),
  };
}

const result = createFormulaRecordProvenanceIndexV1();
if (!result.ok) throw new Error(result.code);
export const FORMULA_RECORD_PROVENANCE_INDEX_V1 = result.index;
