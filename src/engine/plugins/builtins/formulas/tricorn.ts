import type { FormulaPlugin } from '../../types';

export const tricornPlugin: FormulaPlugin = {
  id: 'tricorn',
  category: 'formula',
  name: 'explore.controls.formula.tricorn',
  source: 'builtin',
  supportsPower: true,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 a = complexConj(z);
  if (u_power == 2.0) {
    return vec2(a.x * a.x - a.y * a.y, 2.0 * a.x * a.y) + c;
  }
  return complexPow(a, u_power) + c;
}
`,
};
