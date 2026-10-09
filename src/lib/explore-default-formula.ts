import {
  compilePublishedFormulaPluginV1,
  PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1,
} from '@/engine/formulas/v1/published-adapter';
import { applyPublishedCoordinateParametersV1 } from '@/engine/formulas/v1/published-coordinate-parameters-v1';
import type { PublishedFormulaRuntimeIndexRowV1 } from '@/engine/formulas/v1';
import type { PublishedFormulaSelectionClient } from '@/lib/published-formula-selection';

export const EXPLORE_DEFAULT_URL =
  '/explore-default-formula.json';

export interface ExploreDefaultFormula {
  row: PublishedFormulaRuntimeIndexRowV1;
  source: string;
  client: PublishedFormulaSelectionClient;
}

export async function loadExploreDefaultFormula(
  signal?: AbortSignal,
): Promise<ExploreDefaultFormula | undefined> {
  try {
    const response = await fetch(EXPLORE_DEFAULT_URL, {
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const payload = value as Record<string, unknown>;
    const row = payload.row as PublishedFormulaRuntimeIndexRowV1 | undefined;
    if (
      payload.schema !== 'fractalpark-explore-default/v1' ||
      payload.runtimeAlias !== 'mandelbrot' ||
      !row || typeof row !== 'object' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.formulaId) ||
      row.displayName !== 'mandelbrot' ||
      row.descriptorSchema !== PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1 ||
      !/^[0-9a-f]{64}$/.test(row.sourceRevision) ||
      !/^[0-9a-f]{64}$/.test(row.semanticHash) ||
      row.definitionPath !== `definitions/${row.sourceRevision}.frm` ||
      !Array.isArray(row.parameters) ||
      !row.profile ||
      typeof payload.source !== 'string'
    ) return undefined;
    if (signal?.aborted) return undefined;
    const source = payload.source;
    return {
      row,
      source,
      client: {
        async load(formulaId, loadSignal) {
          if (loadSignal?.aborted) return { ok: false, code: 'definition-fetch-failed' };
          if (formulaId !== row.formulaId) return { ok: false, code: 'formula-not-published' };
          const compiled = await compilePublishedFormulaPluginV1({
            formulaId: row.formulaId,
            displayName: row.displayName,
            family: row.family,
            sourceRevision: row.sourceRevision,
            semanticHash: row.semanticHash,
            source,
          });
          if (!compiled.ok) return { ok: false, code: 'definition-compile-failed' };
          if (
            compiled.value.descriptor.schema !== row.descriptorSchema ||
            JSON.stringify(compiled.value.descriptor.parameters) !== JSON.stringify(row.parameters)
          ) return { ok: false, code: 'descriptor-mismatch' };
          if (loadSignal?.aborted) return { ok: false, code: 'definition-fetch-failed' };
          return applyPublishedCoordinateParametersV1(compiled.value);
        },
      },
    };
  } catch {
    return undefined;
  }
}
