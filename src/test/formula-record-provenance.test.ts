import { describe, expect, it } from 'vitest';

import provenanceAsset from '../../resources/formula-library/v1/formula-record-provenance.v1.json';
import {
  FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1,
  FORMULA_RECORD_PROVENANCE_INDEX_V1,
  createFormulaRecordProvenanceIndexV1,
} from '@/engine/formulas/v1/record-provenance';

describe('Formula Record provenance v1', () => {
  it('pins the exact 534-row public source projection', () => {
    expect(FORMULA_RECORD_PROVENANCE_INDEX_V1.contentHash).toBe(
      FORMULA_RECORD_PROVENANCE_CONTENT_HASH_V1,
    );
    expect(FORMULA_RECORD_PROVENANCE_INDEX_V1.rows).toHaveLength(534);
    expect(
      Object.fromEntries(
        ['fractalpark', 'fractint', 'iterated-dynamics'].map((project) => [
          project,
          FORMULA_RECORD_PROVENANCE_INDEX_V1.rows.filter(
            (row) => row.sourceProject === project,
          ).length,
        ]),
      ),
    ).toEqual({
      fractalpark: 89,
      fractint: 415,
      'iterated-dynamics': 30,
    });
  });

  it('builds immutable GitHub file links for all three source projects', () => {
    const samples = {
      fractalpark: FORMULA_RECORD_PROVENANCE_INDEX_V1.provenanceFor(
        '00e14aa8-b766-54ea-a359-3f5d20d329b7',
      ),
      fractint: FORMULA_RECORD_PROVENANCE_INDEX_V1.provenanceFor(
        '0109434e-e9cc-5d80-ad3f-d25ec62cbfda',
      ),
      'iterated-dynamics': FORMULA_RECORD_PROVENANCE_INDEX_V1.provenanceFor(
        '0236be89-f1e9-5e23-b0a3-f4dd201ee788',
      ),
    };

    expect(samples.fractalpark?.resourceUrl).toContain(
      '/blob/e235a9c4fc584c28517102f1a5ed75eeced4df3d/',
    );
    expect(samples.fractint?.resourceUrl).toBe(
      'https://github.com/LegalizeAdulthood/fractint/blob/b846dc501526d1726d8fe88817e53cdfc46e6768/fractint-float/formulas/fractint.frm',
    );
    expect(samples['iterated-dynamics']?.resourceUrl).toBe(
      'https://github.com/LegalizeAdulthood/iterated-dynamics/blob/1874ec377bdb8a62119aaf9975b1444bf087d478/home/extra/frmtutor.frm',
    );
  });

  it('fails closed when a row, source project, or self-hash drifts', () => {
    const mutated = structuredClone(provenanceAsset) as unknown as {
      rows: Array<Record<string, unknown>>;
      contentHash: string;
    };
    mutated.rows[0].sourceProject = 'fractint';
    expect(createFormulaRecordProvenanceIndexV1(mutated)).toEqual({
      ok: false,
      code: 'invalid-formula-record-provenance',
    });

    const rehashed = structuredClone(provenanceAsset) as unknown as {
      rows: Array<Record<string, unknown>>;
      contentHash: string;
    };
    rehashed.contentHash = '0'.repeat(64);
    expect(createFormulaRecordProvenanceIndexV1(rehashed)).toEqual({
      ok: false,
      code: 'invalid-formula-record-provenance',
    });
  });
});
