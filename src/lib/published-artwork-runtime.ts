import type {
  PublishedFormulaPluginArtifactV1,
  PublishedFormulaRuntimeIndexRowV1,
  PublishedFormulaRuntimeResultV1,
} from '@/engine/formulas/v1';
import { resolveJuliaRuntimeCapabilityV1 } from '@/engine/formulas/v1/julia-runtime-activation-v1';
import { hasCoordinateParametersV1, publishedCoordinateExecutionRevisionV1 } from '@/engine/formulas/v1/published-coordinate-parameters-v1';
import type { FormulaPlugin } from '@/engine/plugins/types';
import type { FractalParams, PluginParamRecord } from '@/engine/types';
import { normalizePublishedFormulaParams } from '@/lib/published-formula-params';
import { reviewedNativeOriginalV1 } from '@/engine/formulas/v1/reviewed-native-rendering-v1';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import {
  getPublishedFormulaLibraryClient,
  type PublishedFormulaLibraryClient,
  type PublishedFormulaLibraryClientResult,
} from '@/lib/published-formula-library';
import type { PublishedArtworkPlayback } from '@/lib/published-artworks';

export type PublishedArtworkRuntimeInput = Pick<
  PublishedArtworkPlayback,
  'params' | 'runtimeFormula'
>;

export type PublishedArtworkRuntimeFailure =
  | 'library-unavailable'
  | 'runtime-alias-missing'
  | 'julia-unsupported'
  | 'formula-load-failed'
  | 'formula-authority-mismatch';

export type PublishedArtworkRuntimeAvailability =
  | { readonly available: true }
  | {
      readonly available: false;
      readonly reason: PublishedArtworkRuntimeFailure;
    };

export type PublishedArtworkRuntimeResolution =
  | {
      readonly ok: true;
      readonly value: {
        readonly params: FractalParams;
        readonly formulaPlugin?: FormulaPlugin;
      };
    }
  | {
      readonly ok: false;
      readonly reason: PublishedArtworkRuntimeFailure;
    };

export type PublishedArtworkLibraryLoader =
  () => Promise<PublishedFormulaLibraryClientResult>;

interface CanonicalRuntimeTarget {
  client: PublishedFormulaLibraryClient;
  row: PublishedFormulaRuntimeIndexRowV1;
}

type ArtifactResult = PublishedFormulaRuntimeResultV1<
  PublishedFormulaPluginArtifactV1
>;

const artifactRequests = new WeakMap<
  PublishedFormulaLibraryClient,
  Map<string, Promise<ArtifactResult>>
>();

async function resolveCanonicalRuntimeTarget(
  playback: PublishedArtworkRuntimeInput,
  loadLibrary: PublishedArtworkLibraryLoader,
): Promise<
  | { readonly ok: true; readonly value: CanonicalRuntimeTarget }
  | { readonly ok: false; readonly reason: PublishedArtworkRuntimeFailure }
> {
  const runtimeFormula = playback.runtimeFormula;
  if (!runtimeFormula) {
    return { ok: false, reason: 'runtime-alias-missing' };
  }

  let library: PublishedFormulaLibraryClientResult;
  try {
    library = await loadLibrary();
  } catch {
    return { ok: false, reason: 'library-unavailable' };
  }
  if (!library.ok) {
    return { ok: false, reason: 'library-unavailable' };
  }

  const row = library.value.resolveRuntimeAlias(runtimeFormula.runtimeId);
  if (!row) {
    return { ok: false, reason: 'runtime-alias-missing' };
  }

  const capability = resolveJuliaRuntimeCapabilityV1(
    row.formulaId,
    row.sourceRevision,
  );
  if (!capability.supportsRuntime || hasCoordinateParametersV1(row.formulaId, row.sourceRevision)) {
    return { ok: false, reason: 'julia-unsupported' };
  }

  return {
    ok: true,
    value: { client: library.value, row },
  };
}

