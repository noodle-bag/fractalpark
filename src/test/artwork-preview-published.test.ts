import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { pluginRegistry } from '@/engine/plugins/registry';
import { prepareArtworkPreview } from '@/lib/artwork-preview';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';
import { readSessionFormulaAssets } from '@/lib/formula-resolver';

vi.mock('@/lib/published-formula-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/published-formula-library')>();
  return {
    ...actual,
    getPublishedFormulaLibraryClient: () => actual.createPublishedFormulaLibraryClient(),
  };
});

const MC_ID = 'cddc90de-e9bd-51ce-909b-b9b956bf419b';

async function mcEnvelope() {
  const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  document.formula.formulaId = MC_ID;
  document.formula.params = {
    formula: { frmV1_growth: [0.054443414843043124, 0.2138612207742419] },
  };
  document.scene.bounds = {
    centerX: -0.0004201048540320277,
    centerY: -9.625255574956285e-5,
    zoom: 0.8736698609400598,
    rotation: -Math.PI,
  };
  document.animation = {
    viewKeyframes: [
      { id: 'start', bounds: { ...document.scene.bounds, zoom: 246.992170271962, rotation: 0 } },
      { id: 'end', bounds: { ...document.scene.bounds } },
    ],
  };
  const result = await createFractalDocumentEnvelope(document, []);
  if (!result.success) throw new Error('published envelope failed');
  return result.value;
}

function mockPublicAssets(failDefinitions = false) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (failDefinitions && path.endsWith('.frm')) return new Response('', { status: 503 });
    return new Response(readFileSync(join(process.cwd(), 'public', path), 'utf8'));
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('published cloud artwork previews', () => {
  it('renders mc from the verified public library without portable assets or session registration', async () => {
    const fetcher = mockPublicAssets();
    const envelope = await mcEnvelope();
    const original = structuredClone(envelope);
    const sessionAssets = readSessionFormulaAssets();

    expect(envelope.assets?.formulas).toBeUndefined();
    const preview = await prepareArtworkPreview(envelope);

    expect(preview).not.toBeNull();
    expect(preview?.customFormulaPlugin).toMatchObject({ id: MC_ID, source: 'frm' });
    expect(preview?.params.formula).toBe(MC_ID);
    expect(preview?.params.pluginParams?.frmV1_growth).toEqual(
      envelope.document.formula.params?.formula?.frmV1_growth,
    );
    expect(preview?.params.bounds).toEqual(envelope.document.scene.bounds);
    expect(preview?.keyframes).toEqual(envelope.document.animation?.viewKeyframes);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('.frm'))).toBe(true);
    expect(pluginRegistry.getFormula(MC_ID)).toBeUndefined();
    expect(readSessionFormulaAssets()).toEqual(sessionAssets);
    expect(envelope).toEqual(original);
  });

  it('fails closed when the public Definition cannot be fetched', async () => {
    mockPublicAssets(true);
    await expect(prepareArtworkPreview(await mcEnvelope())).resolves.toBeNull();
  });

  it('does not accept an unknown UUID as a published formula', async () => {
    const fetcher = mockPublicAssets();
    const envelope = await mcEnvelope();
    envelope.document.formula.formulaId = '00000000-0000-5000-8000-000000000000';
    await expect(prepareArtworkPreview(envelope)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['00e14aa8-b766-54ea-a359-3f5d20d329b7', true],
    ['9e4246cb-bc41-57ba-9903-5c3dcc366cac', false],
  ])('gates Julia using the isolated verified plugin for %s', async (formulaId, expected) => {
    mockPublicAssets();
    const envelope = await mcEnvelope();
    envelope.document.formula.formulaId = formulaId;
    envelope.document.formula.isJulia = true;
    const preview = await prepareArtworkPreview(envelope);
    expect(preview).not.toBeNull();
    expect(preview?.params.isJulia).toBe(expected);
    expect(envelope.document.formula.isJulia).toBe(true);
    expect(pluginRegistry.getFormula(formulaId)).toBeUndefined();
  });

  it('rejects tampered published source instead of compiling unverified bytes', async () => {
    const fetcher = mockPublicAssets();
    const readAsset = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input) => {
      const response = await readAsset(input);
      return String(input).endsWith('.frm')
        ? new Response(`${await response.text()}\n// tampered`)
        : response;
    });
    await expect(prepareArtworkPreview(await mcEnvelope())).resolves.toBeNull();
  });
});
