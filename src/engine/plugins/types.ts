export type PluginCategory = 'formula' | 'outsideColoring' | 'insideColoring' | 'transform';

/**
 * Strict-v2 smooth-coloring capability, resolved from AST/dataflow plus the
 * bailout descriptor at compile time (docs/specs/frm-compatibility-v1.md §7).
 * Never guessed from family, name, `supportsPower`, or a default u_power=2.
 */
export type SmoothCapability = 'supported' | 'adapted' | 'unavailable';

/** Runtime vocabulary of the SmoothCapability union. The bidirectional
 * type assertion below fails the build if the union ever grows without
 * updating this list (Slice 7a review). */
export const SMOOTH_CAPABILITIES = ['supported', 'adapted', 'unavailable'] as const;
type AssertExactMembers<T extends readonly string[], U extends string> =
  [T[number]] extends [U] ? ([U] extends [T[number]] ? true : never) : never;
const _smoothCapabilitiesExhaustive: AssertExactMembers<
  typeof SMOOTH_CAPABILITIES,
  SmoothCapability
> = true;
void _smoothCapabilitiesExhaustive;

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
  /** Immutable source fingerprint appended to the shader cache key. */
  cacheFingerprint?: string;
  /**
   * Optional stateful orbit lifecycle. The shared framework stays byte-identical
   * for every plugin that omits this descriptor; the assembler injects the
   * reset and arbitrary-continue hooks only for the candidate-C v1 adapter.
   */
  orbitLifecycle?: Readonly<{
    kind: 'frm-like-v1';
    resetFunction: 'frmV1ResetState';
    continueFunction: 'frmV1ShouldContinue';
    eventFunction: 'frmV1HasEvent';
  }>;
  /** Explicit compile-semantics contract for FRM/custom plugins. Built-ins
   * omit it and continue to follow the document renderer pipeline. */
  frmSemanticsVersion?: import('../frm/semantics-version').FrmSemanticsVersion;
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
  /**
   * Classic header `function=` bracket defaults (fn1..fn4), recorded during
   * lowering of strict-v2 classic compiles. Classic semantics prompt for fn
   * choices at run time; the bracket pre-specifies them. Values are engine
   * fn-option keys where mapped, raw classic names otherwise.
   */
  fnDefaults?: Record<string, string>;
  supportsPower?: boolean;  // DEPRECATED: not consumed by any current consumer; Smooth capability resolves from AST/dataflow per ADR-0007. Retired in the coloring-capability slice.
  supportsJulia?: boolean;  // default false; only a current capability census row may enable editing
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
  /**
   * Rendering pipeline version (spec §7): when 2, strict-v2 formula
   * capabilities (bailout descriptor, after-step timing, smooth capability)
   * drive shader assembly; anything else renders the legacy frozen path —
   * even for formulas compiled strict-v2.
   */
  pipelineVersion?: 1 | 2;
}
