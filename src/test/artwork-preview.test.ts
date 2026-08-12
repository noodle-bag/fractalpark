import { describe, expect, it } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT, type FractalDocument } from '@/engine/document';
import type { FractalDocumentEnvelopeV1 } from '@/engine/document-envelope';
import { pluginRegistry } from '@/engine/plugins/registry';
import {
  readSessionFormulaAssets,
  resolveCustomFormula,
} from '@/lib/formula-resolver';
import { prepareArtworkPreview } from '@/lib/artwork-preview';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';

const CUSTOM_SOURCE = `PreviewCustom {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const EXTREME_BAILOUT_SOURCE = CUSTOM_SOURCE.replace(
  '|z| < 4',
  '|z| < 1000000000000000000000000000000',
);

const FOREIGN_SOURCE = `ForeignPreview {
init:
  z = 0
loop:
  z = z^3 + c
bailout:
  |z| < 4
}`;

async function envelopeFor(document: FractalDocument): Promise<FractalDocumentEnvelopeV1> {
  const result = await createFractalDocumentEnvelope(document, []);
  if (!result.success) throw new Error('test envelope could not be created');
  return result.value;
}

describe('cloud artwork preview projection', () => {
  it('projects a built-in envelope and preserves its animation keyframes', async () => {
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.animation = {
      viewKeyframes: [
        { id: 'start', bounds: { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 } },
        { id: 'end', bounds: { centerX: -0.7, centerY: 0.2, zoom: 8, rotation: 0.1 } },
      ],
    };

    const preview = await prepareArtworkPreview(await envelopeFor(document));

    expect(preview).not.toBeNull();
    expect(preview?.params.formula).toBe(document.formula.formulaId);
    expect(preview?.params.bounds).toEqual(document.scene.bounds);
    expect(preview?.keyframes).toEqual(document.animation.viewKeyframes);
    expect(preview?.customFormulaPlugin).toBeNull();
  });

  it('hash-checks and compiles the frozen custom formula without registering it globally', async () => {
    const formulaId = 'preview-custom-isolated-test';
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = formulaId;
    const result = await createFractalDocumentEnvelope(document, [
      { id: formulaId, name: 'Preview Custom', source: CUSTOM_SOURCE },
    ]);
    if (!result.success) throw new Error('custom test envelope could not be created');

    const preview = await prepareArtworkPreview(result.value);

    expect(preview?.params.formula).toBe(formulaId);
    expect(preview?.customFormulaPlugin).toMatchObject({ id: formulaId, category: 'formula' });
    expect(pluginRegistry.getFormula(formulaId)).toBeUndefined();
    expect(readSessionFormulaAssets().find((asset) => asset.id === formulaId)).toBeUndefined();
  });

  it('threads a strict-v2 portable asset into the renderer v2 pipeline', async () => {
    const formulaId = 'preview-custom-strict-v2-test';
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = formulaId;
    const result = await createFractalDocumentEnvelope(document, [
      {
        id: formulaId,
        name: 'Strict Preview',
        source: CUSTOM_SOURCE,
        frmSemanticsVersion: 2,
      },
    ]);
    if (!result.success) throw new Error('strict preview envelope failed');

    const preview = await prepareArtworkPreview(result.value);
    expect(preview?.params.pipelineVersion).toBe(2);
    expect(preview?.customFormulaPlugin?.bailoutDescriptor).toBeDefined();
  });

  it('forces a legacy-v1 portable asset onto renderer v1 even when the document says v2', async () => {
    const formulaId = 'preview-custom-legacy-v1-test';
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = formulaId;
    document.coloring.pipelineVersion = 2;
    const result = await createFractalDocumentEnvelope(document, [
      {
        id: formulaId,
        name: 'Legacy Preview',
        source: CUSTOM_SOURCE,
        frmSemanticsVersion: 1,
      },
    ]);
    if (!result.success) throw new Error('legacy preview envelope failed');

    const preview = await prepareArtworkPreview(result.value);
    expect(preview?.params.pipelineVersion).toBe(1);
    expect(preview?.customFormulaPlugin?.frmSemanticsVersion).toBe(1);
  });

  it('bounds an extreme custom bailout only in the isolated preview plugin', async () => {
    const formulaId = 'preview-custom-bailout-bound-test';
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = formulaId;
    const result = await createFractalDocumentEnvelope(document, [
      { id: formulaId, name: 'Bounded Preview', source: EXTREME_BAILOUT_SOURCE },
    ]);
    if (!result.success) throw new Error('bailout test envelope could not be created');

    const preview = await prepareArtworkPreview(result.value);

    expect(preview?.customFormulaPlugin?.bailout).toBe(1_000_000);
    expect(pluginRegistry.getFormula(formulaId)).toBeUndefined();
    expect(readSessionFormulaAssets().find((asset) => asset.id === formulaId)).toBeUndefined();
  });

  it('does not replace a session formula when a public preview reuses its id', async () => {
    const formulaId = 'preview-session-collision-test';
    const userResolution = resolveCustomFormula({ id: formulaId, source: CUSTOM_SOURCE });
    expect(userResolution.success).toBe(true);
    const userPlugin = pluginRegistry.getFormula(formulaId);

    try {
      const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
      document.formula.formulaId = formulaId;
      const result = await createFractalDocumentEnvelope(document, [
        { id: formulaId, name: 'Foreign Preview', source: FOREIGN_SOURCE },
      ]);
      if (!result.success) throw new Error('collision test envelope could not be created');

      const preview = await prepareArtworkPreview(result.value);

      expect(preview?.customFormulaPlugin).toBeDefined();
      expect(preview?.customFormulaPlugin).not.toBe(userPlugin);
      expect(pluginRegistry.getFormula(formulaId)).toBe(userPlugin);
      expect(readSessionFormulaAssets().find((asset) => asset.id === formulaId)?.source).toBe(
        CUSTOM_SOURCE,
      );
    } finally {
      pluginRegistry.unregister('formula', formulaId);
    }
  });

  it('fails closed when portable formula bytes do not match their claimed hash', async () => {
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = 'preview-custom-tampered';
    const result = await createFractalDocumentEnvelope(document, [
      { id: 'preview-custom-tampered', name: 'Preview Custom', source: CUSTOM_SOURCE },
    ]);
    if (!result.success) throw new Error('custom test envelope could not be created');

    const tampered = structuredClone(result.value);
    tampered.assets!.formulas![0].source = `${CUSTOM_SOURCE}\n// changed`;

    await expect(prepareArtworkPreview(tampered)).resolves.toBeNull();
  });

  it('fails closed for a custom formula without its referenced portable asset', async () => {
    const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
    document.formula.formulaId = 'preview-custom-missing';
    document.assets = {
      formula: { id: 'preview-custom-missing', hash: '0'.repeat(64) },
    };
    const envelope: FractalDocumentEnvelopeV1 = {
      envelopeVersion: 1,
      document,
    };

    await expect(prepareArtworkPreview(envelope)).resolves.toBeNull();
  });
});
