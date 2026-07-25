import { describe, expect, it } from 'vitest';

import { readFractalDocumentEnvelope } from '@/engine/document-envelope';
import documentV3Future from './fixtures/documents/document-v3-future.json';
import envelopeV1 from './fixtures/documents/envelope-v1.json';

describe('document envelope', () => {
  it('reads and normalizes an Envelope v1 project', () => {
    const result = readFractalDocumentEnvelope(envelopeV1);

    expect(result.mode).toBe('editable');
    if (result.mode !== 'editable') return;

    expect(result.envelope.envelopeVersion).toBe(1);
    expect(result.envelope.document.schemaVersion).toBe(2);
    expect(result.envelope.assets?.formulas?.[0]).toMatchObject({
      id: 'custom-fixture',
      language: 'frm',
    });
  });

  it('preserves future documents as readonly envelope inputs', () => {
    const futureEnvelope = {
      envelopeVersion: 1,
      document: documentV3Future,
    };
    const result = readFractalDocumentEnvelope(futureEnvelope);

    expect(result.mode).toBe('readonly-future');
    if (result.mode !== 'readonly-future') return;

    expect(result.sourceVersion).toBe(3);
    expect(result.original).toBe(futureEnvelope);
    expect(result.document.schemaVersion).toBe(2);
  });

  it('rejects unsupported envelopes and malformed assets', () => {
    expect(readFractalDocumentEnvelope({ envelopeVersion: 2 })).toMatchObject({
      mode: 'invalid',
      errors: [{ code: 'unsupported-envelope-version' }],
    });

    expect(
      readFractalDocumentEnvelope({
        ...envelopeV1,
        assets: {
          formulas: [
            {
              id: 'bad-hash',
              language: 'frm',
              source: 'Bad {}',
              hash: 'not-a-hash',
            },
          ],
        },
      })
    ).toMatchObject({
      mode: 'invalid',
      errors: [{ code: 'invalid-assets', path: 'assets.formulas[0].hash' }],
    });
  });

  it('rejects duplicate portable formula IDs', () => {
    const formula = envelopeV1.assets.formulas[0];
    const result = readFractalDocumentEnvelope({
      ...envelopeV1,
      assets: { formulas: [formula, formula] },
    });

    expect(result).toMatchObject({
      mode: 'invalid',
      errors: [{ code: 'invalid-assets', path: 'assets.formulas[1].id' }],
    });
  });
});
