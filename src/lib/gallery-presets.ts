/**
 * Gallery builtin presets system
 * Load and parse preset configurations from JSON
 */

import type { FractalDocument } from '@/engine/document';
import {
  documentToRuntimeParams,
  runtimeParamsToDocument,
} from '@/engine/document-adapter';
import {
  normalizeFractalDocument,
  normalizeRuntimeFractalParams,
} from '@/engine/document-migrate';
import type { FractalParams, ViewBounds, Keyframe } from '@/engine/types';
import { decodeParams, documentToExploreHref } from './url-params';

export interface GalleryPresetConfig {
  id: string;
  name: string;
  nameZh?: string;
  url: string;
  thumbnail?: string;
  featured?: boolean;
}

export interface GalleryPresetsFile {
  version: number;
  presets: GalleryPresetConfig[];
}

export interface GalleryPreset {
  id: string;
  name: string;
  nameZh?: string;
  params: FractalParams;
  keyframes?: Keyframe[];   // explicit animation from URL kf= param
  thumbnail?: string;
  isBuiltin: true;
  featured: boolean;
}

let presetsCache: GalleryPreset[] | null = null;

function isPresetConfig(value: unknown): value is GalleryPresetConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as GalleryPresetConfig).id === 'string' &&
    typeof (value as GalleryPresetConfig).name === 'string' &&
    typeof (value as GalleryPresetConfig).url === 'string'
  );
}

export function parseGalleryPresetsFile(data: unknown): GalleryPresetsFile {
  if (typeof data !== 'object' || data === null) {
    throw new Error('gallery-presets.json must be an object');
  }

  const version = (data as GalleryPresetsFile).version;
  const presets = (data as GalleryPresetsFile).presets;

  if (typeof version !== 'number') {
    throw new Error('gallery-presets.json must include a numeric version');
  }

  if (!Array.isArray(presets) || !presets.every(isPresetConfig)) {
    throw new Error('gallery-presets.json must include a valid presets array');
  }

  return {
    version,
    presets,
  };
}

export function findBuiltinPresetConfigById(
  presetsFile: GalleryPresetsFile,
  presetId: string
): GalleryPresetConfig | undefined {
  return presetsFile.presets.find(preset => preset.id === presetId);
}

export function builtinPresetToGalleryHref(presetId: string, locale?: string): string {
  const encodedPresetId = encodeURIComponent(presetId);

  return locale
    ? `/${locale}/gallery/${encodedPresetId}`
    : `/gallery/${encodedPresetId}`;
}

export function builtinPresetConfigToExploreHref(
  config: GalleryPresetConfig,
  locale: string
): string {
  return documentToExploreHref(buildCanonicalPresetDocument(config), locale);
}

interface ParsedPresetQuery {
  params: FractalParams;
  keyframes?: Keyframe[];
}

/**
 * Load presets from JSON file
 * Caches result for subsequent calls
 */
export async function loadBuiltinPresets(locale: string): Promise<GalleryPreset[]> {
  if (presetsCache) {
    return applyLocale(presetsCache, locale);
  }

  try {
    const response = await fetch('/gallery-presets.json');
    if (!response.ok) {
      throw new Error(`Failed to load presets: ${response.status}`);
    }

    const data = parseGalleryPresetsFile(await response.json());
    presetsCache = data.presets.map(parsePresetConfig);

    return applyLocale(presetsCache, locale);
  } catch (error) {
    console.error('Failed to load gallery presets:', error);
    return [];
  }
}

/**
 * Parse preset config into GalleryPreset
 */
export function buildFractalParamsFromPresetQuery(query: string): ParsedPresetQuery {
  // URL may or may not start with ?
  const urlString = query.startsWith('?') ? query : `?${query}`;

  // Create a URLSearchParams from the query string
  const searchParams = new URLSearchParams(urlString);

  // Use existing decodeParams to parse
  const decoded = decodeParams(searchParams);

  // Construct full FractalParams with defaults and decoded values
  const params: FractalParams = {
    // Override with decoded values, with defaults
    maxIterations: decoded.iterations || 300,
    paletteIndex: decoded.palette ?? 0,
    formula: decoded.formula || 'mandelbrot',
    isJulia: decoded.julia || false,
    juliaC: decoded.juliaRe !== undefined && decoded.juliaIm !== undefined
      ? [decoded.juliaRe, decoded.juliaIm]
      : [-0.7, 0.27],
    power: decoded.power || 2,
    customGradient: decoded.gradient ?? null,
    outsideColoring: decoded.outsideColoring || 'smooth',
    insideColoring: decoded.insideColoring || 'black',
    orbitTrap: decoded.orbitTrap ?? {
      shape: 'point',
      point: [0, 0],
      radius: 0.35,
      width: 0.02,
    },
    useSSAA: decoded.useSSAA || false,
    adaptiveIterations: decoded.adaptiveIterations !== false,
    lighting: decoded.lighting ?? {
      enabled: false,
      mode: 'normalMap' as const,
      azimuth: 45,
      elevation: 35,
      intensity: 0.65,
    },
    transformId: decoded.transformId || 'none',
    pluginParams: decoded.pluginParams || {},

    // Ensure bounds is always present
    bounds: decoded.centerX !== undefined && decoded.centerY !== undefined
      ? {
          centerX: decoded.centerX,
          centerY: decoded.centerY,
          zoom: decoded.zoom ?? 1.5,
          rotation: decoded.rotation ?? 0,
        }
      : {
          centerX: -0.5,
          centerY: 0,
          zoom: 1.5,
          rotation: 0,
        },
  };

  return {
    params: normalizeRuntimeFractalParams(params),
    keyframes: decoded.keyframes,
  };
}

