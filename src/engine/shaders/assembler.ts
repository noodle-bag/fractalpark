import type { FormulaPlugin, PluginCombination, ShaderCacheKey } from '../plugins/types';
import { pluginRegistry } from '../plugins/registry';
import frameworkTemplate from './framework.frag.glsl';
import complexMathLib from './complex-math.glsl';
import paletteLib from './palettes.glsl';

const ORBIT_TRAP_GLSL = `
float orbitTrapDistance(vec2 z) {
  vec2 delta = z - u_orbitTrapPoint;
  if (u_orbitTrapShape == 0) return length(delta);
  if (u_orbitTrapShape == 1) return min(abs(delta.x), abs(delta.y));
  return abs(length(delta) - u_orbitTrapRadius);
}
`;

/** GLSL float literal with full precision (integers gain a `.0` suffix). */
function glslFloatLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite GLSL float literal: ${value}`);
  }
  const text = String(value);
  return text.includes('.') || text.includes('e') || text.includes('E') ? text : `${text}.0`;
}

export function assembleShader(
  combo: PluginCombination,
  formulaOverride?: FormulaPlugin,
): string {
  const formula =
    formulaOverride?.id === combo.formulaId
      ? formulaOverride
      : pluginRegistry.getFormula(combo.formulaId);
  const outside = pluginRegistry.getOutsideColoring(combo.outsideColoringId);
  const inside = pluginRegistry.getInsideColoring(combo.insideColoringId);
  const transform = pluginRegistry.getTransform(combo.transformId);

  if (!formula || !outside || !inside || !transform) {
    throw new Error(
      `Missing plugin(s): f=${combo.formulaId} oc=${combo.outsideColoringId} ic=${combo.insideColoringId} t=${combo.transformId}`
    );
  }

  const defines: string[] = [];
  // Renderer-pipeline v2: a formula carrying a bounded bailout descriptor
  // (strict-v2 FRM compile) drives the escape defines from the descriptor
  // instead of the legacy numeric bailout field. C1 thresholds are
  // magnitude values, so the zz comparison consumes threshold²; inverse
  // directions (>, >=) flip the escape condition, and inclusive operators
  // use an inclusive boundary. Legacy formulas (no descriptor) keep the
  // historical BAILOUT_RADIUS semantics byte-for-byte.
  const bailoutDescriptor = formula.bailoutDescriptor;
  if (bailoutDescriptor?.kind === 'C1') {
    // Full precision: fractional thresholds (e.g. |z| < 0.1 → 0.01) must
    // not be rounded away.
    defines.push(`#define BAILOUT_RADIUS ${glslFloatLiteral(bailoutDescriptor.threshold ** 2)}`);
    if (bailoutDescriptor.op === '>' || bailoutDescriptor.op === '>=') {
      defines.push('#define ESCAPE_INVERSE_DIRECTION');
    }
    if (bailoutDescriptor.op === '<=' || bailoutDescriptor.op === '>=') {
      defines.push('#define BAILOUT_INCLUSIVE');
    }
  } else if (bailoutDescriptor?.kind === 'C2' && formula.c2ThresholdGlsl) {
    // C2 parameterized radial: the threshold is a GLSL expression over
    // parameter uniforms (u_p1…u_p5) — parameter edits take effect without
    // recompilation. Escape is the negated continue predicate over the
    // expression's square (zz vs magnitude²).
    const escapeOp = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[bailoutDescriptor.op];
    defines.push('#define ESCAPE_C2');
    defines.push(
      `#define C2_ESCAPE_CHECK(zz) ((zz) ${escapeOp} ((${formula.c2ThresholdGlsl}) * (${formula.c2ThresholdGlsl})))`,
    );
  } else if (bailoutDescriptor?.kind === 'C4R') {
    // C4-R real projection: escape is the negation of the continue
    // predicate over z.x (abs-real uses abs(z.x)). The assembler injects
    // the full comparison expression; the framework routes ESCAPE_CHECK to
    // it. Thresholds are compared against z.x directly (not squared).
    const escapeOp = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' }[bailoutDescriptor.op];
    const operand = bailoutDescriptor.form === 'abs-real' ? 'abs((z).x)' : '(z).x';
    defines.push('#define ESCAPE_C4R');
    defines.push(
      `#define C4R_ESCAPE_CHECK(z) (${operand} ${escapeOp} ${glslFloatLiteral(bailoutDescriptor.threshold)})`,
    );
  } else {
    defines.push(`#define BAILOUT_RADIUS ${(formula.bailout ?? 4.0).toFixed(1)}`);
  }
  // Strict-v2 classic timing: bailout evaluated after each loop step.
  if (formula.afterStepTiming) {
    defines.push('#define ESCAPE_AFTER_STEP');
  }
  if (formula.smoothCapability === 'unavailable') {
    // Spec §7: smooth unavailable (C4-R real projection or inverse-direction
    // radial) → deterministic Escape Time. The requested coloring preference
    // is preserved upstream and deterministically restored when the
    // capability returns (docs/specs/frm-compatibility-v1.md §7).
    defines.push('#define SMOOTH_ESCAPE_TIME');
  }
  if (formula.escapeType === 'converge') {
    defines.push('#define ESCAPE_CONVERGE');
    defines.push('#define CONVERGE_EPSILON 0.000001');
  }
  if (formula.initGlsl) {
    defines.push('#define HAS_INIT_FORMULA');
  }

  const allNeeded = new Set([...(outside.needsOrbitStats ?? []), ...(inside.needsOrbitStats ?? [])]);
  if (allNeeded.has('trapMin')) defines.push('#define NEED_ORBIT_TRAP');
  if (allNeeded.has('tiaSum')) defines.push('#define NEED_TIA');

  const pluginUniforms = [...formula.uniforms, ...outside.uniforms, ...inside.uniforms, ...transform.uniforms];
  const uniformDecls = pluginUniforms.map((u) => `uniform ${u.type} ${u.name};`).join('\n');

  const orbitTrapSection = allNeeded.has('trapMin') ? ORBIT_TRAP_GLSL : '';

  let shader = frameworkTemplate;
  shader = shader.replace('precision highp float;', `precision highp float;\n${defines.join('\n')}`);
  shader = shader.replace('/* INJECT_UNIFORMS */', uniformDecls);
  shader = shader.replace('/* INJECT_COMPLEX_MATH */', complexMathLib);
  shader = shader.replace('/* INJECT_PALETTE_FUNCTIONS */', paletteLib);
  shader = shader.replace('/* INJECT_ORBIT_TRAP */', orbitTrapSection);
  shader = shader.replace('/* INJECT_TRANSFORM */', transform.glsl);
  const hasFullInitFunction = Boolean(formula.initGlsl?.includes('vec2 initFormula('));
  const initGlsl = formula.initGlsl
    ? (hasFullInitFunction
        ? formula.initGlsl
        : `vec2 initFormula(vec2 z, vec2 c, vec2 point) {\n  vec2 pixel = u_isJulia ? point : c;\n${formula.initGlsl}\n  return z;\n}`)
    : '';
  shader = shader.replace('/* INJECT_FORMULA_INIT */', initGlsl);
  shader = shader.replace('/* INJECT_FORMULA */', formula.glsl);
  shader = shader.replace('/* INJECT_OUTSIDE_COLORING */', outside.glsl);
  shader = shader.replace('/* INJECT_INSIDE_COLORING */', inside.glsl);

  return shader;
}

export function makeCacheKey(combo: PluginCombination, formulaOverride?: FormulaPlugin): ShaderCacheKey {
  const base = `${combo.formulaId}|${combo.outsideColoringId}|${combo.insideColoringId}|${combo.transformId}`;
  // Shader semantics now depend on the formula's bailout descriptor (strict
  // v2). A v1 and a v2 variant of the same formula id must never share a
  // compiled program — fingerprint the descriptor into the key.
  const descriptor = formulaOverride?.bailoutDescriptor;
  const timingBit = formulaOverride?.afterStepTiming ? '|t:after' : '';
  if (!descriptor) return `${base}${timingBit}`;
  const fingerprint =
    descriptor.kind === 'C2'
      ? `C2:${descriptor.op}:${descriptor.params.join(',')}`
      : descriptor.kind === 'C1'
        ? `C1:${descriptor.op}:${descriptor.threshold}`
        : `C4R:${descriptor.form}:${descriptor.op}:${descriptor.threshold}`;
  return `${base}|bo:${fingerprint}${timingBit}`;
}
