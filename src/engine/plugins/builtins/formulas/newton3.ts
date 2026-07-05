import type { FormulaPlugin } from '../../types';

export const newton3Plugin: FormulaPlugin = {
  id: 'newton3',
  category: 'formula',
  name: 'explore.controls.formula.newton3',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge', // Newton formulas use converge escape
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton's method for z^3 - 1 = 0
  // z = (2*z^3 + 1) / (3*z^2)
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 numerator = 2.0 * z3 + vec2(1.0, 0.0);
  vec2 denominator = 3.0 * z2;
  return complexDiv(numerator, denominator);
}
`,
};
