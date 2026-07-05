import type { FormulaPlugin } from '../../types';

export const cosMandelbPlugin: FormulaPlugin = {
  id: 'cosMandelb',
  category: 'formula',
  name: 'explore.controls.formula.cosMandelb',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexCos(z) + c;
}
`,
};
