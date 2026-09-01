import type { FractalUrlState } from '@/lib/url-params';
import { canonicalizeCloudCustomFormulaRuntimeId } from '@/lib/cloud/custom-formula-identity';
import type { FractalParams, Keyframe, PluginParamRecord, PluginParamValue, SavedFractal } from './types';
import {
  DEFAULT_DOCUMENT_BOUNDS,
  DEFAULT_DOCUMENT_JULIA_C,
  DEFAULT_DOCUMENT_LIGHTING,
  DEFAULT_DOCUMENT_ORBIT_TRAP,
  DEFAULT_FRACTAL_DOCUMENT,
  FRACTAL_DOCUMENT_SCHEMA_VERSION,
  type AnimationTrack,
  type AssetReference,
  type ColorPostState,
  type ColoringStyleState,
  type FractalDocument,
} from './document';
import {
  projectDocumentToRuntimeParams,
  runtimeParamsToDocument,
  urlStateToDocument,
} from './document-adapter';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasFractalDocumentShape(value: unknown): value is Record<string, unknown> & {
  schemaVersion: number;
} {
  return (
    isObject(value) &&
    typeof value.schemaVersion === 'number' &&
    isObject(value.scene) &&
    isObject(value.formula) &&
    isObject(value.coloring) &&
    isObject(value.transform) &&
    isObject(value.render)
  );
}

function isLegacySavedFractal(value: unknown): value is SavedFractal {
  return isObject(value) && isObject(value.params) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isRuntimeParams(value: unknown): value is FractalParams {
  return (
    isObject(value) &&
    isObject(value.bounds) &&
    typeof value.maxIterations === 'number' &&
    typeof value.paletteIndex === 'number' &&
    typeof value.formula === 'string'
  );
}

function looksLikeUrlState(value: unknown): value is FractalUrlState {
  // Best-effort heuristic: FractalUrlState has no schemaVersion and uses
  // URL-specific field names (e.g. iterations vs maxIterations, julia vs
  // isJulia).  This check runs after isFractalDocument / isLegacySavedFractal /
  // isRuntimeParams, so ambiguous keys like 'formula' won't cause false
  // positives for the types already handled above.
  return (
    isObject(value) &&
    ('centerX' in value ||
      'centerY' in value ||
      'zoom' in value ||
      'rotation' in value ||
      'iterations' in value ||
      'julia' in value ||
      'juliaRe' in value ||
      'juliaIm' in value ||
      'power' in value ||
      'formula' in value ||
      'outsideColoring' in value ||
      'insideColoring' in value ||
      'transformId' in value ||
      'pluginParams' in value ||
      'orbitTrap' in value ||
      'useSSAA' in value ||
      'adaptiveIterations' in value ||
      'lighting' in value ||
      'gradient' in value ||
      'palette' in value ||
      'keyframes' in value)
  );
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePluginParamValue(value: unknown): PluginParamValue | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value) && (value.length === 2 || value.length === 3)) {
    const normalized = value.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : NaN));
    if (normalized.every((entry) => Number.isFinite(entry))) {
      return normalized as PluginParamValue;
    }
  }

  return undefined;
}

function normalizePluginParamRecord(value: unknown): PluginParamRecord | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const normalizedEntry = normalizePluginParamValue(entry);
        return normalizedEntry === undefined ? null : [key, normalizedEntry];
      })
      .filter((entry): entry is [string, PluginParamValue] => entry !== null)
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRgbCurve(value: unknown): [number, number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 5) {
    return undefined;
  }

  const normalized = value.map((entry) => normalizeNumber(entry, NaN));
  return normalized.every(Number.isFinite)
    ? (normalized as [number, number, number, number, number])
    : undefined;
}

