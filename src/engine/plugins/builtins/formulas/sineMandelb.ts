import type { FormulaPlugin } from '../../types';

export const sineMandelbPlugin: FormulaPlugin = {
  id: 'sineMandelb',
  category: 'formula',
  name: 'explore.controls.formula.sineMandelb',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexSin(z) + c;
}
`,
};
