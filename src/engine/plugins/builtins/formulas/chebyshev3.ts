import type { FormulaPlugin } from '../../types';

export const chebyshev3Plugin: FormulaPlugin = {
  id: 'chebyshev3',
  category: 'formula',
  name: 'explore.controls.formula.chebyshev3',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  return 4.0 * z3 - 3.0 * z + c;
}
`,
};
