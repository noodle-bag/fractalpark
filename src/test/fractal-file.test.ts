import { beforeAll, describe, expect, it } from 'vitest';

import type { FractalDocumentEnvelopeV1 } from '@/engine/document-envelope';
import type { FractalDocument } from '@/engine/document';
import { registerBuiltins } from '@/engine/plugins/builtins';
import {
  createFractalDocumentEnvelope,
  createFractalProjectFilename,
  FRACTAL_PROJECT_FILE_MAX_BYTES,
  parseFractalProjectJson,
  PORTABLE_FORMULA_SOURCE_MAX_BYTES,
  prepareFractalProjectImport,
  serializeFractalProject,
  sha256Hex,
} from '@/lib/fractal-file';
import documentV2 from './fixtures/documents/document-v2.json';
import envelopeV1 from './fixtures/documents/envelope-v1.json';

const CURRENT_DOCUMENT = documentV2 as unknown as FractalDocument;
const PORTABLE_ENVELOPE = envelopeV1 as unknown as FractalDocumentEnvelopeV1;

const CUSTOM_SOURCE = `PortableTest {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const DIFFERENT_SOURCE = `LocalConflict {
init:
  z = 0
loop:
  z = z^3 + c
bailout:
  |z| < 16
}`;

describe('fractal project files', () => {
  beforeAll(() => {
    registerBuiltins({ quiet: true });
  });

  it('serializes current envelopes deterministically and parses them back', () => {
    const first = serializeFractalProject(PORTABLE_ENVELOPE);
    const second = serializeFractalProject(PORTABLE_ENVELOPE);

    expect(first.success).toBe(true);
    expect(second).toEqual(first);
    if (!first.success) return;

    expect(first.value.endsWith('\n')).toBe(true);
    const parsed = parseFractalProjectJson(first.value);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.value.mode).toBe('editable');
    if (parsed.value.mode !== 'editable') return;
    expect(parsed.value.envelope.document.formula.formulaId).toBe('custom-fixture');
  });

  it('returns typed errors for malformed and oversized files', () => {
    expect(parseFractalProjectJson('{ invalid')).toMatchObject({
      success: false,
      errors: [{ code: 'invalid-json' }],
    });
    expect(parseFractalProjectJson(' '.repeat(FRACTAL_PROJECT_FILE_MAX_BYTES + 1))).toMatchObject({
      success: false,
      errors: [{ code: 'file-too-large' }],
    });
  });

  it('creates safe and deterministic project filenames', () => {
    expect(createFractalProjectFilename('  Deep Reef / Julia  ')).toBe(
      'fractalpark-Deep-Reef-Julia.fractal.json'
    );
    expect(createFractalProjectFilename('', Date.UTC(2026, 6, 25, 3, 4, 5))).toBe(
      'fractalpark-2026-07-25T03-04-05-000Z.fractal.json'
    );
  });

  it('parses future project documents as readonly', () => {
    const future = structuredClone(PORTABLE_ENVELOPE) as unknown as Record<string, unknown>;
    const document = future.document as Record<string, unknown>;
    document.schemaVersion = 3;

    const result = parseFractalProjectJson(JSON.stringify(future));
    expect(result).toMatchObject({
      success: true,
      value: {
        mode: 'readonly-future',
        sourceVersion: 3,
      },
    });
  });

  it('creates a document-only envelope for a built-in formula', async () => {
    const result = await createFractalDocumentEnvelope(CURRENT_DOCUMENT, []);

    expect(result).toMatchObject({
      success: true,
      value: {
        envelopeVersion: 1,
        document: {
          schemaVersion: 2,
          formula: { formulaId: 'mandelbrot' },
        },
      },
    });
    if (!result.success) return;
    expect(result.value.assets).toBeUndefined();
  });

  it('preserves Remix provenance through project serialization', async () => {
    const document: FractalDocument = {
      ...CURRENT_DOCUMENT,
      metadata: {
        ...CURRENT_DOCUMENT.metadata,
        source: 'remix',
        sourceId: 'formula:mandelbrot',
      },
    };
    const envelope = await createFractalDocumentEnvelope(document, []);

    expect(envelope.success).toBe(true);
    if (!envelope.success) return;
    const serialized = serializeFractalProject(envelope.value);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    const parsed = parseFractalProjectJson(serialized.value);

    expect(parsed).toMatchObject({
      success: true,
      value: {
        mode: 'editable',
        envelope: {
          document: {
            metadata: {
              source: 'remix',
              sourceId: 'formula:mandelbrot',
            },
          },
        },
      },
    });
  });

  it('collects a custom formula with its exact SHA-256 hash', async () => {
    const document = {
      ...documentV2,
      formula: { ...documentV2.formula, formulaId: 'custom-portable-test' },
    };
    const result = await createFractalDocumentEnvelope(document as unknown as FractalDocument, [
      { id: 'custom-portable-test', name: 'Portable Test', source: CUSTOM_SOURCE },
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const hash = await sha256Hex(CUSTOM_SOURCE);
    expect(result.value.document.assets?.formula).toEqual({
      id: 'custom-portable-test',
      hash,
    });
    expect(result.value.assets?.formulas?.[0]).toEqual({
      id: 'custom-portable-test',
      language: 'frm',
      name: 'Portable Test',
      source: CUSTOM_SOURCE,
      hash,
      frmSemanticsVersion: 1,
    });
  });

  it('rejects oversized custom formula sources before serialization', async () => {
    const oversizedSource = 'x'.repeat(PORTABLE_FORMULA_SOURCE_MAX_BYTES + 1);
    const document = {
      ...documentV2,
      formula: { ...documentV2.formula, formulaId: 'custom-oversized' },
    };
    const result = await createFractalDocumentEnvelope(document as unknown as FractalDocument, [
      { id: 'custom-oversized', source: oversizedSource },
    ]);

    expect(result).toMatchObject({
      success: false,
      errors: [{ code: 'source-too-large' }],
    });
  });

  it('rejects oversized portable sources during file parsing', () => {
    const oversizedEnvelope = structuredClone(PORTABLE_ENVELOPE);
    oversizedEnvelope.assets!.formulas![0].source = 'x'.repeat(
      PORTABLE_FORMULA_SOURCE_MAX_BYTES + 1
    );

    expect(parseFractalProjectJson(JSON.stringify(oversizedEnvelope))).toMatchObject({
      success: false,
      errors: [{ code: 'source-too-large' }],
    });
  });

  it('prepares a portable formula without mutating the envelope', async () => {
    const original = structuredClone(envelopeV1) as FractalDocumentEnvelopeV1;
    const result = await prepareFractalProjectImport(
      PORTABLE_ENVELOPE,
      []
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.formulasToAdd).toHaveLength(1);
    expect(result.value.formulasToAdd[0].id).toBe('custom-fixture');
    expect(result.value.document.formula.formulaId).toBe('custom-fixture');
    expect(envelopeV1).toEqual(original);
  });

  it('reuses a local formula when both ID and hash match', async () => {
    const asset = envelopeV1.assets.formulas[0];
    const result = await prepareFractalProjectImport(
      PORTABLE_ENVELOPE,
      [{ id: asset.id, name: asset.name, source: asset.source }]
    );

    expect(result).toMatchObject({
      success: true,
      value: {
        formulasToAdd: [],
        reusedFormulaIds: ['custom-fixture'],
        document: { formula: { formulaId: 'custom-fixture' } },
      },
    });
  });

  it('does not reuse identical bytes under a different semantics version', async () => {
    const strictEnvelope = structuredClone(
      PORTABLE_ENVELOPE,
    ) as FractalDocumentEnvelopeV1;
    strictEnvelope.assets!.formulas![0].frmSemanticsVersion = 2;
    const asset = strictEnvelope.assets!.formulas![0];
    const result = await prepareFractalProjectImport(strictEnvelope, [
      {
        id: asset.id,
        name: asset.name,
        source: asset.source,
        frmSemanticsVersion: 1,
      },
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.reusedFormulaIds).toEqual([]);
    expect(result.value.formulasToAdd).toHaveLength(1);
    expect(result.value.formulasToAdd[0].id).not.toBe(asset.id);
    expect(result.value.formulasToAdd[0].frmSemanticsVersion).toBe(2);
    expect(result.value.document.formula.formulaId).toBe(
      result.value.formulasToAdd[0].id
    );
  });

  it('derives a deterministic ID when local content conflicts', async () => {
    const asset = envelopeV1.assets.formulas[0];
    const result = await prepareFractalProjectImport(
      PORTABLE_ENVELOPE,
      [{ id: asset.id, name: 'Local Conflict', source: DIFFERENT_SOURCE }]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const expectedId = `custom-imported-${asset.hash.slice(0, 12)}`;
    expect(result.value.formulasToAdd[0].id).toBe(expectedId);
    expect(result.value.document.formula.formulaId).toBe(expectedId);
    expect(result.value.document.assets?.formula?.id).toBe(expectedId);
  });

  it('extends the hash prefix when a derived conflict ID is occupied', async () => {
    const asset = envelopeV1.assets.formulas[0];
    const occupiedPrefixId = `custom-imported-${asset.hash.slice(0, 12)}`;
    const result = await prepareFractalProjectImport(
      PORTABLE_ENVELOPE,
      [
        { id: asset.id, source: DIFFERENT_SOURCE },
        { id: occupiedPrefixId, source: DIFFERENT_SOURCE },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.formulasToAdd[0].id).toBe(
      `custom-imported-${asset.hash.slice(0, 16)}`
    );
  });

  it('rejects a custom document that omits its portable formula reference', async () => {
    const customWithoutAsset = structuredClone(CURRENT_DOCUMENT);
    customWithoutAsset.formula.formulaId = 'custom-missing';

    expect(
      await prepareFractalProjectImport(
        {
          envelopeVersion: 1,
          document: customWithoutAsset,
        },
        []
      )
    ).toMatchObject({
      success: false,
      errors: [{ code: 'missing-formula-asset' }],
    });
  });

  it('rejects hash mismatches and compile failures without producing a prepared import', async () => {
    const hashMismatch = structuredClone(envelopeV1) as FractalDocumentEnvelopeV1;
    hashMismatch.assets!.formulas![0].source += '\n; modified';
    expect(await prepareFractalProjectImport(hashMismatch, [])).toMatchObject({
      success: false,
      errors: [{ code: 'asset-hash-mismatch' }],
    });

    const invalidSource = 'Broken { loop: z = missing + c }';
    const invalidHash = await sha256Hex(invalidSource);
    const compileFailure = structuredClone(envelopeV1) as FractalDocumentEnvelopeV1;
    compileFailure.document.assets!.formula!.hash = invalidHash;
    compileFailure.assets!.formulas![0] = {
      ...compileFailure.assets!.formulas![0],
      source: invalidSource,
      hash: invalidHash,
    };
    expect(await prepareFractalProjectImport(compileFailure, [])).toMatchObject({
      success: false,
      errors: [{ code: 'asset-compile-failed' }],
    });
  });
});
