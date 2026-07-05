import type { FormulaPlugin } from '../../types';

export const newton4Plugin: FormulaPlugin = {
  id: 'newton4',
  category: 'formula',
  name: 'explore.controls.formula.newton4',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton's method for z^4 - 1 = 0
  // z = (3*z^4 + 1) / (4*z^3)
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 z4 = complexSqr(z2);
  vec2 numerator = 3.0 * z4 + vec2(1.0, 0.0);
  vec2 denominator = 4.0 * z3;
  return complexDiv(numerator, denominator);
}
`,
};
