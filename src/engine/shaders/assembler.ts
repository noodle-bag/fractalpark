import type { PluginCombination, ShaderCacheKey } from '../plugins/types';
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

export function assembleShader(combo: PluginCombination): string {
  const formula = pluginRegistry.getFormula(combo.formulaId);
  const outside = pluginRegistry.getOutsideColoring(combo.outsideColoringId);
  const inside = pluginRegistry.getInsideColoring(combo.insideColoringId);
  const transform = pluginRegistry.getTransform(combo.transformId);

  if (!formula || !outside || !inside || !transform) {
    throw new Error(
      `Missing plugin(s): f=${combo.formulaId} oc=${combo.outsideColoringId} ic=${combo.insideColoringId} t=${combo.transformId}`
    );
  }

  const defines: string[] = [];
  defines.push(`#define BAILOUT_RADIUS ${(formula.bailout ?? 4.0).toFixed(1)}`);
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

export function makeCacheKey(combo: PluginCombination): ShaderCacheKey {
  return `${combo.formulaId}|${combo.outsideColoringId}|${combo.insideColoringId}|${combo.transformId}`;
}
