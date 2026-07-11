export interface ViewBounds {
  centerX: number;
  centerY: number;
  zoom: number;
  rotation?: number;
}

export interface GradientStop {
  position: number; // 0-1
  color: string; // hex color e.g. "#ff0000"
}

export type BuiltinFormula = 'mandelbrot' | 'burningShip' | 'tricorn' | 'phoenix';
export type BuiltinOutsideColoring = 'smooth' | 'orbitTrap' | 'stripe' | 'binary' | 'tia';
export type BuiltinInsideColoring = 'black' | 'finalOrbit' | 'atomDomain';

export type FractalFormula = string;
export type OutsideColoringMode = string;
export type InsideColoringMode = string;

export type OrbitTrapShape = 'point' | 'cross' | 'circle';

export interface OrbitTrapConfig {
  shape: OrbitTrapShape;
  point: [number, number];
  radius: number;
  width: number;
}

export interface LightingConfig {
  enabled: boolean;
  mode: 'normalMap' | 'dem';
  azimuth: number;
  elevation: number;
  intensity: number;
}

export type ToneMappingMode = 'none' | 'soft' | 'filmic';

export interface PostProcessState {
  toneMapping: ToneMappingMode;
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  vignette: number;
  dither: boolean;
}

export interface ShaderStyleState {
  styleId: 'modernSmooth' | 'layeredOrbit' | 'orbitNebula';
  post: PostProcessState;
}

export type PluginParamVector2 = [number, number];
export type PluginParamVector3 = [number, number, number];
export type PluginParamValue = number | boolean | PluginParamVector2 | PluginParamVector3;
export type PluginParamRecord = Record<string, PluginParamValue>;

export interface FractalParams {
  maxIterations: number;
  paletteIndex: number;
  bounds: ViewBounds;
  isJulia: boolean;
  juliaC: [number, number];
  power: number;
  customGradient: GradientStop[] | null;
  formula: string;
  outsideColoring: string;
  insideColoring: string;
  transformId?: string;
  pluginParams?: PluginParamRecord;
  orbitTrap: OrbitTrapConfig;
  useSSAA: boolean;
  ssaaLevel?: number; // 0=off, 4=2x2, 9=3x3, 16=4x4; overrides useSSAA when set
  adaptiveIterations: boolean;
  lighting: LightingConfig;
  /** Present only when the document explicitly opts into the modern color path. */
  coloringPipelineVersion?: 2;
  modernColoring?: ShaderStyleState;
  /** Internal: tiled export info. u_resolution = full image; u_tileOffset = pixel offset. */
  _tileInfo?: { fullWidth: number; fullHeight: number; offsetX: number; offsetY: number };
}

export interface ColorPalette {
  index: number;
  name: string;
  key: string;
}

export interface WebGLResources {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

export interface SavedFractal {
  id: string;
  name: string;
  params: FractalParams;
  createdAt: number;
  thumbnail: string;
  starred: boolean;
  animation?: KeyframeAnimation;  // NEW: optional keyframe animation
}

export interface Keyframe {
  id: string;              // Unique ID for React key stability
  bounds: ViewBounds;      // Only view bounds (position, zoom, rotation)
}

export interface KeyframeAnimation {
  keyframes: Keyframe[];  // 2-5 keyframes (validated at runtime)
}
