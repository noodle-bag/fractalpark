import type { FormulaPlugin } from '../../types';

export const multicorn7Plugin: FormulaPlugin = {
  id: 'multicorn7',
  category: 'formula',
  name: 'explore.controls.formula.multicorn7',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexPow(complexConj(z), 7.0) + c;
}
`,
};
