import type { FormulaPlugin } from '../../types';

export const chebyshev5Plugin: FormulaPlugin = {
  id: 'chebyshev5',
  category: 'formula',
  name: 'explore.controls.formula.chebyshev5',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Chebyshev T5(z) = 16z^5 - 20z^3 + 5z
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 z4 = complexSqr(z2);
  vec2 z5 = complexMul(z4, z);
  return 16.0 * z5 - 20.0 * z3 + 5.0 * z + c;
}
`,
};
