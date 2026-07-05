import type { FormulaPlugin } from '../../types';

export const simonBrotPlugin: FormulaPlugin = {
  id: 'simonBrot',
  category: 'formula',
  name: 'explore.controls.formula.simonBrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // SimonBrot: z^4 + z^3 + c
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 z4 = complexSqr(z2);
  return z4 + z3 + c;
}
`,
};