export function buildCanonicalPresetDocument(
  config: GalleryPresetConfig
): FractalDocument {
  const { params, keyframes } = buildFractalParamsFromPresetQuery(config.url);

  return normalizeFractalDocument(
    runtimeParamsToDocument(
      params,
      keyframes ? { animation: { keyframes } } : undefined
    )
  );
}

export function buildPresetPlaybackKeyframes(
  document: FractalDocument,
  presetId: string
): Keyframe[] {
  const explicitKeyframes = document.animation?.viewKeyframes;
  if (explicitKeyframes && explicitKeyframes.length >= 2) {
    return explicitKeyframes;
  }

  return generateDriftKeyframes(
    documentToRuntimeParams(document),
    presetId
  ).keyframes;
}

function parsePresetConfig(config: GalleryPresetConfig): GalleryPreset {
  const document = buildCanonicalPresetDocument(config);

  return {
    id: config.id,
    name: config.name,
    nameZh: config.nameZh,
    params: documentToRuntimeParams(document),
    keyframes: document.animation?.viewKeyframes,
    thumbnail: config.thumbnail,
    isBuiltin: true,
    featured: config.featured ?? false,
  };
}

/**
 * Convert one validated preset config into a localized runtime preset.
 * Useful for server-rendered surfaces that need a real preset on the first frame.
 */
export function galleryPresetConfigToPreset(
  config: GalleryPresetConfig,
  locale: string
): GalleryPreset {
  return applyLocale([parsePresetConfig(config)], locale)[0];
}

/**
 * Apply locale to preset names
 */
function applyLocale(presets: GalleryPreset[], locale: string): GalleryPreset[] {
  return presets.map(preset => ({
    ...preset,
    // Use Chinese name if locale is zh and nameZh exists
    name: locale === 'zh' && preset.nameZh ? preset.nameZh : preset.name,
  }));
}

/**
 * Clear presets cache (useful for testing)
 */
export function clearPresetsCache(): void {
  presetsCache = null;
}

/**
 * Convert GalleryPreset to SavedFractal format for compatibility
 * Note: thumbnail is empty string since we render it dynamically
 */
export function presetToSavedFractal(preset: GalleryPreset): {
  id: string;
  name: string;
  params: FractalParams;
  createdAt: number;
  thumbnail: string;
  starred: boolean;
  animation?: { keyframes: Array<{ id: string; bounds: ViewBounds }> };
  isBuiltin: true;
} {
  const document = runtimeParamsToDocument(
    preset.params,
    preset.keyframes ? { animation: { keyframes: preset.keyframes } } : undefined
  );

  return {
    id: preset.id,
    name: preset.name,
    params: preset.params,
    createdAt: 0, // Builtin presets have no creation time
    thumbnail: preset.thumbnail || '', // Static JPEG from public/thumbnails/
    starred: false, // User can star them
    isBuiltin: true,
    // Use explicit keyframes from URL if present, otherwise generate drift
    animation: {
      keyframes: buildPresetPlaybackKeyframes(document, preset.id),
    },
  };
}

/**
 * Generate drift keyframes for fractals without explicit animation
 * Creates a slow drift effect based on zoom level
 */
function generateDriftKeyframes(
  params: FractalParams,
  id: string
): { keyframes: Array<{ id: string; bounds: ViewBounds }> } {
  const { centerX, centerY, zoom, rotation } = params.bounds;

  // Drift amount inversely proportional to zoom
  const drift = 0.01 / Math.sqrt(Math.max(zoom, 0.1));

  return {
    keyframes: [
      { id: `${id}-drift-1`, bounds: { centerX, centerY, zoom, rotation: rotation || 0 } },
      {
        id: `${id}-drift-2`,
        bounds: {
          centerX: centerX + drift,
          centerY: centerY + drift * 0.5,
          zoom: zoom * 1.5,
          rotation: rotation || 0,
        },
      },
    ],
  };
}
