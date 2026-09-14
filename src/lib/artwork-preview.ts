import { documentToRuntimeParams } from '@/engine/document-adapter';
import {
  readFractalDocumentEnvelope,
  type PortableFormulaAsset,
} from '@/engine/document-envelope';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import { resolveFormulaRuntimeCapabilityV1 } from '@/engine/formulas/v1/formula-runtime-capability-v1';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FractalParams, Keyframe } from '@/engine/types';
import { resolveRendererPipelineVersion } from '@/engine/frm/semantics-version';
import { resolveCustomFormula, resolveFormulaReference } from '@/lib/formula-resolver';
import { sha256Hex } from '@/lib/fractal-file';
import { isPublishedFormulaId } from '@/lib/public-formula';

const PREVIEW_MIN_BAILOUT = 1e-6;
const PREVIEW_MAX_BAILOUT = 1_000_000;

export interface ArtworkPreviewData {
  params: FractalParams;
  keyframes: Keyframe[];
  /** Isolated published or custom formula. Never registered in session-global state. */
  customFormulaPlugin: FormulaPlugin | null;
}

function findPortableFormulaAsset(
  assets: PortableFormulaAsset[] | undefined,
  formulaId: string,
): PortableFormulaAsset | null {
  return assets?.find((asset) => asset.id === formulaId) ?? null;
}

/**
 * Validate an immutable cloud envelope and turn it into isolated renderer input.
 *
 * Community data is public but still untrusted input. Portable formula bytes
 * are hash-checked and compiled without touching the user's session formula
 * registry or save/export assets. Invalid or future envelopes fail closed to
 * the neutral preview fallback instead of executing ambiguous content.
 */
export async function prepareArtworkPreview(envelope: unknown): Promise<ArtworkPreviewData | null> {
  registerBuiltins({ quiet: true });

  const read = readFractalDocumentEnvelope(envelope);
  if (read.mode !== 'editable') return null;

  const document = read.envelope.document;
  const formulaId = document.formula.formulaId;
  let customFormulaPlugin: FormulaPlugin | null = null;
  let customFormulaSemanticsVersion: 1 | 2 | undefined;
  const params = documentToRuntimeParams(document);

  if (isPublishedFormulaId(formulaId)) {
    try {
      const { getPublishedFormulaLibraryClient } = await import('@/lib/published-formula-library');
      const library = await getPublishedFormulaLibraryClient();
      if (!library.ok) return null;
      const row = library.value.get(formulaId);
      if (!row) return null;
      const loaded = await library.value.load(formulaId);
      if (!loaded.ok) return null;
      customFormulaPlugin = resolveRecoveredPublishedRenderingPluginV1(
        bindPublishedRenderingSourceV1(loaded.value),
        pluginRegistry.getFormula(row.displayName),
      );
      params.isJulia = document.formula.isJulia && resolveFormulaRuntimeCapabilityV1(
        formulaId,
        customFormulaPlugin,
      ).supportsRuntime;
    } catch {
      return null;
    }
  } else if (getFormulaMetadata(formulaId)) {
    const resolution = resolveFormulaReference(formulaId, []);
    if (!resolution.success) return null;
  } else {
    const reference = document.assets?.formula;
    const asset = findPortableFormulaAsset(read.envelope.assets?.formulas, formulaId);
    if (!reference || reference.id !== formulaId || !asset) return null;
    customFormulaSemanticsVersion = asset.frmSemanticsVersion;

    const actualHash = await sha256Hex(asset.source);
    if (
      actualHash !== asset.hash ||
      (reference.hash !== undefined && reference.hash !== actualHash)
    ) {
      return null;
    }

    const resolution = resolveCustomFormula(
      {
        id: asset.id,
        source: asset.source,
        frmSemanticsVersion: asset.frmSemanticsVersion,
      },
      { register: false },
    );
    if (!resolution.success) return null;

    // Public formula source is untrusted. Bound only the preview instance so an
    // extreme bailout cannot monopolize the serialized 640x400 render queue;
    // editor and saved-artwork semantics remain untouched.
    const rawBailout = resolution.plugin.bailout ?? 4;
    const bailout = Number.isFinite(rawBailout)
      ? Math.min(
          PREVIEW_MAX_BAILOUT,
          Math.max(PREVIEW_MIN_BAILOUT, rawBailout),
        )
      : 4;
    customFormulaPlugin = { ...resolution.plugin, bailout };
  }

  return {
    params: {
      ...params,
      pipelineVersion: resolveRendererPipelineVersion(
        customFormulaSemanticsVersion,
        document.coloring.pipelineVersion,
      ),
    },
    keyframes: document.animation?.viewKeyframes ?? [],
    customFormulaPlugin,
  };
}
