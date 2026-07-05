import type { FormulaPlugin } from '../../types';

export const multicorn5Plugin: FormulaPlugin = {
  id: 'multicorn5',
  category: 'formula',
  name: 'explore.controls.formula.multicorn5',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexPow(complexConj(z), 5.0) + c;
}
`,
};
