import type { FractalDocument } from '@/engine/document';
import { FORMULA_CATALOG } from '@/engine/plugins/formula-catalog';

const BUILTIN_FORMULA_IDS = new Set(FORMULA_CATALOG.map((formula) => formula.id));

export type ProjectFileSizeBucket =
  | 'under-64-kib'
  | '64-to-256-kib'
  | '256-kib-to-1-mib'
  | 'over-1-mib';

export function getArtworkAnalyticsContext(document: FractalDocument) {
  const formulaId = document.formula.formulaId;
  const isBuiltin = BUILTIN_FORMULA_IDS.has(formulaId);
  return {
    document_version: document.schemaVersion,
    formula_kind: isBuiltin ? 'builtin' : 'custom',
    ...(isBuiltin ? { formula: formulaId } : {}),
  } as const;
}

export function getProjectFileSizeBucket(bytes: number): ProjectFileSizeBucket {
  if (bytes < 64 * 1024) return 'under-64-kib';
  if (bytes < 256 * 1024) return '64-to-256-kib';
  if (bytes <= 1024 * 1024) return '256-kib-to-1-mib';
  return 'over-1-mib';
}
