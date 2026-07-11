import type { FractalUrlState } from '@/lib/url-params';
import type { PluginParamRecord, PluginParamValue, SavedFractal, FractalParams } from './types';
import {
  DEFAULT_DOCUMENT_BOUNDS,
  DEFAULT_DOCUMENT_JULIA_C,
  DEFAULT_DOCUMENT_LIGHTING,
  DEFAULT_DOCUMENT_ORBIT_TRAP,
  DEFAULT_FRACTAL_DOCUMENT,
  FRACTAL_DOCUMENT_SCHEMA_VERSION,
  type FractalDocument,
} from './document';
import { documentToRuntimeParams, runtimeParamsToDocument, urlStateToDocument } from './document-adapter';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFractalDocument(value: unknown): value is FractalDocument {
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
      'formula' in value ||
      'iterations' in value ||
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

export function normalizeRuntimeFractalParams(input: unknown): FractalParams {
  const defaults = documentToRuntimeParams(DEFAULT_FRACTAL_DOCUMENT);
  const source = isObject(input) ? input : {};
  const bounds = isObject(source.bounds) ? source.bounds : {};
  const orbitTrap = isObject(source.orbitTrap) ? source.orbitTrap : {};
  const lighting = isObject(source.lighting) ? source.lighting : {};
  const pluginParams = normalizePluginParamRecord(source.pluginParams) ?? defaults.pluginParams;

  return documentToRuntimeParams(
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

function migrateDocumentV0ToV1(doc: DeepPartial<FractalDocument>): FractalDocument {
  return normalizeFractalDocument(doc);
}

export function normalizeFractalDocument(doc: DeepPartial<FractalDocument>): FractalDocument {
  const source = isObject(doc) ? doc : {};

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
          ? source.formula.formulaId
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
      source.animation && Array.isArray(source.animation.keyframes)
        ? { keyframes: [...source.animation.keyframes] }
        : undefined,
    assets: source.assets ? { ...source.assets } : undefined,
    metadata: source.metadata ? { ...source.metadata } : undefined,
  };
}

export function migrateFractalDocument(input: unknown, fromVersion = 0): FractalDocument {
  if (isFractalDocument(input)) {
    const inputVersion = Math.trunc(input.schemaVersion);

    if (inputVersion === FRACTAL_DOCUMENT_SCHEMA_VERSION) {
      return normalizeFractalDocument(input);
    }

    if (inputVersion === 0) {
      return migrateDocumentV0ToV1(input);
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

    return migrateDocumentV0ToV1(runtimeParamsToDocument(input));
  }

  if (looksLikeUrlState(input)) {
    return migrateDocumentV0ToV1(
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

  return migrateDocumentV0ToV1(DEFAULT_FRACTAL_DOCUMENT);
}
