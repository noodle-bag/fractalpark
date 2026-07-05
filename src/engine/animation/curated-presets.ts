/**
 * Curated presets for homepage slideshow
 * 6 built-in presets with params + keyframes
 */

import type { FractalParams, KeyframeAnimation, SavedFractal } from '../types';

interface CuratedPreset {
  id: string;
  name: string;
  params: FractalParams;
  animation: KeyframeAnimation;
}

// Default bounds and configs
const defaultParams: Omit<FractalParams, 'bounds' | 'formula'> = {
  maxIterations: 300,
  paletteIndex: 0,
  isJulia: false,
  juliaC: [-0.7, 0.27],
  power: 2,
  customGradient: null,
  outsideColoring: 'smooth',
  insideColoring: 'black',
  orbitTrap: {
    shape: 'point',
    point: [0, 0],
    radius: 0.35,
    width: 0.02,
  },
  useSSAA: false,
  adaptiveIterations: true,
  lighting: {
    enabled: false,
    mode: 'normalMap' as const,
    azimuth: 45,
    elevation: 35,
    intensity: 0.65,
  },
  transformId: 'none',
  pluginParams: {},
};

export const CURATED_PRESETS: CuratedPreset[] = [
  // 1. Mandelbrot Seahorse Valley
  {
    id: 'preset-mandelbrot-seahorse',
    name: 'Seahorse Valley',
    params: {
      ...defaultParams,
      formula: 'mandelbrot',
      bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-msh-1', bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'p-msh-2', bounds: { centerX: -0.745, centerY: 0.105, zoom: 150, rotation: 0 } },
      ],
    },
  },

  // 2. Julia Spiral (c = -0.7 + 0.27i)
  {
    id: 'preset-julia-spiral',
    name: 'Julia Spiral',
    params: {
      ...defaultParams,
      formula: 'mandelbrot',
      isJulia: true,
      juliaC: [-0.7, 0.27],
      bounds: { centerX: 0, centerY: 0, zoom: 0.4, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-jsp-1', bounds: { centerX: 0, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'p-jsp-2', bounds: { centerX: 0.1, centerY: 0.2, zoom: 80, rotation: Math.PI / 4 } },
      ],
    },
  },

  // 3. Burning Ship
  {
    id: 'preset-burning-ship',
    name: 'Burning Ship',
    params: {
      ...defaultParams,
      formula: 'burningShip',
      bounds: { centerX: -0.5, centerY: -0.5, zoom: 0.4, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-bsh-1', bounds: { centerX: -0.5, centerY: -0.5, zoom: 0.4, rotation: 0 } },
        { id: 'p-bsh-2', bounds: { centerX: -1.75, centerY: -0.03, zoom: 120, rotation: 0 } },
      ],
    },
  },

  // 4. Newton z³-1
  {
    id: 'preset-newton-z3',
    name: 'Newton Fractal',
    params: {
      ...defaultParams,
      formula: 'newton3',
      bounds: { centerX: 0, centerY: 0, zoom: 0.8, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-nz3-1', bounds: { centerX: 0, centerY: 0, zoom: 0.8, rotation: 0 } },
        { id: 'p-nz3-2', bounds: { centerX: 0.3, centerY: 0.2, zoom: 50, rotation: Math.PI / 6 } },
      ],
    },
  },

  // 5. Tricorn
  {
    id: 'preset-tricorn',
    name: 'Tricorn',
    params: {
      ...defaultParams,
      formula: 'tricorn',
      bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-tri-1', bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'p-tri-2', bounds: { centerX: -0.75, centerY: 0.1, zoom: 100, rotation: Math.PI / 3 } },
      ],
    },
  },

  // 6. Phoenix
  {
    id: 'preset-phoenix',
    name: 'Phoenix',
    params: {
      ...defaultParams,
      formula: 'phoenix',
      bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
    },
    animation: {
      keyframes: [
        { id: 'p-phx-1', bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 } },
        { id: 'p-phx-2', bounds: { centerX: -0.25, centerY: 0.05, zoom: 60, rotation: 0 } },
      ],
    },
  },
];

/**
 * Convert curated preset to SavedFractal format for useAnimatedFractals hook
 */
export function presetToSavedFractal(preset: CuratedPreset): SavedFractal {
  return {
    id: preset.id,
    name: preset.name,
    params: preset.params,
    createdAt: 0,
    thumbnail: '',
    starred: false,
    animation: preset.animation,
  };
}

/**
 * Generate drift keyframes for fractals without animation
 * Creates a slow drift effect based on zoom level
 */
export function generateDriftKeyframes(params: FractalParams): KeyframeAnimation {
  const { centerX, centerY, zoom } = params.bounds;

  // Drift amount inversely proportional to zoom
  // Deeper zoom = smaller drift to stay in interesting region
  const drift = 0.01 / Math.sqrt(Math.max(zoom, 0.1));

  return {
    keyframes: [
      { id: 'drift-1', bounds: { centerX, centerY, zoom, rotation: 0 } },
      {
        id: 'drift-2',
        bounds: {
          centerX: centerX + drift,
          centerY: centerY + drift * 0.5,
          zoom: zoom * 1.5,
          rotation: 0,
        },
      },
    ],
  };
}
