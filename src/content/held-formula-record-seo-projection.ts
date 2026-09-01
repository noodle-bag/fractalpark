import heldSeoAsset from '../../resources/formula-library/v1/held-formula-record-seo-projection.v1.json';
import { PUBLICATION_DECISION_LEDGER_V1 } from '@/engine/formulas/v1/publication-decisions';
import { PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1 } from '@/engine/formulas/v1/published-runtime';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';

export const HELD_FORMULA_RECORD_COUNT_V1 = 143 as const;

export interface HeldFormulaRecordSeoRowV1 {
  readonly formulaId: FormulaIdV1;
  readonly displayName: string;
  readonly canonicalPath: `/formulas/${FormulaIdV1}`;
  readonly httpStatus: 200;
  readonly robots: 'noindex, follow';
  readonly canonical: 'self';
  readonly sitemap: false;
  readonly hreflang: false;
  readonly publicSource: false;
  readonly publicActions: false;
}

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const raw = heldSeoAsset as unknown as Record<string, unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadHeldSeoRows(): readonly HeldFormulaRecordSeoRowV1[] {
  const unsigned = { ...raw };
  delete unsigned.contentHash;
  if (
    raw.schema !== 'fractalpark-held-formula-record-seo-projection/v1' ||
    raw.revision !== 1 ||
    raw.rowCount !== HELD_FORMULA_RECORD_COUNT_V1 ||
    typeof raw.contentHash !== 'string' ||
    !SHA256.test(raw.contentHash) ||
    sha256HexSyncV1(canonicalJsonV1(unsigned, 65_536)) !== raw.contentHash ||
    !record(raw.authority) ||
    raw.authority.decisionRevision !==
      PUBLICATION_DECISION_LEDGER_V1.decisionRevision ||
    raw.authority.publicationDecisionsContentHash !==
      PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1 ||
    !Array.isArray(raw.rows) ||
    raw.rows.length !== HELD_FORMULA_RECORD_COUNT_V1
  ) {
    throw new Error('held-formula-record-seo-projection-invalid');
  }

  const formulaIds = new Set<string>();
  const rows = raw.rows.map((value): HeldFormulaRecordSeoRowV1 => {
    if (
      !record(value) ||
      typeof value.formulaId !== 'string' ||
      !UUID_V5.test(value.formulaId) ||
      formulaIds.has(value.formulaId) ||
      PUBLICATION_DECISION_LEDGER_V1.decisionFor(value.formulaId as FormulaIdV1)
        ?.publicationDecision !== 'hold' ||
      typeof value.displayName !== 'string' ||
      value.displayName.length === 0 ||
      value.canonicalPath !== `/formulas/${value.formulaId}` ||
      value.httpStatus !== 200 ||
      value.robots !== 'noindex, follow' ||
      value.canonical !== 'self' ||
      value.sitemap !== false ||
      value.hreflang !== false ||
      value.publicSource !== false ||
      value.publicActions !== false
    ) {
      throw new Error('held-formula-record-seo-projection-invalid');
    }
    formulaIds.add(value.formulaId);
    return Object.freeze({
      formulaId: value.formulaId as FormulaIdV1,
      displayName: value.displayName,
      canonicalPath: value.canonicalPath as `/formulas/${FormulaIdV1}`,
      httpStatus: 200,
      robots: 'noindex, follow',
      canonical: 'self',
      sitemap: false,
      hreflang: false,
      publicSource: false,
      publicActions: false,
    });
  });
  if (formulaIds.size !== HELD_FORMULA_RECORD_COUNT_V1) {
    throw new Error('held-formula-record-seo-projection-invalid');
  }
  return Object.freeze(rows);
}

export const HELD_FORMULA_RECORD_SEO_ROWS_V1 = loadHeldSeoRows();
const ROW_BY_ID = new Map(
  HELD_FORMULA_RECORD_SEO_ROWS_V1.map((row) => [row.formulaId, row]),
);

export function getHeldFormulaRecordSeoRowV1(
  formulaId: unknown,
): HeldFormulaRecordSeoRowV1 | undefined {
  return typeof formulaId === 'string'
    ? ROW_BY_ID.get(formulaId as FormulaIdV1)
    : undefined;
}
