import type { FormulaPlugin } from '../../types';

export const chebyshev4Plugin: FormulaPlugin = {
  id: 'chebyshev4',
  category: 'formula',
  name: 'explore.controls.formula.chebyshev4',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Chebyshev T4(z) = 8z^4 - 8z^2 + 1
  vec2 z2 = complexSqr(z);
  vec2 z4 = complexSqr(z2);
  return 8.0 * z4 - 8.0 * z2 + c;
}
`,
};
