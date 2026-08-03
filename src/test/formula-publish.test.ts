import { describe, expect, it } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';
import { validateFormulaPublication } from '@/lib/cloud/formula-publish';

const VALID_FRM = `TestCustom {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

async function envelopeWithFormula(source = VALID_FRM, id = 'my-custom-test') {
  const doc = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  doc.formula.formulaId = id;
  const result = await createFractalDocumentEnvelope(doc, [{ id, name: 'Test Custom', source }]);
  if (!result.success) throw new Error('fixture envelope failed');
  return result.value;
}

describe('validateFormulaPublication (spec §17.2)', () => {
  it('accepts a valid referenced formula asset', async () => {
    const envelope = await envelopeWithFormula();
    const verdict = validateFormulaPublication(envelope);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.formulaId).toBe('my-custom-test');
      expect(verdict.formulaName).toBe('TestCustom');
    }
  });

  it('rejects when the document does not reference the asset', async () => {
    const envelope = await envelopeWithFormula();
    const tampered = structuredClone(envelope);
    tampered.document.formula.formulaId = 'mandelbrot';
    expect(validateFormulaPublication(tampered)).toEqual({ ok: false, code: 'invalid_envelope' });
  });

  it('rejects a builtin-id conflict', async () => {
    const envelope = await envelopeWithFormula();
    const tampered = structuredClone(envelope);
    tampered.assets!.formulas![0].id = 'mandelbrot';
    tampered.document.formula.formulaId = 'mandelbrot';
    expect(validateFormulaPublication(tampered)).toEqual({
      ok: false,
      code: 'formula_builtin_conflict',
    });
  });

  it('rejects uncompilable source', async () => {
    const envelope = await envelopeWithFormula('not valid frm at all {{{');
    const verdict = validateFormulaPublication(envelope);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('formula_compile_failed');
  });

  it('rejects a hash-mismatched asset', async () => {
    const envelope = await envelopeWithFormula();
    const tampered = structuredClone(envelope);
    const asset = tampered.assets!.formulas![0];
    asset.hash = '0'.repeat(64);
    expect(validateFormulaPublication(tampered)).toEqual({ ok: false, code: 'invalid_envelope' });
  });

  it('rejects multiple assets', async () => {
    const envelope = await envelopeWithFormula();
    const tampered = structuredClone(envelope);
    tampered.assets!.formulas!.push(tampered.assets!.formulas![0]);
    expect(validateFormulaPublication(tampered)).toEqual({ ok: false, code: 'invalid_envelope' });
  });
});
