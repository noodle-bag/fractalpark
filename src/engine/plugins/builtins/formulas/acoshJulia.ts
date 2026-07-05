import type { FormulaPlugin } from '../../types';

export const acoshJuliaPlugin: FormulaPlugin = {
  id: 'acoshJulia',
  category: 'formula',
  name: 'explore.controls.formula.acoshJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 complexSqrtLocal(vec2 z) {
  float r = length(z);
  float x = sqrt(max(0.0, 0.5 * (r + z.x)));
  float y = sqrt(max(0.0, 0.5 * (r - z.x)));
  return vec2(x, z.y < 0.0 ? -y : y);
}

vec2 acoshLocal(vec2 z) {
  vec2 one = vec2(1.0, 0.0);
  return complexLog(z + complexMul(complexSqrtLocal(z - one), complexSqrtLocal(z + one)));
}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexMul(c, acoshLocal(z));
}
`,
};
