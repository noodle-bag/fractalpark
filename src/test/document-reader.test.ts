import { describe, expect, it } from 'vitest';

import { readFractalDocument } from '@/engine/document-reader';
import documentV1 from './fixtures/documents/document-v1.json';
import documentV2 from './fixtures/documents/document-v2.json';
import documentV3Future from './fixtures/documents/document-v3-future.json';

describe('document reader', () => {
  it('migrates a v1 document into an editable v2 document', () => {
    const result = readFractalDocument(documentV1);

    expect(result.mode).toBe('editable');
    if (result.mode !== 'editable') return;

    expect(result.migratedFrom).toBe(1);
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document.coloring.pipelineVersion).toBe(1);
    expect(result.document.animation?.viewKeyframes).toHaveLength(2);
    expect(result.document.scene.bounds.centerX).toBe(-0.123);
  });

  it('normalizes a current v2 document without marking it as migrated', () => {
    const result = readFractalDocument(documentV2);

    expect(result.mode).toBe('editable');
    if (result.mode !== 'editable') return;

    expect(result.migratedFrom).toBeUndefined();
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document.metadata?.sourceId).toBe('fixture-v2');
  });

  it('projects a future document for preview while preserving the original', () => {
    const result = readFractalDocument(documentV3Future);

    expect(result.mode).toBe('readonly-future');
    if (result.mode !== 'readonly-future') return;

    expect(result.sourceVersion).toBe(3);
    expect(result.original).toBe(documentV3Future);
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document.scene.bounds.centerX).toBe(-0.75);
    expect(result.document.render.maxIterations).toBe(500);
    expect(result.warnings).toHaveLength(2);
    expect(result.document.scene).not.toHaveProperty('futureCameraModel');
  });

  it('rejects malformed document shapes with typed errors', () => {
    expect(readFractalDocument(null)).toEqual({
      mode: 'invalid',
      errors: [{ code: 'not-an-object', message: 'The document must be a JSON object.' }],
    });
    expect(readFractalDocument({ schemaVersion: 2 })).toMatchObject({
      mode: 'invalid',
      errors: [{ code: 'missing-document-sections' }],
    });
    expect(readFractalDocument({ schemaVersion: 2.5 })).toMatchObject({
      mode: 'invalid',
      errors: [{ code: 'invalid-schema-version' }],
    });
  });
});
