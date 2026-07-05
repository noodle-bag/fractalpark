import type { FormulaPlugin } from '../../types';

export const cothMandelbrotPlugin: FormulaPlugin = {
  id: 'cothMandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.cothMandelbrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 cothLocal(vec2 z) {
  vec2 denom = complexSinhVec(z);
  if (dot(denom, denom) < 1e-10) {
    denom += vec2(1e-5, 0.0);
  }
  return complexDiv(complexCoshVec(z), denom);
}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return cothLocal(z) + c;
}
`,
};
