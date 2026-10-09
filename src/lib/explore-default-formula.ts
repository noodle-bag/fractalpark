import {
  compilePublishedFormulaPluginV1,
} from '@/engine/formulas/v1/published-adapter';
import { applyPublishedCoordinateParametersV1 } from '@/engine/formulas/v1/published-coordinate-parameters-v1';
import type { PublishedFormulaRuntimeIndexRowV1 } from '@/engine/formulas/v1';
import { DEFAULT_FRACTAL_DOCUMENT, type FractalDocument } from '@/engine/document';
import { resolveApplicationPublishedDefaultProfileV1 } from '@/engine/formulas/v1/published-default-profile-corrections-v1';
import { applyPublishedFormulaProfile } from '@/lib/published-formula-profile';
import type { PublishedFormulaSelectionClient } from '@/lib/published-formula-selection';
import defaultAsset from '../../public/explore-default-formula.json';

export interface ExploreDefaultFormula {
  row: PublishedFormulaRuntimeIndexRowV1;
  source: string;
  client: PublishedFormulaSelectionClient;
}

// Generated from the verified runtime alias, index row, and Definition. Importing
// this small asset makes the default identity available before hydration; no
// network request or built-in Mandelbrot render precedes the published formula.
const row = defaultAsset.row as unknown as PublishedFormulaRuntimeIndexRowV1;
const source = defaultAsset.source;

const defaultFormula: ExploreDefaultFormula = {
  row,
  source,
  client: {
    async load(formulaId, signal) {
      if (signal?.aborted) return { ok: false, code: 'definition-fetch-failed' };
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
      if (signal?.aborted) return { ok: false, code: 'definition-fetch-failed' };
      return applyPublishedCoordinateParametersV1(compiled.value);
    },
  },
};

export function getExploreDefaultFormula(): ExploreDefaultFormula {
  return defaultFormula;
}

export function getExploreDefaultDocument(): FractalDocument {
  return applyPublishedFormulaProfile(DEFAULT_FRACTAL_DOCUMENT, {
    formulaId: row.formulaId,
    formulaParams: {},
    profile: resolveApplicationPublishedDefaultProfileV1(row),
  });
}