function normalizeColoringStyle(value: unknown): ColoringStyleState | undefined {
  if (!isObject(value) || typeof value.styleId !== 'string') {
    return undefined;
  }

  const detail = isObject(value.detail)
    ? {
        scale: typeof value.detail.scale === 'number' && Number.isFinite(value.detail.scale) ? value.detail.scale : undefined,
        amount: typeof value.detail.amount === 'number' && Number.isFinite(value.detail.amount) ? value.detail.amount : undefined,
        softness:
          typeof value.detail.softness === 'number' && Number.isFinite(value.detail.softness)
            ? value.detail.softness
            : undefined,
      }
    : undefined;
  const post: ColorPostState | undefined = isObject(value.post)
    ? {
        toneMapping:
          value.post.toneMapping === 'none' || value.post.toneMapping === 'soft' || value.post.toneMapping === 'filmic'
            ? value.post.toneMapping
            : undefined,
        exposure: typeof value.post.exposure === 'number' && Number.isFinite(value.post.exposure) ? value.post.exposure : undefined,
        contrast: typeof value.post.contrast === 'number' && Number.isFinite(value.post.contrast) ? value.post.contrast : undefined,
        brightness:
          typeof value.post.brightness === 'number' && Number.isFinite(value.post.brightness)
            ? value.post.brightness
            : undefined,
        gamma: typeof value.post.gamma === 'number' && Number.isFinite(value.post.gamma) ? value.post.gamma : undefined,
        saturation:
          typeof value.post.saturation === 'number' && Number.isFinite(value.post.saturation)
            ? value.post.saturation
            : undefined,
        vibrance:
          typeof value.post.vibrance === 'number' && Number.isFinite(value.post.vibrance)
            ? value.post.vibrance
            : undefined,
        hue: typeof value.post.hue === 'number' && Number.isFinite(value.post.hue) ? value.post.hue : undefined,
        temperature:
          typeof value.post.temperature === 'number' && Number.isFinite(value.post.temperature)
            ? value.post.temperature
            : undefined,
        tint: typeof value.post.tint === 'number' && Number.isFinite(value.post.tint) ? value.post.tint : undefined,
        vignette:
          typeof value.post.vignette === 'number' && Number.isFinite(value.post.vignette)
            ? value.post.vignette
            : undefined,
        dither: typeof value.post.dither === 'boolean' ? value.post.dither : undefined,
        invert: typeof value.post.invert === 'boolean' ? value.post.invert : undefined,
        curves: isObject(value.post.curves)
          ? {
              red: normalizeRgbCurve(value.post.curves.red),
              green: normalizeRgbCurve(value.post.curves.green),
              blue: normalizeRgbCurve(value.post.curves.blue),
            }
          : undefined,
      }
    : undefined;

  return {
    styleId: value.styleId,
    detail,
    post,
  };
}

function normalizeAnimationTracks(value: unknown): AnimationTrack[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tracks = value.flatMap((track) => {
    if (!isObject(track) || typeof track.id !== 'string' || typeof track.targetId !== 'string' || !Array.isArray(track.keyframes)) {
      return [];
    }

    const keyframes = track.keyframes.flatMap((keyframe) => {
      if (!isObject(keyframe) || typeof keyframe.time !== 'number' || !Number.isFinite(keyframe.time)) {
        return [];
      }
      const normalizedValue = normalizePluginParamValue(keyframe.value);
      return normalizedValue === undefined ? [] : [{ time: keyframe.time, value: normalizedValue }];
    });

    return [{ id: track.id, targetId: track.targetId, keyframes }];
  });

  return tracks.length > 0 ? tracks : undefined;
}

function normalizeAssetReference(value: unknown): AssetReference | undefined {
  if (!isObject(value) || typeof value.id !== 'string') {
    return undefined;
  }

  return {
    id: canonicalizeCloudCustomFormulaRuntimeId(value.id),
    hash: typeof value.hash === 'string' ? value.hash : undefined,
  };
}

