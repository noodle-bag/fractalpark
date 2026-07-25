import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import documentV1 from './fixtures/documents/document-v1.json';
import documentV2 from './fixtures/documents/document-v2.json';
import documentV3Future from './fixtures/documents/document-v3-future.json';
import envelopeV1 from './fixtures/documents/envelope-v1.json';
import legacySavedFractal from './fixtures/documents/legacy-saved-fractal.json';
import legacyUrlState from './fixtures/documents/legacy-url-state.json';

describe('document compatibility fixtures', () => {
  it('keeps representative legacy and versioned inputs available', () => {
    expect(legacyUrlState).not.toHaveProperty('schemaVersion');
    expect(legacySavedFractal).toHaveProperty('params');
    expect(documentV1.schemaVersion).toBe(1);
    expect(documentV2.schemaVersion).toBe(2);
    expect(documentV3Future.schemaVersion).toBe(3);
    expect(envelopeV1.envelopeVersion).toBe(1);
    expect(envelopeV1.document.schemaVersion).toBe(2);
    expect(envelopeV1.assets.formulas[0].language).toBe('frm');
  });

  it('keeps a deliberately malformed project file', () => {
    const malformed = readFileSync(
      resolve(process.cwd(), 'src/test/fixtures/documents/malformed-project.fractal.json'),
      'utf8'
    );

    expect(() => JSON.parse(malformed)).toThrow();
  });
});
