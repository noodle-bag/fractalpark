export type PluginCategory = 'formula' | 'outsideColoring' | 'insideColoring' | 'transform';

export interface PluginUniformDescriptor {
  name: string;           // e.g. "u_phoenixP"
  type: 'float' | 'int' | 'vec2' | 'vec3' | 'bool';
  default: number | number[] | boolean;
  label?: string;         // i18n key for UI slider label
  min?: number;
  max?: number;
  step?: number;
  group?: string;         // optional grouping hint for UI (e.g., 'center' for 2D pickers)
}

export interface FractalPlugin {
  id: string;
  category: PluginCategory;
  name: string;           // i18n key
  author?: string;
  description?: string;   // i18n key
  glsl: string;           // GLSL function body fragment
  uniforms: PluginUniformDescriptor[];
  source: 'builtin' | 'frm' | 'custom';
}

export interface FormulaPlugin extends FractalPlugin {
  category: 'formula';
  bailout?: number;         // default 4.0
  supportsPower?: boolean;  // whether u_power is used in iteration
  supportsJulia?: boolean;  // default true
  family?: string;          // grouping: 'classic' | 'newton' | 'magnet' | 'phoenix' | 'exotic'
  escapeType?: 'diverge' | 'converge';  // NEW: for Newton-type formulas
  initGlsl?: string;        // GLSL for initFormula(z, c, point) — runs once before iteration loop
}

export interface OutsideColoringPlugin extends FractalPlugin {
  category: 'outsideColoring';
  needsOrbitStats: string[]; // e.g. ['trapMin'] → triggers #define NEED_ORBIT_TRAP
}

export interface InsideColoringPlugin extends FractalPlugin {
  category: 'insideColoring';
  needsOrbitStats: string[];
}

export interface TransformPlugin extends FractalPlugin {
  category: 'transform';
}

export type ShaderCacheKey = string; // "formulaId|outsideId|insideId|transformId"

export interface PluginCombination {
  formulaId: string;
  outsideColoringId: string;
  insideColoringId: string;
  transformId: string;
}
