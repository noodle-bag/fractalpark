import type { FormulaPlugin } from '../../types';

export const multicorn4Plugin: FormulaPlugin = {
  id: 'multicorn4',
  category: 'formula',
  name: 'explore.controls.formula.multicorn4',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 a = complexConj(z);
  vec2 a2 = complexSqr(a);
  return complexSqr(a2) + c;
}
`,
};
