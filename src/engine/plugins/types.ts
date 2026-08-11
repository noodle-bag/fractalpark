export type PluginCategory = 'formula' | 'outsideColoring' | 'insideColoring' | 'transform';

/**
 * Strict-v2 smooth-coloring capability, resolved from AST/dataflow plus the
 * bailout descriptor at compile time (docs/specs/frm-compatibility-v1.md §7).
 * Never guessed from family, name, `supportsPower`, or a default u_power=2.
 */
export type SmoothCapability = 'supported' | 'adapted' | 'unavailable';

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
  /**
   * Strict-v2 bounded bailout descriptor (spec §4). Present only on FRM
   * formulas compiled under semanticsVersion 2; renderer-pipeline v2
   * (shader assembler) consumes this instead of the legacy numeric
   * `bailout` field. Legacy/v1 formulas never carry it.
   */
  bailoutDescriptor?: import('../frm/bailout-descriptor').BailoutDescriptor;
  /**
   * Strict-v2 classic bailout timing (spec §4): classic Fractint dialect
   * evaluates the bailout predicate AFTER each loop step, while the native
   * dialect evaluates BEFORE. Set only for fractint-compat formulas
   * compiled under semanticsVersion 2; the shader assembler turns it into
   * the ESCAPE_AFTER_STEP branch. Legacy/v1 rendering is unchanged.
   */
  afterStepTiming?: boolean;
  /**
   * Strict-v2 C2 parameterized radial: the threshold expression serialized
   * to GLSL through the compiler's own expression pipeline (parameters map
   * to u_p1…u_p5 uniforms, so edits take effect without recompilation).
   * Present only when the plugin carries a C2 bailoutDescriptor.
   */
  c2ThresholdGlsl?: string;
  /**
   * Strict-v2 smooth-coloring capability, resolved from AST/dataflow plus
   * the bailout descriptor at compile time (spec §7). Absent for v1/legacy
   * plugins — v1 smooth behavior is frozen.
   */
  smoothCapability?: SmoothCapability;
  /**
   * Leading polynomial degree extracted from the loop dataflow; present only
   * when smoothCapability === 'supported'. Feeds u_power in place of the
   * document-level power parameter, so the smooth formula uses the degree
   * the formula actually iterates.
   */
  smoothPower?: number;
  supportsPower?: boolean;  // DEPRECATED: not consumed by any current consumer; Smooth capability resolves from AST/dataflow per ADR-0007. Retired in the coloring-capability slice.
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