function loadArtifact(
  client: PublishedFormulaLibraryClient,
  row: PublishedFormulaRuntimeIndexRowV1,
): Promise<ArtifactResult> {
  let requests = artifactRequests.get(client);
  if (!requests) {
    requests = new Map();
    artifactRequests.set(client, requests);
  }

  const cacheKey = `${row.formulaId}:${row.sourceRevision}`;
  const current = requests.get(cacheKey);
  if (current) return current;

  const request = Promise.resolve().then(() => client.load(row.formulaId));
  requests.set(cacheKey, request);
  void request.then(
    (result) => {
      if (!result.ok) requests?.delete(cacheKey);
    },
    () => requests?.delete(cacheKey),
  );
  return request;
}

function canonicalRuntimeParams(
  playback: PublishedArtworkRuntimeInput,
  artifact: PublishedFormulaPluginArtifactV1,
): FractalParams {
  const pluginParams: PluginParamRecord = {
    ...playback.params.pluginParams,
  };
  const formulaInput: PluginParamRecord = {};

  for (const parameter of artifact.descriptor.parameters) {
    const legacyName = `u_${parameter.slotName}`;
    if (Object.hasOwn(pluginParams, parameter.uniformName)) {
      formulaInput[parameter.uniformName] = pluginParams[parameter.uniformName];
    } else if (Object.hasOwn(pluginParams, legacyName)) {
      formulaInput[parameter.uniformName] = pluginParams[legacyName];
    }
    delete pluginParams[legacyName];
  }

  Object.assign(
    pluginParams,
    normalizePublishedFormulaParams(artifact.descriptor, formulaInput),
  );

  return {
    ...playback.params,
    formula: artifact.plugin.id,
    isJulia: true,
    pluginParams,
  };
}

export async function resolvePublishedArtworkRuntimeAvailability(
  playback: PublishedArtworkRuntimeInput,
  loadLibrary: PublishedArtworkLibraryLoader = getPublishedFormulaLibraryClient,
): Promise<PublishedArtworkRuntimeAvailability> {
  if (!playback.runtimeFormula) return { available: true };

  const target = await resolveCanonicalRuntimeTarget(playback, loadLibrary);
  return target.ok
    ? { available: true }
    : { available: false, reason: target.reason };
}

export async function resolvePublishedArtworkRuntime(
  playback: PublishedArtworkRuntimeInput,
  loadLibrary: PublishedArtworkLibraryLoader = getPublishedFormulaLibraryClient,
): Promise<PublishedArtworkRuntimeResolution> {
  if (!playback.runtimeFormula) {
    return {
      ok: true,
      value: { params: playback.params },
    };
  }

  const target = await resolveCanonicalRuntimeTarget(playback, loadLibrary);
  if (!target.ok) return target;

  let loaded: ArtifactResult;
  try {
    loaded = await loadArtifact(target.value.client, target.value.row);
  } catch {
    return { ok: false, reason: 'formula-load-failed' };
  }
  if (!loaded.ok) {
    return { ok: false, reason: 'formula-load-failed' };
  }

  const { plugin } = loaded.value;
  if (
    plugin.id !== target.value.row.formulaId ||
    plugin.cacheFingerprint !== (publishedCoordinateExecutionRevisionV1(loaded.value) ?? target.value.row.sourceRevision) ||
    loaded.value.descriptor.formulaId !== target.value.row.formulaId ||
    loaded.value.descriptor.sourceRevision !== target.value.row.sourceRevision ||
    loaded.value.descriptor.semanticHash !== target.value.row.semanticHash
  ) {
    return { ok: false, reason: 'formula-authority-mismatch' };
  }

  let renderingPlugin = plugin;
  const original = reviewedNativeOriginalV1(playback.runtimeFormula.runtimeId);
  if (original) {
    try {
      renderingPlugin = resolveRecoveredPublishedRenderingPluginV1(
        bindPublishedRenderingSourceV1(loaded.value), original,
      );
    } catch {
      return { ok: false, reason: 'formula-authority-mismatch' };
    }
  }

  return {
    ok: true,
    value: {
      params: canonicalRuntimeParams(playback, loaded.value),
      formulaPlugin: renderingPlugin,
    },
  };
}