export function normalizeRuntimeFractalParams(input: unknown): FractalParams {
  const defaults = projectDocumentToRuntimeParams(DEFAULT_FRACTAL_DOCUMENT);
  const source = isObject(input) ? input : {};
  const bounds = isObject(source.bounds) ? source.bounds : {};
  const orbitTrap = isObject(source.orbitTrap) ? source.orbitTrap : {};
  const lighting = isObject(source.lighting) ? source.lighting : {};
  const pluginParams = normalizePluginParamRecord(source.pluginParams) ?? defaults.pluginParams;

  return projectDocumentToRuntimeParams(
    normalizeFractalDocument(
      runtimeParamsToDocument({
        maxIterations: normalizeNumber(source.maxIterations, defaults.maxIterations),
        paletteIndex: normalizeNumber(source.paletteIndex, defaults.paletteIndex),
        bounds: {
          centerX: normalizeNumber(bounds.centerX, defaults.bounds.centerX),
          centerY: normalizeNumber(bounds.centerY, defaults.bounds.centerY),
          zoom: normalizeNumber(bounds.zoom, defaults.bounds.zoom),
          rotation: normalizeNumber(bounds.rotation, defaults.bounds.rotation ?? 0),
        },
        isJulia: typeof source.isJulia === 'boolean' ? source.isJulia : defaults.isJulia,
        juliaC: [
          normalizeNumber(Array.isArray(source.juliaC) ? source.juliaC[0] : undefined, defaults.juliaC[0]),
          normalizeNumber(Array.isArray(source.juliaC) ? source.juliaC[1] : undefined, defaults.juliaC[1]),
        ],
        power: normalizeNumber(source.power, defaults.power),
        customGradient: Array.isArray(source.customGradient) ? source.customGradient : defaults.customGradient,
        formula: typeof source.formula === 'string' ? source.formula : defaults.formula,
        outsideColoring: typeof source.outsideColoring === 'string' ? source.outsideColoring : defaults.outsideColoring,
        insideColoring: typeof source.insideColoring === 'string' ? source.insideColoring : defaults.insideColoring,
        transformId: typeof source.transformId === 'string' ? source.transformId : defaults.transformId,
        pluginParams,
        orbitTrap: {
          shape: orbitTrap.shape === 'point' || orbitTrap.shape === 'cross' || orbitTrap.shape === 'circle' ? orbitTrap.shape : defaults.orbitTrap.shape,
          point: [
            normalizeNumber(Array.isArray(orbitTrap.point) ? orbitTrap.point[0] : undefined, defaults.orbitTrap.point[0]),
            normalizeNumber(Array.isArray(orbitTrap.point) ? orbitTrap.point[1] : undefined, defaults.orbitTrap.point[1]),
          ],
          radius: normalizeNumber(orbitTrap.radius, defaults.orbitTrap.radius),
          width: normalizeNumber(orbitTrap.width, defaults.orbitTrap.width),
        },
        useSSAA: typeof source.useSSAA === 'boolean' ? source.useSSAA : defaults.useSSAA,
        adaptiveIterations: typeof source.adaptiveIterations === 'boolean' ? source.adaptiveIterations : defaults.adaptiveIterations,
        lighting: {
          enabled: typeof lighting.enabled === 'boolean' ? lighting.enabled : defaults.lighting.enabled,
          mode: lighting.mode === 'dem' ? 'dem' : 'normalMap',
          azimuth: normalizeNumber(lighting.azimuth, defaults.lighting.azimuth),
          elevation: normalizeNumber(lighting.elevation, defaults.lighting.elevation),
          intensity: normalizeNumber(lighting.intensity, defaults.lighting.intensity),
        },
      })
    )
  );
}

function migrateDocumentToV2(doc: DeepPartial<FractalDocument>): FractalDocument {
  return normalizeFractalDocument(doc);
}

