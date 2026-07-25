import type {
  GradientStop,
  Keyframe,
  LightingConfig,
  OrbitTrapConfig,
  PluginParamRecord,
  PluginParamValue,
  ViewBounds,
} from './types';

export const FRACTAL_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type ColoringPipelineVersion = 1 | 2;

export interface FormulaParamsState {
  formula?: PluginParamRecord;
}

export interface ColoringParamsState {
  outside?: PluginParamRecord;
  inside?: PluginParamRecord;
  coloringScript?: PluginParamRecord;
}

export interface TransformParamsState {
  transform?: PluginParamRecord;
}

export interface SceneState {
  bounds: ViewBounds;
}

export interface FormulaState {
  formulaId: string;
  isJulia: boolean;
  juliaC: [number, number];
  power: number;
  params?: FormulaParamsState;
}

export interface ColoringStyleDetailState {
  scale?: number;
  amount?: number;
  softness?: number;
}

export type ToneMappingMode = 'none' | 'soft' | 'filmic';
export type RgbCurve = [number, number, number, number, number];

export interface ColorPostState {
  toneMapping?: ToneMappingMode;
  exposure?: number;
  contrast?: number;
  brightness?: number;
  gamma?: number;
  saturation?: number;
  vibrance?: number;
  hue?: number;
  temperature?: number;
  tint?: number;
  vignette?: number;
  dither?: boolean;
  invert?: boolean;
  curves?: {
    red?: RgbCurve;
    green?: RgbCurve;
    blue?: RgbCurve;
  };
}

export interface ColoringStyleState {
  styleId: string;
  detail?: ColoringStyleDetailState;
  post?: ColorPostState;
}

export interface ColoringState {
  pipelineVersion: ColoringPipelineVersion;
  paletteIndex: number;
  customGradient: GradientStop[] | null;
  outsideColoringId: string;
  insideColoringId: string;
  orbitTrap: OrbitTrapConfig;
  lighting: LightingConfig;
  style?: ColoringStyleState;
  params?: ColoringParamsState;
}

export interface TransformState {
  transformId: string;
  params?: TransformParamsState;
}

export interface RenderState {
  maxIterations: number;
  useSSAA: boolean;
  adaptiveIterations: boolean;
}

export interface AnimationState {
  viewKeyframes?: Keyframe[];
  tracks?: AnimationTrack[];
}

export interface AnimationTrackKeyframe {
  time: number;
  value: PluginParamValue;
}

export interface AnimationTrack {
  id: string;
  targetId: string;
  keyframes: AnimationTrackKeyframe[];
}

export interface AssetReference {
  id: string;
  hash?: string;
}

export interface AssetState {
  formula?: AssetReference;
  colorScript?: AssetReference;
  animationScript?: AssetReference;
}

export interface FractalDocumentMetadata {
  name?: string;
  createdAt?: number;
  updatedAt?: number;
  source?: 'builtin' | 'saved' | 'imported' | 'remix' | 'shared';
  sourceId?: string;
}

export interface FractalDocumentV2 {
  schemaVersion: typeof FRACTAL_DOCUMENT_SCHEMA_VERSION;
  scene: SceneState;
  formula: FormulaState;
  coloring: ColoringState;
  transform: TransformState;
  render: RenderState;
  animation?: AnimationState;
  assets?: AssetState;
  metadata?: FractalDocumentMetadata;
}

export type FractalDocument = FractalDocumentV2;

export const DEFAULT_DOCUMENT_BOUNDS: ViewBounds = {
  centerX: -0.5,
  centerY: 0,
  zoom: 0.4,
  rotation: 0,
};

export const DEFAULT_DOCUMENT_JULIA_C: [number, number] = [-0.7, 0.27];

export const DEFAULT_DOCUMENT_ORBIT_TRAP: OrbitTrapConfig = {
  shape: 'point',
  point: [0, 0],
  radius: 0.35,
  width: 0.02,
};

export const DEFAULT_DOCUMENT_LIGHTING: LightingConfig = {
  enabled: false,
  mode: 'normalMap',
  azimuth: 45,
  elevation: 35,
  intensity: 0.65,
};

export const DEFAULT_FRACTAL_DOCUMENT: FractalDocument = {
  schemaVersion: FRACTAL_DOCUMENT_SCHEMA_VERSION,
  scene: {
    bounds: DEFAULT_DOCUMENT_BOUNDS,
  },
  formula: {
    formulaId: 'mandelbrot',
    isJulia: false,
    juliaC: DEFAULT_DOCUMENT_JULIA_C,
    power: 2,
  },
  coloring: {
    pipelineVersion: 1,
    paletteIndex: 0,
    customGradient: null,
    outsideColoringId: 'smooth',
    insideColoringId: 'black',
    orbitTrap: DEFAULT_DOCUMENT_ORBIT_TRAP,
    lighting: DEFAULT_DOCUMENT_LIGHTING,
  },
  transform: {
    transformId: 'none',
  },
  render: {
    maxIterations: 200,
    useSSAA: false,
    adaptiveIterations: false,
  },
};
