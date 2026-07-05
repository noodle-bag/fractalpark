import type { FormulaPlugin } from '../../types';

export const manowarPlugin: FormulaPlugin = {
  id: 'manowar',
  category: 'formula',
  name: 'explore.controls.formula.manowar',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexSqr(z) + zPrev + c;
}
`,
};