export function normalizeFractalDocument(doc: DeepPartial<FractalDocument>): FractalDocument {
  if (
    isObject(doc) &&
    typeof doc.schemaVersion === 'number' &&
    Math.trunc(doc.schemaVersion) > FRACTAL_DOCUMENT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Cannot normalize future FractalDocument schemaVersion: ${doc.schemaVersion}. ` +
        `Current supported version is ${FRACTAL_DOCUMENT_SCHEMA_VERSION}.`
    );
  }

  const source = isObject(doc) ? doc : {};
  const animation = isObject(source.animation) ? source.animation as Record<string, unknown> : undefined;
  const legacyAssets = isObject(source.assets) ? source.assets as Record<string, unknown> : undefined;
  const viewKeyframes = Array.isArray(animation?.viewKeyframes)
    ? animation.viewKeyframes
    : Array.isArray(animation?.keyframes)
      ? animation.keyframes
      : undefined;

  return {
    schemaVersion: FRACTAL_DOCUMENT_SCHEMA_VERSION,
    scene: {
      bounds: {
        centerX: normalizeNumber(source.scene?.bounds?.centerX, DEFAULT_DOCUMENT_BOUNDS.centerX),
        centerY: normalizeNumber(source.scene?.bounds?.centerY, DEFAULT_DOCUMENT_BOUNDS.centerY),
        zoom: Math.max(0.000001, normalizeNumber(source.scene?.bounds?.zoom, DEFAULT_DOCUMENT_BOUNDS.zoom)),
        rotation: normalizeNumber(source.scene?.bounds?.rotation, DEFAULT_DOCUMENT_BOUNDS.rotation ?? 0),
      },
    },
    formula: {
      formulaId:
        typeof source.formula?.formulaId === 'string'
          ? canonicalizeCloudCustomFormulaRuntimeId(source.formula.formulaId)
          : DEFAULT_FRACTAL_DOCUMENT.formula.formulaId,
      isJulia:
        typeof source.formula?.isJulia === 'boolean'
          ? source.formula.isJulia
          : DEFAULT_FRACTAL_DOCUMENT.formula.isJulia,
      juliaC: [
        normalizeNumber(source.formula?.juliaC?.[0], DEFAULT_DOCUMENT_JULIA_C[0]),
        normalizeNumber(source.formula?.juliaC?.[1], DEFAULT_DOCUMENT_JULIA_C[1]),
      ],
      power: normalizeNumber(source.formula?.power, DEFAULT_FRACTAL_DOCUMENT.formula.power),
      params: source.formula?.params
        ? {
            formula: normalizePluginParamRecord(source.formula.params.formula),
          }
        : undefined,
    },
    coloring: {
      pipelineVersion: source.coloring?.pipelineVersion === 2 ? 2 : 1,
      paletteIndex: normalizeNumber(source.coloring?.paletteIndex, DEFAULT_FRACTAL_DOCUMENT.coloring.paletteIndex),
      customGradient:
        Array.isArray(source.coloring?.customGradient) ? [...source.coloring.customGradient] : DEFAULT_FRACTAL_DOCUMENT.coloring.customGradient,
      outsideColoringId:
        typeof source.coloring?.outsideColoringId === 'string'
          ? source.coloring.outsideColoringId
          : DEFAULT_FRACTAL_DOCUMENT.coloring.outsideColoringId,
      insideColoringId:
        typeof source.coloring?.insideColoringId === 'string'
          ? source.coloring.insideColoringId
          : DEFAULT_FRACTAL_DOCUMENT.coloring.insideColoringId,
      orbitTrap: {
        shape:
          source.coloring?.orbitTrap?.shape === 'cross' || source.coloring?.orbitTrap?.shape === 'circle'
            ? source.coloring.orbitTrap.shape
            : DEFAULT_DOCUMENT_ORBIT_TRAP.shape,
        point: [
          normalizeNumber(source.coloring?.orbitTrap?.point?.[0], DEFAULT_DOCUMENT_ORBIT_TRAP.point[0]),
          normalizeNumber(source.coloring?.orbitTrap?.point?.[1], DEFAULT_DOCUMENT_ORBIT_TRAP.point[1]),
        ],
        radius: Math.max(0, normalizeNumber(source.coloring?.orbitTrap?.radius, DEFAULT_DOCUMENT_ORBIT_TRAP.radius)),
        width: Math.max(0, normalizeNumber(source.coloring?.orbitTrap?.width, DEFAULT_DOCUMENT_ORBIT_TRAP.width)),
      },
      lighting: {
        enabled:
          typeof source.coloring?.lighting?.enabled === 'boolean'
            ? source.coloring.lighting.enabled
            : DEFAULT_DOCUMENT_LIGHTING.enabled,
        mode: source.coloring?.lighting?.mode === 'dem' ? 'dem' : 'normalMap',
        azimuth: normalizeNumber(source.coloring?.lighting?.azimuth, DEFAULT_DOCUMENT_LIGHTING.azimuth),
        elevation: normalizeNumber(source.coloring?.lighting?.elevation, DEFAULT_DOCUMENT_LIGHTING.elevation),
        intensity: normalizeNumber(source.coloring?.lighting?.intensity, DEFAULT_DOCUMENT_LIGHTING.intensity),
      },
      style: normalizeColoringStyle(source.coloring?.style),
      params: source.coloring?.params
        ? {
            outside: normalizePluginParamRecord(source.coloring.params.outside),
            inside: normalizePluginParamRecord(source.coloring.params.inside),
            coloringScript: normalizePluginParamRecord(source.coloring.params.coloringScript),
          }
        : undefined,
    },
    transform: {
      transformId:
        typeof source.transform?.transformId === 'string'
          ? source.transform.transformId
          : DEFAULT_FRACTAL_DOCUMENT.transform.transformId,
      params: source.transform?.params
        ? {
            transform: normalizePluginParamRecord(source.transform.params.transform),
          }
        : undefined,
    },
    render: {
      maxIterations: Math.max(1, Math.round(normalizeNumber(source.render?.maxIterations, DEFAULT_FRACTAL_DOCUMENT.render.maxIterations))),
      useSSAA:
        typeof source.render?.useSSAA === 'boolean'
          ? source.render.useSSAA
          : DEFAULT_FRACTAL_DOCUMENT.render.useSSAA,
      adaptiveIterations:
        typeof source.render?.adaptiveIterations === 'boolean'
          ? source.render.adaptiveIterations
          : DEFAULT_FRACTAL_DOCUMENT.render.adaptiveIterations,
    },
    animation:
      viewKeyframes || animation?.tracks
        ? {
            viewKeyframes: viewKeyframes ? [...viewKeyframes] as Keyframe[] : undefined,
            tracks: normalizeAnimationTracks(animation?.tracks),
          }
        : undefined,
    assets: legacyAssets
      ? {
          formula:
            normalizeAssetReference(legacyAssets.formula) ??
            (typeof legacyAssets.formulaScriptId === 'string' ? { id: legacyAssets.formulaScriptId } : undefined),
          colorScript:
            normalizeAssetReference(legacyAssets.colorScript) ??
            (typeof legacyAssets.colorScriptId === 'string' ? { id: legacyAssets.colorScriptId } : undefined),
          animationScript:
            normalizeAssetReference(legacyAssets.animationScript) ??
            (typeof legacyAssets.animationScriptId === 'string' ? { id: legacyAssets.animationScriptId } : undefined),
        }
      : undefined,
    metadata: source.metadata ? { ...source.metadata } : undefined,
  };
}

export function migrateFractalDocument(input: unknown, fromVersion = 0): FractalDocument {
  if (hasFractalDocumentShape(input)) {
    const inputVersion = Math.trunc(input.schemaVersion);

    if (inputVersion === FRACTAL_DOCUMENT_SCHEMA_VERSION) {
      return normalizeFractalDocument(input as DeepPartial<FractalDocument>);
    }

    if (inputVersion === 0 || inputVersion === 1) {
      return migrateDocumentToV2(input as DeepPartial<FractalDocument>);
    }

    throw new Error(
      `Unsupported FractalDocument schemaVersion: ${input.schemaVersion}. ` +
        `Current supported version is ${FRACTAL_DOCUMENT_SCHEMA_VERSION}.`
    );
  }

  if (isLegacySavedFractal(input)) {
    return normalizeFractalDocument(
      runtimeParamsToDocument(input.params, {
        animation: input.animation,
        metadata: {
          name: input.name,
          createdAt: input.createdAt,
          source: 'saved',
        },
      })
    );
  }

  if (isRuntimeParams(input)) {
    if (fromVersion > FRACTAL_DOCUMENT_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported FractalDocument migration target from version ${fromVersion}. ` +
          `Current supported version is ${FRACTAL_DOCUMENT_SCHEMA_VERSION}.`
      );
    }

    return migrateDocumentToV2(runtimeParamsToDocument(input));
  }

  if (looksLikeUrlState(input)) {
    return migrateDocumentToV2(
      urlStateToDocument(input, {
        metadata: { source: 'shared' },
      })
    );
  }

  if (fromVersion > FRACTAL_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported FractalDocument migration target from version ${fromVersion}. ` +
        `Current supported version is ${FRACTAL_DOCUMENT_SCHEMA_VERSION}.`
    );
  }

  return migrateDocumentToV2(DEFAULT_FRACTAL_DOCUMENT);
}
